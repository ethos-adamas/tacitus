mod auth;
mod state;

use auth::{Challenge, parse_public_identity};
use axum::{
    Json, Router,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderMap, HeaderName, HeaderValue, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{any, get},
};
use serde::Deserialize;
use serde_json::json;
use state::{
    AppState, Delivery, RateKind, ServerCommand, ServerFrame, StateError, Transition, random_token,
};
use std::{
    env,
    path::Path,
    sync::Arc,
    time::{Duration, Instant},
};
use tokio::{
    net::TcpListener,
    sync::{RwLock, mpsc},
    time::{interval, timeout},
};
use tower_http::{
    services::{ServeDir, ServeFile},
    set_header::SetResponseHeaderLayer,
};

type SharedState = Arc<RwLock<AppState>>;

const MAX_FRAME_BYTES: usize = 64 * 1024;

#[derive(Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
enum ClientFrame {
    #[serde(rename = "auth.respond")]
    AuthRespond {
        v: u8,
        nickname: String,
        public_key: String,
        signature: String,
    },
    #[serde(rename = "contact.add")]
    ContactAdd {
        v: u8,
        request_id: String,
        target_fingerprint: String,
    },
    #[serde(rename = "contact.cancel")]
    ContactCancel {
        v: u8,
        request_id: String,
        target_fingerprint: String,
    },
    #[serde(rename = "contact.block")]
    ContactBlock {
        v: u8,
        request_id: String,
        target_fingerprint: String,
    },
    #[serde(rename = "contact.unblock")]
    ContactUnblock {
        v: u8,
        request_id: String,
        target_fingerprint: String,
    },
    #[serde(rename = "message.send")]
    MessageSend {
        v: u8,
        request_id: String,
        to_fingerprint: String,
        message_id: String,
        ciphertext: String,
    },
}

#[tokio::main]
async fn main() {
    let state = Arc::new(RwLock::new(AppState::default()));
    let static_dir = env::var("STATIC_DIR").unwrap_or_else(|_| {
        if Path::new("dist").exists() {
            "dist".into()
        } else {
            "../secret-chat-fe/dist".into()
        }
    });
    let fallback = ServeDir::new(&static_dir)
        .not_found_service(ServeFile::new(format!("{static_dir}/index.html")));
    let app = Router::new()
        .route("/health", get(health))
        .route("/ws", any(websocket))
        .fallback_service(fallback)
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("referrer-policy"),
            HeaderValue::from_static("no-referrer"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            HeaderName::from_static("x-content-type-options"),
            HeaderValue::from_static("nosniff"),
        ))
        .layer(SetResponseHeaderLayer::overriding(
            header::CONTENT_SECURITY_POLICY,
            HeaderValue::from_static(
                "default-src 'self'; connect-src 'self'; img-src 'self' data:; style-src 'self'; script-src 'self' 'wasm-unsafe-eval'; frame-ancestors 'none'; object-src 'none'; base-uri 'none'",
            ),
        ))
        .with_state(state);
    let address = env::var("BIND_ADDRESS").unwrap_or_else(|_| "0.0.0.0:3000".into());
    let listener = TcpListener::bind(address).await.expect("bind server");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("serve application");
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok" }))
}

async fn websocket(
    State(state): State<SharedState>,
    headers: HeaderMap,
    ws: WebSocketUpgrade,
) -> Response {
    if !valid_origin(&headers) {
        return StatusCode::FORBIDDEN.into_response();
    }
    ws.max_frame_size(MAX_FRAME_BYTES)
        .max_message_size(MAX_FRAME_BYTES)
        .on_upgrade(move |socket| serve_socket(socket, state))
}

fn valid_origin(headers: &HeaderMap) -> bool {
    let Some(origin) = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
    else {
        return false;
    };
    if let Ok(public_origin) = env::var("PUBLIC_ORIGIN") {
        return origin == public_origin.trim_end_matches('/');
    }
    let Some(host) = headers
        .get(header::HOST)
        .and_then(|value| value.to_str().ok())
    else {
        return false;
    };
    let scheme = headers
        .get("x-forwarded-proto")
        .and_then(|value| value.to_str().ok())
        .and_then(|value| value.split(',').next())
        .unwrap_or("http")
        .trim();
    origin == format!("{scheme}://{host}")
}

async fn serve_socket(mut socket: WebSocket, state: SharedState) {
    let mut challenge = Challenge::new(Instant::now());
    if send_frame(
        &mut socket,
        &ServerFrame::AuthChallenge {
            v: 1,
            nonce: challenge.nonce.clone(),
        },
    )
    .await
    .is_err()
    {
        return;
    }

    let auth = timeout(Duration::from_secs(30), socket.recv()).await;
    let Ok(Some(Ok(Message::Text(text)))) = auth else {
        let _ = send_error(&mut socket, None, "authentication_failed").await;
        return;
    };
    let Ok(ClientFrame::AuthRespond {
        v: 1,
        nickname,
        public_key,
        signature,
    }) = serde_json::from_str(text.as_str())
    else {
        let _ = send_error(&mut socket, None, "authentication_failed").await;
        return;
    };
    let Ok(identity) = parse_public_identity(&public_key) else {
        let _ = send_error(&mut socket, None, "authentication_failed").await;
        return;
    };
    if challenge
        .verify(Instant::now(), &nickname, &signature, &identity.cert)
        .is_err()
    {
        let _ = send_error(&mut socket, None, "authentication_failed").await;
        return;
    }

    let session_id = random_token::<16>();
    let (sender, mut receiver) = mpsc::channel(64);
    let registration = {
        state.write().await.register(
            &nickname,
            &identity.fingerprint,
            public_key,
            session_id.clone(),
            sender,
        )
    };
    let registration = match registration {
        Ok(registration) => registration,
        Err(error) => {
            let _ = send_error(&mut socket, None, error.code()).await;
            return;
        }
    };
    if let Some(replaced) = registration.replaced {
        let _ = replaced.try_send(ServerCommand::Close);
    }
    dispatch(Transition {
        deliveries: registration.deliveries,
        log: None,
    });
    if send_frame(
        &mut socket,
        &ServerFrame::AuthReady {
            v: 1,
            nickname: registration.nickname,
            fingerprint: identity.fingerprint,
        },
    )
    .await
    .is_err()
    {
        cleanup(&state, &session_id).await;
        return;
    }

    let mut heartbeat = interval(Duration::from_secs(30));
    heartbeat.tick().await;
    let mut last_pong = Instant::now();
    let mut invalid_frames = 0_u8;
    loop {
        tokio::select! {
            command = receiver.recv() => match command {
                Some(ServerCommand::Frame(frame)) => {
                    if send_frame(&mut socket, &frame).await.is_err() { break; }
                }
                Some(ServerCommand::Close) | None => {
                    let _ = socket.send(Message::Close(None)).await;
                    break;
                }
            },
            incoming = socket.recv() => match incoming {
                Some(Ok(Message::Text(text))) => {
                    match serde_json::from_str::<ClientFrame>(text.as_str()) {
                        Ok(frame) => {
                            if process_frame(&mut socket, &state, &session_id, frame).await {
                                break;
                            }
                        }
                        Err(_) => {
                            invalid_frames = invalid_frames.saturating_add(1);
                            let _ = send_error(&mut socket, None, "invalid_request").await;
                            if invalid_frames >= 3 { break; }
                        }
                    }
                }
                Some(Ok(Message::Pong(_))) => last_pong = Instant::now(),
                Some(Ok(Message::Ping(bytes))) => {
                    if socket.send(Message::Pong(bytes)).await.is_err() { break; }
                }
                Some(Ok(Message::Close(_))) | Some(Err(_)) | None => break,
                Some(Ok(Message::Binary(_))) => {
                    invalid_frames = invalid_frames.saturating_add(1);
                    let _ = send_error(&mut socket, None, "invalid_request").await;
                    if invalid_frames >= 3 { break; }
                }
            },
            _ = heartbeat.tick() => {
                if last_pong.elapsed() >= Duration::from_secs(60)
                    || socket.send(Message::Ping(Vec::new().into())).await.is_err()
                {
                    break;
                }
            }
        }
    }
    let transition = { state.write().await.disconnect(&session_id) };
    dispatch(Transition {
        deliveries: transition,
        log: None,
    });
}

async fn process_frame(
    socket: &mut WebSocket,
    state: &SharedState,
    session_id: &str,
    frame: ClientFrame,
) -> bool {
    match frame {
        ClientFrame::AuthRespond { .. } => {
            let _ = send_error(socket, None, "invalid_request").await;
        }
        ClientFrame::ContactAdd {
            v,
            request_id,
            target_fingerprint,
        } => {
            return contact_action(
                socket,
                state,
                session_id,
                v,
                request_id.clone(),
                &target_fingerprint,
                |state| state.add_contact(session_id, &target_fingerprint, request_id),
            )
            .await;
        }
        ClientFrame::ContactCancel {
            v,
            request_id,
            target_fingerprint,
        } => {
            return contact_action(
                socket,
                state,
                session_id,
                v,
                request_id,
                &target_fingerprint,
                |state| state.cancel_contact(session_id, &target_fingerprint),
            )
            .await;
        }
        ClientFrame::ContactBlock {
            v,
            request_id,
            target_fingerprint,
        } => {
            return contact_action(
                socket,
                state,
                session_id,
                v,
                request_id,
                &target_fingerprint,
                |state| state.block_contact(session_id, &target_fingerprint),
            )
            .await;
        }
        ClientFrame::ContactUnblock {
            v,
            request_id,
            target_fingerprint,
        } => {
            return contact_action(
                socket,
                state,
                session_id,
                v,
                request_id,
                &target_fingerprint,
                |state| state.unblock_contact(session_id, &target_fingerprint),
            )
            .await;
        }
        ClientFrame::MessageSend {
            v,
            request_id,
            to_fingerprint,
            message_id,
            ciphertext,
        } => {
            if v != 1 || !valid_request_id(&request_id) || !valid_fingerprint(&to_fingerprint) {
                let _ = send_error(socket, Some(request_id), "invalid_request").await;
                return false;
            }
            let result = {
                let mut state = state.write().await;
                state
                    .check_rate(session_id, RateKind::Message, Instant::now())
                    .and_then(|()| {
                        state.route_message(
                            session_id,
                            &to_fingerprint,
                            message_id.clone(),
                            ciphertext,
                        )
                    })
            };
            match result {
                Ok(route) => match route.sender.try_send(ServerCommand::Frame(route.frame)) {
                    Ok(()) => {
                        let _ = send_frame(
                            socket,
                            &ServerFrame::MessageSent {
                                v: 1,
                                request_id,
                                message_id,
                            },
                        )
                        .await;
                    }
                    Err(mpsc::error::TrySendError::Full(_)) => {
                        let _ = send_error(socket, Some(request_id), "server_overloaded").await;
                    }
                    Err(mpsc::error::TrySendError::Closed(_)) => {
                        let _ = send_error(socket, Some(request_id), "contact_unavailable").await;
                    }
                },
                Err(error) => {
                    let close = matches!(error, StateError::RateLimited { close: true });
                    let _ = send_error(socket, Some(request_id), error.code()).await;
                    if close {
                        return true;
                    }
                }
            }
        }
    }
    false
}

async fn contact_action(
    socket: &mut WebSocket,
    shared: &SharedState,
    session_id: &str,
    version: u8,
    request_id: String,
    target_fingerprint: &str,
    action: impl FnOnce(&mut AppState) -> Result<Transition, StateError>,
) -> bool {
    if version != 1 || !valid_request_id(&request_id) || !valid_fingerprint(target_fingerprint) {
        let _ = send_error(socket, Some(request_id), "invalid_request").await;
        return false;
    }
    let result = {
        let mut state = shared.write().await;
        state
            .check_rate(session_id, RateKind::Contact, Instant::now())
            .and_then(|()| action(&mut state))
    };
    match result {
        Ok(transition) => dispatch(transition),
        Err(error) => {
            let close = matches!(error, StateError::RateLimited { close: true });
            let _ = send_error(socket, Some(request_id), error.code()).await;
            return close;
        }
    }
    false
}

fn dispatch(transition: Transition) {
    for Delivery { sender, frame } in transition.deliveries {
        let _ = sender.try_send(ServerCommand::Frame(frame));
    }
    if let Some(line) = transition.log {
        println!("{line}");
    }
}

async fn cleanup(state: &SharedState, session_id: &str) {
    let deliveries = state.write().await.disconnect(session_id);
    dispatch(Transition {
        deliveries,
        log: None,
    });
}

async fn send_frame(socket: &mut WebSocket, frame: &ServerFrame) -> Result<(), ()> {
    let text = serde_json::to_string(frame).map_err(|_| ())?;
    socket
        .send(Message::Text(text.into()))
        .await
        .map_err(|_| ())
}

async fn send_error(
    socket: &mut WebSocket,
    request_id: Option<String>,
    code: &'static str,
) -> Result<(), ()> {
    send_frame(
        socket,
        &ServerFrame::Error {
            v: 1,
            request_id,
            code,
        },
    )
    .await
}

fn valid_request_id(request_id: &str) -> bool {
    !request_id.is_empty() && request_id.len() <= 64
}

fn valid_fingerprint(fingerprint: &str) -> bool {
    matches!(fingerprint.len(), 40 | 64) && fingerprint.bytes().all(|byte| byte.is_ascii_hexdigit())
}

async fn shutdown_signal() {
    let _ = tokio::signal::ctrl_c().await;
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn origin_must_match_host_and_forwarded_scheme() {
        let mut headers = HeaderMap::new();
        headers.insert(header::HOST, HeaderValue::from_static("chat.example.test"));
        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("https://chat.example.test"),
        );
        headers.insert("x-forwarded-proto", HeaderValue::from_static("https"));
        assert!(valid_origin(&headers));
        headers.insert(
            header::ORIGIN,
            HeaderValue::from_static("https://evil.example"),
        );
        assert!(!valid_origin(&headers));
    }

    #[tokio::test]
    async fn health_has_expected_body() {
        assert_eq!(health().await.0, json!({ "status": "ok" }));
    }
}

use axum::{
    Json, Router,
    extract::{
        State,
        ws::{Message, WebSocket, WebSocketUpgrade},
    },
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{any, get},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use serde::Deserialize;
use serde_json::json;
use std::{
    collections::VecDeque,
    env,
    sync::Arc,
    time::{Duration, Instant},
};
use tacitus_backend::state::{
    AppState, Delivery, PayloadKind, ServerFrame, SessionChannel, StateError,
};
use tacitus_protocol::{IdentityDocument, format_tacitus_id, verify_authentication};
use tokio::{
    net::TcpListener,
    sync::{RwLock, watch},
    time::{sleep, timeout},
};

type SharedState = Arc<RwLock<AppState>>;
const MAX_FRAME_BYTES: usize = 64 * 1024;
const WRITE_TIMEOUT: Duration = Duration::from_secs(5);
const DISCONNECT_GRACE: Duration = Duration::from_secs(30);

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
        tacitus_id: String,
    },
    #[serde(rename = "contact.cancel")]
    ContactCancel {
        v: u8,
        request_id: String,
        tacitus_id: String,
    },
    #[serde(rename = "contact.remove")]
    ContactRemove {
        v: u8,
        request_id: String,
        tacitus_id: String,
    },
    #[serde(rename = "handshake.send")]
    HandshakeSend {
        v: u8,
        request_id: String,
        to_id: String,
        body: String,
    },
    #[serde(rename = "message.send")]
    MessageSend {
        v: u8,
        request_id: String,
        to_id: String,
        body: String,
    },
}

impl ClientFrame {
    fn request_id(&self) -> Option<&str> {
        match self {
            Self::AuthRespond { .. } => None,
            Self::ContactAdd { request_id, .. }
            | Self::ContactCancel { request_id, .. }
            | Self::ContactRemove { request_id, .. }
            | Self::HandshakeSend { request_id, .. }
            | Self::MessageSend { request_id, .. } => Some(request_id),
        }
    }
}

#[tokio::main]
async fn main() {
    let state = Arc::new(RwLock::new(AppState::default()));
    let app = Router::new()
        .route("/health", get(health))
        .route("/ws", any(websocket))
        .with_state(state);
    let address = env::var("BIND_ADDRESS").unwrap_or_else(|_| "0.0.0.0:3000".into());
    let listener = TcpListener::bind(address).await.expect("bind server");
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown_signal())
        .await
        .expect("serve application");
}

async fn health() -> Json<serde_json::Value> {
    Json(json!({ "status": "ok", "protocol": 2 }))
}

async fn websocket(
    State(state): State<SharedState>,
    headers: HeaderMap,
    socket: WebSocketUpgrade,
) -> Response {
    if !valid_origin(&headers) {
        return StatusCode::FORBIDDEN.into_response();
    }
    socket
        .max_frame_size(MAX_FRAME_BYTES)
        .max_message_size(MAX_FRAME_BYTES)
        .on_upgrade(move |socket| serve_socket(socket, state))
}

async fn serve_socket(mut socket: WebSocket, state: SharedState) {
    let nonce: [u8; 32] = rand::random();
    if send_frame(
        &mut socket,
        &ServerFrame::AuthChallenge {
            v: 2,
            nonce: URL_SAFE_NO_PAD.encode(nonce),
        },
    )
    .await
    .is_err()
    {
        return;
    }
    let authentication = timeout(Duration::from_secs(30), socket.recv()).await;
    let Ok(Some(Ok(Message::Text(text)))) = authentication else {
        let _ = send_error(&mut socket, None, StateError::AuthenticationFailed).await;
        return;
    };
    let Ok(ClientFrame::AuthRespond {
        v: 2,
        nickname,
        public_key,
        signature,
    }) = serde_json::from_str(text.as_str())
    else {
        let _ = send_error(&mut socket, None, StateError::AuthenticationFailed).await;
        return;
    };
    let authenticated = (|| {
        let public_key = URL_SAFE_NO_PAD
            .decode(public_key)
            .map_err(|_| StateError::AuthenticationFailed)?;
        let signature = URL_SAFE_NO_PAD
            .decode(signature)
            .map_err(|_| StateError::AuthenticationFailed)?;
        let identity = IdentityDocument::new(&nickname, public_key.clone())
            .map_err(|_| StateError::AuthenticationFailed)?;
        verify_authentication(&identity, &nonce, &signature)
            .map_err(|_| StateError::AuthenticationFailed)?;
        Ok::<_, StateError>((
            identity.nickname().to_owned(),
            format_tacitus_id(identity.id()),
            public_key,
        ))
    })();
    let Ok((nickname, tacitus_id, public_key)) = authenticated else {
        let _ = send_error(&mut socket, None, StateError::AuthenticationFailed).await;
        return;
    };

    let session_id = URL_SAFE_NO_PAD.encode::<[u8; 16]>(rand::random());
    let (channel, mut outgoing, mut close) = SessionChannel::new(session_id.clone());
    let registration =
        state
            .write()
            .await
            .register(&tacitus_id, &nickname, public_key, channel.clone());
    let Ok(deliveries) = registration else {
        let _ = send_error(&mut socket, None, registration.expect_err("checked error")).await;
        return;
    };
    if channel
        .send(ServerFrame::AuthReady {
            v: 2,
            nickname,
            tacitus_id: tacitus_id.clone(),
        })
        .is_err()
    {
        return;
    }
    dispatch(deliveries);

    let mut limits = Limits::default();
    loop {
        tokio::select! {
            biased;
            changed = close.changed() => {
                if changed.is_ok() && *close.borrow() {
                    let _ = timeout(WRITE_TIMEOUT, socket.send(Message::Close(None))).await;
                }
                break;
            }
            Some(frame) = outgoing.recv() => {
                if send_cancellable(&mut socket, &frame, &mut close).await.is_err() { break }
            }
            incoming = socket.recv() => {
                let Some(Ok(message)) = incoming else { break };
                match message {
                    Message::Text(text) => match handle_frame(&state, &session_id, text.as_str(), &mut limits).await {
                        Ok(deliveries) => dispatch(deliveries),
                        Err((request_id, reason)) => {
                            if channel.send(ServerFrame::Error { v: 2, request_id, code: reason.code() }).is_err() { break }
                        }
                    },
                    Message::Ping(bytes) => {
                        if timeout(WRITE_TIMEOUT, socket.send(Message::Pong(bytes))).await.is_err() { break }
                    }
                    Message::Close(_) => break,
                    Message::Binary(_) | Message::Pong(_) => {}
                }
            }
        }
    }
    dispatch(state.write().await.unregister(&session_id));
    tokio::spawn(async move {
        sleep(DISCONNECT_GRACE).await;
        dispatch(
            state
                .write()
                .await
                .expire_disconnect(&tacitus_id, &session_id),
        );
    });
}

async fn handle_frame(
    state: &SharedState,
    session_id: &str,
    text: &str,
    limits: &mut Limits,
) -> Result<Vec<Delivery>, (Option<String>, StateError)> {
    let frame: ClientFrame =
        serde_json::from_str(text).map_err(|_| (None, StateError::InvalidRequest))?;
    if frame
        .request_id()
        .is_none_or(|request_id| request_id.is_empty() || request_id.len() > 64)
    {
        return Err((None, StateError::InvalidRequest));
    }
    let now = Instant::now();
    match frame {
        ClientFrame::ContactAdd {
            v: 2,
            request_id,
            tacitus_id,
        } => {
            limits
                .allow_contact(now)
                .map_err(|error| (Some(request_id.clone()), error))?;
            state
                .write()
                .await
                .add_contact(session_id, &request_id, &tacitus_id)
                .map_err(|error| (Some(request_id), error))
        }
        ClientFrame::ContactCancel {
            v: 2,
            request_id,
            tacitus_id,
        } => {
            limits
                .allow_contact(now)
                .map_err(|error| (Some(request_id.clone()), error))?;
            state
                .write()
                .await
                .cancel_contact(session_id, &request_id, &tacitus_id)
                .map_err(|error| (Some(request_id), error))
        }
        ClientFrame::ContactRemove {
            v: 2,
            request_id,
            tacitus_id,
        } => {
            limits
                .allow_contact(now)
                .map_err(|error| (Some(request_id.clone()), error))?;
            state
                .write()
                .await
                .remove_contact(session_id, &request_id, &tacitus_id)
                .map_err(|error| (Some(request_id), error))
        }
        ClientFrame::HandshakeSend {
            v: 2,
            request_id,
            to_id,
            body,
        } => {
            limits
                .allow_message(now)
                .map_err(|error| (Some(request_id.clone()), error))?;
            state
                .read()
                .await
                .route(
                    session_id,
                    &request_id,
                    &to_id,
                    PayloadKind::Handshake,
                    body,
                )
                .map_err(|error| (Some(request_id), error))
        }
        ClientFrame::MessageSend {
            v: 2,
            request_id,
            to_id,
            body,
        } => {
            limits
                .allow_message(now)
                .map_err(|error| (Some(request_id.clone()), error))?;
            state
                .read()
                .await
                .route(session_id, &request_id, &to_id, PayloadKind::Message, body)
                .map_err(|error| (Some(request_id), error))
        }
        _ => Err((None, StateError::InvalidRequest)),
    }
}

#[derive(Default)]
struct Limits {
    messages: VecDeque<Instant>,
    contacts: VecDeque<Instant>,
}

impl Limits {
    fn allow_message(&mut self, now: Instant) -> Result<(), StateError> {
        allow(&mut self.messages, now, Duration::from_secs(10), 60)
    }
    fn allow_contact(&mut self, now: Instant) -> Result<(), StateError> {
        allow(&mut self.contacts, now, Duration::from_secs(60), 30)
    }
}

fn allow(
    events: &mut VecDeque<Instant>,
    now: Instant,
    window: Duration,
    maximum: usize,
) -> Result<(), StateError> {
    while events
        .front()
        .is_some_and(|event| now.duration_since(*event) >= window)
    {
        events.pop_front();
    }
    if events.len() >= maximum {
        return Err(StateError::InvalidRequest);
    }
    events.push_back(now);
    Ok(())
}

fn dispatch(deliveries: Vec<Delivery>) {
    for delivery in deliveries {
        let _ = delivery.send();
    }
}

async fn send_frame(socket: &mut WebSocket, frame: &ServerFrame) -> Result<(), ()> {
    let serialized = serde_json::to_string(frame).map_err(|_| ())?;
    timeout(WRITE_TIMEOUT, socket.send(Message::Text(serialized.into())))
        .await
        .map_err(|_| ())?
        .map_err(|_| ())
}

async fn send_cancellable(
    socket: &mut WebSocket,
    frame: &ServerFrame,
    close: &mut watch::Receiver<bool>,
) -> Result<(), ()> {
    let serialized = serde_json::to_string(frame).map_err(|_| ())?;
    tokio::select! {
        _ = close.changed() => Err(()),
        result = timeout(WRITE_TIMEOUT, socket.send(Message::Text(serialized.into()))) => {
            result.map_err(|_| ())?.map_err(|_| ())
        }
    }
}

async fn send_error(
    socket: &mut WebSocket,
    request_id: Option<String>,
    error: StateError,
) -> Result<(), ()> {
    send_frame(
        socket,
        &ServerFrame::Error {
            v: 2,
            request_id,
            code: error.code(),
        },
    )
    .await
}

fn valid_origin(headers: &HeaderMap) -> bool {
    let Some(origin) = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
    else {
        return false;
    };
    if let Ok(public_origins) = env::var("PUBLIC_ORIGINS") {
        return public_origins
            .split(',')
            .map(str::trim)
            .map(|allowed| allowed.trim_end_matches('/'))
            .any(|allowed| origin == allowed);
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

async fn shutdown_signal() {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())
                .expect("install SIGTERM handler");
        tokio::select! { _ = tokio::signal::ctrl_c() => {}, _ = terminate.recv() => {} }
    }
    #[cfg(not(unix))]
    tokio::signal::ctrl_c()
        .await
        .expect("install Ctrl-C handler");
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn v1_frames_are_rejected_without_compatibility_path() {
        let state = Arc::new(RwLock::new(AppState::default()));
        let mut limits = Limits::default();
        let v1 = r#"{"v":1,"type":"contact.add","request_id":"r","tacitus_id":"00000-00000-00000-00000-000000"}"#;
        assert!(matches!(
            handle_frame(&state, "unused", v1, &mut limits).await,
            Err((None, StateError::InvalidRequest))
        ));
    }
}

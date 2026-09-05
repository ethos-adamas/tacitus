use std::{net::SocketAddr, sync::Arc};

use axum::{
    Json, Router,
    extract::{ConnectInfo, State, ws::WebSocketUpgrade},
    http::{HeaderMap, StatusCode, header},
    response::{IntoResponse, Response},
    routing::{any, get},
};
use serde_json::json;

use crate::infrastructure::{
    actors::RelayHandle, configurazione::Configurazione, protocol_v3::AutenticatoreProtocolloV3,
};

use super::connessione::gestisci_connessione;

#[derive(Clone)]
struct StatoHttp {
    relay: RelayHandle,
    ingresso: super::limiti::Ingresso,
    configurazione: Arc<Configurazione>,
}

pub fn crea_router(relay: RelayHandle, configurazione: Configurazione) -> Router {
    Router::new()
        .route("/health", get(health))
        .route("/ws", any(websocket))
        .with_state(StatoHttp {
            relay,
            ingresso: super::limiti::Ingresso::default(),
            configurazione: Arc::new(configurazione),
        })
}

async fn health(State(stato): State<StatoHttp>) -> Response {
    if stato.relay.operativo() {
        (
            StatusCode::OK,
            Json(json!({ "status": "ok", "protocol": 3 })),
        )
            .into_response()
    } else {
        (
            StatusCode::SERVICE_UNAVAILABLE,
            Json(json!({ "status": "unavailable", "protocol": 3 })),
        )
            .into_response()
    }
}

async fn websocket(
    State(stato): State<StatoHttp>,
    ConnectInfo(peer): ConnectInfo<SocketAddr>,
    headers: HeaderMap,
    socket: WebSocketUpgrade,
) -> Response {
    if !origine_valida(&headers, &stato.configurazione) {
        return StatusCode::FORBIDDEN.into_response();
    }
    let mut ip = peer.ip();
    if stato.configurazione.proxy_fidati.contains(&ip)
        && let Some(forwarded) = headers.get("x-forwarded-for")
    {
        let Ok(forwarded) = forwarded.to_str() else {
            return StatusCode::BAD_REQUEST.into_response();
        };
        for previous in forwarded.rsplit(',') {
            if !stato.configurazione.proxy_fidati.contains(&ip) {
                break;
            }
            let Ok(previous) = previous.trim().parse() else {
                return StatusCode::BAD_REQUEST.into_response();
            };
            ip = previous;
        }
    }
    let permesso = match stato.ingresso.ammetti(ip) {
        Ok(permesso) => permesso,
        Err(status) => {
            tracing::warn!(evento = "ingresso_rifiutato", codice = status.as_u16());
            return (status, [("retry-after", "30")]).into_response();
        }
    };
    socket
        .max_frame_size(super::connessione::MASSIMA_DIMENSIONE_FRAME)
        .max_message_size(super::connessione::MASSIMA_DIMENSIONE_FRAME)
        .on_upgrade(move |socket| {
            gestisci_connessione(socket, stato.relay, AutenticatoreProtocolloV3, permesso)
        })
}

fn origine_valida(headers: &HeaderMap, configurazione: &Configurazione) -> bool {
    let Some(origin) = headers
        .get(header::ORIGIN)
        .and_then(|value| value.to_str().ok())
    else {
        return false;
    };
    if !configurazione.origini_pubbliche.is_empty() {
        return configurazione
            .origini_pubbliche
            .iter()
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

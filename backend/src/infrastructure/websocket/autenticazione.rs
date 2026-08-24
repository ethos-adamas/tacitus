use std::time::Duration;

use axum::extract::ws::{Message, WebSocket};
use tokio::time::timeout;

use crate::{
    application::ports::autenticatore_identita::{AutenticatoreIdentita, RispostaAutenticazione},
    domain::identita::{IdentitaAutenticata, TacitusId},
    infrastructure::protocol_v3::{
        AutenticatoreProtocolloV3, FrameClient, frame_sfida, parse_frame_client,
    },
};

use super::connessione::{invia_errore, invia_frame};

const TIMEOUT_AUTENTICAZIONE: Duration = Duration::from_secs(30);

pub(super) async fn autentica(
    socket: &mut WebSocket,
    autenticatore: &AutenticatoreProtocolloV3,
) -> Option<(IdentitaAutenticata, Vec<TacitusId>)> {
    let sfida = autenticatore.nuova_sfida();
    invia_frame(socket, &frame_sfida(&sfida)).await.ok()?;
    let risposta = ricevi_frame(socket).await?;
    let FrameClient::RispostaAutenticazione {
        nickname,
        chiave_pubblica,
        firma,
    } = risposta
    else {
        let _ = invia_errore(socket, None, "authentication_failed").await;
        return None;
    };
    let identita = match autenticatore.autentica(
        &sfida,
        RispostaAutenticazione {
            nickname: &nickname,
            chiave_pubblica: &chiave_pubblica,
            firma: &firma,
        },
    ) {
        Ok(identita) => identita,
        Err(_) => {
            let _ = invia_errore(socket, None, "authentication_failed").await;
            return None;
        }
    };
    let sincronizzazione = ricevi_frame(socket).await?;
    let FrameClient::SincronizzaBlocchi { blocchi } = sincronizzazione else {
        let _ = invia_errore(socket, None, "invalid_request").await;
        return None;
    };
    Some((identita, blocchi))
}

async fn ricevi_frame(socket: &mut WebSocket) -> Option<FrameClient> {
    let messaggio = timeout(TIMEOUT_AUTENTICAZIONE, socket.recv())
        .await
        .ok()??
        .ok()?;
    let Message::Text(testo) = messaggio else {
        return None;
    };
    parse_frame_client(testo.as_str()).ok()
}

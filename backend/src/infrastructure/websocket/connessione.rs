use std::time::Duration;

use axum::extract::ws::{CloseFrame, Message, Utf8Bytes, WebSocket, close_code};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use tokio::time::{Instant, timeout};
use tracing::{info, warn};

use crate::{
    application::{
        ports::coordinatore_relay::{CoordinatoreRelay, ErroreCoordinatore, RegistrazioneSessione},
        relay::{ComandoRelay, ErroreRelay, MotivoChiusura},
    },
    domain::{relazioni::Blocco, sessioni::SessionId},
    infrastructure::{
        actors::{RelayHandle, RicevitoreSessione, nuovo_canale_sessione},
        protocol_v3::{
            AutenticatoreProtocolloV3, ErroreFrame, FrameClient, FrameServer, codice_errore,
            parse_frame_client,
        },
    },
};

use super::{autenticazione::autentica, limiti::LimitiConnessione};

pub const MASSIMA_DIMENSIONE_FRAME: usize = 64 * 1024;
const TIMEOUT_SCRITTURA: Duration = Duration::from_secs(5);
const CAPACITA_MAILBOX_SESSIONE: usize = 128;

pub async fn gestisci_connessione(
    mut socket: WebSocket,
    relay: RelayHandle,
    autenticatore: AutenticatoreProtocolloV3,
) {
    let Some((identita, blocchi)) = autentica(&mut socket, &autenticatore).await else {
        warn!(evento = "autenticazione_rifiutata");
        return;
    };
    let sessione = nuova_sessione();
    let blocchi = blocchi
        .into_iter()
        .map(|destinatario| Blocco::new(identita.tacitus_id().clone(), destinatario))
        .collect();
    let (destinatario, ricevitore) =
        nuovo_canale_sessione(sessione.clone(), CAPACITA_MAILBOX_SESSIONE);
    let registrazione = relay
        .registra(RegistrazioneSessione {
            identita,
            sessione: sessione.clone(),
            blocchi,
            destinatario,
        })
        .await;
    if let Err(errore) = registrazione {
        let _ = invia_errore(&mut socket, None, codice_errore(errore)).await;
        return;
    }
    info!(evento = "sessione_aperta");
    esegui_actor_sessione(socket, relay.clone(), sessione.clone(), ricevitore).await;
    let _ = relay
        .esegui(ComandoRelay::Disconnetti {
            sessione: sessione.clone(),
        })
        .await;
    info!(evento = "sessione_chiusa");
}

async fn esegui_actor_sessione(
    mut socket: WebSocket,
    relay: RelayHandle,
    sessione: SessionId,
    mut ricevitore: RicevitoreSessione,
) {
    let mut limiti = LimitiConnessione::default();
    loop {
        tokio::select! {
            cambiata = ricevitore.chiusura.changed() => {
                if cambiata.is_err() { break; }
                let motivo = ricevitore.chiusura.borrow().clone();
                if let Some(motivo) = motivo {
                    let _ = chiudi_socket(&mut socket, motivo).await;
                    break;
                }
            }
            evento = ricevitore.eventi.recv() => {
                let Some(evento) = evento else { break; };
                if invia_frame(&mut socket, &FrameServer::from(evento)).await.is_err() { break; }
            }
            messaggio = socket.recv() => {
                let Some(Ok(messaggio)) = messaggio else { break; };
                match messaggio {
                    Message::Text(testo) => {
                        let frame = match parse_frame_client(testo.as_str()) {
                            Ok(frame) => frame,
                            Err(errore) => {
                                let _ = invia_errore(&mut socket, None, codice_errore_frame(errore)).await;
                                continue;
                            }
                        };
                        let richiesta = frame.richiesta().map(|id| id.as_str().to_owned());
                        let comando = match comando(frame, &sessione, &mut limiti) {
                            Ok(comando) => comando,
                            Err(errore) => {
                                let _ = invia_errore(&mut socket, richiesta.as_deref(), codice_errore(ErroreCoordinatore::Relay(errore))).await;
                                continue;
                            }
                        };
                        if let Err(errore) = relay.esegui(comando).await {
                            let _ = invia_errore(&mut socket, richiesta.as_deref(), codice_errore(errore)).await;
                        }
                    }
                    Message::Ping(bytes) => {
                        if timeout(TIMEOUT_SCRITTURA, socket.send(Message::Pong(bytes))).await.is_err() { break; }
                    }
                    Message::Close(_) => break,
                    Message::Binary(_) | Message::Pong(_) => {}
                }
            }
        }
    }
}

fn comando(
    frame: FrameClient,
    sessione: &SessionId,
    limiti: &mut LimitiConnessione,
) -> Result<ComandoRelay, ErroreRelay> {
    let ora = Instant::now();
    match frame {
        FrameClient::CreaIntento {
            richiesta,
            destinatario,
        } => {
            limiti.contatto(ora)?;
            Ok(ComandoRelay::CreaIntento {
                sessione: sessione.clone(),
                richiesta,
                destinatario,
            })
        }
        FrameClient::AnnullaIntento {
            richiesta,
            destinatario,
        } => {
            limiti.contatto(ora)?;
            Ok(ComandoRelay::AnnullaIntento {
                sessione: sessione.clone(),
                richiesta,
                destinatario,
            })
        }
        FrameClient::RimuoviContatto {
            richiesta,
            destinatario,
        } => {
            limiti.contatto(ora)?;
            Ok(ComandoRelay::RimuoviRelazione {
                sessione: sessione.clone(),
                richiesta,
                destinatario,
            })
        }
        FrameClient::Blocca {
            richiesta,
            destinatario,
        } => {
            limiti.contatto(ora)?;
            Ok(ComandoRelay::Blocca {
                sessione: sessione.clone(),
                richiesta,
                destinatario,
            })
        }
        FrameClient::Sblocca {
            richiesta,
            destinatario,
        } => {
            limiti.contatto(ora)?;
            Ok(ComandoRelay::Sblocca {
                sessione: sessione.clone(),
                richiesta,
                destinatario,
            })
        }
        FrameClient::Instrada {
            richiesta,
            destinatario,
            tipo,
            corpo,
        } => {
            limiti.messaggio(ora)?;
            Ok(ComandoRelay::Instrada {
                sessione: sessione.clone(),
                richiesta,
                destinatario,
                tipo,
                corpo,
            })
        }
        FrameClient::RispostaAutenticazione { .. } | FrameClient::SincronizzaBlocchi { .. } => {
            Err(ErroreRelay::RichiestaNonValida)
        }
    }
}

pub(super) async fn invia_frame(socket: &mut WebSocket, frame: &FrameServer) -> Result<(), ()> {
    let testo = serde_json::to_string(frame).map_err(|_| ())?;
    timeout(TIMEOUT_SCRITTURA, socket.send(Message::Text(testo.into())))
        .await
        .map_err(|_| ())?
        .map_err(|_| ())
}

pub(super) async fn invia_errore(
    socket: &mut WebSocket,
    richiesta: Option<&str>,
    codice: &'static str,
) -> Result<(), ()> {
    invia_frame(
        socket,
        &FrameServer::Errore {
            v: 3,
            request_id: richiesta.map(str::to_owned),
            code: codice,
        },
    )
    .await
}

async fn chiudi_socket(socket: &mut WebSocket, motivo: MotivoChiusura) -> Result<(), ()> {
    let (code, reason) = match motivo {
        MotivoChiusura::RiavvioServizio => (1012, "service restart"),
        MotivoChiusura::SessioneLenta => (1013, "slow session"),
        MotivoChiusura::SessioneSostituita => (close_code::NORMAL, "session replaced"),
    };
    timeout(
        TIMEOUT_SCRITTURA,
        socket.send(Message::Close(Some(CloseFrame {
            code,
            reason: Utf8Bytes::from_static(reason),
        }))),
    )
    .await
    .map_err(|_| ())?
    .map_err(|_| ())
}

fn nuova_sessione() -> SessionId {
    SessionId::new(URL_SAFE_NO_PAD.encode::<[u8; 16]>(rand::random()))
        .expect("un identificativo casuale è sempre valido")
}

fn codice_errore_frame(errore: ErroreFrame) -> &'static str {
    match errore {
        ErroreFrame::NonValido | ErroreFrame::VersioneNonSupportata => "invalid_request",
        ErroreFrame::DatiTroppoGrandi => "payload_too_large",
    }
}

use serde::Serialize;

use crate::application::{
    ports::coordinatore_relay::ErroreCoordinatore,
    relay::{ErroreRelay, EventoSessione},
};
use crate::domain::relay::TipoPayload;

use super::VERSIONE_PROTOCOLLO;

#[derive(Clone, Debug, PartialEq, Serialize)]
#[serde(tag = "type")]
pub enum FrameServer {
    #[serde(rename = "auth.challenge")]
    SfidaAutenticazione { v: u8, nonce: String },
    #[serde(rename = "auth.ready")]
    AutenticazioneCompletata {
        v: u8,
        nickname: String,
        tacitus_id: String,
    },
    #[serde(rename = "contact.pending")]
    IntentoConfermato {
        v: u8,
        #[serde(skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        tacitus_id: String,
    },
    #[serde(rename = "contact.matched")]
    ContattoAssociato {
        v: u8,
        tacitus_id: String,
        nickname: String,
        online: bool,
    },
    #[serde(rename = "contact.state")]
    RelazioneCambiata {
        v: u8,
        tacitus_id: String,
        active: bool,
    },
    #[serde(rename = "contact.removed")]
    ContattoRimosso {
        v: u8,
        request_id: String,
        tacitus_id: String,
    },
    #[serde(rename = "contact.blocked")]
    BloccoConfermato {
        v: u8,
        request_id: String,
        tacitus_id: String,
    },
    #[serde(rename = "contact.unblocked")]
    SbloccoConfermato {
        v: u8,
        request_id: String,
        tacitus_id: String,
    },
    #[serde(rename = "presence.changed")]
    PresenzaCambiata {
        v: u8,
        tacitus_id: String,
        online: bool,
    },
    #[serde(rename = "handshake.sent")]
    HandshakeInviato { v: u8, request_id: String },
    #[serde(rename = "handshake.received")]
    HandshakeRicevuto {
        v: u8,
        from_id: String,
        body: String,
    },
    #[serde(rename = "message.sent")]
    MessaggioInviato { v: u8, request_id: String },
    #[serde(rename = "message.received")]
    MessaggioRicevuto {
        v: u8,
        from_id: String,
        body: String,
    },
    #[serde(rename = "error")]
    Errore {
        v: u8,
        #[serde(skip_serializing_if = "Option::is_none")]
        request_id: Option<String>,
        code: &'static str,
    },
}

impl From<EventoSessione> for FrameServer {
    fn from(evento: EventoSessione) -> Self {
        match evento {
            EventoSessione::AutenticazioneCompletata {
                nickname,
                tacitus_id,
            } => Self::AutenticazioneCompletata {
                v: VERSIONE_PROTOCOLLO,
                nickname,
                tacitus_id: tacitus_id.to_string(),
            },
            EventoSessione::IntentoConfermato {
                richiesta,
                tacitus_id,
            } => Self::IntentoConfermato {
                v: VERSIONE_PROTOCOLLO,
                request_id: richiesta.map(|id| id.as_str().to_owned()),
                tacitus_id: tacitus_id.to_string(),
            },
            EventoSessione::RelazioneStabilita {
                tacitus_id,
                nickname,
                presenza,
            } => Self::ContattoAssociato {
                v: VERSIONE_PROTOCOLLO,
                tacitus_id: tacitus_id.to_string(),
                nickname,
                online: presenza.online(),
            },
            EventoSessione::RelazioneTerminata { tacitus_id } => Self::RelazioneCambiata {
                v: VERSIONE_PROTOCOLLO,
                tacitus_id: tacitus_id.to_string(),
                active: false,
            },
            EventoSessione::RelazioneRimossa {
                richiesta,
                tacitus_id,
            } => Self::ContattoRimosso {
                v: VERSIONE_PROTOCOLLO,
                request_id: richiesta.as_str().to_owned(),
                tacitus_id: tacitus_id.to_string(),
            },
            EventoSessione::BloccoConfermato {
                richiesta,
                tacitus_id,
            } => Self::BloccoConfermato {
                v: VERSIONE_PROTOCOLLO,
                request_id: richiesta.as_str().to_owned(),
                tacitus_id: tacitus_id.to_string(),
            },
            EventoSessione::SbloccoConfermato {
                richiesta,
                tacitus_id,
            } => Self::SbloccoConfermato {
                v: VERSIONE_PROTOCOLLO,
                request_id: richiesta.as_str().to_owned(),
                tacitus_id: tacitus_id.to_string(),
            },
            EventoSessione::PresenzaCambiata {
                tacitus_id,
                presenza,
            } => Self::PresenzaCambiata {
                v: VERSIONE_PROTOCOLLO,
                tacitus_id: tacitus_id.to_string(),
                online: presenza.online(),
            },
            EventoSessione::PayloadInviato { richiesta, tipo } => match tipo {
                TipoPayload::Handshake => Self::HandshakeInviato {
                    v: VERSIONE_PROTOCOLLO,
                    request_id: richiesta.as_str().to_owned(),
                },
                TipoPayload::Messaggio => Self::MessaggioInviato {
                    v: VERSIONE_PROTOCOLLO,
                    request_id: richiesta.as_str().to_owned(),
                },
            },
            EventoSessione::PayloadRicevuto {
                mittente,
                tipo,
                corpo,
            } => match tipo {
                TipoPayload::Handshake => Self::HandshakeRicevuto {
                    v: VERSIONE_PROTOCOLLO,
                    from_id: mittente.to_string(),
                    body: corpo.as_str().to_owned(),
                },
                TipoPayload::Messaggio => Self::MessaggioRicevuto {
                    v: VERSIONE_PROTOCOLLO,
                    from_id: mittente.to_string(),
                    body: corpo.as_str().to_owned(),
                },
            },
        }
    }
}

pub fn codice_errore(errore: ErroreCoordinatore) -> &'static str {
    match errore {
        ErroreCoordinatore::ServerOccupato => "server_busy",
        ErroreCoordinatore::ActorTerminato => "server_unavailable",
        ErroreCoordinatore::Relay(errore) => match errore {
            ErroreRelay::AutenticazioneFallita => "authentication_failed",
            ErroreRelay::CollisioneIdentita => "identity_collision",
            ErroreRelay::ContattoNonDisponibile => "contact_unavailable",
            ErroreRelay::RichiestaNonValida => "invalid_request",
            ErroreRelay::CapacitaEsaurita => "server_busy",
            ErroreRelay::TroppiIntenti => "too_many_contacts",
        },
    }
}

use std::str::FromStr;

use serde::Deserialize;

use crate::domain::{
    contatti::MASSIMO_BLOCCHI_PER_IDENTITA,
    identita::TacitusId,
    relay::{CorpoCifrato, RichiestaId, TipoPayload},
};

mod server;
pub use server::{FrameServer, codice_errore};

const VERSIONE_PROTOCOLLO: u8 = 3;

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum FrameClient {
    RispostaAutenticazione {
        nickname: String,
        chiave_pubblica: String,
        firma: String,
    },
    SincronizzaBlocchi {
        blocchi: Vec<TacitusId>,
    },
    CreaIntento {
        richiesta: RichiestaId,
        destinatario: TacitusId,
    },
    AnnullaIntento {
        richiesta: RichiestaId,
        destinatario: TacitusId,
    },
    RimuoviContatto {
        richiesta: RichiestaId,
        destinatario: TacitusId,
    },
    Blocca {
        richiesta: RichiestaId,
        destinatario: TacitusId,
    },
    Sblocca {
        richiesta: RichiestaId,
        destinatario: TacitusId,
    },
    Instrada {
        richiesta: RichiestaId,
        destinatario: TacitusId,
        tipo: TipoPayload,
        corpo: CorpoCifrato,
    },
}

impl FrameClient {
    pub fn richiesta(&self) -> Option<&RichiestaId> {
        match self {
            Self::CreaIntento { richiesta, .. }
            | Self::AnnullaIntento { richiesta, .. }
            | Self::RimuoviContatto { richiesta, .. }
            | Self::Blocca { richiesta, .. }
            | Self::Sblocca { richiesta, .. }
            | Self::Instrada { richiesta, .. } => Some(richiesta),
            Self::RispostaAutenticazione { .. } | Self::SincronizzaBlocchi { .. } => None,
        }
    }
}

#[derive(Deserialize)]
#[serde(tag = "type", deny_unknown_fields)]
enum FrameClientWire {
    #[serde(rename = "auth.respond")]
    RispostaAutenticazione {
        v: u8,
        nickname: String,
        public_key: String,
        signature: String,
    },
    #[serde(rename = "contact.blocks.sync")]
    SincronizzaBlocchi { v: u8, tacitus_ids: Vec<String> },
    #[serde(rename = "contact.add")]
    CreaIntento {
        v: u8,
        request_id: String,
        tacitus_id: String,
    },
    #[serde(rename = "contact.cancel")]
    AnnullaIntento {
        v: u8,
        request_id: String,
        tacitus_id: String,
    },
    #[serde(rename = "contact.remove")]
    RimuoviContatto {
        v: u8,
        request_id: String,
        tacitus_id: String,
    },
    #[serde(rename = "contact.block")]
    Blocca {
        v: u8,
        request_id: String,
        tacitus_id: String,
    },
    #[serde(rename = "contact.unblock")]
    Sblocca {
        v: u8,
        request_id: String,
        tacitus_id: String,
    },
    #[serde(rename = "handshake.send")]
    InviaHandshake {
        v: u8,
        request_id: String,
        to_id: String,
        body: String,
    },
    #[serde(rename = "message.send")]
    InviaMessaggio {
        v: u8,
        request_id: String,
        to_id: String,
        body: String,
    },
}

impl FrameClientWire {
    fn versione(&self) -> u8 {
        match self {
            Self::RispostaAutenticazione { v, .. }
            | Self::SincronizzaBlocchi { v, .. }
            | Self::CreaIntento { v, .. }
            | Self::AnnullaIntento { v, .. }
            | Self::RimuoviContatto { v, .. }
            | Self::Blocca { v, .. }
            | Self::Sblocca { v, .. }
            | Self::InviaHandshake { v, .. }
            | Self::InviaMessaggio { v, .. } => *v,
        }
    }
}

pub fn parse_frame_client(value: &str) -> Result<FrameClient, ErroreFrame> {
    let wire: FrameClientWire = serde_json::from_str(value).map_err(|_| ErroreFrame::NonValido)?;
    if wire.versione() != VERSIONE_PROTOCOLLO {
        return Err(ErroreFrame::VersioneNonSupportata);
    }
    match wire {
        FrameClientWire::RispostaAutenticazione {
            nickname,
            public_key,
            signature,
            ..
        } => Ok(FrameClient::RispostaAutenticazione {
            nickname,
            chiave_pubblica: public_key,
            firma: signature,
        }),
        FrameClientWire::SincronizzaBlocchi { tacitus_ids, .. } => {
            if tacitus_ids.len() > MASSIMO_BLOCCHI_PER_IDENTITA {
                return Err(ErroreFrame::NonValido);
            }
            let blocchi = tacitus_ids
                .into_iter()
                .map(|id| TacitusId::from_str(&id).map_err(|_| ErroreFrame::NonValido))
                .collect::<Result<Vec<_>, _>>()?;
            Ok(FrameClient::SincronizzaBlocchi { blocchi })
        }
        FrameClientWire::CreaIntento {
            request_id,
            tacitus_id,
            ..
        } => Ok(FrameClient::CreaIntento {
            richiesta: parse_richiesta(request_id)?,
            destinatario: parse_tacitus_id(tacitus_id)?,
        }),
        FrameClientWire::AnnullaIntento {
            request_id,
            tacitus_id,
            ..
        } => Ok(FrameClient::AnnullaIntento {
            richiesta: parse_richiesta(request_id)?,
            destinatario: parse_tacitus_id(tacitus_id)?,
        }),
        FrameClientWire::RimuoviContatto {
            request_id,
            tacitus_id,
            ..
        } => Ok(FrameClient::RimuoviContatto {
            richiesta: parse_richiesta(request_id)?,
            destinatario: parse_tacitus_id(tacitus_id)?,
        }),
        FrameClientWire::Blocca {
            request_id,
            tacitus_id,
            ..
        } => Ok(FrameClient::Blocca {
            richiesta: parse_richiesta(request_id)?,
            destinatario: parse_tacitus_id(tacitus_id)?,
        }),
        FrameClientWire::Sblocca {
            request_id,
            tacitus_id,
            ..
        } => Ok(FrameClient::Sblocca {
            richiesta: parse_richiesta(request_id)?,
            destinatario: parse_tacitus_id(tacitus_id)?,
        }),
        FrameClientWire::InviaHandshake {
            request_id,
            to_id,
            body,
            ..
        } => parse_payload(request_id, to_id, body, TipoPayload::Handshake),
        FrameClientWire::InviaMessaggio {
            request_id,
            to_id,
            body,
            ..
        } => parse_payload(request_id, to_id, body, TipoPayload::Messaggio),
    }
}

fn parse_richiesta(value: String) -> Result<RichiestaId, ErroreFrame> {
    RichiestaId::new(value).map_err(|_| ErroreFrame::NonValido)
}

fn parse_tacitus_id(value: String) -> Result<TacitusId, ErroreFrame> {
    TacitusId::from_str(&value).map_err(|_| ErroreFrame::NonValido)
}

fn parse_payload(
    richiesta: String,
    destinatario: String,
    corpo: String,
    tipo: TipoPayload,
) -> Result<FrameClient, ErroreFrame> {
    Ok(FrameClient::Instrada {
        richiesta: parse_richiesta(richiesta)?,
        destinatario: parse_tacitus_id(destinatario)?,
        tipo,
        corpo: CorpoCifrato::new(corpo).map_err(|_| ErroreFrame::DatiTroppoGrandi)?,
    })
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ErroreFrame {
    NonValido,
    VersioneNonSupportata,
    DatiTroppoGrandi,
}

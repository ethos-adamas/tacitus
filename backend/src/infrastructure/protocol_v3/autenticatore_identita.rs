use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use tacitus_protocol::{IdentityDocument, verify_authentication};

use crate::{
    application::ports::autenticatore_identita::{
        AutenticatoreIdentita, AutenticazioneFallita, RispostaAutenticazione, SfidaAutenticazione,
    },
    domain::identita::{IdentitaAutenticata, TacitusId},
};

#[derive(Clone, Copy, Default)]
pub struct AutenticatoreProtocolloV3;

impl AutenticatoreIdentita for AutenticatoreProtocolloV3 {
    fn nuova_sfida(&self) -> SfidaAutenticazione {
        SfidaAutenticazione(rand::random())
    }

    fn autentica(
        &self,
        sfida: &SfidaAutenticazione,
        risposta: RispostaAutenticazione<'_>,
    ) -> Result<IdentitaAutenticata, AutenticazioneFallita> {
        let chiave_pubblica = URL_SAFE_NO_PAD
            .decode(risposta.chiave_pubblica)
            .map_err(|_| AutenticazioneFallita)?;
        let firma = URL_SAFE_NO_PAD
            .decode(risposta.firma)
            .map_err(|_| AutenticazioneFallita)?;
        let documento = IdentityDocument::new(risposta.nickname, chiave_pubblica.clone())
            .map_err(|_| AutenticazioneFallita)?;
        verify_authentication(&documento, &sfida.0, &firma).map_err(|_| AutenticazioneFallita)?;
        IdentitaAutenticata::new(
            TacitusId::from_bytes(*documento.id()),
            documento.nickname().to_owned(),
            chiave_pubblica,
        )
        .map_err(|_| AutenticazioneFallita)
    }
}

pub fn frame_sfida(sfida: &SfidaAutenticazione) -> FrameServer {
    FrameServer::SfidaAutenticazione {
        v: 3,
        nonce: URL_SAFE_NO_PAD.encode(sfida.0),
    }
}

use super::FrameServer;

use crate::domain::{
    contatti::Blocco,
    identita::{IdentitaAutenticata, TacitusId},
    relay::{CorpoCifrato, RichiestaId, TipoPayload},
    sessioni::SessionId,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum ComandoRelay {
    RegistraSessione {
        identita: IdentitaAutenticata,
        sessione: SessionId,
        blocchi: Vec<Blocco>,
    },
    Disconnetti {
        sessione: SessionId,
    },
    ScadenzaSessione {
        identita: TacitusId,
        sessione: SessionId,
    },
    CreaIntento {
        sessione: SessionId,
        richiesta: RichiestaId,
        destinatario: TacitusId,
    },
    AnnullaIntento {
        sessione: SessionId,
        richiesta: RichiestaId,
        destinatario: TacitusId,
    },
    RimuoviContatto {
        sessione: SessionId,
        richiesta: RichiestaId,
        destinatario: TacitusId,
    },
    Blocca {
        sessione: SessionId,
        richiesta: RichiestaId,
        destinatario: TacitusId,
    },
    Sblocca {
        sessione: SessionId,
        richiesta: RichiestaId,
        destinatario: TacitusId,
    },
    Instrada {
        sessione: SessionId,
        richiesta: RichiestaId,
        destinatario: TacitusId,
        tipo: TipoPayload,
        corpo: CorpoCifrato,
    },
}

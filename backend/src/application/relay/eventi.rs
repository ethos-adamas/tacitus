use std::time::Duration;

use crate::domain::{
    identita::TacitusId,
    relay::{CorpoCifrato, RichiestaId, TipoPayload},
    sessioni::SessionId,
};

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EventoSessione {
    AutenticazioneCompletata {
        nickname: String,
        tacitus_id: TacitusId,
    },
    IntentoConfermato {
        richiesta: Option<RichiestaId>,
        tacitus_id: TacitusId,
    },
    ContattoAssociato {
        tacitus_id: TacitusId,
        nickname: String,
        online: bool,
    },
    RelazioneCambiata {
        tacitus_id: TacitusId,
        attiva: bool,
    },
    ContattoRimosso {
        richiesta: RichiestaId,
        tacitus_id: TacitusId,
    },
    BloccoConfermato {
        richiesta: RichiestaId,
        tacitus_id: TacitusId,
    },
    SbloccoConfermato {
        richiesta: RichiestaId,
        tacitus_id: TacitusId,
    },
    PresenzaCambiata {
        tacitus_id: TacitusId,
        online: bool,
    },
    PayloadInviato {
        richiesta: RichiestaId,
        tipo: TipoPayload,
    },
    PayloadRicevuto {
        mittente: TacitusId,
        tipo: TipoPayload,
        corpo: CorpoCifrato,
    },
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum MotivoChiusura {
    SessioneSostituita,
    SessioneLenta,
    RiavvioServizio,
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum EventoRelay {
    Consegna {
        sessione: SessionId,
        evento: EventoSessione,
    },
    Instradamento {
        mittente: SessionId,
        destinatario: SessionId,
        ricevuto: EventoSessione,
        conferma: EventoSessione,
    },
    PianificaScadenza {
        identita: TacitusId,
        sessione: SessionId,
        dopo: Duration,
    },
    ChiudiSessione {
        sessione: SessionId,
        motivo: MotivoChiusura,
    },
}

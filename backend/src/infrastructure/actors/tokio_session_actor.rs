use std::sync::Arc;

use tokio::sync::{mpsc, watch};

use crate::application::{
    ports::coordinatore_relay::{ConsegnaFallita, DestinatarioSessione},
    relay::{EventoSessione, MotivoChiusura},
};
use crate::domain::sessioni::SessionId;

struct DestinatarioTokio {
    eventi: mpsc::Sender<EventoSessione>,
    chiusura: watch::Sender<Option<MotivoChiusura>>,
}

impl DestinatarioSessione for DestinatarioTokio {
    fn consegna(&self, evento: EventoSessione) -> Result<(), ConsegnaFallita> {
        self.eventi.try_send(evento).map_err(|errore| match errore {
            mpsc::error::TrySendError::Full(_) => ConsegnaFallita::MailboxPiena,
            mpsc::error::TrySendError::Closed(_) => ConsegnaFallita::SessioneChiusa,
        })
    }

    fn chiudi(&self, motivo: MotivoChiusura) {
        self.chiusura.send_replace(Some(motivo));
    }
}

pub struct RicevitoreSessione {
    pub sessione: SessionId,
    pub eventi: mpsc::Receiver<EventoSessione>,
    pub chiusura: watch::Receiver<Option<MotivoChiusura>>,
}

pub fn nuovo_canale_sessione(
    sessione: SessionId,
    capacita: usize,
) -> (Arc<dyn DestinatarioSessione>, RicevitoreSessione) {
    let (eventi, ricevitore_eventi) = mpsc::channel(capacita);
    let (chiusura, ricevitore_chiusura) = watch::channel(None);
    (
        Arc::new(DestinatarioTokio { eventi, chiusura }),
        RicevitoreSessione {
            sessione,
            eventi: ricevitore_eventi,
            chiusura: ricevitore_chiusura,
        },
    )
}

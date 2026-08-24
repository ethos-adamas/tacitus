use std::{future::Future, sync::Arc};

use crate::{
    application::relay::{ComandoRelay, ErroreRelay, EventoSessione, MotivoChiusura},
    domain::sessioni::SessionId,
};

pub trait DestinatarioSessione: Send + Sync + 'static {
    fn consegna(&self, evento: EventoSessione) -> Result<(), ConsegnaFallita>;
    fn chiudi(&self, motivo: MotivoChiusura);
}

pub trait CoordinatoreRelay: Clone + Send + Sync + 'static {
    fn esegui(
        &self,
        comando: ComandoRelay,
    ) -> impl Future<Output = Result<(), ErroreCoordinatore>> + Send;

    fn registra(
        &self,
        comando: ComandoRelay,
        sessione: SessionId,
        destinatario: Arc<dyn DestinatarioSessione>,
    ) -> impl Future<Output = Result<(), ErroreCoordinatore>> + Send;

    fn arresta(&self) -> impl Future<Output = Result<(), ErroreCoordinatore>> + Send;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ConsegnaFallita {
    MailboxPiena,
    SessioneChiusa,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ErroreCoordinatore {
    Relay(ErroreRelay),
    ServerOccupato,
    ActorTerminato,
}

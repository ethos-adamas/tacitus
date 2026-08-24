use std::{collections::HashMap, sync::Arc, time::Duration};

use tokio::{
    sync::{mpsc, oneshot},
    task::JoinHandle,
    time::sleep,
};

use crate::{
    application::{
        ports::coordinatore_relay::{
            CoordinatoreRelay, DestinatarioSessione, ErroreCoordinatore, RegistrazioneSessione,
        },
        relay::{ComandoRelay, ErroreRelay, EventoRelay, MotivoChiusura, Relay},
    },
    domain::{identita::TacitusId, sessioni::SessionId},
};

enum MessaggioActor {
    Esegui {
        comando: ComandoRelay,
        risposta: oneshot::Sender<Result<(), ErroreCoordinatore>>,
    },
    Registra {
        registrazione: RegistrazioneSessione,
        risposta: oneshot::Sender<Result<(), ErroreCoordinatore>>,
    },
    Scadenza(ComandoRelay),
    Arresta(oneshot::Sender<()>),
}

#[derive(Clone)]
pub struct RelayHandle {
    mailbox: mpsc::Sender<MessaggioActor>,
}

impl RelayHandle {
    pub fn operativo(&self) -> bool {
        !self.mailbox.is_closed()
    }

    fn invia(
        &self,
        comando: ComandoRelay,
    ) -> impl Future<Output = Result<(), ErroreCoordinatore>> + Send {
        let (risposta, ricevitore) = oneshot::channel();
        let invio = self
            .mailbox
            .try_send(MessaggioActor::Esegui { comando, risposta });
        async move {
            invio.map_err(|errore| match errore {
                mpsc::error::TrySendError::Full(_) => ErroreCoordinatore::ServerOccupato,
                mpsc::error::TrySendError::Closed(_) => ErroreCoordinatore::ActorTerminato,
            })?;
            ricevitore
                .await
                .unwrap_or(Err(ErroreCoordinatore::ActorTerminato))
        }
    }
}

impl CoordinatoreRelay for RelayHandle {
    fn esegui(
        &self,
        comando: ComandoRelay,
    ) -> impl Future<Output = Result<(), ErroreCoordinatore>> + Send {
        self.invia(comando)
    }

    fn registra(
        &self,
        registrazione: RegistrazioneSessione,
    ) -> impl Future<Output = Result<(), ErroreCoordinatore>> + Send {
        let mailbox = self.mailbox.clone();
        async move {
            let (risposta, ricevitore) = oneshot::channel();
            mailbox
                .try_send(MessaggioActor::Registra {
                    registrazione,
                    risposta,
                })
                .map_err(|errore| match errore {
                    mpsc::error::TrySendError::Full(_) => ErroreCoordinatore::ServerOccupato,
                    mpsc::error::TrySendError::Closed(_) => ErroreCoordinatore::ActorTerminato,
                })?;
            ricevitore
                .await
                .unwrap_or(Err(ErroreCoordinatore::ActorTerminato))
        }
    }

    fn arresta(&self) -> impl Future<Output = Result<(), ErroreCoordinatore>> + Send {
        let mailbox = self.mailbox.clone();
        async move {
            let (risposta, ricevitore) = oneshot::channel();
            mailbox
                .send(MessaggioActor::Arresta(risposta))
                .await
                .map_err(|_| ErroreCoordinatore::ActorTerminato)?;
            ricevitore
                .await
                .map_err(|_| ErroreCoordinatore::ActorTerminato)
        }
    }
}

pub fn avvia_relay_actor(capacita: usize) -> (RelayHandle, JoinHandle<()>) {
    let (mailbox, ricevitore) = mpsc::channel(capacita);
    let handle = RelayHandle {
        mailbox: mailbox.clone(),
    };
    let actor = RelayActor {
        relay: Relay::default(),
        destinatari: HashMap::new(),
        mailbox,
        ricevitore,
    };
    (handle, tokio::spawn(actor.esegui()))
}

struct RelayActor {
    relay: Relay,
    destinatari: HashMap<SessionId, Arc<dyn DestinatarioSessione>>,
    mailbox: mpsc::Sender<MessaggioActor>,
    ricevitore: mpsc::Receiver<MessaggioActor>,
}

impl RelayActor {
    async fn esegui(mut self) {
        while let Some(messaggio) = self.ricevitore.recv().await {
            match messaggio {
                MessaggioActor::Esegui { comando, risposta } => {
                    let risultato = self.processa(comando);
                    let _ = risposta.send(risultato);
                }
                MessaggioActor::Registra {
                    registrazione,
                    risposta,
                } => {
                    let risultato = self.registra(registrazione);
                    let _ = risposta.send(risultato);
                }
                MessaggioActor::Scadenza(comando) => {
                    let _ = self.processa(comando);
                }
                MessaggioActor::Arresta(risposta) => {
                    self.chiudi_tutte(MotivoChiusura::RiavvioServizio);
                    let _ = risposta.send(());
                    return;
                }
            }
        }
        self.chiudi_tutte(MotivoChiusura::RiavvioServizio);
    }

    fn processa(&mut self, comando: ComandoRelay) -> Result<(), ErroreCoordinatore> {
        let sessione_disconnessa = match &comando {
            ComandoRelay::Disconnetti { sessione } => Some(sessione.clone()),
            _ => None,
        };
        let eventi = self
            .relay
            .esegui(comando)
            .map_err(ErroreCoordinatore::Relay)?;
        if let Some(sessione) = sessione_disconnessa {
            self.destinatari.remove(&sessione);
        }
        self.processa_eventi(eventi)
            .map_err(ErroreCoordinatore::Relay)
    }

    fn registra(&mut self, registrazione: RegistrazioneSessione) -> Result<(), ErroreCoordinatore> {
        let RegistrazioneSessione {
            identita,
            sessione,
            blocchi,
            destinatario,
        } = registrazione;
        self.destinatari
            .insert(sessione.clone(), Arc::clone(&destinatario));
        let eventi = match self.relay.registra(identita, sessione.clone(), blocchi) {
            Ok(eventi) => eventi,
            Err(errore) => {
                self.destinatari.remove(&sessione);
                return Err(ErroreCoordinatore::Relay(errore));
            }
        };
        if let Err(errore) = self.processa_eventi(eventi) {
            self.sessione_non_disponibile(&sessione);
            return Err(ErroreCoordinatore::Relay(errore));
        }
        Ok(())
    }

    fn processa_eventi(&mut self, eventi: Vec<EventoRelay>) -> Result<(), ErroreRelay> {
        for evento in eventi {
            match evento {
                EventoRelay::Consegna { sessione, evento } => {
                    if self.consegna(&sessione, evento).is_err() {
                        self.sessione_non_disponibile(&sessione);
                        return Err(ErroreRelay::ContattoNonDisponibile);
                    }
                }
                EventoRelay::Instradamento {
                    mittente,
                    destinatario,
                    ricevuto,
                    conferma,
                } => {
                    if self.consegna(&destinatario, ricevuto).is_err() {
                        self.sessione_non_disponibile(&destinatario);
                        return Err(ErroreRelay::ContattoNonDisponibile);
                    }
                    if self.consegna(&mittente, conferma).is_err() {
                        self.sessione_non_disponibile(&mittente);
                        return Err(ErroreRelay::ContattoNonDisponibile);
                    }
                }
                EventoRelay::PianificaScadenza {
                    identita,
                    sessione,
                    dopo,
                } => self.pianifica_scadenza(identita, sessione, dopo),
                EventoRelay::ChiudiSessione { sessione, motivo } => {
                    if let Some(destinatario) = self.destinatari.remove(&sessione) {
                        destinatario.chiudi(motivo);
                    }
                }
            }
        }
        Ok(())
    }

    fn consegna(
        &self,
        sessione: &SessionId,
        evento: crate::application::relay::EventoSessione,
    ) -> Result<(), ()> {
        self.destinatari
            .get(sessione)
            .ok_or(())?
            .consegna(evento)
            .map_err(|_| ())
    }

    fn sessione_non_disponibile(&mut self, sessione: &SessionId) {
        if let Some(destinatario) = self.destinatari.remove(sessione) {
            destinatario.chiudi(MotivoChiusura::SessioneLenta);
        }
        let Ok(eventi) = self.relay.esegui(ComandoRelay::Disconnetti {
            sessione: sessione.clone(),
        }) else {
            return;
        };
        for evento in eventi {
            match evento {
                EventoRelay::Consegna { sessione, evento } => {
                    let _ = self.consegna(&sessione, evento);
                }
                EventoRelay::PianificaScadenza {
                    identita,
                    sessione,
                    dopo,
                } => self.pianifica_scadenza(identita, sessione, dopo),
                EventoRelay::Instradamento { .. } | EventoRelay::ChiudiSessione { .. } => {}
            }
        }
    }

    fn pianifica_scadenza(&self, identita: TacitusId, sessione: SessionId, dopo: Duration) {
        let mailbox = self.mailbox.clone();
        tokio::spawn(async move {
            sleep(dopo).await;
            let _ = mailbox
                .send(MessaggioActor::Scadenza(ComandoRelay::ScadenzaSessione {
                    identita,
                    sessione,
                }))
                .await;
        });
    }

    fn chiudi_tutte(&mut self, motivo: MotivoChiusura) {
        for destinatario in self
            .destinatari
            .drain()
            .map(|(_, destinatario)| destinatario)
        {
            destinatario.chiudi(motivo.clone());
        }
    }
}

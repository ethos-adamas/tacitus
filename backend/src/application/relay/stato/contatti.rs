use crate::{
    application::relay::{ErroreRelay, EventoRelay, EventoSessione},
    domain::{
        contatti::{Blocco, Contatto, IntentoDiContatto},
        identita::TacitusId,
        relay::{CorpoCifrato, RichiestaId, TipoPayload},
        sessioni::SessionId,
    },
};

use super::Relay;

const MASSIMO_INTENTI: usize = 20;

impl Relay {
    pub(super) fn crea_intento(
        &mut self,
        sessione: &SessionId,
        richiesta: RichiestaId,
        destinatario: TacitusId,
    ) -> Result<Vec<EventoRelay>, ErroreRelay> {
        let mittente = self.identita_della_sessione(sessione)?.clone();
        if mittente == destinatario {
            return Err(ErroreRelay::RichiestaNonValida);
        }
        if self.esiste_blocco(&mittente, &destinatario) {
            return Err(ErroreRelay::ContattoNonDisponibile);
        }
        let contatto = Contatto::new(mittente.clone(), destinatario.clone());
        if self.contatti.contains(&contatto) {
            return self.snapshot_relazione(sessione, &destinatario);
        }
        if self
            .intenti
            .iter()
            .filter(|intento| intento.da == mittente)
            .count()
            >= MASSIMO_INTENTI
        {
            return Err(ErroreRelay::TroppiIntenti);
        }
        self.intenti.insert(IntentoDiContatto::new(
            mittente.clone(),
            destinatario.clone(),
        ));
        let reciproco = self.intenti.contains(&IntentoDiContatto::new(
            destinatario.clone(),
            mittente.clone(),
        )) && self.sessione_attiva(&destinatario).is_ok();
        if !reciproco {
            return Ok(vec![EventoRelay::Consegna {
                sessione: sessione.clone(),
                evento: EventoSessione::IntentoConfermato {
                    richiesta: Some(richiesta),
                    tacitus_id: destinatario,
                },
            }]);
        }
        self.contatti.insert(contatto);
        self.rimuovi_intenti_reciproci(&mittente, &destinatario);
        let destinatario_runtime = self
            .identita
            .get(&destinatario)
            .ok_or(ErroreRelay::ContattoNonDisponibile)?;
        let mittente_runtime = self
            .identita
            .get(&mittente)
            .ok_or(ErroreRelay::ContattoNonDisponibile)?;
        Ok(vec![
            EventoRelay::Consegna {
                sessione: sessione.clone(),
                evento: EventoSessione::ContattoAssociato {
                    tacitus_id: destinatario.clone(),
                    nickname: destinatario_runtime.identita.nickname().to_owned(),
                    online: true,
                },
            },
            EventoRelay::Consegna {
                sessione: destinatario_runtime.sessione.id().clone(),
                evento: EventoSessione::ContattoAssociato {
                    tacitus_id: mittente,
                    nickname: mittente_runtime.identita.nickname().to_owned(),
                    online: true,
                },
            },
        ])
    }

    pub(super) fn annulla_intento(
        &mut self,
        sessione: &SessionId,
        richiesta: RichiestaId,
        destinatario: TacitusId,
    ) -> Result<Vec<EventoRelay>, ErroreRelay> {
        let mittente = self.identita_della_sessione(sessione)?.clone();
        self.intenti
            .remove(&IntentoDiContatto::new(mittente, destinatario.clone()));
        Ok(vec![
            EventoRelay::Consegna {
                sessione: sessione.clone(),
                evento: EventoSessione::RelazioneCambiata {
                    tacitus_id: destinatario.clone(),
                    attiva: false,
                },
            },
            EventoRelay::Consegna {
                sessione: sessione.clone(),
                evento: EventoSessione::ContattoRimosso {
                    richiesta,
                    tacitus_id: destinatario,
                },
            },
        ])
    }

    pub(super) fn rimuovi_contatto(
        &mut self,
        sessione: &SessionId,
        richiesta: RichiestaId,
        destinatario: TacitusId,
    ) -> Result<Vec<EventoRelay>, ErroreRelay> {
        let mittente = self.identita_della_sessione(sessione)?.clone();
        self.contatti
            .remove(&Contatto::new(mittente.clone(), destinatario.clone()));
        self.rimuovi_intenti_reciproci(&mittente, &destinatario);
        let mut eventi = vec![EventoRelay::Consegna {
            sessione: sessione.clone(),
            evento: EventoSessione::ContattoRimosso {
                richiesta,
                tacitus_id: destinatario.clone(),
            },
        }];
        if let Ok(sessione_destinatario) = self.sessione_attiva(&destinatario) {
            eventi.push(EventoRelay::Consegna {
                sessione: sessione_destinatario.clone(),
                evento: EventoSessione::RelazioneCambiata {
                    tacitus_id: mittente,
                    attiva: false,
                },
            });
        }
        Ok(eventi)
    }

    pub(super) fn blocca(
        &mut self,
        sessione: &SessionId,
        richiesta: RichiestaId,
        destinatario: TacitusId,
    ) -> Result<Vec<EventoRelay>, ErroreRelay> {
        let mittente = self.identita_della_sessione(sessione)?.clone();
        if mittente == destinatario {
            return Err(ErroreRelay::RichiestaNonValida);
        }
        self.blocchi
            .insert(Blocco::new(mittente.clone(), destinatario.clone()));
        self.contatti
            .remove(&Contatto::new(mittente.clone(), destinatario.clone()));
        self.rimuovi_intenti_reciproci(&mittente, &destinatario);
        let mut eventi = vec![EventoRelay::Consegna {
            sessione: sessione.clone(),
            evento: EventoSessione::BloccoConfermato {
                richiesta,
                tacitus_id: destinatario.clone(),
            },
        }];
        if let Ok(sessione_destinatario) = self.sessione_attiva(&destinatario) {
            eventi.push(EventoRelay::Consegna {
                sessione: sessione_destinatario.clone(),
                evento: EventoSessione::RelazioneCambiata {
                    tacitus_id: mittente,
                    attiva: false,
                },
            });
        }
        Ok(eventi)
    }

    pub(super) fn sblocca(
        &mut self,
        sessione: &SessionId,
        richiesta: RichiestaId,
        destinatario: TacitusId,
    ) -> Result<Vec<EventoRelay>, ErroreRelay> {
        let mittente = self.identita_della_sessione(sessione)?.clone();
        self.blocchi
            .remove(&Blocco::new(mittente, destinatario.clone()));
        Ok(vec![EventoRelay::Consegna {
            sessione: sessione.clone(),
            evento: EventoSessione::SbloccoConfermato {
                richiesta,
                tacitus_id: destinatario,
            },
        }])
    }

    pub(super) fn instrada(
        &self,
        sessione: SessionId,
        richiesta: RichiestaId,
        destinatario: TacitusId,
        tipo: TipoPayload,
        corpo: CorpoCifrato,
    ) -> Result<Vec<EventoRelay>, ErroreRelay> {
        let mittente = self.identita_della_sessione(&sessione)?.clone();
        if !self
            .contatti
            .contains(&Contatto::new(mittente.clone(), destinatario.clone()))
            || self.esiste_blocco(&mittente, &destinatario)
        {
            return Err(ErroreRelay::ContattoNonDisponibile);
        }
        let sessione_destinatario = self.sessione_attiva(&destinatario)?.clone();
        Ok(vec![EventoRelay::Instradamento {
            mittente: sessione,
            destinatario: sessione_destinatario,
            ricevuto: EventoSessione::PayloadRicevuto {
                mittente,
                tipo,
                corpo,
            },
            conferma: EventoSessione::PayloadInviato { richiesta, tipo },
        }])
    }

    fn snapshot_relazione(
        &self,
        sessione: &SessionId,
        destinatario: &TacitusId,
    ) -> Result<Vec<EventoRelay>, ErroreRelay> {
        let runtime = self
            .identita
            .get(destinatario)
            .ok_or(ErroreRelay::ContattoNonDisponibile)?;
        Ok(vec![EventoRelay::Consegna {
            sessione: sessione.clone(),
            evento: EventoSessione::ContattoAssociato {
                tacitus_id: destinatario.clone(),
                nickname: runtime.identita.nickname().to_owned(),
                online: runtime.sessione.attiva(),
            },
        }])
    }
}

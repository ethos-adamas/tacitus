use crate::domain::{
    contatti::{Blocco, MASSIMO_BLOCCHI_PER_IDENTITA},
    identita::{IdentitaAutenticata, TacitusId},
    sessioni::{SessionId, StatoSessione},
};

use super::{ErroreRelay, EventoRelay, IdentitaRuntime, Relay};
use crate::application::relay::{EventoSessione, MotivoChiusura};

impl Relay {
    pub(super) fn registra(
        &mut self,
        identita: IdentitaAutenticata,
        sessione: SessionId,
        blocchi: Vec<Blocco>,
    ) -> Result<Vec<EventoRelay>, ErroreRelay> {
        let tacitus_id = identita.tacitus_id().clone();
        self.valida_blocchi(&tacitus_id, &blocchi)?;
        let mut eventi = Vec::new();

        if let Some(esistente) = self.identita.get(&tacitus_id) {
            if esistente.identita.nickname() != identita.nickname()
                || esistente.identita.documento_pubblico() != identita.documento_pubblico()
            {
                return Err(ErroreRelay::CollisioneIdentita);
            }
            let precedente = esistente.sessione.id().clone();
            self.identita_per_sessione.remove(&precedente);
            if esistente.sessione.attiva() {
                eventi.push(EventoRelay::ChiudiSessione {
                    sessione: precedente,
                    motivo: MotivoChiusura::SessioneSostituita,
                });
            }
        }

        self.identita.insert(
            tacitus_id.clone(),
            IdentitaRuntime {
                identita: identita.clone(),
                sessione: StatoSessione::Attiva(sessione.clone()),
            },
        );
        self.identita_per_sessione
            .insert(sessione.clone(), tacitus_id.clone());
        eventi.extend(self.sincronizza_blocchi(&tacitus_id, blocchi));
        eventi.push(EventoRelay::Consegna {
            sessione: sessione.clone(),
            evento: EventoSessione::AutenticazioneCompletata {
                nickname: identita.nickname().to_owned(),
                tacitus_id: tacitus_id.clone(),
            },
        });
        eventi.extend(self.snapshot_contatti(&tacitus_id, &sessione));
        Ok(eventi)
    }

    fn valida_blocchi(&self, identita: &TacitusId, blocchi: &[Blocco]) -> Result<(), ErroreRelay> {
        if blocchi.len() > MASSIMO_BLOCCHI_PER_IDENTITA
            || blocchi
                .iter()
                .any(|blocco| &blocco.da != identita || blocco.verso == *identita)
        {
            return Err(ErroreRelay::RichiestaNonValida);
        }
        Ok(())
    }

    fn sincronizza_blocchi(
        &mut self,
        identita: &TacitusId,
        nuovi_blocchi: Vec<Blocco>,
    ) -> Vec<EventoRelay> {
        self.blocchi.retain(|blocco| &blocco.da != identita);
        self.blocchi.extend(nuovi_blocchi);
        let da_rimuovere: Vec<_> = self
            .contatti
            .iter()
            .filter(|contatto| {
                contatto
                    .altra(identita)
                    .is_some_and(|altra| self.esiste_blocco(identita, altra))
            })
            .cloned()
            .collect();
        let mut eventi = Vec::new();
        for contatto in da_rimuovere {
            let Some(altra) = contatto.altra(identita).cloned() else {
                continue;
            };
            self.contatti.remove(&contatto);
            self.rimuovi_intenti_reciproci(identita, &altra);
            if let Ok(sessione) = self.sessione_attiva(&altra) {
                eventi.push(EventoRelay::Consegna {
                    sessione: sessione.clone(),
                    evento: EventoSessione::RelazioneCambiata {
                        tacitus_id: identita.clone(),
                        attiva: false,
                    },
                });
            }
        }
        eventi
    }

    fn snapshot_contatti(&self, identita: &TacitusId, sessione: &SessionId) -> Vec<EventoRelay> {
        let mut eventi = Vec::new();
        for contatto in &self.contatti {
            let Some(altra_id) = contatto.altra(identita) else {
                continue;
            };
            let Some(altra) = self.identita.get(altra_id) else {
                continue;
            };
            eventi.push(EventoRelay::Consegna {
                sessione: sessione.clone(),
                evento: EventoSessione::ContattoAssociato {
                    tacitus_id: altra_id.clone(),
                    nickname: altra.identita.nickname().to_owned(),
                    online: altra.sessione.attiva(),
                },
            });
            if let StatoSessione::Attiva(altra_sessione) = &altra.sessione {
                eventi.push(EventoRelay::Consegna {
                    sessione: altra_sessione.clone(),
                    evento: EventoSessione::PresenzaCambiata {
                        tacitus_id: identita.clone(),
                        online: true,
                    },
                });
            }
        }
        eventi
    }
}

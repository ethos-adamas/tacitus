use crate::domain::{
    identita::{IdentitaAutenticata, TacitusId},
    relazioni::{Blocco, MASSIMO_BLOCCHI_PER_IDENTITA},
    sessioni::{Presenza, SessionId, StatoSessione},
};

use super::{ErroreRelay, EventoRelay, IdentitaRegistrata, Relay};
use crate::application::relay::{EventoSessione, MotivoChiusura};

impl Relay {
    pub fn registra(
        &mut self,
        identita: IdentitaAutenticata,
        sessione: SessionId,
        blocchi: Vec<Blocco>,
    ) -> Result<Vec<EventoRelay>, ErroreRelay> {
        let tacitus_id = identita.tacitus_id().clone();
        self.valida_blocchi(&tacitus_id, &blocchi)?;
        if !self.identita.contains_key(&tacitus_id) && self.identita.len() >= 1024 {
            return Err(ErroreRelay::CapacitaEsaurita);
        }
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
            IdentitaRegistrata {
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
        eventi.extend(self.snapshot_relazioni(&tacitus_id, &sessione));
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
        let identita_bloccate: Vec<_> = nuovi_blocchi
            .iter()
            .map(|blocco| blocco.verso.clone())
            .collect();
        self.blocchi.retain(|blocco| &blocco.da != identita);
        self.blocchi.extend(nuovi_blocchi);
        for bloccata in &identita_bloccate {
            self.rimuovi_intenti_reciproci(identita, bloccata);
        }
        let da_rimuovere: Vec<_> = self
            .relazioni
            .iter()
            .filter(|relazione| {
                relazione
                    .altra(identita)
                    .is_some_and(|altra| self.esiste_blocco(identita, altra))
            })
            .cloned()
            .collect();
        let mut eventi = Vec::new();
        for relazione in da_rimuovere {
            let Some(altra) = relazione.altra(identita).cloned() else {
                continue;
            };
            self.relazioni.remove(&relazione);
            self.rimuovi_intenti_reciproci(identita, &altra);
            if let Ok(sessione) = self.sessione_attiva(&altra) {
                eventi.push(EventoRelay::Consegna {
                    sessione: sessione.clone(),
                    evento: EventoSessione::RelazioneTerminata {
                        tacitus_id: identita.clone(),
                    },
                });
            }
        }
        eventi
    }

    fn snapshot_relazioni(&self, identita: &TacitusId, sessione: &SessionId) -> Vec<EventoRelay> {
        let mut eventi = Vec::new();
        for relazione in &self.relazioni {
            let Some(altra_id) = relazione.altra(identita) else {
                continue;
            };
            let Some(altra) = self.identita.get(altra_id) else {
                continue;
            };
            eventi.push(EventoRelay::Consegna {
                sessione: sessione.clone(),
                evento: EventoSessione::RelazioneStabilita {
                    tacitus_id: altra_id.clone(),
                    nickname: altra.identita.nickname().to_owned(),
                    presenza: altra.sessione.presenza(),
                },
            });
            if let StatoSessione::Attiva(altra_sessione) = &altra.sessione {
                eventi.push(EventoRelay::Consegna {
                    sessione: altra_sessione.clone(),
                    evento: EventoSessione::PresenzaCambiata {
                        tacitus_id: identita.clone(),
                        presenza: Presenza::Online,
                    },
                });
            }
        }
        eventi
    }
}

use std::time::Duration;

use crate::{
    application::relay::{ErroreRelay, EventoRelay, EventoSessione},
    domain::{
        contatti::IntentoDiContatto,
        identita::TacitusId,
        sessioni::{SessionId, StatoSessione},
    },
};

use super::Relay;

const TOLLERANZA_DISCONNESSIONE: Duration = Duration::from_secs(30);

impl Relay {
    pub(super) fn disconnetti(
        &mut self,
        sessione: &SessionId,
    ) -> Result<Vec<EventoRelay>, ErroreRelay> {
        let identita = self.identita_della_sessione(sessione)?.clone();
        self.identita_per_sessione.remove(sessione);
        self.intenti.retain(|intento| intento.da != identita);
        let runtime = self
            .identita
            .get_mut(&identita)
            .ok_or(ErroreRelay::AutenticazioneFallita)?;
        runtime.sessione = StatoSessione::InAttesaDiRiconnessione(sessione.clone());

        let mut eventi = self.notifica_presenza(&identita, false);
        eventi.push(EventoRelay::PianificaScadenza {
            identita,
            sessione: sessione.clone(),
            dopo: TOLLERANZA_DISCONNESSIONE,
        });
        Ok(eventi)
    }

    pub(super) fn scadenza_sessione(
        &mut self,
        identita: &TacitusId,
        sessione: &SessionId,
    ) -> Vec<EventoRelay> {
        let scadenza_corrente = self.identita.get(identita).is_some_and(|runtime| {
            matches!(
                &runtime.sessione,
                StatoSessione::InAttesaDiRiconnessione(corrente) if corrente == sessione
            )
        });
        if !scadenza_corrente {
            return Vec::new();
        }
        let relazioni: Vec<_> = self
            .contatti
            .iter()
            .filter(|contatto| contatto.contiene(identita))
            .cloned()
            .collect();
        let mut eventi = Vec::new();
        for contatto in relazioni {
            let Some(altra) = contatto.altra(identita).cloned() else {
                continue;
            };
            self.contatti.remove(&contatto);
            if let Ok(sessione_altra) = self.sessione_attiva(&altra).cloned() {
                self.intenti
                    .insert(IntentoDiContatto::new(altra.clone(), identita.clone()));
                eventi.push(EventoRelay::Consegna {
                    sessione: sessione_altra,
                    evento: EventoSessione::RelazioneCambiata {
                        tacitus_id: identita.clone(),
                        attiva: false,
                    },
                });
            }
        }
        self.intenti.retain(|intento| intento.da != *identita);
        self.blocchi.retain(|blocco| blocco.da != *identita);
        self.identita.remove(identita);
        eventi
    }

    fn notifica_presenza(&self, identita: &TacitusId, online: bool) -> Vec<EventoRelay> {
        self.contatti
            .iter()
            .filter_map(|contatto| contatto.altra(identita))
            .filter_map(|altra| self.sessione_attiva(altra).ok())
            .map(|sessione| EventoRelay::Consegna {
                sessione: sessione.clone(),
                evento: EventoSessione::PresenzaCambiata {
                    tacitus_id: identita.clone(),
                    online,
                },
            })
            .collect()
    }
}

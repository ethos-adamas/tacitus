mod registrazione;
mod relazioni;
mod sessioni;

use std::collections::{HashMap, HashSet};

use crate::domain::{
    identita::{IdentitaAutenticata, TacitusId},
    relazioni::{Blocco, IntentoDiContatto, Relazione},
    sessioni::{SessionId, StatoSessione},
};

use super::{ComandoRelay, ErroreRelay, EventoRelay};

#[derive(Clone, Debug)]
struct IdentitaRegistrata {
    identita: IdentitaAutenticata,
    sessione: StatoSessione,
}

#[derive(Default)]
pub struct Relay {
    identita: HashMap<TacitusId, IdentitaRegistrata>,
    identita_per_sessione: HashMap<SessionId, TacitusId>,
    intenti: HashSet<IntentoDiContatto>,
    relazioni: HashSet<Relazione>,
    blocchi: HashSet<Blocco>,
}

impl Relay {
    pub fn esegui(&mut self, comando: ComandoRelay) -> Result<Vec<EventoRelay>, ErroreRelay> {
        match comando {
            ComandoRelay::Disconnetti { sessione } => self.disconnetti(&sessione),
            ComandoRelay::ScadenzaSessione { identita, sessione } => {
                Ok(self.scadenza_sessione(&identita, &sessione))
            }
            ComandoRelay::CreaIntento {
                sessione,
                richiesta,
                destinatario,
            } => self.crea_intento(&sessione, richiesta, destinatario),
            ComandoRelay::AnnullaIntento {
                sessione,
                richiesta,
                destinatario,
            } => self.annulla_intento(&sessione, richiesta, destinatario),
            ComandoRelay::RimuoviRelazione {
                sessione,
                richiesta,
                destinatario,
            } => self.rimuovi_relazione(&sessione, richiesta, destinatario),
            ComandoRelay::Blocca {
                sessione,
                richiesta,
                destinatario,
            } => self.blocca(&sessione, richiesta, destinatario),
            ComandoRelay::Sblocca {
                sessione,
                richiesta,
                destinatario,
            } => self.sblocca(&sessione, richiesta, destinatario),
            ComandoRelay::Instrada {
                sessione,
                richiesta,
                destinatario,
                tipo,
                corpo,
            } => self.instrada(sessione, richiesta, destinatario, tipo, corpo),
        }
    }

    pub fn ha_intento(&self, sessione: &SessionId, destinatario: &TacitusId) -> bool {
        self.identita_per_sessione
            .get(sessione)
            .is_some_and(|identita| {
                self.intenti.contains(&IntentoDiContatto::new(
                    identita.clone(),
                    destinatario.clone(),
                ))
            })
    }

    pub fn identita_presente(&self, tacitus_id: &TacitusId) -> bool {
        self.identita.contains_key(tacitus_id)
    }

    fn rimuovi_intenti_reciproci(&mut self, prima: &TacitusId, seconda: &TacitusId) {
        self.intenti.retain(|intento| {
            !((&intento.da == prima && &intento.verso == seconda)
                || (&intento.da == seconda && &intento.verso == prima))
        });
    }

    fn esiste_blocco(&self, prima: &TacitusId, seconda: &TacitusId) -> bool {
        self.blocchi
            .contains(&Blocco::new(prima.clone(), seconda.clone()))
            || self
                .blocchi
                .contains(&Blocco::new(seconda.clone(), prima.clone()))
    }

    fn identita_della_sessione(&self, sessione: &SessionId) -> Result<&TacitusId, ErroreRelay> {
        self.identita_per_sessione
            .get(sessione)
            .ok_or(ErroreRelay::AutenticazioneFallita)
    }

    fn sessione_attiva(&self, identita: &TacitusId) -> Result<&SessionId, ErroreRelay> {
        match self.identita.get(identita).map(|runtime| &runtime.sessione) {
            Some(StatoSessione::Attiva(sessione)) => Ok(sessione),
            _ => Err(ErroreRelay::ContattoNonDisponibile),
        }
    }
}

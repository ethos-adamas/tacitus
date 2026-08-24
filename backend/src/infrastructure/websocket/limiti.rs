use std::{collections::VecDeque, time::Duration};

use tokio::time::Instant;

use crate::application::relay::ErroreRelay;

#[derive(Default)]
pub(super) struct LimitiConnessione {
    messaggi: VecDeque<Instant>,
    contatti: VecDeque<Instant>,
}

impl LimitiConnessione {
    pub(super) fn messaggio(&mut self, ora: Instant) -> Result<(), ErroreRelay> {
        limita(&mut self.messaggi, ora, Duration::from_secs(10), 60)
    }

    pub(super) fn contatto(&mut self, ora: Instant) -> Result<(), ErroreRelay> {
        limita(&mut self.contatti, ora, Duration::from_secs(60), 30)
    }
}

fn limita(
    eventi: &mut VecDeque<Instant>,
    ora: Instant,
    finestra: Duration,
    massimo: usize,
) -> Result<(), ErroreRelay> {
    while eventi
        .front()
        .is_some_and(|evento| ora.duration_since(*evento) >= finestra)
    {
        eventi.pop_front();
    }
    if eventi.len() >= massimo {
        return Err(ErroreRelay::RichiestaNonValida);
    }
    eventi.push_back(ora);
    Ok(())
}

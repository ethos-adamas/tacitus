use std::{collections::VecDeque, time::Duration};

use tokio::time::Instant;

use crate::application::relay::ErroreRelay;

#[derive(Default)]
pub(super) struct LimitiConnessione {
    messaggi: VecDeque<(Instant, usize)>,
    byte_messaggi: usize,
    contatti: VecDeque<Instant>,
}

impl LimitiConnessione {
    pub(super) fn messaggio(&mut self, ora: Instant, byte: usize) -> Result<(), ErroreRelay> {
        while self
            .messaggi
            .front()
            .is_some_and(|(istante, _)| ora.duration_since(*istante) >= Duration::from_secs(10))
        {
            self.byte_messaggi -= self.messaggi.pop_front().unwrap().1;
        }
        if self.messaggi.len() >= 600
            || byte > (16 * 1024 * 1024usize).saturating_sub(self.byte_messaggi)
        {
            return Err(ErroreRelay::RichiestaNonValida);
        }
        self.byte_messaggi += byte;
        self.messaggi.push_back((ora, byte));
        Ok(())
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

use axum::http::StatusCode;
use std::{
    collections::HashMap,
    net::IpAddr,
    sync::{Arc, Mutex},
};

#[derive(Clone)]
pub(super) struct Ingresso(Arc<Mutex<StatoIngresso>>);

#[derive(Default)]
struct StatoIngresso {
    connessioni: usize,
    autenticazioni: usize,
    per_ip: HashMap<IpAddr, Origine>,
    tentativi: VecDeque<Instant>,
}

#[derive(Default)]
struct Origine {
    connessioni: usize,
    autenticazioni: usize,
    tentativi: VecDeque<Instant>,
}

pub(super) struct PermessoIngresso {
    ingresso: Ingresso,
    ip: IpAddr,
    in_autenticazione: bool,
}

impl Default for Ingresso {
    fn default() -> Self {
        let stato = Arc::new(Mutex::new(StatoIngresso::default()));
        let debole = Arc::downgrade(&stato);
        tokio::spawn(async move {
            loop {
                tokio::time::sleep(Duration::from_secs(30)).await;
                let Some(stato) = debole.upgrade() else {
                    break;
                };
                stato
                    .lock()
                    .expect("limiti ingresso")
                    .per_ip
                    .retain(|_, origine| {
                        origine.connessioni > 0
                            || origine
                                .tentativi
                                .back()
                                .is_some_and(|ora| ora.elapsed() < Duration::from_secs(60))
                    });
            }
        });
        Self(stato)
    }
}

impl Ingresso {
    pub(super) fn ammetti(&self, ip: IpAddr) -> Result<PermessoIngresso, StatusCode> {
        let mut stato = self.0.lock().expect("limiti ingresso");
        if stato.connessioni >= 1088 || stato.autenticazioni >= 64 {
            return Err(StatusCode::SERVICE_UNAVAILABLE);
        }
        let ora = Instant::now();
        if !stato.per_ip.contains_key(&ip) && stato.per_ip.len() >= 4096 {
            return Err(StatusCode::SERVICE_UNAVAILABLE);
        }
        limita(&mut stato.tentativi, ora, Duration::from_secs(1), 128)
            .map_err(|_| StatusCode::SERVICE_UNAVAILABLE)?;
        let origine = stato.per_ip.entry(ip).or_default();
        if origine.connessioni >= 64 || origine.autenticazioni >= 8 {
            return Err(StatusCode::TOO_MANY_REQUESTS);
        }
        limita(&mut origine.tentativi, ora, Duration::from_secs(60), 120)
            .map_err(|_| StatusCode::TOO_MANY_REQUESTS)?;
        origine.connessioni += 1;
        origine.autenticazioni += 1;
        stato.connessioni += 1;
        stato.autenticazioni += 1;
        Ok(PermessoIngresso {
            ingresso: self.clone(),
            ip,
            in_autenticazione: true,
        })
    }
}

impl PermessoIngresso {
    pub(super) fn autenticata(&mut self) {
        if !self.in_autenticazione {
            return;
        }
        let mut stato = self.ingresso.0.lock().expect("limiti ingresso");
        stato.autenticazioni -= 1;
        stato
            .per_ip
            .get_mut(&self.ip)
            .expect("origine presente")
            .autenticazioni -= 1;
        self.in_autenticazione = false;
    }
}

impl Drop for PermessoIngresso {
    fn drop(&mut self) {
        self.autenticata();
        let mut stato = self.ingresso.0.lock().expect("limiti ingresso");
        stato.connessioni -= 1;
        let counts = stato.per_ip.get_mut(&self.ip).expect("origine presente");
        counts.connessioni -= 1;
    }
}

#[cfg(test)]
mod trasferimenti_test {
    use super::*;

    #[test]
    fn i_chunk_album_hanno_un_budget_finito_di_frame_e_byte() {
        // Given
        let mut limiti = LimitiConnessione::default();
        let ora = Instant::now();
        // When: ordinary image chunks fit, sustained flooding does not.
        for _ in 0..300 {
            assert!(limiti.messaggio(ora, 44_000).is_ok());
        }
        let mut ammessi = 300;
        while limiti.messaggio(ora, 44_000).is_ok() {
            ammessi += 1;
        }
        // Then
        assert_eq!(ammessi, 16 * 1024 * 1024 / 44_000);
        let dopo = ora + Duration::from_secs(10);
        for _ in 0..600 {
            assert!(limiti.messaggio(dopo, 100).is_ok());
        }
        assert!(limiti.messaggio(dopo, 100).is_err());
    }
}

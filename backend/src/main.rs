use std::{process::ExitCode, time::Duration};

use tacitus_backend::{
    application::ports::coordinatore_relay::CoordinatoreRelay,
    infrastructure::{
        actors::avvia_relay_actor, configurazione::Configurazione, osservabilita,
        websocket::crea_router,
    },
};
use tokio::{net::TcpListener, sync::watch, time::timeout};
use tracing::{error, info};

const CAPACITA_MAILBOX_RELAY: usize = 1_024;
const TIMEOUT_ARRESTO: Duration = Duration::from_secs(10);

#[tokio::main]
async fn main() -> ExitCode {
    osservabilita::inizializza();
    match esegui().await {
        Ok(()) => ExitCode::SUCCESS,
        Err(errore) => {
            error!(evento = "arresto_anomalo", errore = %errore);
            ExitCode::FAILURE
        }
    }
}

async fn esegui() -> Result<(), Box<dyn std::error::Error>> {
    let configurazione = Configurazione::da_ambiente()?;
    let indirizzo = configurazione.indirizzo;
    let (relay, mut actor) = avvia_relay_actor(CAPACITA_MAILBOX_RELAY);
    let router = crea_router(relay.clone(), configurazione);
    let listener = TcpListener::bind(indirizzo).await?;
    let (arresto, mut arresto_ricevuto) = watch::channel(false);
    let mut server = tokio::spawn(async move {
        axum::serve(listener, router)
            .with_graceful_shutdown(async move {
                let _ = arresto_ricevuto.changed().await;
            })
            .await
    });
    info!(evento = "backend_avviato", %indirizzo, protocollo = 3);

    tokio::select! {
        segnale = segnale_arresto() => {
            segnale?;
            arresto.send_replace(true);
            relay.arresta().await.map_err(|errore| format!("arresto relay fallito: {errore:?}"))?;
            timeout(TIMEOUT_ARRESTO, &mut server).await???;
            actor.await?;
            Ok(())
        }
        risultato = &mut actor => {
            risultato?;
            Err("RelayActor terminato inaspettatamente".into())
        }
        risultato = &mut server => {
            risultato??;
            relay.arresta().await.map_err(|errore| format!("arresto relay fallito: {errore:?}"))?;
            actor.await?;
            Ok(())
        }
    }
}

async fn segnale_arresto() -> Result<(), Box<dyn std::error::Error>> {
    #[cfg(unix)]
    {
        let mut terminate =
            tokio::signal::unix::signal(tokio::signal::unix::SignalKind::terminate())?;
        tokio::select! {
            risultato = tokio::signal::ctrl_c() => risultato?,
            _ = terminate.recv() => {},
        }
    }
    #[cfg(not(unix))]
    tokio::signal::ctrl_c().await?;
    Ok(())
}

use tacitus_backend::{
    application::{
        ports::coordinatore_relay::{
            ConsegnaFallita, CoordinatoreRelay, ErroreCoordinatore, RegistrazioneSessione,
        },
        relay::{ComandoRelay, ErroreRelay, EventoSessione, MotivoChiusura},
    },
    domain::{
        identita::{IdentitaAutenticata, TacitusId},
        relay::{CorpoCifrato, RichiestaId, TipoPayload},
        sessioni::{Presenza, SessionId},
    },
    infrastructure::actors::{avvia_relay_actor, nuovo_canale_sessione},
};

fn identita(byte: u8, nickname: &str) -> IdentitaAutenticata {
    IdentitaAutenticata::new(
        TacitusId::from_bytes([byte; 16]),
        nickname.to_owned(),
        vec![byte; 65],
    )
    .unwrap()
}

#[test]
fn una_mailbox_di_sessione_piena_applica_backpressure() {
    // Given
    let (destinatario, _ricevitore) = nuovo_canale_sessione(sessione("alice-session"), 1);
    let evento = EventoSessione::PresenzaCambiata {
        tacitus_id: TacitusId::from_bytes([2; 16]),
        presenza: Presenza::Online,
    };
    destinatario.consegna(evento.clone()).unwrap();

    // When
    let risultato = destinatario.consegna(evento);

    // Then
    assert_eq!(risultato, Err(ConsegnaFallita::MailboxPiena));
}

fn sessione(value: &str) -> SessionId {
    SessionId::new(value).unwrap()
}

fn richiesta(value: &str) -> RichiestaId {
    RichiestaId::new(value).unwrap()
}

#[tokio::test]
async fn una_sessione_destinataria_chiusa_non_riceve_conferme_false() {
    // Given
    let (relay, actor) = avvia_relay_actor(32);
    let alice = identita(1, "Alice");
    let bob = identita(2, "Bob");
    let alice_id = alice.tacitus_id().clone();
    let bob_id = bob.tacitus_id().clone();
    let alice_sessione = sessione("alice-session");
    let bob_sessione = sessione("bob-session");
    let (alice_destinatario, mut alice_eventi) = nuovo_canale_sessione(alice_sessione.clone(), 8);
    let (bob_destinatario, mut bob_eventi) = nuovo_canale_sessione(bob_sessione.clone(), 8);
    relay
        .registra(RegistrazioneSessione {
            identita: alice,
            sessione: alice_sessione.clone(),
            blocchi: vec![],
            destinatario: alice_destinatario,
        })
        .await
        .unwrap();
    relay
        .registra(RegistrazioneSessione {
            identita: bob,
            sessione: bob_sessione.clone(),
            blocchi: vec![],
            destinatario: bob_destinatario,
        })
        .await
        .unwrap();
    alice_eventi.eventi.recv().await.unwrap();
    bob_eventi.eventi.recv().await.unwrap();
    relay
        .esegui(ComandoRelay::CreaIntento {
            sessione: alice_sessione.clone(),
            richiesta: richiesta("contact-a"),
            destinatario: bob_id.clone(),
        })
        .await
        .unwrap();
    alice_eventi.eventi.recv().await.unwrap();
    relay
        .esegui(ComandoRelay::CreaIntento {
            sessione: bob_sessione.clone(),
            richiesta: richiesta("contact-b"),
            destinatario: alice_id,
        })
        .await
        .unwrap();
    alice_eventi.eventi.recv().await.unwrap();
    bob_eventi.eventi.recv().await.unwrap();
    drop(bob_eventi);

    // When
    let risultato = relay
        .esegui(ComandoRelay::Instrada {
            sessione: alice_sessione,
            richiesta: richiesta("message-1"),
            destinatario: bob_id,
            tipo: TipoPayload::Messaggio,
            corpo: CorpoCifrato::new("opaque").unwrap(),
        })
        .await;

    // Then
    assert_eq!(
        risultato,
        Err(ErroreCoordinatore::Relay(
            ErroreRelay::ContattoNonDisponibile
        ))
    );
    assert!(!matches!(
        alice_eventi.eventi.try_recv(),
        Ok(EventoSessione::PayloadInviato { .. })
    ));
    relay.arresta().await.unwrap();
    actor.await.unwrap();
}

#[tokio::test]
async fn lo_shutdown_chiude_le_sessioni_con_service_restart() {
    // Given
    let (relay, actor) = avvia_relay_actor(8);
    let alice = identita(1, "Alice");
    let alice_sessione = sessione("alice-session");
    let (destinatario, mut ricevitore) = nuovo_canale_sessione(alice_sessione.clone(), 4);
    relay
        .registra(RegistrazioneSessione {
            identita: alice,
            sessione: alice_sessione,
            blocchi: vec![],
            destinatario,
        })
        .await
        .unwrap();
    ricevitore.eventi.recv().await.unwrap();

    // When
    relay.arresta().await.unwrap();

    // Then
    ricevitore.chiusura.changed().await.unwrap();
    assert_eq!(
        ricevitore.chiusura.borrow().clone(),
        Some(MotivoChiusura::RiavvioServizio)
    );
    actor.await.unwrap();
}

#[tokio::test]
async fn una_registrazione_fallita_non_lascia_una_sessione_fantasma() {
    // Given
    let (relay, actor) = avvia_relay_actor(32);
    let alice = identita(1, "Alice");
    let bob = identita(2, "Bob");
    let alice_id = alice.tacitus_id().clone();
    let bob_id = bob.tacitus_id().clone();
    let alice_sessione = sessione("alice-session");
    let bob_sessione = sessione("bob-session");
    let (alice_destinatario, mut alice_eventi) = nuovo_canale_sessione(alice_sessione.clone(), 1);
    let (bob_destinatario, mut bob_eventi) = nuovo_canale_sessione(bob_sessione.clone(), 8);
    relay
        .registra(RegistrazioneSessione {
            identita: alice,
            sessione: alice_sessione.clone(),
            blocchi: vec![],
            destinatario: alice_destinatario,
        })
        .await
        .unwrap();
    relay
        .registra(RegistrazioneSessione {
            identita: bob.clone(),
            sessione: bob_sessione.clone(),
            blocchi: vec![],
            destinatario: bob_destinatario,
        })
        .await
        .unwrap();
    alice_eventi.eventi.recv().await.unwrap();
    bob_eventi.eventi.recv().await.unwrap();
    relay
        .esegui(ComandoRelay::CreaIntento {
            sessione: alice_sessione.clone(),
            richiesta: richiesta("contact-a"),
            destinatario: bob_id,
        })
        .await
        .unwrap();
    alice_eventi.eventi.recv().await.unwrap();
    relay
        .esegui(ComandoRelay::CreaIntento {
            sessione: bob_sessione.clone(),
            richiesta: richiesta("contact-b"),
            destinatario: alice_id.clone(),
        })
        .await
        .unwrap();
    alice_eventi.eventi.recv().await.unwrap();
    bob_eventi.eventi.recv().await.unwrap();
    relay
        .esegui(ComandoRelay::Disconnetti {
            sessione: bob_sessione,
        })
        .await
        .unwrap();
    let nuova_sessione = sessione("bob-session-2");
    let (nuovo_destinatario, _nuovi_eventi) = nuovo_canale_sessione(nuova_sessione.clone(), 8);

    // When
    let registrazione = relay
        .registra(RegistrazioneSessione {
            identita: bob,
            sessione: nuova_sessione.clone(),
            blocchi: vec![],
            destinatario: nuovo_destinatario,
        })
        .await;
    let comando_successivo = relay
        .esegui(ComandoRelay::CreaIntento {
            sessione: nuova_sessione,
            richiesta: richiesta("ghost-command"),
            destinatario: alice_id,
        })
        .await;

    // Then
    assert_eq!(
        registrazione,
        Err(ErroreCoordinatore::Relay(
            ErroreRelay::ContattoNonDisponibile
        ))
    );
    assert_eq!(
        comando_successivo,
        Err(ErroreCoordinatore::Relay(
            ErroreRelay::AutenticazioneFallita
        ))
    );
    relay.arresta().await.unwrap();
    actor.await.unwrap();
}

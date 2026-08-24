use tacitus_backend::{
    application::relay::{ComandoRelay, ErroreRelay, EventoRelay, EventoSessione, Relay},
    domain::{
        identita::{IdentitaAutenticata, TacitusId},
        relay::{CorpoCifrato, RichiestaId, TipoPayload},
        relazioni::Blocco,
        sessioni::SessionId,
    },
};

fn identita(byte: u8, nickname: &str) -> IdentitaAutenticata {
    IdentitaAutenticata::new(
        TacitusId::from_bytes([byte; 16]),
        nickname.to_owned(),
        vec![byte; 65],
    )
    .unwrap()
}

fn sessione(value: &str) -> SessionId {
    SessionId::new(value).unwrap()
}

fn richiesta(value: &str) -> RichiestaId {
    RichiestaId::new(value).unwrap()
}

fn registra(
    relay: &mut Relay,
    identita: IdentitaAutenticata,
    sessione: SessionId,
    blocchi: Vec<Blocco>,
) {
    relay.registra(identita, sessione, blocchi).unwrap();
}

#[test]
fn il_consenso_reciproco_crea_una_relazione_e_permette_il_relay() {
    // Given
    let mut relay = Relay::default();
    let alice = identita(1, "Alice");
    let bob = identita(2, "Bob");
    let alice_id = alice.tacitus_id().clone();
    let bob_id = bob.tacitus_id().clone();
    let alice_sessione = sessione("alice-session");
    let bob_sessione = sessione("bob-session");
    registra(&mut relay, alice, alice_sessione.clone(), vec![]);
    registra(&mut relay, bob, bob_sessione.clone(), vec![]);
    relay
        .esegui(ComandoRelay::CreaIntento {
            sessione: alice_sessione.clone(),
            richiesta: richiesta("contact-a"),
            destinatario: bob_id.clone(),
        })
        .unwrap();

    // When
    let associazione = relay
        .esegui(ComandoRelay::CreaIntento {
            sessione: bob_sessione.clone(),
            richiesta: richiesta("contact-b"),
            destinatario: alice_id.clone(),
        })
        .unwrap();
    let invio = relay
        .esegui(ComandoRelay::Instrada {
            sessione: alice_sessione.clone(),
            richiesta: richiesta("message-1"),
            destinatario: bob_id.clone(),
            tipo: TipoPayload::Messaggio,
            corpo: CorpoCifrato::new("opaque-ciphertext").unwrap(),
        })
        .unwrap();

    // Then
    assert_eq!(
        associazione
            .iter()
            .filter(|evento| matches!(
                evento,
                EventoRelay::Consegna {
                    evento: EventoSessione::RelazioneStabilita { .. },
                    ..
                }
            ))
            .count(),
        2
    );
    assert!(matches!(
        invio.as_slice(),
        [EventoRelay::Instradamento {
            mittente,
            destinatario,
            ..
        }] if mittente == &alice_sessione && destinatario == &bob_sessione
    ));
}

#[test]
fn la_scadenza_della_sessione_conserva_solo_intento_dell_identita_online() {
    // Given
    let mut relay = Relay::default();
    let alice = identita(1, "Alice");
    let bob = identita(2, "Bob");
    let alice_id = alice.tacitus_id().clone();
    let bob_id = bob.tacitus_id().clone();
    let alice_sessione = sessione("alice-session");
    let bob_sessione = sessione("bob-session");
    registra(&mut relay, alice, alice_sessione.clone(), vec![]);
    registra(&mut relay, bob, bob_sessione.clone(), vec![]);
    relay
        .esegui(ComandoRelay::CreaIntento {
            sessione: alice_sessione.clone(),
            richiesta: richiesta("contact-a"),
            destinatario: bob_id.clone(),
        })
        .unwrap();
    relay
        .esegui(ComandoRelay::CreaIntento {
            sessione: bob_sessione.clone(),
            richiesta: richiesta("contact-b"),
            destinatario: alice_id,
        })
        .unwrap();

    // When
    relay
        .esegui(ComandoRelay::Disconnetti {
            sessione: bob_sessione.clone(),
        })
        .unwrap();
    relay
        .esegui(ComandoRelay::ScadenzaSessione {
            identita: bob_id.clone(),
            sessione: bob_sessione,
        })
        .unwrap();

    // Then
    assert!(relay.ha_intento(&alice_sessione, &bob_id));
    assert!(!relay.identita_presente(&bob_id));
}

#[test]
fn un_blocco_elimina_la_relazione_e_nasconde_il_motivo_al_bloccato() {
    // Given
    let mut relay = Relay::default();
    let alice = identita(1, "Alice");
    let bob = identita(2, "Bob");
    let alice_id = alice.tacitus_id().clone();
    let bob_id = bob.tacitus_id().clone();
    let alice_sessione = sessione("alice-session");
    let bob_sessione = sessione("bob-session");
    registra(&mut relay, alice, alice_sessione.clone(), vec![]);
    registra(&mut relay, bob, bob_sessione.clone(), vec![]);
    relay
        .esegui(ComandoRelay::CreaIntento {
            sessione: alice_sessione.clone(),
            richiesta: richiesta("contact-a"),
            destinatario: bob_id.clone(),
        })
        .unwrap();
    relay
        .esegui(ComandoRelay::CreaIntento {
            sessione: bob_sessione.clone(),
            richiesta: richiesta("contact-b"),
            destinatario: alice_id.clone(),
        })
        .unwrap();

    // When
    relay
        .esegui(ComandoRelay::Blocca {
            sessione: alice_sessione,
            richiesta: richiesta("block-bob"),
            destinatario: bob_id,
        })
        .unwrap();
    let nuovo_intento = relay.esegui(ComandoRelay::CreaIntento {
        sessione: bob_sessione,
        richiesta: richiesta("contact-again"),
        destinatario: alice_id,
    });

    // Then
    assert_eq!(nuovo_intento, Err(ErroreRelay::ContattoNonDisponibile));
}

#[test]
fn la_sincronizzazione_di_un_blocco_elimina_gli_intenti_pendenti() {
    // Given
    let mut relay = Relay::default();
    let alice = identita(1, "Alice");
    let bob = identita(2, "Bob");
    let alice_id = alice.tacitus_id().clone();
    let bob_id = bob.tacitus_id().clone();
    let alice_sessione = sessione("alice-session");
    let bob_sessione = sessione("bob-session");
    registra(&mut relay, bob, bob_sessione.clone(), vec![]);
    relay
        .esegui(ComandoRelay::CreaIntento {
            sessione: bob_sessione.clone(),
            richiesta: richiesta("contact-alice"),
            destinatario: alice_id.clone(),
        })
        .unwrap();

    // When
    registra(
        &mut relay,
        alice,
        alice_sessione,
        vec![Blocco::new(alice_id.clone(), bob_id)],
    );

    // Then
    assert!(!relay.ha_intento(&bob_sessione, &alice_id));
}

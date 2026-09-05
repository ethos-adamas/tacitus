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

#[test]
fn un_identita_puo_avere_al_massimo_cinque_intenti_in_attesa() {
    // Given
    let mut relay = Relay::default();
    let session = sessione("alice-session");
    registra(&mut relay, identita(1, "alice"), session.clone(), vec![]);
    for byte in 2..=6 {
        relay
            .esegui(ComandoRelay::CreaIntento {
                sessione: session.clone(),
                richiesta: richiesta("add"),
                destinatario: TacitusId::from_bytes([byte; 16]),
            })
            .unwrap();
    }
    // When
    let sixth = relay.esegui(ComandoRelay::CreaIntento {
        sessione: session.clone(),
        richiesta: richiesta("sixth"),
        destinatario: TacitusId::from_bytes([7; 16]),
    });
    // Then
    assert_eq!(sixth, Err(ErroreRelay::TroppiIntenti));
    assert!(!relay.ha_intento(&session, &TacitusId::from_bytes([7; 16])));
}

#[test]
fn ripetere_un_intento_esistente_non_consuma_un_altro_posto() {
    // Given
    let mut relay = Relay::default();
    let session = sessione("alice-session");
    registra(&mut relay, identita(1, "alice"), session.clone(), vec![]);
    for byte in 2..=6 {
        relay
            .esegui(ComandoRelay::CreaIntento {
                sessione: session.clone(),
                richiesta: richiesta("add"),
                destinatario: TacitusId::from_bytes([byte; 16]),
            })
            .unwrap();
    }
    // When
    let repeated = relay.esegui(ComandoRelay::CreaIntento {
        sessione: session,
        richiesta: richiesta("repeat"),
        destinatario: TacitusId::from_bytes([2; 16]),
    });
    // Then
    assert!(repeated.is_ok());
}

#[test]
fn il_registry_e_finito_e_riserva_la_riconnessione_alle_identita_note() {
    // Given
    let mut relay = Relay::default();
    for n in 0..1024_u128 {
        let user = IdentitaAutenticata::new(
            TacitusId::from_bytes(n.to_be_bytes()),
            "alice".into(),
            vec![1; 65],
        )
        .unwrap();
        registra(&mut relay, user, sessione(&format!("session-{n}")), vec![]);
    }
    // When
    let extra = IdentitaAutenticata::new(
        TacitusId::from_bytes(1024_u128.to_be_bytes()),
        "alice".into(),
        vec![1; 65],
    )
    .unwrap();
    let rejected = relay.registra(extra, sessione("extra"), vec![]);
    let known = IdentitaAutenticata::new(
        TacitusId::from_bytes(0_u128.to_be_bytes()),
        "alice".into(),
        vec![1; 65],
    )
    .unwrap();
    let reconnect = relay.registra(known, sessione("reconnect"), vec![]);
    // Then
    assert!(rejected.is_err());
    assert!(reconnect.is_ok());
    relay
        .esegui(ComandoRelay::Disconnetti {
            sessione: sessione("reconnect"),
        })
        .unwrap();
    relay
        .esegui(ComandoRelay::ScadenzaSessione {
            identita: TacitusId::from_bytes([0; 16]),
            sessione: sessione("reconnect"),
        })
        .unwrap();
    let new = IdentitaAutenticata::new(
        TacitusId::from_bytes(1024_u128.to_be_bytes()),
        "alice".into(),
        vec![1; 65],
    )
    .unwrap();
    assert!(relay.registra(new, sessione("new"), vec![]).is_ok());
}

#[test]
fn la_scadenza_non_crea_un_sesto_intento_automatico() {
    // Given
    let mut relay = Relay::default();
    registra(&mut relay, identita(1, "alice"), sessione("alice"), vec![]);
    for byte in 2..=7 {
        let peer = format!("peer-{byte}");
        registra(&mut relay, identita(byte, &peer), sessione(&peer), vec![]);
        relay
            .esegui(ComandoRelay::CreaIntento {
                sessione: sessione("alice"),
                richiesta: richiesta("add"),
                destinatario: TacitusId::from_bytes([byte; 16]),
            })
            .unwrap();
        relay
            .esegui(ComandoRelay::CreaIntento {
                sessione: sessione(&peer),
                richiesta: richiesta("accept"),
                destinatario: TacitusId::from_bytes([1; 16]),
            })
            .unwrap();
    }
    // When
    for byte in 2..=7 {
        let peer = sessione(&format!("peer-{byte}"));
        relay
            .esegui(ComandoRelay::Disconnetti {
                sessione: peer.clone(),
            })
            .unwrap();
        relay
            .esegui(ComandoRelay::ScadenzaSessione {
                sessione: peer,
                identita: TacitusId::from_bytes([byte; 16]),
            })
            .unwrap();
    }
    // Then
    let pending = (2..=7)
        .filter(|byte| relay.ha_intento(&sessione("alice"), &TacitusId::from_bytes([*byte; 16])))
        .count();
    assert_eq!(pending, 5);
}

#[test]
fn anche_i_blocchi_aggiunti_dopo_autenticazione_hanno_un_limite_finito() {
    // Given
    let mut relay = Relay::default();
    registra(&mut relay, identita(1, "alice"), sessione("alice"), vec![]);
    for n in 0..1024_u128 {
        relay
            .esegui(ComandoRelay::Blocca {
                sessione: sessione("alice"),
                richiesta: richiesta("block"),
                destinatario: TacitusId::from_bytes(n.to_be_bytes()),
            })
            .unwrap();
    }
    // When
    let result = relay.esegui(ComandoRelay::Blocca {
        sessione: sessione("alice"),
        richiesta: richiesta("overflow"),
        destinatario: TacitusId::from_bytes(1024_u128.to_be_bytes()),
    });
    // Then
    assert!(result.is_err());
}

#[test]
fn cinque_intenti_non_impediscono_un_match_immediato() {
    // Given
    let mut relay = Relay::default();
    registra(&mut relay, identita(1, "alice"), sessione("alice"), vec![]);
    registra(&mut relay, identita(2, "bob"), sessione("bob"), vec![]);
    for n in 3..=7 {
        relay
            .esegui(ComandoRelay::CreaIntento {
                sessione: sessione("alice"),
                richiesta: richiesta("add"),
                destinatario: TacitusId::from_bytes([n; 16]),
            })
            .unwrap();
    }
    relay
        .esegui(ComandoRelay::CreaIntento {
            sessione: sessione("bob"),
            richiesta: richiesta("add"),
            destinatario: TacitusId::from_bytes([1; 16]),
        })
        .unwrap();
    // When
    let result = relay.esegui(ComandoRelay::CreaIntento {
        sessione: sessione("alice"),
        richiesta: richiesta("match"),
        destinatario: TacitusId::from_bytes([2; 16]),
    });
    // Then
    assert!(result.is_ok());
    assert!(!relay.ha_intento(&sessione("alice"), &TacitusId::from_bytes([2; 16])));
}

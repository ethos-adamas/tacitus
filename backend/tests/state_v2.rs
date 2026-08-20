use tacitus_backend::state::{AppState, PayloadKind, ServerFrame, SessionChannel};
use tacitus_protocol::format_tacitus_id;

fn id(byte: u8) -> String {
    format_tacitus_id(&[byte; 16])
}

#[test]
fn mutual_intents_create_one_relation_and_relay_only_opaque_frames() {
    let mut state = AppState::default();
    let (alice, mut alice_frames, _) = SessionChannel::new("alice-session".into());
    let (bob, mut bob_frames, _) = SessionChannel::new("bob-session".into());
    state.register(&id(1), "alice", vec![1], alice).unwrap();
    state.register(&id(2), "bob", vec![2], bob).unwrap();

    state.add_contact("alice-session", "a1", &id(2)).unwrap();
    state.add_contact("bob-session", "b1", &id(1)).unwrap();
    let deliveries = state
        .route(
            "alice-session",
            "m1",
            &id(2),
            PayloadKind::Message,
            "opaque-ciphertext".into(),
        )
        .unwrap();
    for delivery in deliveries {
        delivery.send().unwrap();
    }

    assert!(
        matches!(alice_frames.try_recv().unwrap(), ServerFrame::MessageSent { request_id, .. } if request_id == "m1")
    );
    assert!(
        matches!(bob_frames.try_recv().unwrap(), ServerFrame::MessageReceived { body, .. } if body == "opaque-ciphertext")
    );
}

#[test]
fn removing_then_readding_requires_fresh_mutual_consent() {
    let mut state = AppState::default();
    let (alice, _, _) = SessionChannel::new("alice-session".into());
    let (bob, _, _) = SessionChannel::new("bob-session".into());
    state.register(&id(1), "alice", vec![1], alice).unwrap();
    state.register(&id(2), "bob", vec![2], bob).unwrap();
    state.add_contact("alice-session", "a1", &id(2)).unwrap();
    state.add_contact("bob-session", "b1", &id(1)).unwrap();
    state.remove_contact("alice-session", "r1", &id(2)).unwrap();
    state.add_contact("alice-session", "a2", &id(2)).unwrap();

    assert!(
        state
            .route(
                "alice-session",
                "m1",
                &id(2),
                PayloadKind::Message,
                "x".into()
            )
            .is_err()
    );
    state.add_contact("bob-session", "b2", &id(1)).unwrap();
    assert!(
        state
            .route(
                "alice-session",
                "m2",
                &id(2),
                PayloadKind::Message,
                "x".into()
            )
            .is_ok()
    );
}

#[test]
fn a_new_session_replaces_and_closes_the_previous_one() {
    let mut state = AppState::default();
    let (old, _, mut old_close) = SessionChannel::new("old".into());
    let (new, _, _) = SessionChannel::new("new".into());
    let (bob, _, _) = SessionChannel::new("bob".into());
    state.register(&id(1), "alice", vec![1], old).unwrap();
    state.register(&id(2), "bob", vec![2], bob).unwrap();
    state.add_contact("old", "a1", &id(2)).unwrap();
    state.register(&id(1), "alice", vec![1], new).unwrap();
    assert!(*old_close.borrow_and_update());
    state.unregister("old");
    assert!(state.is_online(&id(1)));
    state.add_contact("bob", "b1", &id(1)).unwrap();
    assert!(
        state
            .route("new", "m1", &id(2), PayloadKind::Message, "x".into())
            .is_err()
    );
}

#[test]
fn disconnect_expiry_keeps_only_the_online_peers_intent() {
    let mut state = AppState::default();
    let (alice, mut alice_frames, _) = SessionChannel::new("alice-session".into());
    let (bob, _, _) = SessionChannel::new("bob-session".into());
    state.register(&id(1), "alice", vec![1], alice).unwrap();
    state.register(&id(2), "bob", vec![2], bob).unwrap();
    state.add_contact("alice-session", "a1", &id(2)).unwrap();
    state.add_contact("bob-session", "b1", &id(1)).unwrap();

    state.unregister("bob-session");
    for delivery in state.expire_disconnect(&id(2), "bob-session") {
        delivery.send().unwrap();
    }
    assert!(matches!(
        alice_frames.try_recv().unwrap(),
        ServerFrame::ContactPending { tacitus_id, .. } if tacitus_id == id(2)
    ));

    let (bob, _, _) = SessionChannel::new("bob-returned".into());
    state.register(&id(2), "bob", vec![2], bob).unwrap();
    state.add_contact("bob-returned", "b2", &id(1)).unwrap();
    assert!(
        state
            .route(
                "alice-session",
                "m1",
                &id(2),
                PayloadKind::Message,
                "x".into()
            )
            .is_ok()
    );
}

#[test]
fn reconnecting_before_expiry_invalidates_the_old_disconnect() {
    let mut state = AppState::default();
    let (alice, _, _) = SessionChannel::new("alice-session".into());
    let (bob, _, _) = SessionChannel::new("bob-session".into());
    state.register(&id(1), "alice", vec![1], alice).unwrap();
    state.register(&id(2), "bob", vec![2], bob).unwrap();
    state.add_contact("alice-session", "a1", &id(2)).unwrap();
    state.add_contact("bob-session", "b1", &id(1)).unwrap();

    state.unregister("bob-session");
    let (bob, _, _) = SessionChannel::new("bob-returned".into());
    state.register(&id(2), "bob", vec![2], bob).unwrap();

    assert!(state.expire_disconnect(&id(2), "bob-session").is_empty());
    assert!(
        state
            .route(
                "alice-session",
                "m1",
                &id(2),
                PayloadKind::Message,
                "x".into()
            )
            .is_ok()
    );
}

#[test]
fn disconnecting_both_peers_discards_both_intents() {
    let mut state = AppState::default();
    let (alice, _, _) = SessionChannel::new("alice-session".into());
    let (bob, _, _) = SessionChannel::new("bob-session".into());
    state.register(&id(1), "alice", vec![1], alice).unwrap();
    state.register(&id(2), "bob", vec![2], bob).unwrap();
    state.add_contact("alice-session", "a1", &id(2)).unwrap();
    state.add_contact("bob-session", "b1", &id(1)).unwrap();

    state.unregister("bob-session");
    state.unregister("alice-session");
    state.expire_disconnect(&id(2), "bob-session");
    state.expire_disconnect(&id(1), "alice-session");

    let (alice, _, _) = SessionChannel::new("alice-returned".into());
    let (bob, _, _) = SessionChannel::new("bob-returned".into());
    state.register(&id(1), "alice", vec![1], alice).unwrap();
    state.register(&id(2), "bob", vec![2], bob).unwrap();
    state.add_contact("alice-returned", "a2", &id(2)).unwrap();
    assert!(
        state
            .route(
                "alice-returned",
                "m1",
                &id(2),
                PayloadKind::Message,
                "x".into()
            )
            .is_err()
    );
}

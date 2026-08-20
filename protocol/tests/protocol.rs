use p256::{
    ecdsa::{Signature, SigningKey, signature::Signer},
    elliptic_curve::Generate,
};
use tacitus_protocol::{
    IdentityDocument, PeerSession, authentication_payload, format_tacitus_id, parse_tacitus_id,
    verify_authentication,
};

fn identity(nickname: &str) -> (SigningKey, IdentityDocument) {
    let key = SigningKey::generate();
    let public_key = key.verifying_key().to_sec1_point(false).as_bytes().to_vec();
    (key, IdentityDocument::new(nickname, public_key).unwrap())
}

fn sign(session: &mut PeerSession, key: &SigningKey) {
    let signature: Signature = key.sign(&session.signature_payload().unwrap());
    session
        .complete_signature(signature.to_bytes().as_slice())
        .unwrap();
}

fn connected() -> (PeerSession, PeerSession) {
    let (alice_key, alice) = identity("alice");
    let (bob_key, bob) = identity("bob");
    let mut alice_session = PeerSession::initiator(alice, bob.id()).unwrap();
    let offer = alice_session.take_outbound().unwrap();
    let mut bob_session = PeerSession::responder(bob, alice_session.own_id(), &offer).unwrap();
    sign(&mut bob_session, &bob_key);
    alice_session
        .receive_handshake(&bob_session.take_outbound().unwrap())
        .unwrap();
    sign(&mut alice_session, &alice_key);
    bob_session
        .receive_handshake(&alice_session.take_outbound().unwrap())
        .unwrap();
    assert!(alice_session.is_ready() && bob_session.is_ready());
    (alice_session, bob_session)
}

#[test]
fn tacitus_id_is_a_stable_128_bit_crockford_code() {
    let key = SigningKey::from_slice(&[1_u8; 32]).unwrap();
    let public_key = key.verifying_key().to_sec1_point(false).as_bytes().to_vec();
    let identity = IdentityDocument::new(" Alice ", public_key).unwrap();
    assert_eq!(identity.nickname(), "alice");
    assert_eq!(identity.id().len(), 16);
    assert_eq!(
        format_tacitus_id(identity.id()),
        "2G2DX-6P175-0PJ6E-Q37T0-Q94YJC"
    );
    assert_eq!(
        parse_tacitus_id("2g2dx6p1750pj6eq37t0q94yjc").unwrap(),
        *identity.id()
    );
}

#[test]
fn websocket_authentication_is_bound_to_identity_and_challenge() {
    let (key, identity) = identity("alice");
    let nonce = [7_u8; 32];
    let signature: Signature = key.sign(&authentication_payload(&identity, &nonce).unwrap());
    assert!(verify_authentication(&identity, &nonce, signature.to_bytes().as_slice()).is_ok());
    assert!(
        verify_authentication(&identity, &[8_u8; 32], signature.to_bytes().as_slice()).is_err()
    );
}

#[test]
fn authenticated_handshake_and_double_ratchet_round_trip() {
    let (mut alice, mut bob) = connected();
    let first = alice.encrypt("ciao Bob", 1_777_000_000_000).unwrap();
    assert_eq!(bob.decrypt(&first).unwrap().text, "ciao Bob");
    let reply = bob.encrypt("ciao Alice", 1_777_000_000_001).unwrap();
    assert_eq!(alice.decrypt(&reply).unwrap().text, "ciao Alice");
    let next = alice
        .encrypt("secondo messaggio", 1_777_000_000_002)
        .unwrap();
    assert_eq!(bob.decrypt(&next).unwrap().text, "secondo messaggio");
}

#[test]
fn tampering_replay_and_wrong_identity_are_rejected() {
    let (mut alice, mut bob) = connected();
    let envelope = alice.encrypt("autenticato", 1).unwrap();
    assert!(bob.decrypt(&format!("{envelope}x")).is_err());
    assert_eq!(bob.decrypt(&envelope).unwrap().text, "autenticato");
    assert!(bob.decrypt(&envelope).is_err());

    let (alice_key, alice_id) = identity("alice");
    let (_, mallory) = identity("mallory");
    let (_, bob_id) = identity("bob");
    let mut initiator = PeerSession::initiator(alice_id, bob_id.id()).unwrap();
    let offer = initiator.take_outbound().unwrap();
    let mut imposter = PeerSession::responder(mallory, initiator.own_id(), &offer).unwrap();
    let fake: Signature = alice_key.sign(&imposter.signature_payload().unwrap());
    imposter
        .complete_signature(fake.to_bytes().as_slice())
        .unwrap();
    assert!(
        initiator
            .receive_handshake(&imposter.take_outbound().unwrap())
            .is_err()
    );
}

#[test]
fn plaintext_is_hidden_in_fixed_padding_buckets() {
    let (mut alice, _) = connected();
    let short = alice.encrypt("x", 1).unwrap();
    let medium = alice.encrypt(&"x".repeat(300), 2).unwrap();
    assert_eq!(PeerSession::encrypted_body_len(&short).unwrap(), 256 + 16);
    assert_eq!(PeerSession::encrypted_body_len(&medium).unwrap(), 512 + 16);
    assert!(alice.encrypt(&"😀".repeat(4_001), 3).is_err());
}

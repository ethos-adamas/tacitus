//! Protocollo crittografico Tacitus V2 condiviso da Web, mobile e test nativi.

use aes_gcm_siv::{
    Aes256GcmSiv, KeyInit, Nonce,
    aead::{Aead, Payload},
};
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use hkdf::Hkdf;
use hmac::{Hmac, Mac};
use p256::ecdsa::{Signature, VerifyingKey, signature::Verifier};
use serde::{Deserialize, Serialize};
use sha2::{Digest, Sha256};
use std::{fmt, mem};
use wasm_bindgen::prelude::*;
use x25519_dalek::{X25519_BASEPOINT_BYTES, x25519};

const VERSION: u8 = 2;
const MAX_NICKNAME_BYTES: usize = 24;
const MAX_TEXT_CHARACTERS: usize = 4_000;
const MAX_TEXT_BYTES: usize = 16_000;
const MAX_TIMESTAMP_MS: u64 = 8_640_000_000_000_000;
const PADDING_BUCKETS: [usize; 7] = [256, 512, 1_024, 2_048, 4_096, 8_192, 16_384];
const ID_DOMAIN: &[u8] = b"tacitus/id/v2\0";
const AUTH_DOMAIN: &[u8] = b"tacitus/auth/v2\0";
const HANDSHAKE_DOMAIN: &[u8] = b"tacitus/handshake/v2\0";
const MESSAGE_DOMAIN: &[u8] = b"tacitus/message/v2\0";
const CROCKFORD: &[u8; 32] = b"0123456789ABCDEFGHJKMNPQRSTVWXYZ";
type HandshakeKeys = ([u8; 32], [u8; 32], [u8; 32]);

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub struct ProtocolError(&'static str);

impl fmt::Display for ProtocolError {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(self.0)
    }
}

impl std::error::Error for ProtocolError {}

fn error(message: &'static str) -> ProtocolError {
    ProtocolError(message)
}

#[wasm_bindgen]
#[derive(Clone, Debug)]
pub struct IdentityDocument {
    nickname: String,
    public_key: Vec<u8>,
    id: [u8; 16],
}

impl IdentityDocument {
    pub fn new(nickname: &str, public_key: Vec<u8>) -> Result<Self, ProtocolError> {
        let nickname = normalize_nickname(nickname)?;
        VerifyingKey::from_sec1_bytes(&public_key).map_err(|_| error("invalid identity key"))?;
        let canonical = encode_identity_fields(&nickname, &public_key);
        let digest = Sha256::digest([ID_DOMAIN, canonical.as_slice()].concat());
        let mut id = [0_u8; 16];
        id.copy_from_slice(&digest[..16]);
        Ok(Self {
            nickname,
            public_key,
            id,
        })
    }

    pub fn nickname(&self) -> &str {
        &self.nickname
    }

    pub fn public_key(&self) -> &[u8] {
        &self.public_key
    }

    pub fn id(&self) -> &[u8; 16] {
        &self.id
    }

    fn encode(&self) -> Vec<u8> {
        encode_identity_fields(&self.nickname, &self.public_key)
    }

    fn decode(bytes: &[u8]) -> Result<Self, ProtocolError> {
        if bytes.len() < 3 || bytes[0] != VERSION {
            return Err(error("invalid identity document"));
        }
        let nickname_len = usize::from(bytes[1]);
        let key_len_index = 2 + nickname_len;
        if key_len_index >= bytes.len() {
            return Err(error("invalid identity document"));
        }
        let key_len = usize::from(bytes[key_len_index]);
        if key_len_index + 1 + key_len != bytes.len() {
            return Err(error("invalid identity document"));
        }
        let nickname = std::str::from_utf8(&bytes[2..key_len_index])
            .map_err(|_| error("invalid identity document"))?;
        Self::new(nickname, bytes[key_len_index + 1..].to_vec())
    }
}

#[wasm_bindgen]
impl IdentityDocument {
    #[wasm_bindgen(constructor)]
    pub fn wasm_new(nickname: &str, public_key: Vec<u8>) -> Result<IdentityDocument, JsValue> {
        Self::new(nickname, public_key).map_err(js_error)
    }

    #[wasm_bindgen(getter, js_name = nickname)]
    pub fn wasm_nickname(&self) -> String {
        self.nickname.clone()
    }

    #[wasm_bindgen(getter, js_name = id)]
    pub fn wasm_id(&self) -> String {
        format_tacitus_id(&self.id)
    }

    #[wasm_bindgen(getter, js_name = publicKey)]
    pub fn wasm_public_key(&self) -> Vec<u8> {
        self.public_key.clone()
    }
}

fn encode_identity_fields(nickname: &str, public_key: &[u8]) -> Vec<u8> {
    let mut bytes = Vec::with_capacity(3 + nickname.len() + public_key.len());
    bytes.push(VERSION);
    bytes.push(nickname.len() as u8);
    bytes.extend_from_slice(nickname.as_bytes());
    bytes.push(public_key.len() as u8);
    bytes.extend_from_slice(public_key);
    bytes
}

pub fn normalize_nickname(nickname: &str) -> Result<String, ProtocolError> {
    let nickname = nickname.trim().to_ascii_lowercase();
    if !(3..=MAX_NICKNAME_BYTES).contains(&nickname.len())
        || !nickname.bytes().all(|character| {
            character.is_ascii_lowercase() || character.is_ascii_digit() || character == b'_'
        })
    {
        return Err(error("invalid nickname"));
    }
    Ok(nickname)
}

pub fn format_tacitus_id(id: &[u8; 16]) -> String {
    let mut value = u128::from_be_bytes(*id);
    let mut code = [b'0'; 26];
    for character in code.iter_mut().rev() {
        *character = CROCKFORD[(value & 31) as usize];
        value >>= 5;
    }
    let raw = String::from_utf8(code.to_vec()).expect("Crockford alphabet is UTF-8");
    format!(
        "{}-{}-{}-{}-{}",
        &raw[0..5],
        &raw[5..10],
        &raw[10..15],
        &raw[15..20],
        &raw[20..26]
    )
}

pub fn parse_tacitus_id(value: &str) -> Result<[u8; 16], ProtocolError> {
    let normalized: Vec<u8> = value
        .bytes()
        .filter(|byte| *byte != b'-' && !byte.is_ascii_whitespace())
        .map(|byte| byte.to_ascii_uppercase())
        .collect();
    if normalized.len() != 26 {
        return Err(error("invalid Tacitus ID"));
    }
    let mut value = 0_u128;
    for (index, byte) in normalized.into_iter().enumerate() {
        let digit = match byte {
            b'O' => 0,
            b'I' | b'L' => 1,
            _ => CROCKFORD
                .iter()
                .position(|candidate| *candidate == byte)
                .ok_or_else(|| error("invalid Tacitus ID"))? as u8,
        };
        if index == 0 && digit > 7 {
            return Err(error("invalid Tacitus ID"));
        }
        value = value
            .checked_mul(32)
            .and_then(|current| current.checked_add(u128::from(digit)))
            .ok_or_else(|| error("invalid Tacitus ID"))?;
    }
    Ok(value.to_be_bytes())
}

pub fn authentication_payload(
    identity: &IdentityDocument,
    nonce: &[u8],
) -> Result<Vec<u8>, ProtocolError> {
    if nonce.len() != 32 {
        return Err(error("invalid authentication challenge"));
    }
    let document = identity.encode();
    let mut payload = Vec::with_capacity(AUTH_DOMAIN.len() + 2 + document.len() + nonce.len());
    payload.extend_from_slice(AUTH_DOMAIN);
    put_bytes(&mut payload, &document)?;
    payload.extend_from_slice(nonce);
    Ok(payload)
}

pub fn verify_authentication(
    identity: &IdentityDocument,
    nonce: &[u8],
    signature: &[u8],
) -> Result<(), ProtocolError> {
    verify_signature(
        identity,
        &authentication_payload(identity, nonce)?,
        signature,
    )
}

#[derive(Serialize, Deserialize)]
#[serde(tag = "type", rename_all = "snake_case", deny_unknown_fields)]
enum HandshakeFrame {
    Offer {
        session_id: String,
        ephemeral_key: String,
    },
    Response {
        session_id: String,
        ephemeral_key: String,
        nonce: String,
        ciphertext: String,
    },
    Confirm {
        session_id: String,
        ratchet_key: String,
        nonce: String,
        ciphertext: String,
    },
}

struct InitiatorWaiting {
    own: IdentityDocument,
    expected_peer: [u8; 16],
    session_id: [u8; 16],
    ephemeral_secret: [u8; 32],
    ephemeral_public: [u8; 32],
}

struct InitiatorSigning {
    own: IdentityDocument,
    peer: IdentityDocument,
    session_id: [u8; 16],
    transcript: Vec<u8>,
    handshake_key: [u8; 32],
    root: [u8; 32],
    peer_ephemeral: [u8; 32],
    ratchet_secret: [u8; 32],
    ratchet_public: [u8; 32],
}

struct ResponderSigning {
    own: IdentityDocument,
    expected_peer: [u8; 16],
    session_id: [u8; 16],
    ephemeral_secret: [u8; 32],
    ephemeral_public: [u8; 32],
    transcript: Vec<u8>,
    response_key: [u8; 32],
    confirm_key: [u8; 32],
    root: [u8; 32],
}

struct ResponderWaiting {
    own: IdentityDocument,
    expected_peer: [u8; 16],
    session_id: [u8; 16],
    ephemeral_secret: [u8; 32],
    transcript: Vec<u8>,
    confirm_key: [u8; 32],
    root: [u8; 32],
}

#[derive(Clone)]
struct Ratchet {
    own: IdentityDocument,
    peer: IdentityDocument,
    session_id: [u8; 16],
    root: [u8; 32],
    own_secret: [u8; 32],
    own_public: [u8; 32],
    peer_public: [u8; 32],
    sending_chain: [u8; 32],
    receiving_chain: [u8; 32],
    sent: u32,
    received: u32,
    previous_sent: u32,
}

enum SessionState {
    InitiatorWaiting(InitiatorWaiting),
    InitiatorSigning(InitiatorSigning),
    ResponderSigning(ResponderSigning),
    ResponderWaiting(ResponderWaiting),
    Ready(Ratchet),
    Poisoned,
}

#[wasm_bindgen]
pub struct PeerSession {
    state: SessionState,
    outbound: Option<String>,
}

impl PeerSession {
    pub fn initiator(own: IdentityDocument, expected_peer: &[u8]) -> Result<Self, ProtocolError> {
        let expected_peer = fixed::<16>(expected_peer, "invalid peer identity")?;
        if own.id == expected_peer {
            return Err(error("cannot connect identity to itself"));
        }
        let session_id = random_array()?;
        let ephemeral_secret = random_array()?;
        let ephemeral_public = x25519(ephemeral_secret, X25519_BASEPOINT_BYTES);
        let outbound = serde_json::to_string(&HandshakeFrame::Offer {
            session_id: encode(&session_id),
            ephemeral_key: encode(&ephemeral_public),
        })
        .map_err(|_| error("cannot encode handshake"))?;
        Ok(Self {
            state: SessionState::InitiatorWaiting(InitiatorWaiting {
                own,
                expected_peer,
                session_id,
                ephemeral_secret,
                ephemeral_public,
            }),
            outbound: Some(outbound),
        })
    }

    pub fn responder(
        own: IdentityDocument,
        expected_peer: &[u8],
        offer: &str,
    ) -> Result<Self, ProtocolError> {
        let expected_peer = fixed::<16>(expected_peer, "invalid peer identity")?;
        let HandshakeFrame::Offer {
            session_id,
            ephemeral_key,
        } = decode_handshake(offer)?
        else {
            return Err(error("expected handshake offer"));
        };
        let session_id = decode_fixed::<16>(&session_id, "invalid session")?;
        let peer_ephemeral = decode_fixed::<32>(&ephemeral_key, "invalid ephemeral key")?;
        let ephemeral_secret = random_array()?;
        let ephemeral_public = x25519(ephemeral_secret, X25519_BASEPOINT_BYTES);
        let transcript = transcript(
            &session_id,
            &expected_peer,
            own.id(),
            &peer_ephemeral,
            &ephemeral_public,
        );
        let shared = checked_dh(ephemeral_secret, peer_ephemeral)?;
        let (response_key, confirm_key, root) = handshake_keys(&shared, &transcript)?;
        Ok(Self {
            state: SessionState::ResponderSigning(ResponderSigning {
                own,
                expected_peer,
                session_id,
                ephemeral_secret,
                ephemeral_public,
                transcript,
                response_key,
                confirm_key,
                root,
            }),
            outbound: None,
        })
    }

    pub fn own_id(&self) -> &[u8; 16] {
        match &self.state {
            SessionState::InitiatorWaiting(state) => state.own.id(),
            SessionState::InitiatorSigning(state) => state.own.id(),
            SessionState::ResponderSigning(state) => state.own.id(),
            SessionState::ResponderWaiting(state) => state.own.id(),
            SessionState::Ready(state) => state.own.id(),
            SessionState::Poisoned => unreachable!("poisoned session is not observable"),
        }
    }

    pub fn take_outbound(&mut self) -> Option<String> {
        self.outbound.take()
    }

    pub fn signature_payload(&self) -> Option<Vec<u8>> {
        match &self.state {
            SessionState::ResponderSigning(state) => {
                Some(role_signature_payload(&state.transcript, b'R', None))
            }
            SessionState::InitiatorSigning(state) => Some(role_signature_payload(
                &state.transcript,
                b'I',
                Some(&state.ratchet_public),
            )),
            _ => None,
        }
    }

    pub fn complete_signature(&mut self, signature: &[u8]) -> Result<(), ProtocolError> {
        if signature.len() != 64 {
            return Err(error("invalid identity signature"));
        }
        let current = mem::replace(&mut self.state, SessionState::Poisoned);
        match current {
            SessionState::ResponderSigning(state) => {
                let plaintext = encode_signed_identity(&state.own, signature)?;
                let (nonce, ciphertext) = seal(&state.response_key, &state.transcript, &plaintext)?;
                self.outbound = Some(
                    serde_json::to_string(&HandshakeFrame::Response {
                        session_id: encode(&state.session_id),
                        ephemeral_key: encode(&state.ephemeral_public),
                        nonce: encode(&nonce),
                        ciphertext: encode(&ciphertext),
                    })
                    .map_err(|_| error("cannot encode handshake"))?,
                );
                self.state = SessionState::ResponderWaiting(ResponderWaiting {
                    own: state.own,
                    expected_peer: state.expected_peer,
                    session_id: state.session_id,
                    ephemeral_secret: state.ephemeral_secret,
                    transcript: state.transcript,
                    confirm_key: state.confirm_key,
                    root: state.root,
                });
                Ok(())
            }
            SessionState::InitiatorSigning(state) => {
                let plaintext = encode_signed_identity(&state.own, signature)?;
                let associated_data =
                    [state.transcript.as_slice(), state.ratchet_public.as_slice()].concat();
                let (nonce, ciphertext) = seal(&state.handshake_key, &associated_data, &plaintext)?;
                self.outbound = Some(
                    serde_json::to_string(&HandshakeFrame::Confirm {
                        session_id: encode(&state.session_id),
                        ratchet_key: encode(&state.ratchet_public),
                        nonce: encode(&nonce),
                        ciphertext: encode(&ciphertext),
                    })
                    .map_err(|_| error("cannot encode handshake"))?,
                );
                let (root, sending_chain) = ratchet_keys(
                    &state.root,
                    &checked_dh(state.ratchet_secret, state.peer_ephemeral)?,
                )?;
                self.state = SessionState::Ready(Ratchet {
                    own: state.own,
                    peer: state.peer,
                    session_id: state.session_id,
                    root,
                    own_secret: state.ratchet_secret,
                    own_public: state.ratchet_public,
                    peer_public: state.peer_ephemeral,
                    sending_chain,
                    receiving_chain: [0; 32],
                    sent: 0,
                    received: 0,
                    previous_sent: 0,
                });
                Ok(())
            }
            other => {
                self.state = other;
                Err(error("identity signature is not expected"))
            }
        }
    }

    pub fn receive_handshake(&mut self, frame: &str) -> Result<(), ProtocolError> {
        let current = mem::replace(&mut self.state, SessionState::Poisoned);
        let result = match current {
            SessionState::InitiatorWaiting(state) => self.receive_response(state, frame),
            SessionState::ResponderWaiting(state) => self.receive_confirm(state, frame),
            other => {
                self.state = other;
                Err(error("handshake frame is not expected"))
            }
        };
        if result.is_err() && matches!(self.state, SessionState::Poisoned) {
            // A failed authenticated handshake is terminal by design.
        }
        result
    }

    fn receive_response(
        &mut self,
        state: InitiatorWaiting,
        frame: &str,
    ) -> Result<(), ProtocolError> {
        let HandshakeFrame::Response {
            session_id,
            ephemeral_key,
            nonce,
            ciphertext,
        } = decode_handshake(frame)?
        else {
            return Err(error("expected handshake response"));
        };
        if decode_fixed::<16>(&session_id, "invalid session")? != state.session_id {
            return Err(error("wrong handshake session"));
        }
        let peer_ephemeral = decode_fixed::<32>(&ephemeral_key, "invalid ephemeral key")?;
        let transcript = transcript(
            &state.session_id,
            state.own.id(),
            &state.expected_peer,
            &state.ephemeral_public,
            &peer_ephemeral,
        );
        let shared = checked_dh(state.ephemeral_secret, peer_ephemeral)?;
        let (response_key, confirm_key, root) = handshake_keys(&shared, &transcript)?;
        let plaintext = open(
            &response_key,
            &transcript,
            &decode_fixed::<12>(&nonce, "invalid nonce")?,
            &decode(&ciphertext, "invalid ciphertext")?,
        )?;
        let (peer, signature) = decode_signed_identity(&plaintext)?;
        if peer.id != state.expected_peer {
            return Err(error("unexpected peer identity"));
        }
        verify_signature(
            &peer,
            &role_signature_payload(&transcript, b'R', None),
            &signature,
        )?;
        let ratchet_secret = random_array()?;
        let ratchet_public = x25519(ratchet_secret, X25519_BASEPOINT_BYTES);
        self.state = SessionState::InitiatorSigning(InitiatorSigning {
            own: state.own,
            peer,
            session_id: state.session_id,
            transcript,
            handshake_key: confirm_key,
            root,
            peer_ephemeral,
            ratchet_secret,
            ratchet_public,
        });
        Ok(())
    }

    fn receive_confirm(
        &mut self,
        state: ResponderWaiting,
        frame: &str,
    ) -> Result<(), ProtocolError> {
        let HandshakeFrame::Confirm {
            session_id,
            ratchet_key,
            nonce,
            ciphertext,
        } = decode_handshake(frame)?
        else {
            return Err(error("expected handshake confirmation"));
        };
        if decode_fixed::<16>(&session_id, "invalid session")? != state.session_id {
            return Err(error("wrong handshake session"));
        }
        let peer_public = decode_fixed::<32>(&ratchet_key, "invalid ratchet key")?;
        let associated_data = [state.transcript.as_slice(), peer_public.as_slice()].concat();
        let plaintext = open(
            &state.confirm_key,
            &associated_data,
            &decode_fixed::<12>(&nonce, "invalid nonce")?,
            &decode(&ciphertext, "invalid ciphertext")?,
        )?;
        let (peer, signature) = decode_signed_identity(&plaintext)?;
        if peer.id != state.expected_peer {
            return Err(error("unexpected peer identity"));
        }
        verify_signature(
            &peer,
            &role_signature_payload(&state.transcript, b'I', Some(&peer_public)),
            &signature,
        )?;
        let (root, receiving_chain) = ratchet_keys(
            &state.root,
            &checked_dh(state.ephemeral_secret, peer_public)?,
        )?;
        let own_secret = random_array()?;
        let own_public = x25519(own_secret, X25519_BASEPOINT_BYTES);
        let (root, sending_chain) = ratchet_keys(&root, &checked_dh(own_secret, peer_public)?)?;
        self.state = SessionState::Ready(Ratchet {
            own: state.own,
            peer,
            session_id: state.session_id,
            root,
            own_secret,
            own_public,
            peer_public,
            sending_chain,
            receiving_chain,
            sent: 0,
            received: 0,
            previous_sent: 0,
        });
        Ok(())
    }

    pub fn is_ready(&self) -> bool {
        matches!(self.state, SessionState::Ready(_))
    }

    pub fn peer_nickname(&self) -> Option<&str> {
        match &self.state {
            SessionState::InitiatorSigning(state) => Some(state.peer.nickname()),
            SessionState::Ready(state) => Some(state.peer.nickname()),
            _ => None,
        }
    }

    pub fn encrypt(&mut self, text: &str, created_at: u64) -> Result<String, ProtocolError> {
        let SessionState::Ready(ratchet) = &mut self.state else {
            return Err(error("secure session is not ready"));
        };
        if text.chars().count() > MAX_TEXT_CHARACTERS
            || text.len() > MAX_TEXT_BYTES
            || text.is_empty()
            || created_at > MAX_TIMESTAMP_MS
        {
            return Err(error("invalid message length"));
        }
        let (next_chain, message_key) = chain_keys(&ratchet.sending_chain);
        let plaintext = padded_plaintext(text, created_at)?;
        let bucket = plaintext.len() as u32;
        let nonce: [u8; 12] = random_array()?;
        let header = MessageHeader {
            session_id: encode(&ratchet.session_id),
            from_id: format_tacitus_id(ratchet.own.id()),
            to_id: format_tacitus_id(ratchet.peer.id()),
            ratchet_key: encode(&ratchet.own_public),
            previous_chain_length: ratchet.previous_sent,
            message_number: ratchet.sent,
            bucket,
            nonce: encode(&nonce),
        };
        let associated_data = header.associated_data()?;
        let cipher =
            Aes256GcmSiv::new_from_slice(&message_key).map_err(|_| error("invalid message key"))?;
        let ciphertext = cipher
            .encrypt(
                &Nonce::from(nonce),
                Payload {
                    msg: &plaintext,
                    aad: &associated_data,
                },
            )
            .map_err(|_| error("cannot encrypt message"))?;
        ratchet.sending_chain = next_chain;
        ratchet.sent = ratchet
            .sent
            .checked_add(1)
            .ok_or_else(|| error("message counter exhausted"))?;
        serde_json::to_string(&MessageEnvelope {
            header,
            ciphertext: encode(&ciphertext),
        })
        .map_err(|_| error("cannot encode message"))
    }

    pub fn decrypt(&mut self, envelope: &str) -> Result<DecryptedMessage, ProtocolError> {
        let SessionState::Ready(ratchet) = &mut self.state else {
            return Err(error("secure session is not ready"));
        };
        let envelope: MessageEnvelope =
            serde_json::from_str(envelope).map_err(|_| error("invalid message envelope"))?;
        let mut candidate = ratchet.clone();
        let peer_public = decode_fixed::<32>(&envelope.header.ratchet_key, "invalid ratchet key")?;
        if envelope.header.session_id != encode(&candidate.session_id)
            || parse_tacitus_id(&envelope.header.from_id)? != *candidate.peer.id()
            || parse_tacitus_id(&envelope.header.to_id)? != *candidate.own.id()
        {
            return Err(error("message belongs to another session"));
        }
        if peer_public != candidate.peer_public {
            candidate.ratchet(peer_public)?;
        }
        if envelope.header.message_number != candidate.received {
            return Err(error("out-of-order or replayed message"));
        }
        if !PADDING_BUCKETS.contains(&(envelope.header.bucket as usize)) {
            return Err(error("invalid padding bucket"));
        }
        let ciphertext = decode(&envelope.ciphertext, "invalid ciphertext")?;
        if ciphertext.len() != envelope.header.bucket as usize + 16 {
            return Err(error("invalid padded message size"));
        }
        let nonce = decode_fixed::<12>(&envelope.header.nonce, "invalid nonce")?;
        let (next_chain, message_key) = chain_keys(&candidate.receiving_chain);
        let cipher =
            Aes256GcmSiv::new_from_slice(&message_key).map_err(|_| error("invalid message key"))?;
        let plaintext = cipher
            .decrypt(
                &Nonce::from(nonce),
                Payload {
                    msg: &ciphertext,
                    aad: &envelope.header.associated_data()?,
                },
            )
            .map_err(|_| error("message authentication failed"))?;
        let message = decode_padded_plaintext(&plaintext)?;
        candidate.receiving_chain = next_chain;
        candidate.received = candidate
            .received
            .checked_add(1)
            .ok_or_else(|| error("message counter exhausted"))?;
        *ratchet = candidate;
        Ok(message)
    }

    pub fn encrypted_body_len(envelope: &str) -> Result<usize, ProtocolError> {
        let envelope: MessageEnvelope =
            serde_json::from_str(envelope).map_err(|_| error("invalid message envelope"))?;
        Ok(decode(&envelope.ciphertext, "invalid ciphertext")?.len())
    }
}

impl Ratchet {
    fn ratchet(&mut self, peer_public: [u8; 32]) -> Result<(), ProtocolError> {
        self.previous_sent = self.sent;
        self.sent = 0;
        self.received = 0;
        self.peer_public = peer_public;
        let (root, receiving_chain) =
            ratchet_keys(&self.root, &checked_dh(self.own_secret, self.peer_public)?)?;
        self.root = root;
        self.receiving_chain = receiving_chain;
        self.own_secret = random_array()?;
        self.own_public = x25519(self.own_secret, X25519_BASEPOINT_BYTES);
        let (root, sending_chain) =
            ratchet_keys(&self.root, &checked_dh(self.own_secret, self.peer_public)?)?;
        self.root = root;
        self.sending_chain = sending_chain;
        Ok(())
    }
}

#[wasm_bindgen]
impl PeerSession {
    #[wasm_bindgen(js_name = start)]
    pub fn wasm_initiator(
        own: IdentityDocument,
        expected_peer: &str,
    ) -> Result<PeerSession, JsValue> {
        let peer = parse_tacitus_id(expected_peer).map_err(js_error)?;
        Self::initiator(own, &peer).map_err(js_error)
    }

    #[wasm_bindgen(js_name = answer)]
    pub fn wasm_responder(
        own: IdentityDocument,
        expected_peer: &str,
        offer: &str,
    ) -> Result<PeerSession, JsValue> {
        let peer = parse_tacitus_id(expected_peer).map_err(js_error)?;
        Self::responder(own, &peer, offer).map_err(js_error)
    }

    #[wasm_bindgen(js_name = takeOutbound)]
    pub fn wasm_take_outbound(&mut self) -> Option<String> {
        self.take_outbound()
    }

    #[wasm_bindgen(js_name = signaturePayload)]
    pub fn wasm_signature_payload(&self) -> Option<Vec<u8>> {
        self.signature_payload()
    }

    #[wasm_bindgen(js_name = completeSignature)]
    pub fn wasm_complete_signature(&mut self, signature: &[u8]) -> Result<(), JsValue> {
        self.complete_signature(signature).map_err(js_error)
    }

    #[wasm_bindgen(js_name = receiveHandshake)]
    pub fn wasm_receive_handshake(&mut self, frame: &str) -> Result<(), JsValue> {
        self.receive_handshake(frame).map_err(js_error)
    }

    #[wasm_bindgen(getter, js_name = ready)]
    pub fn wasm_ready(&self) -> bool {
        self.is_ready()
    }

    #[wasm_bindgen(getter, js_name = peerNickname)]
    pub fn wasm_peer_nickname(&self) -> Option<String> {
        self.peer_nickname().map(str::to_owned)
    }

    #[wasm_bindgen(js_name = encrypt)]
    pub fn wasm_encrypt(&mut self, text: &str, created_at: u64) -> Result<String, JsValue> {
        self.encrypt(text, created_at).map_err(js_error)
    }

    #[wasm_bindgen(js_name = decrypt)]
    pub fn wasm_decrypt(&mut self, envelope: &str) -> Result<String, JsValue> {
        serde_json::to_string(&self.decrypt(envelope).map_err(js_error)?)
            .map_err(|_| JsValue::from_str("cannot encode decrypted message"))
    }
}

#[wasm_bindgen(js_name = authenticationPayload)]
pub fn wasm_authentication_payload(
    nickname: &str,
    public_key: Vec<u8>,
    nonce: &str,
) -> Result<Vec<u8>, JsValue> {
    let identity = IdentityDocument::new(nickname, public_key).map_err(js_error)?;
    let nonce = decode_fixed::<32>(nonce, "invalid authentication challenge").map_err(js_error)?;
    authentication_payload(&identity, &nonce).map_err(js_error)
}

#[derive(Clone, Serialize, Deserialize)]
struct MessageHeader {
    session_id: String,
    from_id: String,
    to_id: String,
    ratchet_key: String,
    previous_chain_length: u32,
    message_number: u32,
    bucket: u32,
    nonce: String,
}

impl MessageHeader {
    fn associated_data(&self) -> Result<Vec<u8>, ProtocolError> {
        let mut data = Vec::with_capacity(160);
        data.extend_from_slice(MESSAGE_DOMAIN);
        data.extend_from_slice(&decode_fixed::<16>(&self.session_id, "invalid session")?);
        data.extend_from_slice(&parse_tacitus_id(&self.from_id)?);
        data.extend_from_slice(&parse_tacitus_id(&self.to_id)?);
        data.extend_from_slice(&decode_fixed::<32>(
            &self.ratchet_key,
            "invalid ratchet key",
        )?);
        data.extend_from_slice(&self.previous_chain_length.to_be_bytes());
        data.extend_from_slice(&self.message_number.to_be_bytes());
        data.extend_from_slice(&self.bucket.to_be_bytes());
        data.extend_from_slice(&decode_fixed::<12>(&self.nonce, "invalid nonce")?);
        Ok(data)
    }
}

#[derive(Serialize, Deserialize)]
#[serde(deny_unknown_fields)]
struct MessageEnvelope {
    header: MessageHeader,
    ciphertext: String,
}

#[derive(Debug, Serialize, Deserialize, PartialEq, Eq)]
pub struct DecryptedMessage {
    pub message_id: String,
    pub created_at: u64,
    pub text: String,
}

fn transcript(
    session_id: &[u8; 16],
    initiator_id: &[u8; 16],
    responder_id: &[u8; 16],
    initiator_ephemeral: &[u8; 32],
    responder_ephemeral: &[u8; 32],
) -> Vec<u8> {
    [
        HANDSHAKE_DOMAIN,
        session_id,
        initiator_id,
        responder_id,
        initiator_ephemeral,
        responder_ephemeral,
    ]
    .concat()
}

fn role_signature_payload(transcript: &[u8], role: u8, ratchet_key: Option<&[u8; 32]>) -> Vec<u8> {
    let mut payload = Vec::with_capacity(transcript.len() + 33);
    payload.extend_from_slice(transcript);
    payload.push(role);
    if let Some(key) = ratchet_key {
        payload.extend_from_slice(key);
    }
    payload
}

fn handshake_keys(shared: &[u8; 32], transcript: &[u8]) -> Result<HandshakeKeys, ProtocolError> {
    let salt = Sha256::digest(transcript);
    let hkdf = Hkdf::<Sha256>::new(Some(&salt), shared);
    Ok((
        hkdf_key(&hkdf, b"responder identity")?,
        hkdf_key(&hkdf, b"initiator identity")?,
        hkdf_key(&hkdf, b"double ratchet root")?,
    ))
}

fn hkdf_key(hkdf: &Hkdf<Sha256>, label: &[u8]) -> Result<[u8; 32], ProtocolError> {
    let mut key = [0_u8; 32];
    hkdf.expand(label, &mut key)
        .map_err(|_| error("key derivation failed"))?;
    Ok(key)
}

fn ratchet_keys(root: &[u8; 32], shared: &[u8; 32]) -> Result<([u8; 32], [u8; 32]), ProtocolError> {
    let hkdf = Hkdf::<Sha256>::new(Some(root), shared);
    Ok((hkdf_key(&hkdf, b"root")?, hkdf_key(&hkdf, b"chain")?))
}

fn chain_keys(chain: &[u8; 32]) -> ([u8; 32], [u8; 32]) {
    type HmacSha256 = Hmac<Sha256>;
    let mut next = <HmacSha256 as Mac>::new_from_slice(chain).expect("HMAC accepts any key size");
    next.update(&[2]);
    let next: [u8; 32] = next.finalize().into_bytes().into();
    let mut message =
        <HmacSha256 as Mac>::new_from_slice(chain).expect("HMAC accepts any key size");
    message.update(&[1]);
    let message: [u8; 32] = message.finalize().into_bytes().into();
    (next, message)
}

fn checked_dh(secret: [u8; 32], public: [u8; 32]) -> Result<[u8; 32], ProtocolError> {
    let shared = x25519(secret, public);
    if shared == [0; 32] {
        return Err(error("invalid Diffie-Hellman key"));
    }
    Ok(shared)
}

fn verify_signature(
    identity: &IdentityDocument,
    payload: &[u8],
    signature: &[u8],
) -> Result<(), ProtocolError> {
    let key = VerifyingKey::from_sec1_bytes(identity.public_key())
        .map_err(|_| error("invalid identity key"))?;
    let signature =
        Signature::from_slice(signature).map_err(|_| error("invalid identity signature"))?;
    key.verify(payload, &signature)
        .map_err(|_| error("identity signature verification failed"))
}

fn encode_signed_identity(
    identity: &IdentityDocument,
    signature: &[u8],
) -> Result<Vec<u8>, ProtocolError> {
    let document = identity.encode();
    let mut bytes = Vec::with_capacity(document.len() + signature.len() + 4);
    put_bytes(&mut bytes, &document)?;
    put_bytes(&mut bytes, signature)?;
    Ok(bytes)
}

fn decode_signed_identity(bytes: &[u8]) -> Result<(IdentityDocument, Vec<u8>), ProtocolError> {
    let (document, remaining) = take_bytes(bytes)?;
    let (signature, trailing) = take_bytes(remaining)?;
    if !trailing.is_empty() || signature.len() != 64 {
        return Err(error("invalid signed identity"));
    }
    Ok((IdentityDocument::decode(document)?, signature.to_vec()))
}

fn padded_plaintext(text: &str, created_at: u64) -> Result<Vec<u8>, ProtocolError> {
    let text = text.as_bytes();
    let required = 1 + 8 + 16 + 2 + text.len();
    let bucket = PADDING_BUCKETS
        .iter()
        .copied()
        .find(|size| *size >= required)
        .ok_or_else(|| error("message does not fit padding buckets"))?;
    let mut plaintext = vec![0_u8; bucket];
    plaintext[0] = VERSION;
    plaintext[1..9].copy_from_slice(&created_at.to_be_bytes());
    getrandom::fill(&mut plaintext[9..25]).map_err(|_| error("random generator unavailable"))?;
    plaintext[25..27].copy_from_slice(&(text.len() as u16).to_be_bytes());
    plaintext[27..27 + text.len()].copy_from_slice(text);
    getrandom::fill(&mut plaintext[27 + text.len()..])
        .map_err(|_| error("random generator unavailable"))?;
    Ok(plaintext)
}

fn decode_padded_plaintext(bytes: &[u8]) -> Result<DecryptedMessage, ProtocolError> {
    if !PADDING_BUCKETS.contains(&bytes.len()) || bytes.len() < 27 || bytes[0] != VERSION {
        return Err(error("invalid padded plaintext"));
    }
    let created_at = u64::from_be_bytes(fixed::<8>(&bytes[1..9], "invalid timestamp")?);
    if created_at > MAX_TIMESTAMP_MS {
        return Err(error("invalid timestamp"));
    }
    let message_id = encode(&bytes[9..25]);
    let text_len = usize::from(u16::from_be_bytes(fixed::<2>(
        &bytes[25..27],
        "invalid text length",
    )?));
    if text_len > MAX_TEXT_BYTES || 27 + text_len > bytes.len() {
        return Err(error("invalid text length"));
    }
    let text = std::str::from_utf8(&bytes[27..27 + text_len])
        .map_err(|_| error("message is not UTF-8"))?
        .to_owned();
    if text.chars().count() > MAX_TEXT_CHARACTERS || text.is_empty() {
        return Err(error("invalid message length"));
    }
    Ok(DecryptedMessage {
        message_id,
        created_at,
        text,
    })
}

fn seal(
    key: &[u8; 32],
    associated_data: &[u8],
    plaintext: &[u8],
) -> Result<([u8; 12], Vec<u8>), ProtocolError> {
    let nonce = random_array()?;
    let cipher = Aes256GcmSiv::new_from_slice(key).map_err(|_| error("invalid handshake key"))?;
    let ciphertext = cipher
        .encrypt(
            &Nonce::from(nonce),
            Payload {
                msg: plaintext,
                aad: associated_data,
            },
        )
        .map_err(|_| error("cannot encrypt handshake"))?;
    Ok((nonce, ciphertext))
}

fn open(
    key: &[u8; 32],
    associated_data: &[u8],
    nonce: &[u8; 12],
    ciphertext: &[u8],
) -> Result<Vec<u8>, ProtocolError> {
    let cipher = Aes256GcmSiv::new_from_slice(key).map_err(|_| error("invalid handshake key"))?;
    cipher
        .decrypt(
            &Nonce::from(*nonce),
            Payload {
                msg: ciphertext,
                aad: associated_data,
            },
        )
        .map_err(|_| error("handshake authentication failed"))
}

fn put_bytes(target: &mut Vec<u8>, bytes: &[u8]) -> Result<(), ProtocolError> {
    let length = u16::try_from(bytes.len()).map_err(|_| error("field too large"))?;
    target.extend_from_slice(&length.to_be_bytes());
    target.extend_from_slice(bytes);
    Ok(())
}

fn take_bytes(bytes: &[u8]) -> Result<(&[u8], &[u8]), ProtocolError> {
    if bytes.len() < 2 {
        return Err(error("truncated field"));
    }
    let length = usize::from(u16::from_be_bytes([bytes[0], bytes[1]]));
    if bytes.len() < 2 + length {
        return Err(error("truncated field"));
    }
    Ok((&bytes[2..2 + length], &bytes[2 + length..]))
}

fn decode_handshake(frame: &str) -> Result<HandshakeFrame, ProtocolError> {
    serde_json::from_str(frame).map_err(|_| error("invalid handshake frame"))
}

fn encode(bytes: &[u8]) -> String {
    URL_SAFE_NO_PAD.encode(bytes)
}

fn decode(value: &str, message: &'static str) -> Result<Vec<u8>, ProtocolError> {
    URL_SAFE_NO_PAD.decode(value).map_err(|_| error(message))
}

fn decode_fixed<const N: usize>(
    value: &str,
    message: &'static str,
) -> Result<[u8; N], ProtocolError> {
    fixed(&decode(value, message)?, message)
}

fn fixed<const N: usize>(bytes: &[u8], message: &'static str) -> Result<[u8; N], ProtocolError> {
    bytes.try_into().map_err(|_| error(message))
}

fn random_array<const N: usize>() -> Result<[u8; N], ProtocolError> {
    let mut bytes = [0_u8; N];
    getrandom::fill(&mut bytes).map_err(|_| error("random generator unavailable"))?;
    Ok(bytes)
}

fn js_error(error: ProtocolError) -> JsValue {
    JsValue::from_str(&error.to_string())
}

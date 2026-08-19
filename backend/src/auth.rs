use crate::state::random_token;
use base64::{Engine, engine::general_purpose::URL_SAFE_NO_PAD};
use sequoia_openpgp::{
    Cert, KeyHandle,
    parse::{Parse, stream::*},
    policy::StandardPolicy,
};
use std::time::{Duration, Instant};

const MAX_PUBLIC_KEY_BYTES: usize = 32 * 1024;
const MAX_SIGNATURE_BYTES: usize = 16 * 1024;

pub struct PublicIdentity {
    pub cert: Cert,
    pub fingerprint: String,
}

pub struct Challenge {
    pub nonce: String,
    issued_at: Instant,
    used: bool,
}

#[derive(Debug, PartialEq)]
pub struct AuthenticationFailed;

impl Challenge {
    pub fn new(now: Instant) -> Self {
        Self {
            nonce: random_token::<32>(),
            issued_at: now,
            used: false,
        }
    }

    pub fn verify(
        &mut self,
        now: Instant,
        nickname: &str,
        signature: &str,
        cert: &Cert,
    ) -> Result<(), AuthenticationFailed> {
        if self.used || now.duration_since(self.issued_at) > Duration::from_secs(30) {
            return Err(AuthenticationFailed);
        }
        self.used = true;
        let signature = URL_SAFE_NO_PAD
            .decode(signature)
            .map_err(|_| AuthenticationFailed)?;
        if signature.len() > MAX_SIGNATURE_BYTES {
            return Err(AuthenticationFailed);
        }
        let signed = format!(
            "secret-chat/auth/v1\n{}\n{}",
            nickname.to_ascii_lowercase(),
            self.nonce
        );
        let policy = StandardPolicy::new();
        let mut verifier = DetachedVerifierBuilder::from_bytes(&signature)
            .map_err(|_| AuthenticationFailed)?
            .with_policy(&policy, None, SignatureHelper(cert.clone()))
            .map_err(|_| AuthenticationFailed)?;
        verifier
            .verify_bytes(signed.as_bytes())
            .map_err(|_| AuthenticationFailed)
    }
}

pub fn parse_public_identity(armored: &str) -> Result<PublicIdentity, AuthenticationFailed> {
    if armored.len() > MAX_PUBLIC_KEY_BYTES {
        return Err(AuthenticationFailed);
    }
    let cert = Cert::from_bytes(armored.as_bytes()).map_err(|_| AuthenticationFailed)?;
    if cert.is_tsk() {
        return Err(AuthenticationFailed);
    }
    let policy = StandardPolicy::new();
    let valid = cert
        .with_policy(&policy, None)
        .map_err(|_| AuthenticationFailed)?;
    let can_sign = valid
        .keys()
        .supported()
        .alive()
        .revoked(false)
        .for_signing()
        .next()
        .is_some();
    let can_encrypt = valid
        .keys()
        .supported()
        .alive()
        .revoked(false)
        .for_transport_encryption()
        .next()
        .is_some()
        || valid
            .keys()
            .supported()
            .alive()
            .revoked(false)
            .for_storage_encryption()
            .next()
            .is_some();
    if !can_sign || !can_encrypt {
        return Err(AuthenticationFailed);
    }
    Ok(PublicIdentity {
        fingerprint: cert.fingerprint().to_hex().to_ascii_lowercase(),
        cert,
    })
}

struct SignatureHelper(Cert);

impl VerificationHelper for SignatureHelper {
    fn get_certs(&mut self, _ids: &[KeyHandle]) -> sequoia_openpgp::Result<Vec<Cert>> {
        Ok(vec![self.0.clone()])
    }

    fn check(&mut self, structure: MessageStructure<'_>) -> sequoia_openpgp::Result<()> {
        match structure.into_iter().next() {
            Some(MessageLayer::SignatureGroup { results })
                if results.iter().any(|result| result.is_ok()) =>
            {
                Ok(())
            }
            _ => Err(std::io::Error::other("invalid signature").into()),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use sequoia_openpgp::{
        cert::prelude::*,
        policy::StandardPolicy,
        serialize::{
            Serialize,
            stream::{Message, Signer},
        },
    };
    use std::io::Write;

    fn identity() -> (String, Cert) {
        let (cert, _) = CertBuilder::general_purpose(["Alice <alice@example.test>"])
            .generate()
            .unwrap();
        let public = cert.clone().strip_secret_key_material();
        let mut armored = Vec::new();
        public.armored().serialize(&mut armored).unwrap();
        (String::from_utf8(armored).unwrap(), cert)
    }

    fn sign(cert: &Cert, bytes: &[u8]) -> String {
        let policy = StandardPolicy::new();
        let keypair = cert
            .keys()
            .secret()
            .with_policy(&policy, None)
            .supported()
            .alive()
            .revoked(false)
            .for_signing()
            .next()
            .unwrap()
            .key()
            .clone()
            .into_keypair()
            .unwrap();
        let mut signature = Vec::new();
        let message = Message::new(&mut signature);
        let mut signer = Signer::new(message, keypair)
            .unwrap()
            .detached()
            .build()
            .unwrap();
        signer.write_all(bytes).unwrap();
        signer.finalize().unwrap();
        URL_SAFE_NO_PAD.encode(signature)
    }

    #[test]
    fn valid_certificate_and_signature_authenticate() {
        let (armored, secret) = identity();
        let public = parse_public_identity(&armored).unwrap();
        let now = Instant::now();
        let mut challenge = Challenge::new(now);
        let bytes = format!("secret-chat/auth/v1\nalice\n{}", challenge.nonce);
        let signature = sign(&secret, bytes.as_bytes());
        assert_eq!(
            challenge.verify(now, "Alice", &signature, &public.cert),
            Ok(())
        );
    }

    #[test]
    fn expired_reused_and_wrong_signatures_are_rejected() {
        let (armored, secret) = identity();
        let public = parse_public_identity(&armored).unwrap();
        let now = Instant::now();

        let mut expired = Challenge::new(now - Duration::from_secs(31));
        assert_eq!(
            expired.verify(now, "alice", "invalid", &public.cert),
            Err(AuthenticationFailed)
        );

        let mut challenge = Challenge::new(now);
        let bytes = format!("secret-chat/auth/v1\nalice\n{}", challenge.nonce);
        let signature = sign(&secret, bytes.as_bytes());
        assert!(
            challenge
                .verify(now, "alice", &signature, &public.cert)
                .is_ok()
        );
        assert_eq!(
            challenge.verify(now, "alice", &signature, &public.cert),
            Err(AuthenticationFailed)
        );

        let mut wrong = Challenge::new(now);
        let signature = sign(&secret, b"different bytes");
        assert_eq!(
            wrong.verify(now, "alice", &signature, &public.cert),
            Err(AuthenticationFailed)
        );

        assert_eq!(
            parse_public_identity(&"x".repeat(MAX_PUBLIC_KEY_BYTES + 1)).err(),
            Some(AuthenticationFailed)
        );
    }
}

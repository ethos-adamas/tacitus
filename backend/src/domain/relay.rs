const MAX_RELAY_BODY_BYTES: usize = 48 * 1024;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct RichiestaId(String);

impl RichiestaId {
    pub fn new(value: impl Into<String>) -> Result<Self, DatoRelayNonValido> {
        let value = value.into();
        if value.is_empty() || value.len() > 64 {
            return Err(DatoRelayNonValido);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct CorpoCifrato(String);

impl CorpoCifrato {
    pub fn new(value: impl Into<String>) -> Result<Self, DatoRelayNonValido> {
        let value = value.into();
        if value.is_empty() || value.len() > MAX_RELAY_BODY_BYTES {
            return Err(DatoRelayNonValido);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum TipoPayload {
    Handshake,
    Messaggio,
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct DatoRelayNonValido;

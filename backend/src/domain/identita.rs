use std::{fmt, str::FromStr};
use tacitus_protocol::{format_tacitus_id, parse_tacitus_id};

#[derive(Clone, Debug, PartialEq, Eq, Hash, PartialOrd, Ord)]
pub struct TacitusId(String);

impl TacitusId {
    pub fn from_bytes(value: [u8; 16]) -> Self {
        Self(format_tacitus_id(&value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl FromStr for TacitusId {
    type Err = IdentitaNonValida;

    fn from_str(value: &str) -> Result<Self, Self::Err> {
        let bytes = parse_tacitus_id(value).map_err(|_| IdentitaNonValida)?;
        Ok(Self::from_bytes(bytes))
    }
}

impl fmt::Display for TacitusId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct IdentitaAutenticata {
    tacitus_id: TacitusId,
    nickname: String,
    documento_pubblico: Vec<u8>,
}

impl IdentitaAutenticata {
    pub fn new(
        tacitus_id: TacitusId,
        nickname: String,
        documento_pubblico: Vec<u8>,
    ) -> Result<Self, IdentitaNonValida> {
        if nickname.is_empty() || documento_pubblico.is_empty() {
            return Err(IdentitaNonValida);
        }
        Ok(Self {
            tacitus_id,
            nickname,
            documento_pubblico,
        })
    }

    pub fn tacitus_id(&self) -> &TacitusId {
        &self.tacitus_id
    }

    pub fn nickname(&self) -> &str {
        &self.nickname
    }

    pub fn documento_pubblico(&self) -> &[u8] {
        &self.documento_pubblico
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct IdentitaNonValida;

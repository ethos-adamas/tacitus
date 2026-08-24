use std::fmt;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct SessionId(String);

impl SessionId {
    pub fn new(value: impl Into<String>) -> Result<Self, SessioneNonValida> {
        let value = value.into();
        if value.is_empty() || value.len() > 64 {
            return Err(SessioneNonValida);
        }
        Ok(Self(value))
    }

    pub fn as_str(&self) -> &str {
        &self.0
    }
}

impl fmt::Display for SessionId {
    fn fmt(&self, formatter: &mut fmt::Formatter<'_>) -> fmt::Result {
        formatter.write_str(&self.0)
    }
}

#[derive(Clone, Debug, PartialEq, Eq)]
pub enum StatoSessione {
    Attiva(SessionId),
    InAttesaDiRiconnessione(SessionId),
}

impl StatoSessione {
    pub fn id(&self) -> &SessionId {
        match self {
            Self::Attiva(id) | Self::InAttesaDiRiconnessione(id) => id,
        }
    }

    pub fn attiva(&self) -> bool {
        matches!(self, Self::Attiva(_))
    }

    pub fn presenza(&self) -> Presenza {
        match self {
            Self::Attiva(_) => Presenza::Online,
            Self::InAttesaDiRiconnessione(_) => Presenza::Offline,
        }
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Presenza {
    Online,
    Offline,
}

impl Presenza {
    pub fn online(self) -> bool {
        self == Self::Online
    }
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct SessioneNonValida;

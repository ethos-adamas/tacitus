use crate::domain::identita::TacitusId;

pub const MASSIMO_BLOCCHI_PER_IDENTITA: usize = 1_024;

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct IntentoDiContatto {
    pub da: TacitusId,
    pub verso: TacitusId,
}

impl IntentoDiContatto {
    pub fn new(da: TacitusId, verso: TacitusId) -> Self {
        Self { da, verso }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Relazione(TacitusId, TacitusId);

impl Relazione {
    pub fn new(prima: TacitusId, seconda: TacitusId) -> Self {
        if prima <= seconda {
            Self(prima, seconda)
        } else {
            Self(seconda, prima)
        }
    }

    pub fn contiene(&self, identita: &TacitusId) -> bool {
        &self.0 == identita || &self.1 == identita
    }

    pub fn altra(&self, identita: &TacitusId) -> Option<&TacitusId> {
        if &self.0 == identita {
            Some(&self.1)
        } else if &self.1 == identita {
            Some(&self.0)
        } else {
            None
        }
    }
}

#[derive(Clone, Debug, PartialEq, Eq, Hash)]
pub struct Blocco {
    pub da: TacitusId,
    pub verso: TacitusId,
}

impl Blocco {
    pub fn new(da: TacitusId, verso: TacitusId) -> Self {
        Self { da, verso }
    }
}

use crate::domain::identita::IdentitaAutenticata;

#[derive(Clone, Debug, PartialEq, Eq)]
pub struct SfidaAutenticazione(pub [u8; 32]);

pub struct RispostaAutenticazione<'a> {
    pub nickname: &'a str,
    pub chiave_pubblica: &'a str,
    pub firma: &'a str,
}

pub trait AutenticatoreIdentita: Clone + Send + Sync + 'static {
    fn nuova_sfida(&self) -> SfidaAutenticazione;

    fn autentica(
        &self,
        sfida: &SfidaAutenticazione,
        risposta: RispostaAutenticazione<'_>,
    ) -> Result<IdentitaAutenticata, AutenticazioneFallita>;
}

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub struct AutenticazioneFallita;

mod comandi;
mod eventi;
mod stato;

pub use comandi::ComandoRelay;
pub use eventi::{EventoRelay, EventoSessione, MotivoChiusura};
pub use stato::Relay;

#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum ErroreRelay {
    AutenticazioneFallita,
    CollisioneIdentita,
    ContattoNonDisponibile,
    RichiestaNonValida,
    TroppiIntenti,
    CapacitaEsaurita,
}

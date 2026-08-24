mod autenticatore_identita;
mod frame;

pub use autenticatore_identita::{AutenticatoreProtocolloV3, frame_sfida};
pub use frame::{ErroreFrame, FrameClient, FrameServer, codice_errore, parse_frame_client};

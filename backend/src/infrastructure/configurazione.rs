use std::{env, net::SocketAddr};

#[derive(Clone, Debug)]
pub struct Configurazione {
    pub indirizzo: SocketAddr,
    pub origini_pubbliche: Vec<String>,
}

impl Configurazione {
    pub fn da_ambiente() -> Result<Self, ConfigurazioneNonValida> {
        let indirizzo = env::var("BIND_ADDRESS")
            .unwrap_or_else(|_| "0.0.0.0:3000".to_owned())
            .parse()
            .map_err(|_| ConfigurazioneNonValida)?;
        let origini_pubbliche = env::var("PUBLIC_ORIGINS")
            .map(|value| {
                value
                    .split(',')
                    .map(str::trim)
                    .filter(|value| !value.is_empty())
                    .map(|value| value.trim_end_matches('/').to_owned())
                    .collect()
            })
            .unwrap_or_default();
        Ok(Self {
            indirizzo,
            origini_pubbliche,
        })
    }
}

#[derive(Clone, Copy, Debug)]
pub struct ConfigurazioneNonValida;

impl std::fmt::Display for ConfigurazioneNonValida {
    fn fmt(&self, formatter: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        formatter.write_str("configurazione backend non valida")
    }
}

impl std::error::Error for ConfigurazioneNonValida {}

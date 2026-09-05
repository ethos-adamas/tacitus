use std::{
    env,
    net::{IpAddr, SocketAddr},
};

#[derive(Clone, Debug)]
pub struct Configurazione {
    pub indirizzo: SocketAddr,
    pub origini_pubbliche: Vec<String>,
    pub proxy_fidati: Vec<IpAddr>,
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
        let proxy_fidati = env::var("TRUSTED_PROXY_IPS")
            .unwrap_or_default()
            .split(',')
            .map(str::trim)
            .filter(|ip| !ip.is_empty())
            .map(|ip| ip.parse().map_err(|_| ConfigurazioneNonValida))
            .collect::<Result<Vec<_>, _>>()?;
        Ok(Self {
            indirizzo,
            origini_pubbliche,
            proxy_fidati,
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

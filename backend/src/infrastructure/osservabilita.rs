pub fn inizializza() {
    let filtro = tracing_subscriber::EnvFilter::try_from_default_env()
        .unwrap_or_else(|_| tracing_subscriber::EnvFilter::new("tacitus_backend=info"));
    let _ = tracing_subscriber::fmt()
        .with_env_filter(filtro)
        .without_time()
        .try_init();
}

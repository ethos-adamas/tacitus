# Relay Tacitus

Backend Axum/Tokio senza database. Autentica un'Identità P-256, coordina Intenti e Relazioni mentre il processo è vivo e inoltra body opachi di handshake e messaggi. Non cifra, non decifra, non accoda offline e non scrive metadati applicativi nei log.

Una disconnessione ha 30 secondi di tolleranza. Dopo la scadenza la Relazione diventa l'Intento unilaterale dell'Identità rimasta online; chi ritorna deve riattivarla. Se entrambe sono offline, entrambi gli Intenti vengono persi.

Il protocollo completo, inclusi autenticazione, handshake, Double Ratchet e frame JSON V2, è documentato nel [`README` principale](../README.md#protocollo-tacitus-v2).

## Avvio e test

```bash
cargo run -p tacitus-backend
cargo test -p tacitus-backend
```

Variabili:

- `BIND_ADDRESS`, default `0.0.0.0:3000`;
- `PUBLIC_ORIGINS`, lista separata da virgole degli origin esatti accettati in produzione. Il deploy include Web e i due origin Tauri mobile.

`GET /health` restituisce anche la versione del protocollo. Il Dockerfile copia il binario già costruito dalla pipeline da `backend/artifacts/tacitus-backend`; non contiene uno stage di build.

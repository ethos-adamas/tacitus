# Client Tacitus

La stessa SPA React usa il core Rust `tacitus-protocol` compilato in WASM su Web, Android e iOS. La chiave persistente dell'Identità resta dietro un provider: WebCrypto nel browser, Android Keystore/StrongBox o iOS Secure Enclave nelle app Tauri. Sessioni X25519 e Double Ratchet sono volatili nel modulo WASM.

Il tema segue il sistema finché non viene selezionato manualmente. Le notifiche sono opt-in: il browser usa la Notification API e Android/iOS il plugin ufficiale Tauri. Sono locali e best-effort, quindi non arrivano quando tab o app sono sospesi o chiusi.

Il protocollo wire e crittografico completo è documentato nel [`README` principale](../README.md#protocollo-tacitus-v2).

## Web

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --version 0.15.0 --locked
npm install
npm run dev
```

`npm run build` rigenera automaticamente `src/generated/` e produce `dist/`. Il Dockerfile contiene soltanto Nginx e il `dist/` già costruito dalla pipeline.

## Android e iOS

Il guscio Tauri è in `src-tauri/`; il plugin nativo è in `src-tauri/plugins/identity/`. Dopo aver installato i prerequisiti Tauri della piattaforma:

```bash
npm run tauri android init
npm run tauri android dev
```

Su macOS:

```bash
npm run tauri ios init
npm run tauri ios dev
```

Le app usano `wss://tacitus.ethos-adamas.it/ws`; `VITE_RELAY_URL` permette di puntare un relay di sviluppo diverso.

Android richiede API 23 o successiva; StrongBox viene usata da API 28 quando disponibile. Su dispositivo iOS la creazione P-256 richiede Secure Enclave; il simulatore usa una chiave software non esportabile per lo sviluppo.

## Test

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

I vettori di interoperabilità handshake/ratchet sono testati nativamente in `protocol/tests/protocol.rs`; i test client coprono modello della Conversazione, preferenze del dispositivo e cifratura dello snapshot locale.

# Client Tacitus

La stessa SPA React usa il core Rust `tacitus-protocol` compilato in WASM su Web, Android e iOS. La chiave persistente dell'Identità resta dietro un provider: WebCrypto nel browser, Android Keystore/StrongBox o iOS Secure Enclave nelle app Tauri. Sessioni X25519 e Double Ratchet sono volatili nel modulo WASM.

Il tema segue il sistema finché non viene selezionato manualmente. Le notifiche sono opt-in: il browser usa la Notification API e Android/iOS il plugin ufficiale Tauri. Sono locali e best-effort, quindi non arrivano quando tab o app sono sospesi o chiusi.

Il protocollo wire e crittografico completo è documentato nel [`README` principale](../README.md#protocollo-wire-v3).

## Struttura

Il frontend è organizzato per layer e responsabilità della Messaggistica privata:

- `src/domain/`: linguaggio e invarianti di Identità, Relazioni, Conversazioni e Messaggi;
- `src/application/store/`: stato Redux normalizzato e selector derivati;
- `src/application/hooks/`: capability usate dai componenti e lifecycle React;
- `src/application/listeners/`: effetti di Sessioni sicure, Messaggi, notifiche e persistenza;
- `src/infrastructure/`: adapter per Relay, Provider di Identità, WASM, IndexedDB e piattaforma;
- `src/ui/`: componenti che possiedono HTML e stato strettamente visuale.

Redux contiene soltanto stato serializzabile. Chiavi, `WebSocket`, timer e `PeerSession` restano nei rispettivi moduli. Le transizioni dello slice e i selector costituiscono il seam principale dei test del modello client.

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
npm run format:check
npm run build
```

I vettori di interoperabilità handshake/ratchet sono testati nativamente in `protocol/tests/protocol.rs`. Vitest copre dominio, reducer, listener, adapter e UI; Playwright esercita gli use case completi contro il Relay locale su Chromium desktop e viewport mobile.

## Versione e interfaccia

`package.json` è la fonte della versione mostrata nel brand e della versione dell'app Tauri (`src-tauri/tauri.conf.json` la legge direttamente). Il brand resta visibile su mobile. Tema, notifiche e cancellazione dati sono raccolti sotto l'ingranaggio Impostazioni.

La chat segue la viewport visibile, comprese le variazioni della tastiera; scorre soltanto la cronologia. Il componente emoji richiede stili inline, autorizzati dalla policy CSS di Nginx come già avviene in Tauri; la policy degli script resta invariata.

Tacitus non gestisce lo spazio del dispositivo: nessuna quota applicativa, monitoraggio dello spazio o cancellazione automatica. Gli errori di quota vengono segnalati esplicitamente; ogni salvataggio attende il commit IndexedDB prima di considerarsi riuscito.

## Album e riattivazione

La scelta multipla delle foto mostra anteprime annullabili prima dell'invio. Il consenso iniziale, la revoca per Contatto e l'interruttore globale sono descritti nel [protocollo Album](../README.md#foto-album-e-consenso). I test browser coprono anche un mittente che tenta di anticipare il consenso, WebP corrotti, mancanza di spazio, indici locali opachi, persistenza dopo reload e cancellazione.

La riattivazione conserva Contatto e Conversazione. Una conferma ripetuta di una Relazione non riporta una Sessione pronta in negoziazione; frame, firme e callback di una vecchia connessione vengono scartati dopo la riconnessione. Il test di chiusura di entrambi i client attende oltre i 30 secondi di tolleranza del relay e verifica lo scambio senza rimuovere i Contatti. Non viene introdotta una scadenza di 30 secondi agli Intenti nuovi.

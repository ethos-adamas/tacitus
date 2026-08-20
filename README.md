# Tacitus

Tacitus è una chat testuale effimera end-to-end encrypted per Web, Android e iOS. Non ha account, directory, database o messaggi offline: due Identità devono essere online e approvare reciprocamente il proprio Tacitus ID.

Questa è la versione 2 del protocollo. Sostituisce integralmente la V1 OpenPGP: frame, chiavi e dati V1 non sono accettati né migrati.

## Componenti

- `protocol/`: core Rust condiviso, usato nativamente nei test e compilato in WebAssembly nel client;
- `frontend/`: unica UI React/Vite per Web e Tauri mobile;
- `frontend/src-tauri/plugins/identity/`: provider Android Keystore/StrongBox e iOS Secure Enclave/Keychain;
- `backend/`: registry e relay WebSocket Axum con solo stato volatile;
- `deploy/`: deploy K3s a replica singola.

In produzione l'Ingress usa un solo origin: `/` serve il client e `/ws` il relay.

## Protocollo Tacitus V2

### Identità e Tacitus ID

L'Identità contiene un nickname immutabile e una chiave pubblica ECDSA P-256 SEC1 non compressa. Il documento canonico è:

```text
0x02 | nickname_len:u8 | nickname_ascii | 0x41 | p256_public_key:65
```

Il nickname viene normalizzato in minuscolo e deve rispettare `^[a-z0-9_]{3,24}$`. La chiave privata è non esportabile:

- Web: `CryptoKey` WebCrypto in IndexedDB;
- Android: P-256 in Android Keystore, StrongBox quando disponibile;
- iOS: P-256 nel Secure Enclave; il simulatore usa Keychain software per consentire lo sviluppo.

Il Tacitus ID è lungo 128 bit:

```text
SHA-256("tacitus/id/v2\0" || documento_identità)[0..16]
```

Viene mostrato come 26 caratteri Crockford Base32 nel formato `5-5-5-5-6`. È un locator umano, non una credenziale. Una collisione con una chiave diversa viene rifiutata.

### Autenticazione del relay

Il relay invia un nonce casuale monouso di 32 byte. Il client firma con ECDSA P-256/SHA-256:

```text
"tacitus/auth/v2\0" | documento_len:u16_be | documento_identità | nonce:32
```

La firma wire è `r || s` a 64 byte, codificata Base64URL. Una nuova Sessione autenticata della stessa Identità chiude la precedente. Il relay conserva il binding ID/chiave soltanto in RAM e non registra metadati applicativi nei log.

### Consenso e handshake

Una Relazione nasce soltanto quando entrambi gli Intenti di contatto sono presenti e le due Identità sono online. La rimozione cancella la Relazione; per ricrearla servono due nuovi Intenti. Una riconnessione conserva la Conversazione locale ma crea sempre una nuova Sessione crittografica.

Alla disconnessione il relay concede 30 secondi per rientrare nella stessa Relazione. Scaduto il termine, l'Identità rimasta online conserva il proprio Intento e quella che ritorna deve premere `Riattiva`; non deve farlo anche il Contatto rimasto online. Se entrambe si disconnettono, nessun Intento sopravvive. Il riavvio del backend ha lo stesso effetto perché lo stato è volatile.

L'Identità col Tacitus ID lessicograficamente minore inizia un handshake autenticato in stile SIGMA-I. Ogni lato genera X25519 effimero, deriva chiavi distinte con HKDF-SHA-256 e cifra i documenti e le firme dell'Identità con AES-256-GCM-SIV. Le firme coprono versione, ID, session ID, entrambe le chiavi effimere, ruolo e prima chiave ratchet; non firmano i singoli messaggi.

```text
Alice                          Relay opaco                         Bob
  |                                |                                |
  |-- contact.add(Bob ID) -------->|                                |
  |                                |<------- contact.add(Alice ID) --|
  |<------- contact.matched -------|------- contact.matched -------->|
  |                                |                                |
  | genera eA, session ID          |                                |
  |-- OFFER(session, eA) --------->|------------------------------->|
  |                                |        genera eB, DH(eB,eA)     |
  |                                |        firma transcript come B |
  |<-- RESPONSE(eB, AEAD{docB,sigB}) <------------------------------|
  | DH(eA,eB), verifica ID e sigB  |                                |
  | genera ratchet A, firma come A |                                |
  |-- CONFIRM(rA, AEAD{docA,sigA})->|------------------------------>|
  |                                | verifica ID e sigA, ratchet     |
  |<================ Sessione Double Ratchet pronta ===============>|
```

Il relay vede mittente, destinatario, tempi e dimensione a bucket, ma non chiavi di sessione, documenti cifrati nell'handshake o testo.

### Double Ratchet e messaggi

La chiave root iniziale viene derivata dal DH dell'handshake. Il ratchet DH usa X25519; ogni cambio di chiave DH aggiorna root key e sending/receiving chain con HKDF-SHA-256. Ogni messaggio consuma una message key diversa derivata con HMAC-SHA-256. Lo stato è solo in memoria e non viene mai salvato.

Il testo viene cifrato con AES-256-GCM-SIV e nonce casuale da 96 bit. L'associated data canonica autentica:

```text
versione | session ID | from ID | to ID | ratchet public key |
previous chain length | message number | bucket | nonce
```

Il plaintext autenticato contiene versione, timestamp, message ID casuale, lunghezza reale, UTF-8 e padding casuale. I bucket del plaintext sono `256, 512, 1024, 2048, 4096, 8192, 16384` byte; il ciphertext aggiunge il tag da 16 byte. Il limite UI è 4.000 caratteri.

Il receiver rifiuta AEAD non valida, ID/sessione errati, replay e messaggi fuori ordine. Tacitus non offre retry o consegna offline: una disconnessione può perdere i frame in transito.

Il padding nasconde la lunghezza esatta all'interno del bucket, non il bucket, la frequenza o gli orari. Non c'è cover traffic; la resistenza completa alla traffic analysis non è una garanzia della V2.

### Cronologia locale

La Conversazione è separata dalla Sessione. Il client conserva testo e bozze in uno snapshot cifrato:

- Web: AES-256-GCM con chiave WebCrypto non esportabile;
- Android: AES-256-GCM con chiave Android Keystore/StrongBox;
- iOS: AES-256-GCM con chiave `ThisDeviceOnly` in Keychain.

`Cancella dati` elimina Identità, chiavi, Contatti e Conversazioni. Tema e preferenza notifiche appartengono al dispositivo e restano. Non esistono backup, recovery, sincronizzazione o multi-device.

Il client segue inizialmente il tema del sistema e conserva un'eventuale scelta chiaro/scuro. Le notifiche sono disattivate di default e richiedono un consenso esplicito. Quando Tacitus non è in primo piano, ogni nuovo Messaggio produce una notifica generica senza Contatto né anteprima; Web e app mobile non ricevono notifiche push quando vengono sospesi o chiusi.

### Frame WebSocket

I frame sono JSON V2; ciphertext e campi binari usano Base64URL. Il relay accetta soltanto:

```text
auth.respond
contact.add | contact.cancel | contact.remove
handshake.send
message.send
```

e produce:

```text
auth.challenge | auth.ready
contact.pending | contact.matched | contact.state | contact.removed
presence.changed
handshake.sent | handshake.received
message.sent | message.received
error
```

I body di handshake e messaggio sono opachi per il backend.

## Sviluppo

Servono Rust 1.96, Node 24, il target WASM e `wasm-pack` 0.15:

```bash
rustup target add wasm32-unknown-unknown
cargo install wasm-pack --version 0.15.0 --locked
npm --prefix frontend ci
```

Avvio:

```bash
cargo run -p tacitus-backend
npm --prefix frontend run dev
```

Vite inoltra `/ws` a `localhost:3000`.

Verifica completa:

```bash
cargo fmt --all --check
cargo clippy --workspace --all-targets --locked -- -D warnings
cargo test --locked
npm --prefix frontend run lint
npm --prefix frontend test
npm --prefix frontend run typecheck
npm --prefix frontend run build
```

Le istruzioni specifiche sono in [`frontend/README.md`](frontend/README.md) e [`backend/README.md`](backend/README.md).

## Deploy

Le pipeline frontend e backend pubblicano immagini distinte su GHCR. Una modifica a `protocol/` le attiva entrambe perché entrambe dipendono dal protocollo condiviso. I manifest K3s mantengono una sola replica backend e nessun volume.

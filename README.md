# Tacitus

Tacitus è una chat testuale effimera end-to-end encrypted per Web, Android e iOS. Non ha account, directory, database o messaggi offline: due Identità devono essere online e approvare reciprocamente il proprio Tacitus ID.

Tacitus usa la versione 2 del protocollo crittografico e la versione 3 del protocollo wire. Il wire V3 sostituisce integralmente V1 e V2: i vecchi frame non sono accettati né migrati.

## Componenti

- `protocol/`: core Rust condiviso, usato nativamente nei test e compilato in WebAssembly nel client;
- `frontend/`: unica UI React/Vite per Web e Tauri mobile;
- `frontend/src-tauri/plugins/identity/`: provider Android Keystore/StrongBox e iOS Secure Enclave/Keychain;
- `backend/`: registry e relay WebSocket Axum con solo stato volatile;
- `deploy/`: deploy K3s a replica singola.

In produzione l'Ingress usa un solo origin: `/` serve il client e `/ws` il relay.

## Protocollo crittografico Tacitus V2

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

Un Blocco è unilaterale: elimina Relazione e Intenti reciproci e impedisce nuovi Intenti, handshake e Messaggi cifrati tra le due Identità. Lo sblocco non ricrea alcuna Relazione. I Blocchi sono persistiti nello snapshot cifrato del dispositivo e sincronizzati col relay prima che la Sessione diventi online; il relay non li conserva dopo il riavvio.

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

Il plaintext autenticato contiene versione, timestamp, message ID casuale, lunghezza reale, UTF-8 e padding casuale. I bucket del plaintext sono `256, 512, 1024, 2048, 4096, 8192, 16384, 32768` byte; il ciphertext aggiunge il tag da 16 byte. Il limite UI è 4.000 caratteri.

Il receiver rifiuta AEAD non valida, ID/sessione errati, replay e messaggi fuori ordine. Tacitus non offre retry o consegna offline: una disconnessione può perdere i frame in transito.

Il padding nasconde la lunghezza esatta all'interno del bucket, non il bucket, la frequenza o gli orari. Non c'è cover traffic; la resistenza completa alla traffic analysis non è una garanzia della V2.

### Foto, Album e consenso

Un Album contiene da 1 a 10 foto. Il client accetta JPEG, PNG e WebP fino a 20 MiB e 24 megapixel per originale, ridimensiona il lato maggiore a 2048 pixel e ricodifica in WebP statico (massimo 5 MiB per foto). Non invia nomi di file, EXIF o XMP; può conservare il profilo colore generato dall'encoder. Il browser decodifica le foto; dove manca l'encoder WebP del canvas, il modulo WASM usa `image-webp`. Non sono previsti GIF animate, video o consegna offline.

Prima di inviare qualsiasi byte delle foto viene scambiata un'offerta cifrata. Per un Contatto nuovo il destinatario vede un piccolo avviso: accettando autorizza anche gli Album successivi. Rifiutando disabilita ulteriori richieste da quel Contatto. L'ingranaggio del Contatto permette di tornare a «Chiedi consenso», accettare automaticamente o non ricevere; «Ricevi foto e album» nelle impostazioni globali prevale sulle scelte dei singoli Contatti. Il consenso riguarda la ricezione, non l'invio, e viene conservato solo nello snapshot locale cifrato.

Il wire esterno rimane V3 e il relay continua a inoltrare esclusivamente body opachi, senza conservare immagini o offerte. Nel plaintext cifrato, la versione contenuto `2` identifica il testo esistente e `3` identifica JSON UTF-8 limitato a 32.000 byte. La struttura autenticata e il Double Ratchet restano gli stessi. Per scambiare Album entrambi i client devono essere aggiornati: i client precedenti non comprendono il contenuto `3`.

| Contenuto cifrato | Campi oltre a `type` e `id` (UUID casuale dell'Album) |
| --- | --- |
| `album.offer` | `sizes`: 1–10 dimensioni in byte delle foto WebP |
| `album.answer` | `accepted`: consenso alla trasmissione |
| `album.chunk` | `index`: foto da 0; `offset`: byte da 0; `data`: Base64URL senza padding, massimo 18.000 byte decodificati |
| `album.ack` | `index`, `offset`: posizione successiva attesa |
| `album.cancel` | nessun altro campo |

Il mittente aspetta l'ACK di ogni blocco e distanzia i blocchi di almeno 50 ms. Il destinatario accetta solo dimensioni, indice e offset concordati, controlla il contenitore [WebP](https://developers.google.com/speed/webp/docs/riff_container) e decodifica la foto prima di salvarla. Sono ammessi un trasferimento in uscita e uno in ingresso per dispositivo, con al massimo cinque offerte in attesa. L'offerta scade dopo due minuti; un blocco senza risposta scade dopo 30 secondi. Questi timeout riguardano gli Album, non gli Intenti di contatto. Disconnessione, annullamento o rimozione del Contatto interrompono il trasferimento senza ripresa automatica.

Le foto diventano visibili nella cronologia dopo il salvataggio dell'intero Album. L'ultimo ACK viene inviato dopo il commit locale del destinatario. Se la connessione cade proprio tra commit e ACK, il destinatario può avere l'Album e il mittente vedere un trasferimento interrotto: non esiste una copia sul server con cui riconciliarli.

Il relay non vede consenso, tipo di contenuto, nomi o dimensioni esatte delle foto. Vede ancora gli interlocutori, i bucket (ora anche 32.768 byte), tempi, numero e direzione dei frame: un trasferimento di immagini può essere dedotto da questi segnali. Non viene fornita resistenza completa all'analisi del traffico.

### Cronologia locale

La Conversazione è separata dalla Sessione. Il client conserva testo, bozze, riferimenti agli Album e consenso in uno snapshot cifrato:

- Web: AES-256-GCM con chiave WebCrypto non esportabile;
- Android: AES-256-GCM con chiave Android Keystore/StrongBox;
- iOS: AES-256-GCM con chiave `ThisDeviceOnly` in Keychain.

Gli Album sono record cifrati separati in IndexedDB, identificati da UUID opachi; il Contatto e le foto stanno nel ciphertext. La cancellazione di un Contatto elimina i relativi Album. Non vengono misurati lo spazio disponibile né imposte quote complessive o cancellazioni automatiche: un errore di spazio viene segnalato e non crea un Album incompleto. Un crash può lasciare un asset temporaneo non referenziato; non è prevista manutenzione automatica dello spazio.

`Cancella dati` elimina Identità, chiavi, Contatti, Conversazioni, Album e preferenze del dispositivo. Non esistono backup, recovery, sincronizzazione o multi-device.

Il client segue inizialmente il tema del sistema e conserva un'eventuale scelta chiaro/scuro. Le notifiche sono disattivate di default e richiedono un consenso esplicito. Quando Tacitus non è in primo piano, ogni nuovo Messaggio produce una notifica generica senza Contatto né anteprima; Web e app mobile non ricevono notifiche push quando vengono sospesi o chiusi.

## Protocollo wire V3

I frame sono JSON V3; ciphertext e campi binari usano Base64URL. Dopo `auth.respond`, il client deve inviare `contact.blocks.sync`; soltanto allora riceve `auth.ready` e diventa online.

Il relay accetta soltanto:

```text
auth.respond
contact.blocks.sync
contact.add | contact.cancel | contact.remove | contact.block | contact.unblock
handshake.send
message.send
```

e produce:

```text
auth.challenge | auth.ready
contact.pending | contact.matched | contact.state | contact.removed
contact.blocked | contact.unblocked
presence.changed
handshake.sent | handshake.received
message.sent | message.received
error
```

I body di handshake e messaggio sono opachi per il backend.

`message.sent` e `handshake.sent` attestano soltanto che il relay ha inserito il payload nella mailbox della Sessione attiva del destinatario. Non attestano ricezione sul dispositivo, decifratura o lettura. Una mailbox destinataria bloccata causa `contact_unavailable`; la saturazione della mailbox centrale causa `server_busy` senza disconnettere il mittente.

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

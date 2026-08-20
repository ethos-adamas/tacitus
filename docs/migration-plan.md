# Piano di migrazione Tacitus v2

Documento modificabile che raccoglie decisioni, ordine dei lavori e verifiche già svolte.

## Stato

**In pausa al gate crittografico della fase 1.** Nessun codice di produzione o percorso del repository è stato migrato.

| Fase | Stato | Commit |
| --- | --- | --- |
| Configurazione agenti | completata | `bb2d90e` |
| Modello di sicurezza e gate crittografico | completata, gate non superato | `e899c85` |
| Migrazione strutturale e funzionale | non iniziata | — |

## Obiettivo confermato

Tacitus deve produrre Web, Android e iOS dalla stessa UI e offrire messaggistica testuale end-to-end cifrata senza account, directory persistente o messaggi offline.

### Identità

- un'Identità per installazione, senza backup, recovery o sincronizzazione;
- creazione: `Crea identità` → nickname → generazione e salvataggio atomici;
- nickname non unico e immutabile per la vita dell'Identità;
- cambio nickname = nuova Identità;
- cancellazione irreversibile di Identità, Contatti e Conversazioni;
- nessun prompt aggiuntivo per usare le chiavi nella prima release.

### Tacitus ID

- formato Crockford Base32 da 12 caratteri, raggruppato `4-4-4`;
- derivazione proposta:

```text
SHA-256("tacitus-id-v1" || Ed25519_public || X25519_public)
```

- vengono mostrati i primi 60 bit; trattini e maiuscole sono normalizzati in input;
- è un locator umano, mai una credenziale di autorizzazione;
- il server conserva temporaneamente `Tacitus ID → Identità online`;
- una collisione fallisce senza scegliere arbitrariamente un'Identità.

### Contatti e Relazioni

- si condivide `nickname · Tacitus ID` tramite Web Share API o copia;
- entrambe le Identità devono essere online e inserire reciprocamente il codice;
- il primo Intento resta in attesa e può essere annullato;
- la chiave pubblica viene scambiata automaticamente soltanto dopo il consenso reciproco;
- una nuova sessione crittografica non crea una nuova Conversazione;
- una nuova Identità crea invece un nuovo Contatto;
- rimuovere un Contatto revoca la Relazione e cancella la Conversazione locale.

### Messaggi e storage

- solo testo nella prima release;
- nessuna coda server o consegna offline;
- composer disabilitato quando il Contatto è offline, con bozza locale conservata;
- cronologia cifrata soltanto sul dispositivo;
- Web: chiavi WebCrypto non esportabili e stato cifrato in IndexedDB;
- Android/iOS: chiavi nello storage protetto del sistema e snapshot cifrato atomico nell'app data.

### Interfaccia

- una sola UI interamente in italiano;
- landing:

```text
TACITUS

Messaggistica privata senza account.

[ Crea identità ]

Le tue chiavi private non lasciano mai questo dispositivo.
```

- desktop: lista Conversazioni a sinistra e Conversazione attiva a destra;
- mobile: lista e Conversazione su viste successive;
- nell'uso ordinario viene mostrato il nickname;
- Tacitus ID visibile in Condividi identità, Aggiungi contatto e Dettagli contatto;
- connessione automatica, senza controlli connect/reconnect/disconnect;
- una sola Sessione per Identità; la più recente sostituisce la precedente.

## Architettura obiettivo

```text
tacitus/
├── apps/
│   ├── client/
│   │   ├── React + Vite
│   │   └── src-tauri/
│   └── server/
│       └── Axum + Tokio
└── crates/
    ├── tacitus-core/
    ├── tacitus-crypto/
    └── tacitus-protocol/
```

- `tacitus-core`: stato e transizioni pure di Identità, Contatti, Relazioni e Conversazioni;
- `tacitus-crypto`: identità crittografica, canale E2EE, cifratura locale e provider Web/native;
- `tacitus-protocol`: frame WebSocket versionati e tipi serializzabili;
- React renderizza lo stato;
- Axum, Tokio, storage e API di piattaforma restano negli adapter delle app;
- non sono previsti `apps/web`, `apps/mobile` o `packages/ui` separati.

## Protocollo proposto, attualmente sospeso

La proposta confermata durante il design era:

```text
Noise_XX_25519_AESGCM_SHA256
```

- Ed25519 per documento d'Identità e autenticazione verso il server;
- X25519 statico per l'Identità Noise;
- handshake XX nuovo a ogni connessione;
- verifica della chiave statica contro il Tacitus ID atteso;
- `Rekey()` dopo ogni messaggio;
- chiavi effimere e precedenti eliminate;
- nessuna persistenza delle chiavi Noise;
- cronologia decifrata e ricifrata separatamente con la chiave locale del dispositivo.

La proposta è sospesa dal gate descritto sotto.

## Piano dei commit

- [x] Documentare modello di dominio, threat model e gate crittografico.
- [ ] Risolvere il gate Noise/WebCrypto e aggiornare l'ADR.
- [ ] Spostare senza modifiche funzionali `frontend` → `apps/client` e `backend` → `apps/server`; aggiungere il Cargo workspace.
- [ ] Creare `tacitus-core`, `tacitus-crypto` e `tacitus-protocol` con test vector interoperabili.
- [ ] Aggiungere `/ws/v2`, autenticazione Ed25519 e registry temporaneo Tacitus ID mantenendo momentaneamente v1.
- [ ] Completare il client Web v2: Identità generata, Contatti, canale E2EE, cronologia cifrata e UI italiana.
- [ ] Eliminare v1, OpenPGP e la vecchia UI.
- [ ] Aggiungere Tauri Android/iOS e storage nativo.
- [ ] Generare da un tag server image, Web image, Android AAB e iOS archive con la stessa versione.

Ogni voce deve lasciare test e build verdi e produrre un commit separato.

## Prove già eseguite

### WebCrypto

Il check riproducibile `node scripts/check-webcrypto-isolation.mjs` ha confermato:

- generazione Ed25519 e X25519 con chiavi private `extractable: false`;
- esportazione delle chiavi private rifiutata;
- derivazione X25519 riuscita con lo stesso segreto sui due peer;
- firma e verifica Ed25519 riuscite.

Conclusione: le primitive opache richieste sono disponibili; il problema è l'integrazione con la state machine Noise.

### `snow` 0.10

- implementazione Rust Noise stabile esaminata;
- `Builder::local_private_key` riceve i byte della chiave privata;
- il trait DH è sincrono, espone `set`, `privkey` e `dh` su byte;
- non può usare direttamente un `CryptoKey` WebCrypto asincrono e non esportabile.

### `hiss` 0.1 e 0.3.2

- offre tipi per handle privati opachi e trait DH asincroni;
- la versione 0.3.2 non espone un driver XX Web/WASM completo basato sul provider asincrono;
- gli helper asincroni interni non sostituiscono la state machine pubblica sincrona;
- non include un backend WebCrypto;
- la precedente API async richiede handle e future `Send`, mentre gli oggetti WebCrypto sono legati al thread browser.

### Suite del repository

Eseguite con esito positivo:

- 8 test frontend;
- lint frontend;
- typecheck frontend;
- build Vite;
- 13 test backend;
- Clippy con warning trattati come errori;
- check WebCrypto opaco.

Rust 1.96.0 è stato installato per allinearsi a `backend/rust-toolchain.toml`.

## Blocker

Non è stata trovata un'implementazione Noise mantenuta capace di completare XX usando chiavi WebCrypto opache senza:

- esportare la chiave privata;
- introdurre wrapper unsafe/thread-local;
- forcare o riscrivere la state machine Noise.

Il gate concordato vieta tutte e tre le scorciatoie. La migrazione resta quindi ferma prima di modificare il codice di produzione.

## Decisione necessaria per ripartire

Scegliere e documentare una delle seguenti strade:

1. adottare un protocollo mantenuto che supporti provider asincroni e chiavi opache;
2. finanziare, revisionare e mantenere un provider/driver Noise WebCrypto;
3. rinunciare esplicitamente alla non esportabilità delle chiavi Web.

La terza opzione non è raccomandata.

## Fuori scope

- recovery, backup, sincronizzazione e multi-device;
- messaggi offline, allegati e notifiche push;
- QR code e app-lock;
- desktop;
- directory server persistente;
- anonimato e difesa dalla traffic analysis;
- pubblicazione automatica sugli store;
- claim di audit prima di una revisione indipendente.

## Definizione di completamento

- Web, Android e iOS creano un'Identità locale;
- nickname e Tacitus ID possono essere condivisi;
- due Identità online stabiliscono consenso reciproco;
- il canale E2EE verifica gli ID attesi e offre forward secrecy;
- i messaggi testuali applicano rekey continuo;
- la cronologia locale cifrata sopravvive al riavvio;
- cancellazione dati o Identità è irreversibile;
- il server non persiste Identità, Relazioni o metadata;
- browser incompatibili ricevono un errore chiaro;
- test, lint e build passano;
- un tag genera server/Web/Android/iOS dalla stessa versione.

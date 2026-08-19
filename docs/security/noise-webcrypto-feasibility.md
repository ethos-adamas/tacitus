# Noise con chiavi WebCrypto opache

## Domanda

`Noise_XX_25519_AESGCM_SHA256` può usare una chiave statica X25519 WebCrypto non esportabile attraverso un'implementazione Noise mantenuta, senza riscrivere il protocollo?

## Verifica

`scripts/check-webcrypto-isolation.mjs` conferma con la Web Crypto API che:

- le chiavi private Ed25519 e X25519 possono essere generate come non esportabili;
- il browser impedisce di esportarne i byte;
- la chiave X25519 opaca può comunque derivare lo stesso segreto condiviso su entrambi i peer;
- la chiave Ed25519 opaca può firmare e la chiave pubblica può verificare.

La parte WebCrypto è quindi fattibile.

L'implementazione Rust stabile [`snow` 0.10](https://docs.rs/snow/latest/snow/) non può però consumare quell'handle. Il suo trait [`Dh`](https://docs.rs/crate/snow/latest/source/src/types.rs) è sincrono, riceve la chiave privata come slice di byte e richiede di restituirla; anche `Builder::local_private_key` accetta direttamente i byte privati.

È stato verificato anche [`hiss` 0.3.2](https://docs.rs/hiss/latest/hiss/), che modella correttamente chiavi private opache. La state machine XX pubblica usa tuttavia il provider DH sincrono; gli helper DH asincroni non formano un driver Web/WASM completo e il crate non include un backend WebCrypto. La precedente API asincrona richiedeva inoltre handle e future `Send`, mentre `CryptoKey` e le promise WebCrypto sono legati al thread del browser.

Le implementazioni JavaScript individuate usano analogamente chiavi raw tramite libsodium.

Adattare WebCrypto richiederebbe una state machine Noise asincrona con un'interfaccia per handle opachi, cioè una riscrittura o un fork della parte sensibile che il gate di sicurezza vieta.

## Verdetto

**Gate non superato.** La migrazione si ferma prima di cambiare struttura o codice di produzione. Non verranno usate chiavi Web esportabili come fallback.

Per riprendere serve una nuova decisione tra:

1. adottare un protocollo mantenuto che supporti provider crittografici asincroni e chiavi opache;
2. finanziare e sottoporre a revisione un provider Noise compatibile;
3. rinunciare esplicitamente alla non esportabilità delle chiavi Web.

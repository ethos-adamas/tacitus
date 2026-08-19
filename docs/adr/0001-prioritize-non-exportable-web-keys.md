---
status: accepted
---

# Privilegiare chiavi Web non esportabili

Tacitus privilegia l'isolamento delle chiavi private rispetto all'uso uniforme di Rust: il Web deve usare chiavi WebCrypto non esportabili, mentre Android e iOS useranno lo storage protetto del sistema. La proposta `Noise_XX_25519_AESGCM_SHA256` resta sospesa perché nessuna implementazione Noise mantenuta può completare XX usando gli handle WebCrypto asincroni e legati al thread del browser; non verranno introdotti né un fallback esportabile né un'implementazione Noise propria senza una nuova decisione e revisione di sicurezza.

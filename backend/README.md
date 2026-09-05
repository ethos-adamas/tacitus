# Relay Tacitus

Backend Axum/Tokio senza database. Autentica un'Identità P-256, coordina Intenti e Relazioni mentre il processo è vivo e inoltra body opachi di handshake e messaggi. Non cifra, non decifra, non accoda offline e non scrive metadati applicativi nei log.

Una disconnessione ha 30 secondi di tolleranza. Dopo la scadenza la Relazione diventa l'Intento unilaterale dell'Identità rimasta online; chi ritorna deve riattivarla. Se entrambe sono offline, entrambi gli Intenti vengono persi.

Il protocollo completo, inclusi autenticazione, handshake, Double Ratchet e frame JSON V3, è documentato nel [`README` principale](../README.md#protocollo-wire-v3).

## Architettura

Il dominio contiene Identità, Sessioni, Intenti, Relazioni e Blocchi senza dipendenze da Axum, Tokio o Serde. Un `RelayActor` centrale possiede lo stato volatile e riceve comandi attraverso una mailbox limitata; ogni WebSocket autenticato ha un `ActorSessione` con una propria mailbox limitata. Gli adapter traducono protocollo V3, autenticazione crittografica, timer e trasporto nelle porte applicative.

Una sessione lenta viene chiusa senza bloccare il relay. Se la mailbox centrale è satura, il client riceve `server_busy`. Un arresto inatteso del `RelayActor` termina il processo affinché K3s lo riavvii.

## Avvio e test

```bash
cargo run -p tacitus-backend
cargo test -p tacitus-backend
```

Variabili:

- `BIND_ADDRESS`, default `0.0.0.0:3000`;
- `PUBLIC_ORIGINS`, lista separata da virgole degli origin esatti accettati in produzione. Il deploy include Web e i due origin Tauri mobile.

`GET /health` restituisce anche la versione del protocollo. Il Dockerfile copia il binario già costruito dalla pipeline da `backend/artifacts/tacitus-backend`; non contiene uno stage di build.

## Limiti di ammissione

Il relay ammette al massimo 1.024 Identità in RAM, comprese quelle nei 30 secondi di tolleranza: una Sessione già nota può riconnettersi anche a registro pieno. Ogni Identità può avere 5 Intenti in attesa e 1.024 Blocchi, inclusi quelli aggiunti dopo l'autenticazione. Le Relazioni che scadono conservano un Intento soltanto se rimane posto nel limite di 5.

All'upgrade WebSocket sono ammessi al massimo 1.088 socket complessivi, 64 autenticazioni pendenti, 64 socket e 8 autenticazioni per IP. I tentativi sono limitati a 128 al secondo globali e 120 al minuto per IP. I rifiuti producono HTTP 429/503, `Retry-After` ed eventi aggregabili senza registrare IP o Identità. `/health` non consuma questi posti. I contatori IP restano soltanto in RAM: un controllo ogni 30 secondi rimuove quelli senza connessioni e senza tentativi da almeno 60 secondi; la tabella contiene al massimo 4.096 IP.

Dietro un reverse proxy configurare `TRUSTED_PROXY_IPS` con gli IP esatti dei proxy autorizzati, separati da virgole. Solo da questi peer viene interpretato `X-Forwarded-For`, da destra verso sinistra fino al primo hop non fidato. In assenza di configurazione conta l'IP del peer TCP: le connessioni provenienti dallo stesso proxy condividono quindi i limiti. Non autorizzare IP controllabili dai client.

Il traffico autenticato ha un limite di 600 frame e 16 MiB di body opachi ogni 10 secondi per connessione. Ogni body resta limitato a 48 KiB e ogni frame WebSocket a 64 KiB; gli Album vengono suddivisi e confermati dai client senza introdurre storage sul relay.

# Messaggistica privata

Tacitus consente a due persone contemporaneamente online di stabilire un contatto consensuale e scambiarsi testo cifrato senza affidare i contenuti al server.

## Language

**Identità locale**:
L'identità crittografica generata per una singola installazione, riconosciuta pubblicamente dalla coppia composta da nickname immutabile e Tacitus ID.
_Avoid_: Account, profilo, utente locale

**Provider di Identità**:
La capacità della piattaforma di creare la chiave privata non esportabile dell'Identità locale e firmare senza esporla al protocollo condiviso.
_Avoid_: Keystore, wallet

**Tacitus ID**:
L'identificatore pubblico corto derivato dall'Identità locale, usato per stabilire un contatto mentre entrambe le Identità sono online. Non è una credenziale di autorizzazione.
_Avoid_: Fingerprint, username, account ID

**Contatto**:
Una persona la cui Identità locale è stata accettata attraverso Intenti di contatto reciproci e vincolata al relativo Tacitus ID.
_Avoid_: Amico, account, destinatario

**Intento di contatto**:
La volontà unilaterale e temporanea di stabilire una relazione con un Contatto.
_Avoid_: Richiesta di amicizia, invito

**Relazione**:
Il consenso reciproco corrente tra due Identità, valido per una specifica coppia di Tacitus ID.
_Avoid_: Amicizia, connessione

**Presenza del Contatto**:
Lo stato volatile online o offline osservato dal frontend per un Contatto, distinto sia dalla Relazione sia dalla Sessione sicura.
_Avoid_: Stato della Relazione, connessione del Contatto

**Sessione sicura**:
Lo stato crittografico volatile stabilito da due Identità per proteggere i Messaggi cifrati di una Relazione; può cambiare senza creare una nuova Conversazione.
_Avoid_: Relazione, Conversazione

**Conversazione**:
La cronologia locale cifrata associata a un Contatto, mantenuta tra connessioni e cancellata definitivamente insieme al Contatto o all'Identità locale.
_Avoid_: Relazione, stanza, canale

**Messaggio cifrato**:
La rappresentazione end-to-end cifrata di un testo scambiato nella Sessione sicura.
_Avoid_: Payload, messaggio in chiaro

**Contenuto del messaggio**:
Il testo e i dati di Relazione autenticati dalla cifratura end-to-end.
_Avoid_: Payload

**Album**:
Un insieme di una o più foto raggruppate in un unico invio a un Contatto.
_Avoid_: Cartella, galleria

**Anteprima Album**:
L'insieme delle foto scelte per un Album destinato a uno specifico Contatto e ancora in attesa della conferma di invio, al quale possono essere aggiunte altre foto. Rimane associato al Contatto anche quando si apre un'altra Conversazione.
_Avoid_: Album inviato, coda di invio

**Evento locale**:
Una voce della Conversazione generata dal client, non inviata, che registra un cambiamento rilevante della Relazione.
_Avoid_: Messaggio di sistema

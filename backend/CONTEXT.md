# Messaggistica privata

Tacitus consente a due persone contemporaneamente online di stabilire un contatto consensuale e scambiarsi testo cifrato senza affidare i contenuti al server.

## Language

**Identità**:
Il nickname immutabile, il Tacitus ID e la chiave pubblica legati in memoria dal relay.
_Avoid_: Account, profilo

**Tacitus ID**:
L'identificatore pubblico corto derivato dalle chiavi dell'Identità, usato dal backend esclusivamente come locator temporaneo. Non è una credenziale di autorizzazione.
_Avoid_: Fingerprint, username, account ID

**Sessione**:
La connessione autenticata corrente di un’Identità; una nuova Sessione sostituisce la precedente.
_Avoid_: Identità, account

**Intento di contatto**:
La volontà unilaterale e temporanea di stabilire una Relazione con un Contatto.
_Avoid_: Richiesta di amicizia, invito

**Relazione**:
Il consenso reciproco tra due Identità contemporaneamente online. Una disconnessione conserva la Relazione per 30 secondi; alla scadenza rimane soltanto l’Intento dell’Identità ancora online. Un riavvio elimina lo stato volatile.
_Avoid_: Amicizia, connessione

**Blocco**:
La decisione unilaterale persistita sul dispositivo di impedire Intenti, Relazioni e Messaggi cifrati con un’altra Identità. Il dispositivo sincronizza i Blocchi prima che la Sessione diventi attiva.
_Avoid_: Ban, blacklist

**Messaggio cifrato**:
Il ciphertext end-to-end opaco che il backend instrada senza decifrarlo.
_Avoid_: Messaggio in chiaro, contenuto

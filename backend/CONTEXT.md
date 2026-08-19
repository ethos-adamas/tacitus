# Messaggistica privata

Tacitus consente a due persone contemporaneamente online di stabilire un contatto consensuale e scambiarsi testo cifrato senza affidare i contenuti al server.

## Language

**Identità**:
Il nickname immutabile, il Tacitus ID e il documento pubblico registrati insieme soltanto mentre l'Identità è online.
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
Il consenso reciproco tra due Identità, valido per una specifica coppia di Tacitus ID e per un epoch.
_Avoid_: Amicizia, connessione

**Messaggio cifrato**:
Il ciphertext end-to-end opaco che il backend instrada senza decifrarlo.
_Avoid_: Messaggio in chiaro, contenuto

# Messaggistica privata

Tacitus consente a due persone contemporaneamente online di stabilire un contatto consensuale e scambiarsi testo cifrato senza affidare i contenuti al server.

## Language

**Identità locale**:
L'identità crittografica generata per una singola installazione, riconosciuta pubblicamente dalla coppia composta da nickname immutabile e Tacitus ID.
_Avoid_: Account, profilo, utente locale

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
Il consenso reciproco tra due Identità, valido per una specifica coppia di Tacitus ID e per un epoch.
_Avoid_: Amicizia, connessione

**Conversazione**:
La cronologia locale cifrata associata a un Contatto, mantenuta tra connessioni e cancellata definitivamente insieme al Contatto o all'Identità locale.
_Avoid_: Relazione, stanza, canale

**Messaggio cifrato**:
Un testo cifrato end-to-end per le Identità di una Relazione.
_Avoid_: Payload, messaggio in chiaro

**Contenuto del messaggio**:
Il testo e i dati di Relazione autenticati dalla cifratura end-to-end.
_Avoid_: Payload

**Evento locale**:
Una voce della Conversazione generata dal client, non inviata, che registra un cambiamento rilevante della Relazione.
_Avoid_: Messaggio di sistema

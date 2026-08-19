# Messaggistica privata

Secret Chat consente a due persone contemporaneamente online di stabilire un contatto consensuale e scambiarsi testo cifrato senza affidare i contenuti al server.

## Language

**Identità locale**:
La singola identità OpenPGP usata nel browser, riconosciuta pubblicamente da nickname e fingerprint.
_Avoid_: Account, profilo, utente locale

**Contatto**:
Una persona la cui chiave pubblica è stata importata privatamente e vincolata al relativo fingerprint.
_Avoid_: Amico, account, destinatario

**Intento di contatto**:
La volontà unilaterale e temporanea di stabilire una relazione con un Contatto.
_Avoid_: Richiesta di amicizia, invito

**Relazione**:
Il consenso reciproco tra due Identità, valido per una specifica coppia di fingerprint e per un epoch.
_Avoid_: Amicizia, connessione

**Conversazione**:
La cronologia locale associata a un Contatto, mantenuta anche quando cambia il suo fingerprint.
_Avoid_: Relazione, stanza, canale

**Messaggio cifrato**:
Un testo firmato e cifrato per entrambe le Identità di una Relazione.
_Avoid_: Payload, messaggio in chiaro

**Evento locale**:
Una voce della Conversazione generata dal browser, non inviata e non cifrata, che registra un cambiamento rilevante come un nuovo fingerprint.
_Avoid_: Messaggio di sistema

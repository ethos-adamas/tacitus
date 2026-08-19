# Messaggistica privata

Tacitus consente a due persone contemporaneamente online di stabilire un contatto consensuale e scambiarsi testo cifrato senza affidare i contenuti al server.

## Language

**Identità**:
Il nickname e il fingerprint OpenPGP registrati insieme per la vita del processo backend.
_Avoid_: Account, profilo

**Sessione**:
La connessione autenticata corrente di un’Identità; una nuova Sessione sostituisce la precedente.
_Avoid_: Identità, account

**Intento di contatto**:
La volontà unilaterale e temporanea di stabilire una Relazione con un Contatto.
_Avoid_: Richiesta di amicizia, invito

**Relazione**:
Il consenso reciproco tra due Identità, valido per una specifica coppia di fingerprint e per un epoch.
_Avoid_: Amicizia, connessione

**Messaggio cifrato**:
Il testo OpenPGP opaco che il backend instrada senza decifrarlo.
_Avoid_: Messaggio in chiaro, contenuto

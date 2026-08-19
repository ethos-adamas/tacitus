# Threat model

Tacitus offre messaggistica testuale end-to-end cifrata, senza account, directory persistente o consegna offline. Il server coordina soltanto Identità contemporaneamente online e non conserva Identità, Relazioni, messaggi o metadata applicativi.

## Risorse protette

- chiavi private dell'Identità;
- contenuto dei messaggi e cronologia locale;
- legame tra nickname, Tacitus ID e chiavi pubbliche;
- chiavi effimere e stato crittografico di una Relazione.

## Confini di fiducia

- Sul Web, il browser custodisce chiavi WebCrypto non esportabili e separa lo storage per origin.
- Su Android e iOS, lo storage protetto dal sistema custodisce le chiavi persistenti e la WebView accede soltanto a operazioni Tauri autorizzate.
- Il server, la rete e gli altri client non sono fidati per la riservatezza o integrità dei messaggi.
- Il codice Tacitus distribuito e attualmente in esecuzione è fidato; una compromissione della stessa origin o della WebView può usare le operazioni autorizzate mentre rimane attiva.

## Garanzie richieste

- le chiavi private persistenti non lasciano il dispositivo;
- il server non può leggere o modificare silenziosamente i messaggi;
- il possesso del solo Tacitus ID non autorizza un Contatto;
- una Relazione richiede Intenti di contatto reciproci;
- la compromissione futura di un'Identità non deve decifrare sessioni di rete concluse;
- la cronologia è cifrata a riposo e viene cancellata definitivamente con il Contatto o l'Identità.

## Metadata esposti

Il server vede durante l'esecuzione nickname, Tacitus ID online, Intenti di contatto, Relazioni, indirizzi di rete, orari e dimensioni dei ciphertext. Questi dati non devono essere scritti nei log applicativi.

## Fuori scope

- dispositivo sbloccato o codice Tacitus attivamente compromesso;
- estensioni browser o malware con privilegi sufficienti;
- anonimato di rete e analisi del traffico;
- recovery, backup, sincronizzazione e multi-device;
- messaggi offline, allegati e notifiche push;
- audit di sicurezza indipendente.

La cancellazione dei dati del browser o dell'app distrugge intenzionalmente Identità, Contatti e Conversazioni.

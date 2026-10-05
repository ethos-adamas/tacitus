# Issue #15 — Compositore e Anteprima Album condivisa

Issue: https://github.com/ethos-adamas/tacitus/issues/15.
Stato: piano esecutivo, implementazione non eseguita.
Base analizzata: `f3b724928e6b48078ec6117d7d036992e67021a8`.
Prerequisito: [#18 fase A](issue-18-adapter-ui-temi.md).
Questo piano introduce il contratto usato da [#20](issue-20-incolla-immagini.md)
e [#21](issue-21-trascinamento-foto.md). Leggere anche le regole
nell'[indice](README.md).

## Risultato e confini

Foto a sinistra del campo messaggio; emoji dentro la sua area visiva; invio
testo a destra. Eliminare la descrizione tecnica permanente del selettore,
non gli indicatori di preparazione, consenso o trasferimento.

Le decisioni concordate estendono questa issue alla gestione comune delle
foto: aggiunta cumulativa, massimo 10 per Contatto, aggiunte atomiche,
rimozione singola, conservazione al cambio Conversazione fino al reload.
Inviare richiede sempre `Invia album`. Invio testo e invio Album sono distinti.
Nessuna modifica a cifratura, protocollo, backend o formato persistito.

## Leggere prima di modificare

Tutti i percorsi sono relativi alla radice.

| File                                                         | Punto da comprendere                                                               |
| ------------------------------------------------------------ | ---------------------------------------------------------------------------------- |
| `frontend/src/ui/conversation/Conversation.tsx`              | Due compositori separati e Sessione sicura `pronta`.                               |
| `frontend/src/ui/conversation/Album.tsx`                     | `AlbumComposer` possiede buffer e generation; svuota prima di preparare e inviare. |
| `frontend/src/ui/emoji/EmojiComposer.tsx`                    | Proprietario di textarea, selezione, emoji, suggerimenti e Enter.                  |
| `frontend/src/infrastructure/album/album.ts`                 | `prepareImages`, `MAX_IMAGES`, controlli formato/dimensioni e conversione WebP.    |
| `frontend/src/application/album/trasferimentiAlbum.ts`       | `inviaAlbum`, `annullaAlbum`, flag `completed`, invio globale singolo.             |
| `frontend/src/application/store/albumSlice.ts`               | Preferenze, offerte e progresso; qui aggiungere solo metadati.                     |
| `frontend/src/application/store/store.ts`                    | Registrazione dei moduli dopo la creazione dello store.                            |
| `frontend/src/application/listeners/persistenzaListeners.ts` | Salva solo `album.preferenze`; non allargare lo snapshot.                          |
| `frontend/src/application/hooks/useIdentitaLocale.ts`        | Annullamento e cancellazione dei dati locali.                                      |
| `frontend/e2e/messaggistica.spec.ts`                         | Scenari Album, fixture PNG, due browser collegati, consenso e WebP fallback.       |

Prima di cambiare firme eseguire `rg -n 'inviaAlbum|AlbumComposer|prepareImages' frontend/src frontend/e2e`.
Non duplicare il validatore: picker, paste e drop devono raggiungere
`prepareImages` attraverso una sola operazione applicativa.

## 1. Contratto dello stato

Aggiungere in `albumSlice.ts`:

```ts
export type AnteprimaAlbumMeta = {
  fotoIds: string[];
  preparazione: boolean;
  invio: boolean;
};
// Nuovo campo di AlbumState, inizializzato a {}:
anteprime: Record<TacitusId, AnteprimaAlbumMeta>;
```

Azioni: `anteprimaAlbumAggiornata({ tacitusId, anteprima })`,
`anteprimaAlbumEliminata(tacitusId)`, `anteprimeAlbumSvuotate()`.
La prima sostituisce atomicamente i metadati del Contatto, la seconda elimina
la voce, la terza svuota solo `anteprime`. I reducer di
`contattoRimosso` e `contattoBloccato` eliminano anche i suoi metadati.
`relayDisconnesso` NON elimina anteprime.

Nuovo modulo `frontend/src/application/album/anteprimeAlbum.ts`:

- Una Map per Tacitus ID contiene foto preparate
  `{ id: string; bytes: Uint8Array; src: string }` e token delle operazioni
  attive. I buffer, i data URL e i token restano qui, non nello store.
- Generare ID con `crypto.randomUUID()`. Creare il data URL WebP una sola
  volta usando la conversione base64 già presente in `Album.tsx`.
  Non introdurre Blob URL, storage o una seconda copia dei buffer.
- I metadati Redux sono l'interfaccia reattiva. Pubblicarli dopo aver
  aggiornato la Map; mai il contrario. Gli ID nell'ordine Redux devono
  corrispondere alle risorse runtime.
- Un record vuoto senza operazioni viene eliminato. Record e token devono
  essere oggetti nuovi quando si ricrea un'anteprima: il solo ID del
  Contatto non distingue un'operazione vecchia da una nuova.
- Non creare un servizio generico, un provider React o un secondo store.
  Seguire la registrazione già usata da `registerAlbumListeners`.

Esportare queste operazioni, con funzioni dichiarate `const`:

```ts
registerAnteprimeAlbum(
  startListening: StartListening,
  store: Pick<AppStore, 'dispatch' | 'getState'>,
): void;
aggiungiFoto(tacitusId: TacitusId, files: File[]): Promise<void>;
rimuoviFoto(tacitusId: TacitusId, fotoId: string): void;
annullaAnteprima(tacitusId: TacitusId): void;
inviaAnteprima(tacitusId: TacitusId): Promise<void>;
svuotaAnteprime(): void;
leggiFotoAnteprima(tacitusId: TacitusId):
  readonly { id: string; src: string }[];
```

I tipi di store vanno importati con `import type`, senza import runtime
dello store dal modulo. Registrare una sola volta in `store.ts`, dopo la
creazione dello store. Non aggiungere factory o interfacce per dipendenze
che nei test possono essere mockate ai confini esistenti.
`leggiFotoAnteprima` restituisce una lista vuota stabile per anteprima
assente; una discrepanza tra ID Redux e risorse è un errore interno, non
una foto da saltare silenziosamente.

## 2. Implementare l'aggiunta atomica

1. L'UI acquisisce subito un array di File e il Tacitus ID. Una selezione
   vuota è un no-op; azzerare comunque il valore dell'input per poter
   scegliere nuovamente lo stesso file.
2. Nel modulo comune verificare Identità pronta, Contatto esistente,
   `state.sessioniSicure[tacitusId] === 'pronta'`, nessuna preparazione o
   invio su quell'anteprima e nessun progresso Album per quel Contatto.
   Conservare così il vincolo di disponibilità già esistente.
   Per richieste non disponibili mostrare feedback e non iniziare lavoro.
3. Controllare il totale con `MAX_IMAGES` importato dal modulo Album:
   nessun altro limite numerico indipendente. Se il gruppo eccede i posti,
   rifiutarlo tutto prima di convertire. Con 9 + 3:
   `Puoi aggiungere ancora 1 foto.`; con zero posti:
   `L'Album può contenere al massimo 10 foto.`.
4. Segnare sincronicamente il token di preparazione, pubblicare
   `preparazione: true`, mantenendo foto già presenti. Una seconda
   aggiunta durante la preparazione viene rifiutata con
   `Attendi la preparazione delle foto.`, non accodata né sovrapposta.
5. Chiamare `prepareImages(files)` solo sui nuovi file. Restano validi i
   controlli esistenti: JPEG/PNG/WebP, originali 20 MiB e 24 MP,
   conversione fino a lato 2048 px, risultato WebP fino a 5 MiB.
6. Dopo l'await verificare che Map e token siano ancora quelli catturati.
   Se sono stati invalidati, abbandonare il risultato e i riferimenti
   temporanei senza mostrare un errore tardivo.
7. Solo al successo dell'intero gruppo creare le nuove risorse e accodarle
   nell'ordine ricevuto. In caso di errore non aggiungere neanche i file
   validi del gruppo; conservare tutte le foto precedenti.
8. Nel finally rimuovere il token e aggiornare i metadati soltanto se
   l'operazione è ancora corrente. Non ricreare un record cancellato.
   L'errore corrente passa una volta a `erroreMostrato`.

Non deduplicare foto identiche: non è richiesto. Il cambio Conversazione
non invalida il token; il risultato appartiene sempre al Contatto catturato.
Se nel frattempo il Contatto va offline, una preparazione già iniziata può
terminare nella sua anteprima, ma l'invio rimane disabilitato.

## 3. Rimozione, annullamento e invio senza perdita delle foto

`rimuoviFoto` elimina per ID, preserva ordine e buffer delle altre foto,
pubblica i metadati e libera il posto. Disabilitare rimozione singola durante
preparazione/invio. `annullaAnteprima` invalida la preparazione e svuota
tutto; rimane disponibile durante preparazione, non durante invio.

Prima di collegare l'invio, cambiare `inviaAlbum` in
`Promise<boolean>`: restituire il flag `completed` dopo il finally
esistente. Non mettere un return nel finally. Il catch interno continua a
segnalare l'errore; i controlli preliminari che lanciano prima del try
continuano a rigettare la Promise. Conservare ACK, consenso, persistenza
dell'Album inviato e cleanup dei trasferimenti falliti.

`inviaAnteprima` deve:

1. Rifiutare anteprima vuota, preparazione attiva, sessione non pronta o
   invio già in corso. Conservare il limite di un invio globale già imposto
   dal trasporto; anche la UI disabilita Invia album quando un'altra
   anteprima ha `invio: true`.
2. Acquisire record e buffer, impostare un token di invio PRIMA dell'await.
   Non eliminare foto; impedire aggiunta, rimozione e doppio invio.
3. Attendere `inviaAlbum(tacitusId, bytes)`. Se restituisce true e il
   record/token è ancora corrente, eliminare l'anteprima. Se false,
   conservare le foto senza duplicare il feedback già prodotto dal trasporto.
   Se rigetta, conservare e segnalare una volta l'errore preliminare.
4. Ripulire il token nel finally solo sul record corrente. Nessun esito
   tardivo deve ricreare una voce rimossa.
5. Conservare `Interrompi album` con `annullaAlbum(tacitusId)`.
   Dopo il fallimento/annullamento confermato dal trasporto, le foto tornano
   modificabili e reinviabili; allora è possibile anche annullare l'anteprima.

Il cambio Conversazione non interrompe l'invio. Rimozione/blocco del Contatto
e cancellazione dell'Identità invece sì: mantenere i listener del trasporto
e aggiungere quelli che invalidano/eliminano le risorse di anteprima.
In `useGestioneIdentitaLocale.cancella` chiamare `svuotaAnteprime()`
prima di `await clearLocalData()`; il listener `identitaLocaleAssente`
svuota anch'esso. La pulizia è idempotente e non può essere annullata da
una Promise pendente. Non pulire su semplice offline o chiusura della chat.

Non modificare la persistenza. Aggiungere nel modulo un commento
`ponytail:` che espliciti il limite: memoria proporzionale alle anteprime
per Contatto (buffer più data URL), nessuna espulsione automatica; un
eventuale budget globale richiederebbe una nuova decisione di prodotto.

## 4. Collegare la UI, senza riscrivere le emoji

Creare `frontend/src/application/hooks/useAnteprimaAlbum.ts`: seleziona i
metadati del Contatto e la presenza di altri invii, legge le miniature dal
modulo e restituisce foto, flag e callback nominate legate a quel Tacitus ID.
Le callback pubbliche per la UI restituiscono void e avviano le operazioni
applicative, che gestiscono gli errori; nessuna Promise rigettata ignorata.

Contratto del hook: `{ foto, preparing, sending, photosDisabled,
sendDisabled, onFiles, onRemove, onCancel, onSend }`. `foto` espone solo
id/src; `onFiles(File[])`, `onRemove(fotoId)`, `onCancel()` e `onSend()`
delegano rispettivamente ad aggiunta, rimozione, annullamento e invio del
modulo. `photosDisabled` combina sessione, preparazione, invio e progresso;
`sendDisabled` aggiunge anteprima vuota e altro invio globale. Nel componente
rinominare `onSend` dell'hook in `sendAlbum`, per non confonderlo con la
prop omonima dell'invio testo. La #20 aggiungerà `onFilesError` a questo
contratto per gli errori di acquisizione browser.

Creare `frontend/src/ui/conversation/MessageComposer.tsx` con props
`{ tacitusId, value, theme, disabled, placeholder, maxLength, onChange, onSend }`.
Tipi coerenti con `EmojiComposer`; nessun secondo stato del testo.
Questo componente usa l'hook anteprima, mostra i pannelli Album sopra la riga
e passa il comando foto a `EmojiComposer`.

In `Album.tsx` sostituire `AlbumComposer` con questi export UI:

- `PhotoPicker({ disabled, onFiles })`: button locale `Aggiungi foto`,
  ref a input file nascosto, `multiple`, accept attuale, handler change
  nominato; label accessibile input `Scegli foto`. Solo il click esplicito
  apre il picker. `onFiles: (files: File[]) => void`.
- `AlbumPreview({ foto, preparing, sending, sendDisabled, onRemove, onCancel, onSend })`:
  miniature, contatore `N/10 foto`, `Preparazione foto…`, rimozione
  per ID, `Annulla album`, `Invia album`. Ogni bottone × ha nome
  `Rimuovi foto N`. Per handler nominati usare un piccolo componente
  miniatura nello stesso file, non un corpo inline nell'evento JSX.
- `AlbumTransferStatus({ tacitusId })`: spostare senza cambiarli offerta,
  accetta/rifiuta, progresso e Interrompi album dal vecchio compositore.

Conservare `AlbumConsent` e `AlbumGallery`, già modificati da #16/#19.

Aggiungere a `EmojiComposer` solo la prop `attachment: ReactNode`.
Markup: riga con attachment, contenitore `.message-input` e Invia testo.
Dentro `.message-input`: textarea e bottone emoji; il contatore sta sotto
il testo in una zona che non sovrappone la digitazione. Il pannello emoji e
i suggerimenti rimangono ancorati al root del compositore.

CSS: griglia esterna `auto minmax(0, 1fr) auto`, textarea min-width 0;
pulsante emoji in spazio riservato a destra del campo, almeno 44×44 px,
non sopra l'ultima parola. Mantenere focus della textarea visibile.
Le anteprime possono scorrere nel loro contenitore, non allargare la pagina.
Non usare contentEditable. Conservare selectionRef, textareaRef, searchRef,
onSelect, Enter/Shift+Enter, limite testo e inserimento emoji al cursore.
La prop `onFiles` della textarea sarà aggiunta solo in #20.

In `Conversation.tsx` montare un solo `MessageComposer key={tacitusId}`
al posto dei due compositori, con gli stessi hook del testo e condizioni
della Sessione sicura. Le risorse delle foto NON appartengono a questa key.

## 5. Test da implementare

Test nel `__test__/` del modulo proprietario; organizzare Given, When, Then.
Non aggiungere framework: usare Vitest, Testing Library e Playwright presenti.

In `application/album/__test__/anteprimeAlbum.test.ts`, usare lo store di
test, registrare il modulo, mockare preparazione/trasporto; per verificare
listener usare un listenerMiddleware del test con gli stessi reducer.
Pulire registrazioni e risorse dopo ogni test. Usare Promise controllate
dal test per imporre l'ordine degli eventi, non ritardi arbitrari.

| Given                                 | When                                            | Then                                                                         |
| ------------------------------------- | ----------------------------------------------- | ---------------------------------------------------------------------------- |
| Due foto pronte                       | Aggiungere una foto                             | Tre nello stesso ordine; prepare chiamato solo sul nuovo file; nessun invio. |
| Nove foto                             | Aggiungerne tre                                 | Restano nove; messaggio sul posto residuo; nessuna conversione.              |
| Due foto                              | Gruppo valido + non valido                      | Restano due; errore unico.                                                   |
| Tre foto                              | Rimuovere la centrale, poi le altre             | Ordine corretto, posti liberati; ultima rimozione elimina i metadati.        |
| Preparazione Alice pendente           | Aprire Bob, completare                          | Foto solo di Alice; Bob non preparazione.                                    |
| Preparazione pendente                 | Annullare e preparare di nuovo                  | Il risultato vecchio non appare, anche con stesso Tacitus ID.                |
| Preparazione pendente                 | Rimuovere/bloccare Contatto o svuotare Identità | Nessuna ricomparsa e nessun errore tardivo.                                  |
| Invio pendente                        | Richiamare invio o aggiunta                     | Un solo invio; nessuna mutazione dei buffer inviati.                         |
| Invio fallito, rigettato o interrotto | Attendere esito                                 | Foto conservate, flag azzerati, feedback non duplicato.                      |
| Invio riuscito                        | Attendere esito                                 | Solo anteprima del destinatario svuotata.                                    |
| Anteprima presente                    | Disconnessione relay                            | Anteprima conservata, invio non disponibile.                                 |

Aggiungere una verifica del nuovo booleano a
`application/album/__test__/trasferimentiAlbum.test.ts`, mockando ai confini
sessione/persistenza: true solo dopo completamento; false sul fallimento
gestito; rigetto su preflight. Non testare soltanto un mock che restituisce true.

Estendere `application/listeners/__test__/persistenzaListeners.test.ts`:
creare metadati di anteprima, poi cambiare Conversazione per innescare un
salvataggio reale del listener; lo snapshot passato a enqueueStateSave
contiene solo preferenze Album, niente ID anteprima, buffer o data URL.

In `ui/conversation/__test__/MessageComposer.test.tsx` coprire nomi
accessibili, rimozione singola, disabled e conservazione testo.
In `ui/emoji/__test__/EmojiComposer.test.tsx` coprire cursore, selezione
e invio testo con il nuovo markup, mockando solo ricerca/picker se necessario.

Estendere lo scenario E2E Album esistente: due selezioni cumulative,
rimozione centrale, invio manuale, errore con conservazione, passaggio tra
due Contatti, reload senza anteprime ma con Album inviati presenti.
Riutilizzare fixture PNG e helper dei Contatti; non duplicare il protocollo
nel test. Conservare scenari su 11 foto, WebP fallback, consenso e cleanup.

## 6. Verifica e consegna

Dalla directory `frontend/`:

```bash
npm test -- src/application/album/__test__ src/application/listeners/__test__/persistenzaListeners.test.ts src/ui/conversation/__test__ src/ui/emoji/__test__
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:e2e -- --project=chromium-desktop --grep "Album|compositore|emoji"
npm run test:e2e -- --project=chromium-mobile --grep "Album|compositore|emoji"
```

Dare ai nuovi test titoli corrispondenti al filtro e verificare che nessun
comando termini con zero test. I prerequisiti WASM/browser sono nell'indice.
Controllare nel browser 320, 390 e 1280 px, chiaro/scuro; native escluse.

Commit logici consigliati: stato/runtime + test; esito trasporto + test;
layout e integrazione; E2E e pulizia dei vecchi stili. Non lasciare commit
con chiamanti della vecchia firma. Alla consegna devono passare aggiunta
atomica, isolamento per Contatto e recupero dopo errore, non solo il layout.

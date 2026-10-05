# Issue #20 — Incollare immagini nel campo messaggio

Issue: https://github.com/ethos-adamas/tacitus/issues/20.
Stato: piano esecutivo, implementazione non eseguita.
Base analizzata: `f3b724928e6b48078ec6117d7d036992e67021a8`.
Prerequisito: [#15](issue-15-compositore-foto.md), Anteprima Album e
MessageComposer. Adapter UI: [#18A](issue-18-adapter-ui-temi.md).
Regole generali: [indice](README.md).

## Risultato e casi concordati

Con focus nel campo Messaggio, Ctrl+V, Cmd+V o Incolla del browser aggiungono
le immagini della clipboard alla stessa Anteprima Album del selettore.
Invio sempre manuale. Nessun nuovo pannello, upload o dialogo permessi.

| Clipboard                           | Comportamento                                                                             |
| ----------------------------------- | ----------------------------------------------------------------------------------------- |
| Solo immagini                       | Aggiunta all'anteprima, testo e selezione del campo invariati.                            |
| Immagini + testo                    | Prevalgono immagini; testo clipboard non inserito, testo e selezione esistenti invariati. |
| Solo testo, anche con HTML          | Incolla nativo della textarea, nessuna foto creata da URL o markup.                       |
| Gruppo con file non valido          | Rifiuto intero del gruppo; foto già presenti conservate.                                  |
| Immagini che eccedono posti residui | Stesso errore e atomicità del picker, nessuna aggiunta parziale.                          |

Non intercettare Ctrl+V a livello window/document e non incollare immagini
quando il focus è in Nickname, Tacitus ID, impostazioni o fuori dalla chat.
Non leggere periodicamente la clipboard. Non chiamare navigator.clipboard.read:
l'evento paste contiene i dati dell'operazione esplicita dell'utente.
[Comportamento dell'evento paste](https://developer.mozilla.org/en-US/docs/Web/API/Element/paste_event).

## 1. Leggere il percorso prima di modificare

- `frontend/src/ui/emoji/EmojiComposer.tsx`: textarea, handler changeMessage,
  rememberSelection, Enter, selezione e ref.
- `frontend/src/ui/conversation/MessageComposer.tsx`: introdotto dalla #15,
  unisce testo e callback del modulo Anteprima Album.
- `frontend/src/application/hooks/useAnteprimaAlbum.ts` e
  `application/album/anteprimeAlbum.ts`: aggiunta condivisa, errori,
  destinatario catturato, token asincroni.
- `frontend/src/infrastructure/album/album.ts`: validazione esistente.
- `frontend/src/ui/kit/Fields.tsx`: TextArea deve inoltrare onPaste e ref.
- `frontend/e2e/messaggistica.spec.ts`: fixture foto e scenari chat.

Cercare tutti i chiamanti di EmojiComposer e tutti gli handler paste esistenti.
Aggiungere una sola gestione sulla textarea. Se #18B non è ancora eseguita,
la textarea può essere ancora nativa; mantenere le stesse props per la
migrazione successiva.

## 2. Contratto UI e acquisizione sincrona

Aggiungere alle props di EmojiComposer:

```ts
onFiles: (files: File[]) => void;
onFilesError: (reason: unknown) => void;
```

MessageComposer passa la stessa callback `onFiles` già usata da PhotoPicker.
Estendere useAnteprimaAlbum con `onFilesError`: una callback nominata che
dispatcha erroreMostrato con il messaggio Error, oppure
`Acquisizione foto non riuscita.`. Non deve modificare l'anteprima.
Questa callback serve agli errori di lettura browser, non a intercettare
nuovamente gli errori già gestiti da aggiungiFoto.

Definire in EmojiComposer un handler const
`pasteFiles(event: ClipboardEvent<HTMLTextAreaElement>)`, usando il tipo
React ClipboardEvent, non il tipo nativo del test. Passarlo a onPaste.

Algoritmo, tutto prima di qualunque await:

1. Se il campo è disabled, non avviare operazioni.
2. Leggere `event.clipboardData`; copiare `files` con Array.from.
   Se contiene file, usare questa lista come fonte unica, senza sommarla
   a items (si rischierebbero duplicati).
3. Se files è vuoto, esaminare items con kind file. Se non ce ne sono,
   return senza preventDefault e senza chiamare onChange.
4. Se ci sono file items, ottenere File con getAsFile. Se uno restituisce
   null, non accettare gli altri come gruppo parziale: preventDefault,
   chiamare onFilesError con Error e terminare.
   [getAsFile può restituire null](https://developer.mozilla.org/en-US/docs/Web/API/DataTransferItem/getAsFile).
5. Quando la clipboard porta file, chiamare preventDefault anche se il gruppo
   sarà invalido. Poi passare l'intero File[] a onFiles. Non filtrare
   preventivamente per MIME: una JPEG insieme a un file non supportato
   deve essere rifiutata atomicamente dalla validazione comune.
6. Non chiamare onChange, non assegnare textarea.value, non spostare focus,
   non ricostruire la selezione con un indice di fine testo. Il default
   cancellato conserva valore e selectionStart/End. Non aprire il picker.

Il handler cattura il callback del MessageComposer di quella Conversazione.
Dopo l'evento, la preparazione può terminare anche se si apre un'altra chat:
#15 mantiene l'associazione iniziale e invalida solo su annullamento,
rimozione/blocco o cancellazione dell'Identità.

## 3. Stato, disponibilità ed errori

Nessuno stato immagini nuovo in EmojiComposer, nessuna seconda Map.
Se prepara/invia già un Album o la sessione non è pronta, il percorso
applicativo comune rifiuta l'aggiunta e preserva quanto c'è già.
Il campo testo non va disabilitato solo perché si preparano foto:
continua a usare il disabled del testo già esistente.

In un evento misto con errore delle foto, non inserire il testo come
ripiego: la priorità alle immagini è una decisione esplicita.
Rimane il testo precedente, appare il motivo dell'errore.

Il limite caratteri di un incolla solo testo rimane quello della textarea
e del flusso messaggi; nessun algoritmo parallelo per troncare o inserire.
HTML con img remota non è un file clipboard: non scaricarlo né convertirlo.
Se il browser/sistema non espone immagini come File, non promettere
supporto per quella forma di copia; il picker rimane l'alternativa.

## 4. Test di componente

Estendere `frontend/src/ui/emoji/__test__/EmojiComposer.test.tsx` o crearlo
se ancora assente; Given When Then e Testing Library già installata.
Costruire un evento paste cancellabile con clipboardData di test.
Non usare type assertion su oggetti arbitrari quando basta una proprietà
definita sul vero Event o un DataTransfer del browser.

| Given                                   | When            | Then                                                                                                   |
| --------------------------------------- | --------------- | ------------------------------------------------------------------------------------------------------ |
| Testo abc, selezione b                  | Paste file PNG  | onFiles una volta con File originale; preventDefault true; onChange non chiamato; selezione invariata. |
| Testo abc, clipboard PNG + testo xyz    | Paste           | Solo foto; bozza abc invariata.                                                                        |
| Solo testo xyz                          | Paste           | Evento non cancellato, nessun onFiles; inserimento reale verificato nel browser.                       |
| files vuoto, items contiene immagine    | Paste           | Fallback getAsFile funziona senza duplicare.                                                           |
| files e items descrivono lo stesso file | Paste           | Una sola foto consegnata.                                                                              |
| Un file item illeggibile                | Paste           | Gruppo non consegnato, errore visibile, testo non inserito.                                            |
| File JPEG + file non supportato         | Paste           | Entrambi passati al percorso comune, nessun filtro che accetti solo JPEG.                              |
| Campo disabled                          | Paste sintetico | Nessuna operazione applicativa.                                                                        |

Non aspettarsi inserimento testo da un evento sintetico: il browser non
esegue quell'azione di default per un paste costruito dal test.
La documentazione MDN citata sopra distingue questo limite; verificare
separatamente handler e clipboard reale.

## 5. Test integrati senza scorciatoie sul risultato

Aggiungere in `frontend/e2e/messaggistica.spec.ts` test con prefisso
`Album: incolla`, riusando helper di creazione/associazione Contatti e PNG.

Per la pipeline foto automatica: in page.evaluate creare File e DataTransfer,
aggiungere i File a items e l'eventuale testo con setData, poi dispatch
ClipboardEvent('paste', { clipboardData, bubbles: true, cancelable: true })
sulla textarea focalizzata. Usare foto reali decodificabili dalle fixture,
non bytes inventati etichettati image/png. Questo testa l'ingresso browser
e tutta la preparazione, ma non prova l'accesso alla clipboard del sistema.

Scenari:

1. Selezionare 2 foto col picker; incollare una terza; contare 3 miniature.
   Nessun Album inviato e nessuna offerta al ricevente prima di Invia album.
2. Click Invia album, accettare sull'altro peer; il ricevente vede un Album
   con 3 foto e il mittente non ha più anteprima.
3. 9 + 3 incollate => 9 e messaggio `Puoi aggiungere ancora 1 foto.`.
   Gruppo PNG + file invalido => anteprima precedente invariata.
4. Clipboard mista con bozza e selezione non vuote => foto aggiunte,
   contenuto/selection del testo invariati; emoji al cursore ancora funzionanti.
5. Incollare per Alice e passare a Bob prima della conversione conclusa
   (test controllato a livello modulo se il browser è troppo veloce):
   risultato solo Alice. Non introdurre ritardi di produzione per il test.
6. Ripetere un paste e una selezione picker per dimostrare che condividono
   l'accumulo e non due anteprime separate.

Per solo testo reale su Chromium desktop: concedere permesso
clipboard-write nel browser context di test, navigator.clipboard.writeText,
focus textarea e keyboard.press('Control+V') nell'ambiente Linux;
verificare inserimento alla selezione e limite testo. Non introdurre
richieste di permessi nell'applicazione per far funzionare il test.
Usare Cmd+V nella verifica manuale su macOS.
Se la clipboard di sistema non è disponibile nel runner, registrare
esplicitamente il test non eseguito e fare la prova manuale; non sostituire
l'inserimento atteso con un fill che farebbe passare un test falso.

Prova manuale browser: copiare una foto/screenshot da un'app esterna,
incollare nel campo, controllare anteprima e assenza di invio; provare
Incolla dal menu contestuale oltre alla scorciatoia.
Le prove app native sono escluse; eventuale mobile è browser simulato.

## 6. Comandi e completamento

Da frontend:

```bash
npm test -- src/ui/emoji/__test__ src/ui/conversation/__test__ src/application/album/__test__
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:e2e -- --project=chromium-desktop --grep "Album: incolla"
npm run test:e2e -- --project=chromium-mobile --grep "Album: incolla"
```

Sul progetto mobile eseguire pipeline sintetica; non dichiarare disponibile
una tastiera desktop fisica. I test clipboard di sistema hanno scope desktop.
Commit: handler/props e test; pipeline E2E e regressioni cursore.
Done: tre ingressi non ancora necessari (#21 segue), ma picker e incolla
devono condividere già ogni regola #15; nessun invio automatico, nessuna
perdita della bozza testo o delle foto dopo un errore.

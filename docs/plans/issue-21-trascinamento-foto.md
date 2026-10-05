# Issue #21 — Trascinare foto nel compositore

Issue: https://github.com/ethos-adamas/tacitus/issues/21.
Stato: piano esecutivo, implementazione non eseguita.
Base analizzata: `f3b724928e6b48078ec6117d7d036992e67021a8`.
Prerequisiti: [#15](issue-15-compositore-foto.md), [#18A](issue-18-adapter-ui-temi.md).
Nella sequenza segue [#20](issue-20-incolla-immagini.md), di cui mantiene
onFiles/onFilesError e comportamento della clipboard. [Regole comuni](README.md).

## Risultato e confini

Trascinare file foto dal sistema nell'area del campo Messaggio li aggiunge
alla stessa Anteprima Album di picker/incolla, senza inviarli.
Durante il passaggio mostrare `Rilascia le foto per aggiungerle all'Album`
e un bordo evidenziato. Non coprire la chat con un overlay permanente.

Stesse regole #15: massimo 10 complessive per Contatto, aggiunta atomica,
ordine dei nuovi file preservato, conservazione delle foto precedenti,
nessuna perdita della bozza testo, destinatario catturato.
Non aggiungere supporto cartelle, URL remoti, drag da altre chat,
riordinamento foto o invio con rilascio.

Un file rilasciato fuori dal compositore non deve navigare via
dall'applicazione o essere aggiunto a un destinatario implicito.
Test app native esclusi; drag-and-drop del sistema è verifica Web desktop.

## 1. Leggere codice e sorgente Kibo

Leggere MessageComposer, EmojiComposer, PhotoPicker e useAnteprimaAlbum
prodotti da #15/#20, AuthenticatedApplication e index.css.
L'aggiunta comune è `aggiungiFoto(tacitusId, files)`: NON chiamare
prepareImages, inviaAlbum o storage direttamente dal componente Dropzone.

Usare il [sorgente Dropzone Kibo fissato](https://github.com/haydenbleasel/kibo/blob/3d63cdb15b79d972e3dc38a10997987672f9b263/packages/dropzone/index.tsx)
come base adattata nell'area vendor locale. Il sorgente originale:

- rende la radice attraverso Button;
- usa react-dropzone e default maxFiles 1;
- offre contenuti predefiniti e stato src pensati anche per sostituzione;
- gestisce onDrop in modo asincrono attraverso l'estrazione dei file.

Non copiare questi default nel compositore. Un button non può contenere
textarea e altri bottoni. Accumulo/validazione restano Tacitus, non Kibo.

Installare solo durante questa issue, da frontend:

```bash
npm install --save-exact react-dropzone@14.3.8
```

Versione fissata e [sorgente di riferimento](https://github.com/react-dropzone/react-dropzone/blob/v14.3.8/src/index.js).
Nella versione scelta preventDropOnDocument applica preventDefault anche
fuori root senza il filtro richiesto per il testo: disabilitarlo e usare
la protezione file-only descritta sotto. Non copiare API di versioni diverse.

## 2. Adapter locale con HTML valido

Creare `frontend/src/ui/kit/PhotoDropzone.tsx`, derivando il solo
componente necessario dal sorgente Kibo e conservando attribuzione e commit
in vendor/README.md. Il sorgente vendor e l'export locale possono stare in
due file se si conserva la base separata; il contratto applicativo è uno solo:

```ts
type PhotoDropzoneProps = {
  children: ReactNode;
  disabled: boolean;
  onFiles: (files: File[]) => void;
  onFilesError: (reason: unknown) => void;
};
```

Radice div, role presentation, ref e handler composti di getRootProps,
attributo `data-photo-dropzone` e `data-disabled`.
Nessun role button e nessun tabIndex aggiuntivo: i figli hanno già controlli
accessibili e picker disponibile da tastiera.
Non montare l'input nascosto di Dropzone: esiste PhotoPicker e noClick/noKeyboard
disabilitano l'apertura del file dialog.

Configurare useDropzone con disabled, noClick true, noKeyboard true,
multiple true, maxFiles 0, minSize 0, maxSize Infinity,
preventDropOnDocument false, noDragEventsBubbling false.
Non impostare accept o validator: limiti reali e formati restano nel percorso
comune. Il filtro anticipato potrebbe accettare solo parte del gruppo
violando l'atomicità. Eliminare contenuti automatici replace, conteggi
vendor e src come secondo stato delle foto.

## 3. Eventi, estrazione e destinatario

Il wrapper deve intercettare SOLO drag di file. Definire nel modulo adapter
`contieneFile(dataTransfer)`: true se types contiene Files o almeno un
item ha kind file. Riutilizzarlo anche nella protezione documento.
Questo controllo identifica un ingresso, non valida il contenuto foto.

Acquisire getRootProps e incapsularne gli handler in funzioni const nominate:

- dragenter/dragover: per file chiamare preventDefault, poi il relativo
  handler composto della libreria. Per dati solo testo/URL non chiamarlo
  e non cancellare l'evento, così la textarea conserva il drag di testo.
- drop: se file, preventDefault sempre, anche disabled. Se disponibile,
  inoltrare una sola volta al drop handler composto della libreria.
  Se disabled, mostrare un errore tramite onFilesError e non consegnare file.
- dragleave: inoltrare la pulizia alla libreria; non dipendere da types
  non vuoto nel leave (alcuni browser non lo forniscono). La gestione
  dei target annidati della libreria evita lo sfarfallio entrando nei figli.
- Non usare stopPropagation indiscriminato: il guard documento deve poter
  prevenire il comportamento nativo anche fuori dalla dropzone.
  Non applicare preventDefault al pointerdown o al normale click.

Fornire un `getFilesFromEvent` locale al confine browser:

1. Nelle fasi dragenter leggere soltanto items, senza accedere al contenuto.
2. Nel drop copiare subito `Array.from(dataTransfer.files)`.
   Non conservare React event/DataTransfer oltre questa lettura.
3. Se un item espone webkitGetAsEntry e indica una directory, rifiutare
   l'intero rilascio con `Trascina file foto, non cartelle.`.
   Non effettuare scansione ricorsiva o richieste File System Access.
   Se il browser non identifica la directory, la validazione comune rifiuta
   il file non decodificabile/non supportato; niente accettazione parziale.
4. Restituire `Promise.resolve(snapshot)`, firma prevista dalla versione
   14.3.8. La lettura dei File deve avvenire PRIMA di costruire la Promise,
   non in una then successiva. Il resolver non compie IO asincrono.
   Racchiudere l'estrazione in try/catch e restituire Promise.reject(reason)
   nel catch: un throw sincrono prima di Promise.resolve non viene catturato
   dalla catena interna della libreria. Eventi non previsti producono errore
   gestito, non cast indiscriminati.

La callback onDrop nominata consegna a onFiles l'intero acceptedFiles se
non ci sono rejections; qualsiasi rejection rifiuta tutto via onFilesError.
onError della libreria usa lo stesso handler. Non consegnare lo stesso
gruppo sia da onDrop sia da onDropAccepted.

Montare `PhotoDropzone key={tacitusId}` dentro MessageComposer intorno
alla sola riga EmojiComposer, non a galleria, offerte o intera pagina.
onFiles è la callback catturata dell'hook per quel Contatto. Non usare
la Conversazione attiva letta dopo l'estrazione. L'estrazione descritta
risolve nella microtask dello stesso evento, senza una scansione cartelle
che possa protrarsi fino a un altro gesto utente; la preparazione successiva
è protetta dai token #15. Un drop seguito da cambio chat prepara per il
destinatario originale, non per quello nuovo.

## 4. Protezione della pagina e presentazione

Nello stesso modulo adapter esportare
`usePhotoDropProtection(): void`, un piccolo hook con useEffect.
AuthenticatedApplication lo invoca una volta.
Agganciare a window dragover e drop con handler nominati, non passivi:

- Se contieneFile false: non fare nulla.
- Se true: preventDefault per impedire apertura/navigazione del file.
- Nel dragover impostare dropEffect none quando il target non appartiene a
  una `[data-photo-dropzone]` abilitata, copy quando appartiene.
- Non estrarre, preparare o consegnare file nel listener globale.
- Cleanup rimuove entrambi i listener; nessuna registrazione nel render.

Senza Conversazione selezionata il guard rimane presente ma non c'è una
dropzone: rilascio sicuro, nessuna aggiunta. Con sessione non pronta il
compositore disabilitato non deve aprire file nel browser.

Il root Dropzone deve avere width 100%, min-width 0 e position relative.
Usare isDragActive della libreria per outline/overlay con pointer-events none,
senza cambiare dimensioni del compositore. L'evidenziazione è visibile solo
con isDragActive e non disabled. Messaggio breve role status;
non annunciare l'intero contenuto ad ogni dragover. Togliere evidenziazione
al leave/drop, anche su file invalido, annullamento o cambio Contatto.
Tema usa token green/line/surface esistenti; niente nuova palette.

disabled deriva dalle stesse condizioni del picker: sessione non pronta,
preparazione, invio o progresso del Contatto. Non bloccare scrittura testo
o selezione solo perché il drop di foto è indisponibile.
Non applicare user-select none al compositore.

## 5. Test adapter e pipeline

Creare `frontend/src/ui/kit/__test__/PhotoDropzone.test.tsx`,
Given When Then, con mock DataTransfer controllato dove manca in JSDOM.
Usare la libreria reale per la composizione degli eventi; attendere le
microtask con act/waitFor, non fake timeout arbitrari.

| Given                        | When                                        | Then                                                                  |
| ---------------------------- | ------------------------------------------- | --------------------------------------------------------------------- |
| Due File validi              | Drop dentro root                            | onFiles chiamato una volta con entrambi e ordine invariato.           |
| File valido + invalido       | Drop                                        | Nessun filtro MIME locale; gruppo intero raggiunge validatore comune. |
| DataTransfer con Files       | Dragenter, entrare in textarea figlia, drop | Evidenziazione stabile poi rimossa, nessun click file dialog.         |
| Solo testo                   | Dragover/drop                               | Nessun preventDefault aggiuntivo e nessun onFiles.                    |
| disabled                     | Drop File                                   | Default cancellato, nessuna aggiunta, feedback pertinente.            |
| Cartella riconosciuta + foto | Drop                                        | Errore, nessun gruppo parziale.                                       |
| Errore estrazione            | Drop                                        | onFilesError unico, evidenziazione rimossa.                           |
| Hook protezione montato      | Drop File fuori root                        | Default cancellato, nessun onFiles.                                   |
| Hook protezione montato      | Drop solo testo fuori root                  | Default non cancellato.                                               |
| Hook smontato/rimontato      | Un drop                                     | Nessun listener duplicato.                                            |

Integrare MessageComposer con store e modulo #15:
picker poi drop aggiungono alla stessa anteprima, 9 + 3 rifiutate,
gruppo misto conserva le precedenti, preparazione tardiva di Alice
non appare in Bob, annullamento impedisce ricomparsa.
Riutilizzare test runtime #15 per le combinazioni già provate,
aggiungendo il collegamento effettivo del nuovo ingresso.

## 6. Browser: drag di file e regressioni testo

In `frontend/e2e/messaggistica.spec.ts` aggiungere titoli
`Album: trascinamento`. Usare page.evaluateHandle per creare DataTransfer
con File PNG reali dalle fixture e locator.dispatchEvent per dragenter,
dragover, drop sul campo. Rilasciare JSHandle nel finally.

Questo verifica il percorso browser, non simula la finestra del file manager.
Una prova manuale da file manager desktop completa la verifica del gesto.

Scenari E2E:

1. Picker 1 foto, paste #20 1 foto, drop 1 foto => 3 nello stesso ordine.
   Nessuna offerta al ricevente; Invia album produce un solo Album di 3.
2. Drop di 3 con 9 presenti => errore e 9 conservate.
3. Drop misto => nessuna aggiunta parziale.
4. Rilascio sulla lista Contatti, su cronologia e senza chat attiva =>
   URL invariato, pagina ancora attiva, nessuna foto aggiunta.
5. Sessione non pronta => nessuna aggiunta/navigazione.
6. Click nella textarea ed Enter/Shift+Enter, apertura emoji e picker =>
   comportamento precedente; nessun file dialog al semplice click.
7. Trascinare testo selezionato nella textarea => normale comportamento
   browser. Nel test sintetico verificare non-cancellazione; per inserimento
   reale usare gesto browser/manuale, non assumere che dispatchEvent inserisca.
8. 320/390/1280 px, chiaro/scuro: niente overflow o layout shift al drag.

Nel progetto mobile verificare rendering e pipeline sintetica senza
dichiarare supportato un file manager touch del sistema o un'app nativa.
Non servono test Tauri/Android/iOS.

## 7. Comandi e completamento

Da frontend:

```bash
npm test -- src/ui/kit/__test__/PhotoDropzone.test.tsx src/ui/conversation/__test__ src/application/album/__test__
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:e2e -- --project=chromium-desktop --grep "Album: trascinamento"
npm run test:e2e -- --project=chromium-mobile --grep "Album: trascinamento"
```

Rieseguire anche gli E2E di incolla/emoji e gli Album preesistenti.
Commit: adapter e guard con test; collegamento compositore; E2E e stile.
Done: tutti e tre gli ingressi convergono sul modulo #15, testo preservato,
niente navigazione involontaria e nessun invio automatico.
La successiva #18B può cambiare presentazione, non questi contratti.

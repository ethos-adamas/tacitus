# Issue #22 — Ripristino delle spaziature UI

Issue: https://github.com/ethos-adamas/tacitus/issues/22.
Base: `52c93698182374df7c7594b4e824bb7668d4fa2e`.
Stato: piano esecutivo, correzione non implementata.
Primo passo dell'[incarico Luna Max](correzioni-ui-luna-max.md).

## Obiettivo e cause individuate

Correggere entrambi gli esempi dell'issue: modale Aggiungi Contatto e
pannello di consenso Album. La spaziatura deve essere coerente anche negli
altri utilizzatori degli stessi adapter, non una patch su un singolo screenshot.

La modale Radix è un div con role dialog: le vecchie regole `dialog form`
non si applicano. DialogContent imposta `p-0`; solo modal-body ha padding
orizzontale, mentre header, descrizione e footer rimangono sui bordi.
AlbumTransferStatus restituisce invece un fragment: nel refactor ha perso
il contenitore album-composer che forniva padding e margini ai comandi.

## Letture e file interessati

Tutti sotto `frontend/`, salvo i documenti:

| File                                                            | Intervento                                                                                       |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------ |
| src/ui/kit/vendor/dialog.tsx                                    | Unico padding esterno del contenitore Modal.                                                     |
| src/ui/kit/Modal.tsx                                            | Classi semantiche e descrizione; nessun cambio del contratto pubblico.                           |
| src/ui/kit/vendor/alert-dialog.tsx                              | Allineare la spaziatura della conferma, senza raddoppiarla.                                      |
| src/ui/conversation/Album.tsx                                   | Contenitore di AlbumTransferStatus e gruppi di azioni.                                           |
| src/ui/conversation/MessageComposer.tsx                         | Verificare che il nuovo pannello sia sopra anteprima/riga; nessun wrapper aggiuntivo necessario. |
| src/index.css                                                   | Stili locali, rimozione padding duplicati/obsoleti e layout viewer.                              |
| src/ui/kit/PhotoViewer.tsx                                      | Leggere la gerarchia attuale; non cambiare gesti o caricamento.                                  |
| src/ui/contacts/AddContactDialog.tsx, ContactSettingsDialog.tsx | Verificare tutti i consumer della modale.                                                        |
| e2e/messaggistica.spec.ts                                       | Test browser delle misure e regressioni esistenti.                                               |

Prima del diff:

```bash
rg -n '<Modal|<DialogContent|<AlertDialogContent|album-composer|AlbumTransferStatus|dialog form|modal-body' frontend/src
```

## 1. Scrivere la riproduzione browser prima della modifica

Estendere `e2e/messaggistica.spec.ts` riusando createPersona, matchContacts
e le fixture foto. Titoli `Regressione UI #22: ...`.
Per Aggiungi Contatto basta un'Identità locale: aprire col bottone `.add`.

Usare getBoundingClientRect di dialog, titolo h2, descrizione e footer.
Misurare l'inset del TESTO del titolo, non del suo contenitore: il contenitore
può occupare tutta la riga pur avendo il proprio padding corretto.

Test inizialmente rosso: a 390 px ogni contenuto è distante dal bordo interno
almeno 15 px; a 1280 px almeno 23 px. Tolleranza 1 px per arrotondamenti;
con font/root standard il risultato di progetto è rispettivamente 16 e 24 px.
Misurare anche la distanza destra dell'ultimo bottone e quella inferiore
del footer: non basta verificare che il titolo abbia un margine.
Attendere document.fonts.ready e layout stabile prima di leggere rettangoli.

## 2. Una sola proprietà del padding delle modali

1. In DialogContent sostituire `p-0` con `p-4 sm:p-6`, mantenendo gap-4,
   portale, larghezza, focus e scroll esistenti. Il contenitore è il solo
   proprietario dello spazio esterno: 1rem mobile, 1.5rem da breakpoint sm.
2. In index.css cambiare `.modal-body` in padding 0, min-width 0, display
   grid e gap 1rem. Questo separa anche le sezioni di ContactSettingsDialog.
   Non aggiungere padding a ogni figlio: si sommerebbe a quello del dialog.
3. Assegnare `className="modal-description"` a DialogDescription in Modal,
   con margin 0 e line-height leggibile. Azzerare il margin del titolo e
   mantenere la disposizione flex del suo header; footer gap .5rem e
   flex-wrap wrap, senza nuovo padding proprio.
4. AlertDialogContent ha già p-6: renderlo `p-4 sm:p-6` per la stessa
   geometria. Titolo/descrizione senza margini browser aggiuntivi. Non
   applicare anche lo spazio esterno di Modal alla conferma annidata.
5. Eliminare regole `dialog`/`dialog form` soltanto dopo aver verificato che
   non esistano più dialog nativi. Non eliminare `.dialog-title` e
   `.dialog-actions`, ancora usate dagli adapter.
6. Rimuovere handler JSX inline nei componenti eventualmente toccati,
   sostituendoli con const nominate; non fare pulizia generalizzata.

Non usare `!important` per contrastare p-0: eliminarne la causa. Non
introdurre Preflight, reset globale, nuovo Modal o props configurabili di
spaziatura che nessun chiamante richiede.

## 3. Preservare lo spazio utile del viewer

Il medesimo DialogContent serve PhotoViewer. Il padding nuovo deve essere
conteggiato nella sua area disponibile, non compensato con altezza fissa.
Mantenere `.modal-image` con righe auto/auto/minmax(0,1fr)/auto; il body
centrale ha min-height 0. Nella struttura attuale toolbar e stage sono
entrambi DENTRO `.photo-viewer`, mentre Chiudi è nel footer di Modal.

Sostituire il min-height calcolato rigido di `.photo-viewer` con height 100%,
min-height 0 e grid-template-rows `minmax(0, 1fr) auto`: lo stage occupa
solo lo spazio rimasto dopo la toolbar. Conservare min-height 0/overflow
hidden sullo stage. Il ResizeObserver già presente misura questo spazio.
Non sottrarre a mano un'altezza toolbar ipotetica né spostare i controlli
in un altro portale. A font/viewport diversi la toolbar può andare a capo.

Il test browser deve verificare toolbar e Chiudi dentro la viewport e stage
con dimensioni positive, sia 390×844 sia 320×740, anche in rétro dopo #23.
Ripetere wheel/pinch: questo intervento non cambia la loro configurazione.

## 4. Ripristinare il pannello Album, senza ricreare il vecchio compositore

In AlbumTransferStatus, se non ci sono offer né progress, restituire null.
Altrimenti sostituire il fragment con un div `album-transfer-status`.
All'interno mantenere i due stati e tutti gli handler esistenti:
rispondiAlbum, rifiutaFoto e annullaAlbum non cambiano.

Usare queste responsabilità CSS:

- `.album-transfer-status`: display grid, gap .75rem, padding .75rem 1rem,
  border-top 1px solid var(--line), min-width 0; limite max-height 30dvh e
  overflow-y auto per non nascondere il compositore quando gli stati crescono.
- `.album-consent` e nuova `.album-progress`: display grid, gap .5rem,
  min-width 0. Paragrafo/titolo con margin 0.
- `.album-transfer-actions`: display flex, flex-wrap wrap e gap .5rem.
  Inserire qui Accetta/Rifiuta; usare lo stesso gruppo per Interrompi album.

Non impostare margini su ogni button e non rimettere picker/textarea
all'interno del pannello. I role status restano sugli stati operativi.
Se `.album-composer` risulta inutilizzata, rimuoverne gli stili morti.
Bozza testo, anteprima cumulativa e consenso rimangono invariati.

## 5. Test e criteri di completamento

Estendere il test di MessageComposer nel suo `__test__/` per pannello
assente/presente usando offerte/progresso nello store. Verificare anche
che i comandi mantengano gli handler: un wrapper corretto non deve
interrompere l'accettazione o l'annullamento del trasferimento.

Nel browser, preparare e inviare una foto tra due Contatti con consenso ask:
misurare pannello con almeno 15 px di inset laterale, almeno 7 px di
separazione fra i pulsanti sulla stessa riga; se vanno a capo misurare
il gap verticale. Accettare e verificare la comparsa della foto ricevuta.
Usare il flusso E2E Album esistente per evitare un nuovo protocollo nel test.

Altre asserzioni: nessun pannello vuoto che consumi spazio; nessun overflow
orizzontale della pagina; Aggiungi Contatto e ContactSettingsDialog con
spaziatura comune; conferme annullabili e focus restituito; viewer non tagliato.
Le misure di layout appartengono a Playwright, non a JSDOM.

Comandi da frontend, nell'ordine e con i vincoli dell'incarico principale:

```bash
npm test -- src/ui/kit/__test__ src/ui/contacts/__test__ src/ui/conversation/__test__
npm run typecheck
npm run lint
npm run build
npm run test:e2e -- --grep 'Regressione UI #22|Album: anteprima|Album: consenso'
```

Done: entrambi gli esempi dell'issue coperti da prove rosse→verdi,
padding presente in tutti i consumer e viewer usabile su schermo stretto.

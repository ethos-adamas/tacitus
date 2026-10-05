# Issue #19 — Anteprima foto con zoom continuo

Issue: https://github.com/ethos-adamas/tacitus/issues/19.
Stato: piano esecutivo, implementazione non eseguita.
Base analizzata: `f3b724928e6b48078ec6117d7d036992e67021a8`.
Prerequisito: [#18 fase A](issue-18-adapter-ui-temi.md), Modal e Button.
Regole generali: [indice](README.md).

## Comportamento concordato e ambito

Click o tap su una foto di un Album apre un'anteprima modale, senza download.
Zoom continuo con rotellina sul computer e pinch con due dita touch.
Il semplice ingrandimento al click NON soddisfa il requisito.
Aggiungere pan dell'immagine ingrandita, pulsanti accessibili zoom +/−,
ripristino e comando esplicito `Scarica foto`.

Solo foto già disponibili localmente, ricevute o inviate, usando i data URL
restituiti da loadAlbum. Non recuperare originali remoti e non cambiare
cifratura/persistenza. Nessun carosello, editor, fullscreen API o gesto
globale sulla pagina richiesto.

App native Android/iOS non testabili e fuori dalle verifiche di questo ciclo.
Il download HTML viene verificato sul Web, non dichiarato valido in Tauri.

## Evidenza tecnica e dipendenza scelta

AlbumGallery, in `frontend/src/ui/conversation/Album.tsx`, oggi racchiude
ogni img in un link con download. L'effetto carica tramite
`loadAlbum(leggiIdentitaLocale(), tacitusId, id)` e ha un flag active.
In index.css la regola `.album-gallery a:only-child` dipende da quel markup.

Il [sorgente Kibo Image Zoom](https://github.com/haydenbleasel/kibo/blob/3d63cdb15b79d972e3dc38a10997987672f9b263/packages/image-zoom/index.tsx)
usa react-medium-image-zoom: non fornisce nelle proprie props documentate
il contratto di zoom continuo richiesto. Non forzarlo aggiungendo un secondo
trasformatore annidato. Usare un adapter Tacitus che integra Modal shadcn
con `react-zoom-pan-pinch@4.2.0`.

I [tipi della versione fissata](https://github.com/BetterTyped/react-zoom-pan-pinch/blob/v4.2.0/src/models/context.model.ts)
espongono minScale/maxScale, wheel, pinch, panning, keyboard, controlli e
onTransform. Il piano sotto è la scelta di integrazione Tacitus, non una
funzione promessa da Kibo.

Da frontend, durante implementazione:

```bash
npm install --save-exact react-zoom-pan-pinch@4.2.0
```

## 1. Adapter e isolamento dal dominio

Creare `frontend/src/ui/kit/PhotoViewer.tsx`:

```ts
type PhotoViewerProps = {
  src: string;
  alt: string;
  downloadName: string;
};
```

Un'istanza per foto, apertura locale e risorse montate soltanto quando aperta.
Renderizza come radice visibile una Button ghost con classe `album-photo`,
aria-label `Apri FOTO` dove FOTO è alt, e miniatura img.
Modal usa questo bottone come trigger, title uguale ad alt, size image,
descrizione breve `Usa la rotellina o due dita per lo zoom.`.
Non mettere href/download nel trigger. Il chiamante non importa il motore.

Nel contenuto: barra titolo/chiusura, area immagine, barra controlli.
Usare DownloadLink locale della #18 per `Scarica foto`, con href=src e
download=downloadName. Non simulare un click per scaricare alla apertura.
Download non chiude la modale né modifica Album o Conversazione.

L'area zoom e lo stato delle sue dimensioni sono UI effimera, non Redux.
Gli handler JSX sono funzioni const nominate.
Nessuna nuova astrazione generica gesture o image service.

## 2. Dimensioni e geometria definite

Modal image: width min(1100px, 100vw - 1rem), height min(850px, 100dvh - 1rem),
griglia righe auto minmax(0, 1fr) auto. La toolbar può andare a capo.
L'area centrale ha min-width/min-height 0, overflow hidden, position relative.
Il portale su body evita il containing block trasformato di app-shell.

Acquisire naturalWidth/naturalHeight dall'evento load dell'immagine.
Misurare l'area centrale con ResizeObserver, non window.innerWidth:
altezza disponibile deve escludere entrambe le barre.
Finché dimensioni naturali o area sono zero, mostrare caricamento,
non dividere per zero e non montare il trasformatore.
L'immagine di caricamento può essere invisibile e fuori dal layout; toglierla
quando si monta quella trasformata, evitando due immagini accessibili.

Calcolo puro, nello stesso modulo proprietario, con input positivi:

```ts
const fit = Math.min(1, stageWidth / imageWidth, stageHeight / imageHeight);
const x = (stageWidth - imageWidth * fit) / 2;
const y = (stageHeight - imageHeight * fit) / 2;
```

Il 100% del controllo indica questa vista adattata, non pixel originali.
Minimo scala fit, massimo 4 * fit. Una foto piccola non viene ingrandita
automaticamente all'apertura. Impostare sull'img trasformata width e height
naturali, max-width none, display block e draggable false.
Il wrapper TransformComponent occupa il 100% dell'area centrale.
NON applicare alla foto grande i max-height 240px della galleria:
circoscrivere quella regola alle sole miniature.

Dopo resize/orientamento ricalcolare e rimontare il solo trasformatore con
key composta da src e dimensioni disponibili arrotondate a pixel.
Questo ripristina la vista adattata, scelta tecnica intenzionale.
Aggiornare dimensioni soltanto se cambiano, per evitare loop ResizeObserver.
Chiudere disconnette l'observer e smonta il motore; riaprire riparte a 100%.

## 3. Configurare un solo motore per i gesti

TransformWrapper:

- initialScale/minScale = fit, maxScale = 4 * fit;
  initialPositionX/Y = x/y.
- limitToBounds true, centerZoomedOut true.
- wheel enabled, step 0.1; pinch enabled con allowPanning true.
- panning enabled, velocityDisabled true; doubleClick disabled.
- trackPadPanning disabled: il gesto rotellina/trackpad resta zoom,
  non un secondo comportamento concorrente.
- zoomAnimation disabled, velocityAnimation disabled,
  autoAlignment animationTime 0. Controlli con animationTime 0.
  Non introdurre animazioni indispensabili ai gesti.
- keyboard enabled sul wrapper focalizzabile, panStep 40,
  zoomStep 0.2 * fit, animationTime 0.

Applicare touch-action none solo all'area zoom, non a html/body o chat.
Wheel/pinch non devono scorrere la Conversazione dietro la modale.
Non aggiungere listener wheel sul document e non disabilitare lo zoom
del browser nel meta viewport. Fuori dalla modale tutto torna normale.

Usare ref del motore o useControls per handler const:
`zoomIn(0.2 * fit, 0)`, `zoomOut(0.2 * fit, 0)`,
`setTransform(x, y, fit, 0)` per `Ripristina zoom`.
La versione 4.2.0 restituisce Promise dai controlli: gestirle secondo i tipi
installati, senza cast per simulare API di una versione precedente.
Pulsanti nomi `Aumenta zoom`, `Riduci zoom`, `Ripristina zoom`;
disabilitare + e − ai rispettivi limiti con tolleranza numerica piccola.
onTransform aggiorna il valore visualizzato `round(scale / fit * 100)%`;
non annunciare ogni frame come live region.

Wrapper tabIndex 0 e nome `Foto ingrandita`: frecce per pan e +/−
per zoom se focalizzato; toolbar offre comunque le stesse azioni.
Escape rimane al Modal, non viene consumato dal motore.
Mantenere focus trap e ritorno al trigger; nessun listener residuo su chiusura.

## 4. Integrare AlbumGallery e lifecycle

In AlbumGallery sostituire gli anchor con PhotoViewer, passando gli stessi
src e alt `Foto N`, downloadName `foto-N.webp`.
Usare identità foto composta da tacitusId, id Album e posizione; la posizione
è accettabile qui perché un Album inviato è immutabile, a differenza delle
anteprime modificabili della #15.

In Conversation.tsx dare ad AlbumGallery una key composta da Contatto e
Album: cambiando chat non deve sopravvivere una modale del Contatto precedente.
Nell'effetto di caricamento azzerare immagini/errore all'avvio per evitare
stati residui su aggiornamenti; conservare active e ignorare risultati dopo
smontaggio. Non introdurre cache globale delle immagini decifrate.

Cambiare `.album-gallery a:only-child` in
`.album-gallery .album-photo:only-child`. La miniatura-bottone mantiene
griglia e dimensioni precedenti, bordo/focus visibile e padding adatto.
Verificare immagini uniche, più immagini, messaggi in entrata e uscita.

Errore loadAlbum: mantenere `Foto locali non disponibili.` nella galleria.
Errore decode dell'immagine nel viewer: testo role alert
`Impossibile visualizzare questa foto.`, controlli zoom disabilitati,
chiusura sempre possibile; nessun retry remoto automatico.
L'azione download resta esplicita per il src disponibile.

## 5. Test di componente e geometria

Creare `ui/kit/__test__/PhotoViewer.test.tsx` con Given When Then.
Testare funzione fit nel suo modulo: orizzontale, verticale, immagine piccola,
centratura e limite 4x; dimensioni zero non avviano il calcolo.
Esempio 2000×1000 in area 500×400 => fit .25, x 0, y 75.
Questo test prova i calcoli, non la libreria mockata.

Testing Library: trigger apre senza download, link esplicito con nome/file
corretti, Escape chiude, errore immagine lascia Chiudi operativo.
JSDOM non prova pinch/rotellina o misure: non usarlo per dichiarare riusciti
i gesti. Mock ResizeObserver soltanto per test strutturali.

In `ui/conversation/__test__/AlbumGallery.test.tsx`:
mock loadAlbum controllato, smontaggio/cambio destinatario prima del resolve,
nessuna foto vecchia; errore esplicito. Eseguire il test delle miniature
dopo aver migrato il selettore CSS, non controllare solo il nome della classe.

## 6. Test browser dello zoom effettivo

Estendere `frontend/e2e/messaggistica.spec.ts`, titoli con prefisso
`Album: anteprima`, usando un Album realmente scambiato dalle fixture
esistenti. La foto può essere una PNG generata su canvas nel test, con
dimensioni almeno 1000×800 e dettagli riconoscibili; non una sola cella.

Desktop Chromium:

1. Registrare eventi download, cliccare la miniatura, attendere dialog/foto.
   La modale è visibile e la lista download rimane vuota.
2. Leggere la scala da DOMMatrixReadOnly sul contenuto trasformato e il
   bounding box dell'immagine. Spostare mouse al centro dell'area, eseguire
   wheel deltaY negativo; con expect.poll verificare scala e dimensione
   maggiori. Delta positivo le riduce; testare i limiti.
3. A zoom > minimo trascinare il mouse: cambia traslazione, scala invariata.
   Ripristina riporta fit e centratura. I comandi tastiera danno lo stesso esito.
4. Cliccare Scarica foto con waitForEvent('download') registrato prima del
   click; suggestedFilename foto-N.webp. Non serve salvare in una directory
   utente. Chiudere e verificare focus e normale scroll della chat.

Mobile Chromium emulato:

1. Usare il progetto chromium-mobile; aprire la stessa foto con tap.
2. Creare una CDP session della pagina. Con
   [Input.dispatchTouchEvent](https://chromedevtools.github.io/devtools-protocol/tot/Input/#method-dispatchTouchEvent)
   inviare touchStart con due punti id 1/2 al centro ±20 px; più touchMove
   con distanza crescente, sempre dentro area; touchEnd con touchPoints [].
3. Verificare la scala effettiva e il bounding box aumentati, non solo il
   numero percentuale. Ripetere avvicinando le dita per diminuire.
   In finally terminare eventuali tocchi e chiudere la sessione CDP.
4. Ruotare/cambiare viewport: foto di nuovo adattata, comandi visibili.
   Chiudere: nessuna cattura gesti residua.

Non usare pinch con Ctrl+wheel come unica prova del touch: sono ingressi
diversi. Questa è emulazione browser, non verifica di hardware fisico.
Se disponibile un browser su dispositivo touch reale, annotare una prova
manuale; se non disponibile, dichiararla non eseguita senza bloccare con
test nativi esclusi dall'utente.

## 7. Verifica e consegna

Da frontend:

```bash
npm test -- src/ui/kit/__test__/PhotoViewer.test.tsx src/ui/conversation/__test__/AlbumGallery.test.tsx
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:e2e -- --project=chromium-desktop --grep "Album: anteprima"
npm run test:e2e -- --project=chromium-mobile --grep "Album: anteprima"
```

Poi suite E2E Album esistente. Testare chiaro/scuro, 320/390/1280 px.
#18B ripete la verifica con retro.
Commit: adapter/geometria; galleria/lifecycle; browser gestures/download.
Done solo con prova della trasformazione reale su wheel e pinch emulato,
download esclusivamente esplicito e nessuna foto del Contatto sbagliato.

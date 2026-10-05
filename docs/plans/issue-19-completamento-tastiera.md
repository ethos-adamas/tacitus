# Issue #19 — Completare i controlli da tastiera dello zoom

Issue di riferimento: https://github.com/ethos-adamas/tacitus/issues/19.
Questo è un follow-up del [piano #19](issue-19-anteprima-zoom.md), non una
nuova issue GitHub. Base: `52c93698182374df7c7594b4e824bb7668d4fa2e` più
#22/#23. Stato: piano esecutivo, correzione non implementata.
Terzo passo dell'[incarico Luna Max](correzioni-ui-luna-max.md).

## Difetto e correzione minima

PhotoViewer passa panStep, zoomStep e animationTime a keyboard ma omette
disabled. La versione installata react-zoom-pan-pinch 4.2.0 ha keyboard
disabilitata per default. La riproduzione a layout stabilizzato ha dato
scala 0.915 prima e dopo `+`, mentre il pulsante portava la scala a 1.1.
I valori dipendono dalla viewport: il test deve confrontarli, non fissarli.

Il motore gestisce già +/=, -/_, frecce e 0 sul wrapper, ignorando campi
editabili e combinazioni Ctrl/Meta/Alt. Non implementare un secondo handler
globale: [sorgente ufficiale della versione](https://github.com/BetterTyped/react-zoom-pan-pinch/blob/v4.2.0/src/core/keyboard/keyboard.logic.ts).

## File e passi

Leggere `frontend/src/ui/kit/PhotoViewer.tsx`, il suo test, Modal.tsx e
gli E2E con prefisso Album: anteprima. Confermare il default nella dipendenza
installata, senza modificare node_modules o aggiornare package.json.

1. Prima della correzione aggiungere il test browser descritto sotto e
   osservarne il fallimento su `+`, dopo che il layout è stabile.
2. In PhotoViewer aggiungere soltanto `disabled: false` al blocco keyboard:

```tsx
keyboard={{
  disabled: false,
  panStep: 40,
  zoomStep: fit.fit * 0.2,
  animationTime: 0,
}}
```

3. Mantenere tabIndex 0 e nome Foto ingrandita sul wrapper. Collegare con
   aria-describedby un breve aiuto visibile per +/−, frecce e 0; usare
   un ID univoco con useId per ogni viewer. Non usare un ID fisso condiviso
   da tutte le foto della Conversazione.
4. Conservare i pulsanti +, −, Ripristina zoom e Scarica foto, il focus trap,
   la chiusura Escape e il ritorno al trigger. Non cambiare limiti di scala,
   pan, pinch, rotellina, font o persistenza per questa correzione.
5. Estrarre onInit/onTransform inline in handler const nominati nel file
   toccato, mantenendo i tipi della libreria e lo stesso comportamento.

Nessuna scorciatoia sulla pagina intera, nessuna intercettazione di Ctrl+V,
nessun preventDefault generalizzato. La toolbar, essendo fuori dal wrapper,
non deve diventare una zona in cui ogni tasto cambia l'immagine.

## Test browser che verifica l'interazione reale

Estendere l'E2E desktop esistente del viewer, che già invia una foto e apre
la miniatura; creare un test nominato `Regressione UI #19: tastiera zoom`
riusando lo stesso setup se serve mantenerlo separato. Non aggiungere un
componente demo nella produzione né una seconda libreria di test.

1. Attendere immagine caricata, font pronti e dimensioni stabili dello stage.
   Campionare con expect.poll due frame consecutivi di dimensioni e scala,
   azzerando il conteggio se cambiano; richiedere stabilità su almeno tre
   campioni prima della baseline. Non leggere la trasformazione appena
   compare il DOM: il ResizeObserver può ancora rimontare il motore e
   produrre un falso aumento di scala attribuito al tasto.
2. Leggere DOMMatrixReadOnly su `.photo-viewer-zoom-content`: a è la scala,
   e/f la traslazione. Leggere anche width/height dell'immagine trasformata.
   Usare locator del wrapper focalizzabile e verificare che abbia focus.
3. Inviare `press('+')` o `press('=')`: expect.poll sulla scala maggiore
   della baseline e larghezza immagine maggiore. Non chiamare zoomIn nel
   test e non cliccare il bottone al posto del tasto.
4. Con `-` la scala deve diminuire senza scendere sotto il fit. Aumentare
   poi fino ad almeno 2× il fit per poter testare il pan su immagine più
   grande dello stage, senza essere bloccati dalla centratura ai limiti.
5. Premere freccia destra/sinistra: traslazione cambia, scala resta uguale.
   Testare una direzione che non sia già al bordo; evitare asserzioni sul
   segno assoluto della traslazione non necessarie al requisito.
6. Premere `0`: scala e centratura tornano alla vista iniziale con tolleranza
   .001 sulla scala e 1 px sulla posizione. Riprovare il pulsante reset.
7. Spostare focus su un pulsante toolbar e premere una freccia: la foto non
   deve muoversi. Escape chiude la modale; focus torna alla miniatura.
   Riapertura: vista adattata iniziale, nessun listener duplicato.
8. Rifare i test wheel e pinch CDP già presenti dopo la correzione #22;
   non dedurre che il touch funzioni dal solo successo della tastiera.

La prova nuova della tastiera è desktop. Il progetto mobile continua a
provare pinch e geometria della modale; l'eventuale skip della prova tastiera
è esplicito e motivato, non una dichiarazione di supporto nativo.

Nel test di componente PhotoViewer.test.tsx verificare che l'aiuto sia
collegato al wrapper e che i suoi ID siano univoci. JSDOM non dimostra
che il motore trasformi davvero l'immagine: il test determinante è E2E.
Non aggiungere un test che controlli soltanto la prop disabled false.

## Verifica e completamento

Da frontend, senza rigenerazioni WASM durante gli E2E:

```bash
npm test -- src/ui/kit/__test__/PhotoViewer.test.tsx
npm run typecheck
npm run lint
npm run build
npm run test:e2e -- --project=chromium-desktop --grep 'Regressione UI #19|Album: anteprima'
npm run test:e2e -- --project=chromium-mobile --grep 'Album: anteprima'
```

Done: test tastiera rosso prima/verde dopo, wheel/pinch e download esplicito
ancora funzionanti. Nessuna nuova dipendenza e nessuna modifica al protocollo.

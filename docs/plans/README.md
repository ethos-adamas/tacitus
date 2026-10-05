# Piani esecutivi delle issue #15–#21

## Seguito della verifica del 9 settembre 2026

Le implementazioni #15–#21 sono ora presenti nel workspace al commit
`52c93698182374df7c7594b4e824bb7668d4fa2e`, ma la verifica ha riprodotto
le nuove issue #22/#23 e un'incompletezza della tastiera nel viewer #19.
Il prossimo incarico è il [piano correttivo per Luna Max](correzioni-ui-luna-max.md),
con un documento esecutivo per ogni intervento. Il resto di questo indice
conserva il contesto della pianificazione iniziale: non è lo stato di
completamento aggiornato delle implementazioni.

## Pianificazione iniziale del 7 settembre 2026

Sette piani dettagliati, uno per issue; #18 ha due fasi nello stesso documento.
La pianificazione è completata. Le funzionalità descritte NON sono state
implementate né testate durante questa attività.

Issue e codice verificati il 7 settembre 2026 su
[ethos-adamas/tacitus](https://github.com/ethos-adamas/tacitus/issues).
Commit base: `f3b724928e6b48078ec6117d7d036992e67021a8`.
Le decisioni di prodotto sono quelle emerse dall'intervista
`grill-with-docs`; i dettagli tecnici nei piani guidano l'esecutore.
Nessuna issue, etichetta o dipendenza su GitHub è stata modificata.

## Ordine operativo

| Ordine | Piano                                                                 | Risultato e motivo della priorità                                                           |
| ------ | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------- |
| 1      | [#17 — Allineamento checkbox](issue-17-allineamento-checkbox.md)      | Correzione isolata, piccola e verificabile subito, senza dipendenze.                        |
| 2      | [#18 — Fase A: base UI](issue-18-adapter-ui-temi.md)                  | Adapter e stili di base prima delle modali e dei nuovi controlli, senza anticipare i temi.  |
| 3      | [#19 — Anteprima e zoom](issue-19-anteprima-zoom.md)                  | Corregge il download involontario; verifica subito modale e interazione complessa.          |
| 4      | [#16 — Impostazioni Contatto](issue-16-impostazioni-contatto.md)      | Usa la base modale e rende consensi/azioni accessibili prima dei nuovi ingressi foto.       |
| 5      | [#15 — Compositore e Anteprima Album](issue-15-compositore-foto.md)   | Introduce layout e gestione foto condivisa che evita tre implementazioni divergenti.        |
| 6      | [#20 — Incolla immagini](issue-20-incolla-immagini.md)                | Primo ingresso aggiuntivo sulla gestione comune, senza nuove dipendenze.                    |
| 7      | [#21 — Trascinamento foto](issue-21-trascinamento-foto.md)            | Completa gli ingressi usando gli stessi contratti e proteggendo il normale drag del testo.  |
| 8      | [#18 — Fase B: migrazione finale e temi](issue-18-adapter-ui-temi.md) | Completa tutte le schermate; tema rétro e selettore nelle impostazioni arrivano per ultimi. |

Questo è l'ordine di esecuzione consigliato, non una graduatoria di gravità.
#19 e #16 non bloccano tecnicamente il modulo foto della #15: vengono prima
per consolidare la UI e verificare gli adapter. I vincoli tecnici effettivi:

- #17 non ha prerequisiti funzionali.
- #18A fornisce gli adapter alle #19, #16, #15 e #21.
- #15 è prerequisito delle #20 e #21.
- #21 usa anche le callback di errore browser esplicitate nella #20.
- #18B si esegue dopo tutti gli interventi funzionali.

Non chiudere #18 dopo A. Non impostare tutte le issue come bloccate
dall'intera #18 e contemporaneamente #18 bloccata da quelle issue: sarebbe
un ciclo. Registrare le fasi come checklist/commit nel lavoro esecutivo;
eventuali aggiornamenti del tracker richiedono un incarico distinto.

## Decisioni confermate da mantenere

### UI e temi

Tutte le schermate useranno adapter locali per primitive shadcn/UI e
componenti Kibo pertinenti. Gli import vendor restano negli adapter; layout,
HTML semantico e logica di dominio rimangono Tacitus. Non servono wrapper
per ogni div, né una seconda architettura dell'applicazione.
Decisione registrata nell'[ADR frontend 0001](../../frontend/docs/adr/0001-adapter-ui-shadcn-kibo.md).

Chiaro e scuro restano. Rétro: fondo quasi nero, verde fosforo, bordi
squadrati, font da computer 8-bit su titoli/comandi, messaggi leggibili.
Tema nuovo e selezione vengono implementati solo in #18B; il selettore
vive sempre nelle impostazioni, anche prima di creare l'Identità.

### Foto e Anteprima Album

Selettore, incolla e trascinamento aggiungono foto alla medesima anteprima
del Contatto. Massimo 10 foto complessive per anteprima; ordine conservato.
Ogni nuovo gruppo è indivisibile: un errore o troppi file rifiutano tutto
il nuovo gruppo, senza toccare le foto già preparate.

Esempi vincolanti:

- 2 foto presenti + 1 valida = 3 foto, nessun invio.
- 9 presenti + 3 nuove = 9 conservate e `Puoi aggiungere ancora 1 foto.`.
- 2 presenti + gruppo valido/non valido = 2 conservate e motivo dell'errore.
- Rimuovere la seconda di 3 mantiene prima/terza e libera un posto.
- Rimuovere l'ultima svuota l'anteprima, non la bozza di testo.
- Preparare per Alice, aprire Bob e tornare: le foto sono ancora di Alice.
- Annullare mentre si prepara: un risultato tardivo non ricrea l'anteprima.
- Invio fallito: foto conservate e possibilità di riprovare.
- Invio riuscito: anteprima svuotata solo dopo l'esito positivo.

Le anteprime sono volatili fino al reload/chiusura della scheda: nessuna
persistenza su disco. I buffer restano fuori Redux, i metadati serializzabili
nello slice Album, non nel modello Conversazione persistito.
Gli Album già inviati mantengono la persistenza esistente.
Rimozione/blocco del Contatto e cancellazione Identità puliscono le anteprime.

Ogni miniatura ha rimozione singola; resta Annulla album.
Invio Album sempre esplicito con Invia album, separato dall'invio testo.

### Zoom, clipboard e consensi

Click/tap su foto già inviata/ricevuta apre anteprima, non download.
Richiesti pinch con due dita e rotellina, con pan e controlli accessibili.
Scarica foto è un comando separato nella modale.

Clipboard immagini + testo: prevalgono le immagini, bozza e selezione
del testo restano invariate. Solo testo: normale incolla della textarea.

Consensi del Contatto immediati, senza Salva; chiusura non annulla la scelta.
Rimuovere/bloccare richiede conferma; Non ricevere foto non blocca il Contatto.
Nickname e Tacitus ID restano dove sono nell'header.

### Verifiche di piattaforma

Le app native Android/iOS NON vengono testate in questo ciclo, su indicazione
dell'utente. Non rimuovere il supporto nativo e non allargare i permessi Tauri.

Distinguere nel resoconto:

| Verifica                             | Cosa dimostra                                                                      |
| ------------------------------------ | ---------------------------------------------------------------------------------- |
| Vitest/JSDOM                         | Contratti, stato e handler, non geometria/gesti fisici.                            |
| Chromium desktop                     | Funzionamento browser e layout, wheel/pan, flussi E2E.                             |
| Chromium mobile emulato              | Viewport/touch emulato e pipeline browser, non app nativa.                         |
| Browser touch reale, se disponibile  | Gesti su hardware; segnalare se non eseguito.                                      |
| Clipboard/drop sintetici             | Pipeline evento → preparazione; non accesso al file manager/clipboard del sistema. |
| Prova manuale clipboard/file manager | Interazione con il sistema operativo nel browser.                                  |

Non convertire un test non eseguibile in un test che modifica direttamente
lo stato per ottenere il risultato atteso. Dichiarare limiti residui.

## Istruzioni per il modello esecutore

1. Leggere AGENTS.md, CONTEXT-MAP.md, frontend/CONTEXT.md, ADR e questo indice.
   Scegliere una sola issue/fase dalla sequenza e leggere tutto il suo piano.
2. Verificare `git status --short`, il commit di partenza e i file reali:
   i piani indicano sia file esistenti sia file da introdurre. Se un
   prerequisito è già implementato, riusarlo; non ricrearlo dal piano.
3. Cercare tutti i chiamanti prima di cambiare un contratto. Non correggere
   solo l'ingresso citato dall'issue lasciando divergenti picker/paste/drop.
4. Implementare in passi coerenti con i commit logici del piano. Non fare
   commit/push o aggiornamenti GitHub senza relativa autorizzazione.
5. Funzioni/componenti const; Error Boundary resta classe; handler JSX
   nominati; HTML in ui; test nel **test** del proprietario con Given/When/Then.
   Niente moduli utils/common/constants generici.
6. Validare file/stringhe al confine di ingresso; mantenere i controlli
   separati di protocollo e persistenza ai rispettivi confini di fiducia.
   Non inserire buffer, socket, listener o token asincroni in Redux.
7. Usare gli errori per preservare i dati, non nasconderli. Nessun invio
   automatico, cancellazione implicita o variazione del consenso.
8. Eseguire i controlli del piano, verificando che i filtri selezionino test
   reali. Al termine riportare cosa è passato, fallito o non eseguito.
9. Se il codice è cambiato materialmente rispetto alla base, documentare la
   differenza prima di adattare il piano. Per scelte che cambiano i requisiti
   chiedere all'utente; non reinterpretare un vincolo confermato.

## Ambiente e comandi condivisi

I piani sono per il frontend Web, ma gli E2E avviano il relay Rust locale.
Prerequisiti del repo: Node 24, Rust 1.96, target wasm32-unknown-unknown,
wasm-pack 0.15.0. Riferimenti: [README principale](../../README.md) e
[README frontend](../../frontend/README.md).

In ambiente predisposto, dalla radice per le dipendenze esistenti:

```bash
npm --prefix frontend ci
```

Le nuove dipendenze vengono aggiunte soltanto dall'issue indicata nella #18,
con package-lock aggiornato. Non eseguire npm ci dopo aver modificato
package.json senza prima sincronizzare il lockfile.

Da frontend, per predisporre Chromium se non installato:

```bash
npx playwright install chromium
```

`pretest`, `typecheck`, `build` e `predev` compilano il protocollo WASM.
Se manca un prerequisito, riportarlo separatamente da un fallimento del
codice. Non committare artefatti generati esclusi dal repo.
Playwright contiene già i progetti chromium-desktop/chromium-mobile e due
webServer (cargo backend e Vite): non avviare un secondo relay sulle stesse
porte e non usare il server di produzione per test distruttivi.

Controlli condivisi da frontend:

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:e2e -- --project=chromium-desktop
npm run test:e2e -- --project=chromium-mobile
```

I singoli piani riportano comandi mirati; la fase finale #18B richiede la
regressione completa. Eventuali problemi preesistenti vanno distinti dalle
regressioni, senza estendere di nascosto lo scope.

## Stato della consegna documentale

Ogni piano contiene obiettivo, prerequisiti, letture del codice, contratti,
passi di modifica, errori/concorrenza, test concretamente implementabili,
comandi e criterio di completamento. Le scelte emerse sono riflesse
nel [glossario frontend](../../frontend/CONTEXT.md) e nell'ADR pertinente.

Questa consegna modifica soltanto documentazione. I test elencati sono
istruzioni per la successiva implementazione, non risultati già ottenuti.

# Correzioni UI — incarico esecutivo per Luna Max

Data: 9 settembre 2026. Stato: piano pronto, correzioni non implementate.
Base verificata: `52c93698182374df7c7594b4e824bb7668d4fa2e`.
Questo incarico prosegue le implementazioni #15–#21 già presenti nel workspace;
non richiede di ripetere la migrazione UI né di installare altre dipendenze.

## Ordine e documenti da eseguire

| Passo | Piano completo                                                                  | Risultato richiesto                                                             |
| ----- | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------- |
| 1     | [#22 — Spaziature di modali e pannelli Album](issue-22-spaziature-ui.md)        | Ripristinare padding e separazione dei controlli senza tagliare il viewer.      |
| 2     | [#23 — Tipografia e impostazioni uniformi](issue-23-tipografia-impostazioni.md) | Font coerenti per ruolo e due preferenze booleane con checkbox ed etichetta.    |
| 3     | [#19 — Completamento tastiera](issue-19-completamento-tastiera.md)              | Abilitare i comandi già offerti dal motore e verificarli realmente nel browser. |
| 4     | Verifica finale di questo documento                                             | Tutte le regressioni coperte, nessuna perdita dei flussi foto già funzionanti.  |

L'ordine evita di testare la tipografia su contenitori ancora senza spazio e
misura lo zoom quando layout e font hanno già la forma definitiva.
Il terzo piano integra, non sostituisce, il [piano originale #19](issue-19-anteprima-zoom.md).
I nuovi piani prevalgono sui dettagli di presentazione incompatibili dei
piani precedenti; tutti gli altri requisiti confermati restano validi.

## Evidenze di partenza: non confonderle con una consegna riuscita

La verifica del 9 settembre ha trovato:

- #22: nella modale Aggiungi Contatto, padding esterno e del footer 0 px,
  titolo a circa 1 px dal bordo. Il nuovo contenitore è un div Radix;
  `dialog form` non seleziona più il contenuto. Il commento della stessa
  issue mostra anche la richiesta di consenso Album priva di spaziatura.
- #23: in rétro il font pixel è caricato, ma il select usa Arial, le label
  usano lo stack Inter e il comando notifiche ha solo il simbolo 🔕.
- #19: con area zoom focalizzata e geometria stabilizzata, il tasto `+`
  lascia invariata la scala; il pulsante Aumenta zoom la cambia. La
  configurazione omette `keyboard.disabled: false`.
- 71 test unitari e 24 E2E selezionati sono passati; 2 E2E erano saltati
  intenzionalmente in base al dispositivo. Build e typecheck passavano;
  lint produceva 6 warning. I test verdi NON coprivano questi tre difetti.

Questi sono risultati storici della diagnosi, non risultati delle correzioni
da fare. Riprodurre i difetti e aggiungere test fallenti prima di correggerli.
Non servono i file temporanei della diagnosi: ciascun piano descrive un
percorso riproducibile usando l'applicazione e i test del repository.

## Prima di iniziare

1. Leggere AGENTS.md, CONTEXT-MAP.md, frontend/CONTEXT.md e
   [ADR UI](../../frontend/docs/adr/0001-adapter-ui-shadcn-kibo.md).
2. Verificare `git status --short` e `git log -10 --oneline`. I piani e il
   glossario possono essere modifiche non committate dell'utente: preservarli.
3. Verificare che gli otto commit #17–#18B siano presenti. Alla diagnosi il
   main locale era avanti di 8 rispetto al main remoto; un clone del solo
   remoto potrebbe non avere i prerequisiti. Non ripartire dalla vecchia
   base `f3b7249` e non eseguire pull/reset per eliminare questa differenza.
4. Cercare tutti i chiamanti dei componenti che si modificano. Correggere
   l'adapter comune per tutte le modali, non solo Aggiungi Contatto.
5. Non modificare protocollo, crittografia, backend, persistenza Album,
   consensi o Tauri. Nessuna nuova libreria, framework UI o libreria di test.
6. Funzioni const, handler JSX nominati, HTML in ui, test nel **test** del
   proprietario con Given/When/Then. Conservare Redux come fonte delle
   preferenze; i soli flag transitori dell'interazione restano nella UI.

## Esecuzione dei controlli, senza interferenze tra processi

Dalla directory `frontend/`, completare PRIMA i comandi che rigenerano WASM:

```bash
npm test
npm run typecheck
npm run lint
npm run build
```

Poi avviare Playwright. Non lanciare build/typecheck/npm test mentre gli E2E
usano Vite: la rigenerazione di src/generated può provocare reload/HMR,
annullare interazioni e creare falsi errori di Sessione sicura. Durante la
diagnosi la riesecuzione con server pulito ha eliminato tali interferenze.
La configurazione Playwright avvia già backend e frontend locali; non usare
produzione né chiudere processi dell'utente per liberare le porte.

```bash
npm run test:e2e -- --project=chromium-desktop --grep 'Regressione UI|Album: anteprima|notifica|impostazioni'
npm run test:e2e -- --project=chromium-mobile --grep 'Regressione UI|Album: anteprima|notifica|impostazioni'
```

I nuovi test devono includere `Regressione UI` nel titolo. Un filtro che
seleziona zero test non è un successo. Infine eseguire la suite browser intera:

```bash
npm run test:e2e -- --project=chromium-desktop
npm run test:e2e -- --project=chromium-mobile
npm run format:check
git diff --check
```

Formattare soltanto i file toccati con il Prettier già installato. Se il
controllo globale trova problemi preesistenti, annotarli, non riformattare
l'intero repository di nascosto. Per mancanza di toolchain, browser o porte,
riportare il limite e non dichiarare completata una verifica non eseguita.

## Matrice visiva minima e criterio finale

Browser desktop e Chromium mobile emulato; viewport 320×740, 390×844 e
1280×900. Temi light, dark, retro. Per ogni combinazione verificare:

- impostazioni prima della creazione Identità e dopo;
- Aggiungi Contatto, impostazioni Contatto e conferma distruttiva annullata;
- richiesta di consenso Album e progresso, oltre al normale compositore;
- viewer con barre comandi visibili, zoom e chiusura accessibili.

Acquisire screenshot con attachment Playwright per la revisione visiva,
ma basare i test automatici su misure e comportamento. Non generare
snapshot attesi dal risultato difettoso solo per far passare la suite.
Test app native Android/iOS esclusi, come richiesto. Non equiparare mobile
emulato a hardware touch reale o app nativa.

La consegna è completa solo se i test nuovi erano rossi prima e sono verdi
dopo, le misure visive richieste passano e i flussi precedenti restano verdi.
Riportare file modificati, test eseguiti/esiti, warning preesistenti e limiti.
Non chiudere issue, pubblicare commenti, fare commit/push o deploy senza
autorizzazione distinta. La semplice menzione `#22` in un commit non è QA.

## Prompt da consegnare a Luna Max

> Leggi docs/plans/correzioni-ui-luna-max.md e i tre piani collegati.
> Implementa nell'ordine #22, #23 e completamento #19, partendo dal codice
> attuale e preservando il lavoro non committato. Prima aggiungi test che
> riproducano i difetti, poi correggi i componenti proprietari. Non aggiungere
> dipendenze e non rifare le issue già implementate. Esegui le verifiche
> indicate, senza build WASM concorrenti agli E2E. Escludi le app native.
> Consegna diff e risultati reali; non fare commit, push, deploy o modifiche
> GitHub. Se un controllo non è eseguibile, dichiaralo esplicitamente.

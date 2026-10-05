# Issue #23 — Tipografia coerente e impostazioni uniformi

Issue: https://github.com/ethos-adamas/tacitus/issues/23.
Base: `52c93698182374df7c7594b4e824bb7668d4fa2e`, più correzione #22.
Stato: piano esecutivo, correzione non implementata.
Secondo passo dell'[incarico Luna Max](correzioni-ui-luna-max.md).

## Risultato richiesto e decisione di presentazione

La stessa categoria di elementi deve usare il medesimo font del tema,
anche nei portali. Le due preferenze booleane delle impostazioni devono
avere lo stesso controllo, allineamento ed etichetta sempre visibile.

Scelta esecutiva: riusare CheckboxField sia per `Ricevi foto e album` sia
per `Notifiche`. È già disponibile, ha label cliccabile e non richiede un
nuovo switch. Tema rimane un select; Cancella dati rimane un'azione con
conferma. Non trasformare tutto il pannello in checkbox indiscriminatamente.

Conservare la decisione precedente sulla leggibilità: messaggi e campo
Messaggio NON diventano pixelati. Il difetto da correggere non è questa
distinzione intenzionale, ma il font browser casuale dei controlli e la
tipografia incoerente fra elementi UI equivalenti.

## File da leggere e modificare

| File sotto frontend                                        | Responsabilità                                                           |
| ---------------------------------------------------------- | ------------------------------------------------------------------------ |
| src/index.css                                              | Font per ruoli, ereditarietà dei controlli, layout preferenze.           |
| src/ui/kit/Fields.tsx                                      | CheckboxField e SelectField; inoltro associazione descrizione.           |
| src/ui/kit/Button.tsx, vendor/button.tsx, vendor/input.tsx | Verificare che non sovrascrivano la famiglia font; nessun nuovo wrapper. |
| src/ui/shell/AppHeader.tsx                                 | Sostituire bottone notifiche, conservando flusso del permesso.           |
| src/ui/shell/ThemeSelector.tsx                             | Stesse opzioni e valori, solo coerenza visuale/accessibile.              |
| src/ui/kit/SettingsPopover.tsx                             | Intestazione Impostazioni nel portale, da includere nel tema.            |
| src/application/hooks/useNotifications.ts                  | Leggere cambiaNotifiche e relative transizioni; non cambiarne l'API.     |
| src/infrastructure/notifications/notifications.ts          | Permessi e persistenza: riuso, nessun accesso duplicato dalla UI.        |
| src/ui/kit/EmojiPicker.tsx                                 | Mantenere la mappatura dark/retro del Web Component.                     |
| src/ui/shell/**test**/AppHeader.test.tsx                   | Aggiungere test stato/permessi delle due preferenze.                     |
| src/ui/shell/**test**/ThemeSelector.test.tsx               | Conservare selezione tema e assenza di effetti sulle altre preferenze.   |
| e2e/messaggistica.spec.ts                                  | Aggiornare locator notifiche e aggiungere verifica tipografica.          |

Ricerca preventiva:

```bash
rg -n 'font-family|font:|Press Start|Georgia|CheckboxField|Abilita notifiche|Disattiva notifiche|cambiaNotifiche' frontend/src frontend/e2e
```

## 1. Stabilire un contratto tipografico minimo

Definire in index.css, nel layer base, due variabili proprietarie della UI:

```css
:root {
  --font-ui: Inter, ui-sans-serif, system-ui, sans-serif;
  --font-reading: Inter, ui-sans-serif, system-ui, sans-serif;
  font-family: var(--font-ui);
}
:root[data-theme="retro"] {
  --font-ui: "Press Start 2P", ui-monospace, monospace;
}
```

Integrare queste dichiarazioni nei blocchi esistenti, non creare radici
concorrenti in fondo al file. Dark mantiene gli stessi font di light;
palette, scelta tema, persistenza e font locale già installato non cambiano.

| Ruolo                                                     | Font da applicare                                                          |
| --------------------------------------------------------- | -------------------------------------------------------------------------- |
| Brand, titoli, label, testo di pulsanti, select e opzioni | var(--font-ui).                                                            |
| Testo digitato in Nickname e altri campi UI ordinari      | var(--font-ui), salvo campi identificatori.                                |
| Messaggi della cronologia e textarea Messaggio            | var(--font-reading).                                                       |
| Descrizioni lunghe, aiuti, errori e contatori             | var(--font-reading), coerente fra schermate.                               |
| Tacitus ID e altri elementi code                          | Stack monospace già presente, per riconoscere i caratteri.                 |
| Griglia emoji/icone                                       | Rendering del componente/icon font, non forzare i glifi con il font pixel. |

Implementazione CSS:

1. Includere select nella regola esistente di ereditarietà:
   `button, input, textarea, select { color: inherit; font: inherit; }`.
   Le utilities continuano a definire dimensioni/padding: non usare una
   regola unlayered `font: inherit !important` che cancelli tutto.
2. Esplicitare font-family var(--font-ui) sui titoli e sugli adapter dei
   controlli se un loro antenato usa il font di lettura. Non copiare lo
   stesso selettore per ogni schermata: raggruppare i ruoli nel CSS UI.
3. Rimuovere il vecchio blocco rétro che elenca solo brand/h1/h2/h3/button:
   è sostituito dal contratto, non deve rimanere come seconda fonte.
   Conservare gli override rétro di colori e bordi squadrati.
4. Gli shorthand `font: ... Georgia` di identity-card h1 e dialog-title h2
   sovrascrivono la famiglia: separarli in font-size, font-weight e
   line-height, preservando quelle misure e usando var(--font-ui).
5. Applicare il font di lettura esplicitamente a `.message p`,
   `.message-input textarea`, `.message-input > small`, `.modal-description`,
   aiuti `.settings-help` e testi/avvisi dei pannelli Album. Per testo
   descrittivo ContactSettingsDialog usare una classe locale coerente,
   senza cambiare il consenso o le parole mostrate.
6. Sui label di CheckboxField/SelectField e sull'intestazione di
   SettingsPopover usare sempre var(--font-ui). Anche DownloadLink è un
   comando: usare la stessa famiglia dei button, non trattarlo come testo
   di un messaggio solo perché è un anchor.

Non introdurre nuovi font, richieste Google Fonts, nuove scale tipografiche
o un tema diverso. Non applicare `* { font-family: ... }`: annullerebbe
le eccezioni necessarie per messaggi, codice ed emoji.

## 2. Due preferenze con la stessa presentazione

In AppHeader, mantenere l'ordine Tema → Ricevi foto e album → Notifiche →
Cancella dati. Sostituire il Button contenente soltanto 🔔/🔕 con:

```tsx
<CheckboxField
  id="notifications-setting"
  label="Notifiche"
  checked={notifiche.abilitate}
  disabled={notificationsDisabled}
  onCheckedChange={changeNotifications}
  descriptionId="notifications-help"
/>
```

Questo è markup di progetto: introdurre i due identificatori e l'handler
nominato nel componente, non copiarli come variabili globali o aggiungere
un nuovo modulo di impostazioni.

Estendere CheckboxField con la sola prop opzionale `descriptionId?: string`,
inoltrata a `aria-describedby` su Checkbox.Root. Renderizzare il testo
di aiuto in AppHeader come p con id notifications-help e classe settings-help.
Label sempre `Notifiche`, non alternare il nome accessibile fra Abilita e
Disattiva: checked rappresenta lo stato. Nessuna icona isolata residua.

Entrambe le righe riusano checkbox-field/checkbox-control: checkbox a sinistra,
testo a destra, riga almeno 44 px e gap .55rem. Checkbox compatta, spazio
cliccabile nel label. Il testo va a capo senza restringere il controllo.
L'aiuto ha margine 0, font di lettura e non entra nel nome accessibile.

## 3. Preservare permessi, errori e persistenza notifiche

Non creare uno stato locale `enabled` e non cambiare direttamente Redux
dall'handler: chiamare `cambiaNotifiche()` che già possiede il flusso.

| Stato                  | Checkbox                               | Aiuto visibile                                                   |
| ---------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| default, non abilitate | Deselezionata e disponibile            | «Attivando Notifiche, il browser può chiedere il permesso.»      |
| granted                | Selezionata secondo Redux, disponibile | «Le notifiche sono disponibili mentre l'applicazione è aperta.»  |
| denied                 | Non disponibile                        | «Notifiche bloccate: consentile nelle impostazioni del browser.» |
| unsupported            | Non disponibile                        | «Notifiche non supportate in questo ambiente.»                   |
| richiesta in corso     | Disabilitata, checked ancora da Redux  | «Richiesta del permesso…»                                        |

Implementare `changeNotifications(nextChecked: boolean)`:

1. Se valore uguale a notifiche.abilitate, permesso denied/unsupported o
   operazione già pendente, non fare nulla.
2. Usare un ref pending come guardia sincrona contro invocazioni ravvicinate
   e uno state UI pending per il disabled; nessun sistema di richieste nuovo.
3. Impostare pending prima dell'await; chiamare cambiaNotifiche una volta.
4. Catch conserva la segnalazione esistente con erroreMostrato; nessuna
   selezione ottimistica da ripristinare. Finally rilascia guardia e flag.
5. Se il permesso viene rifiutato, il controllo rimane spento e mostra
   il motivo. Disattivare dopo granted non deve chiedere altri permessi.

Non attivare notifiche alla semplice apertura delle impostazioni, al cambio
tema o durante il render. La preferenza foto continua a usare la sua azione
ricezioneFotoCambiata, indipendente dalle notifiche.

## 4. Test di comportamento, prima e dopo

Estendere AppHeader.test.tsx con Provider/store e mock dell'adapter notifiche;
esercitare l'hook reale. Preparare il permesso nello store tramite l'azione
notificheConfigurate. Promise controllata per la richiesta pendente.

| Given                | When                     | Then                                                                |
| -------------------- | ------------------------ | ------------------------------------------------------------------- |
| Impostazioni chiuse  | Aprirle                  | Due checkbox con label visibile; zero richieste permesso.           |
| Permesso default     | Click su label Notifiche | Una richiesta, stato da Redux dopo risposta granted.                |
| Richiesta pendente   | Seconda interazione      | Nessuna seconda richiesta, controllo disabilitato.                  |
| Risposta denied      | Fine richiesta           | Deselezionata, disabilitata, motivo collegato con aria-describedby. |
| Permesso unsupported | Aprire pannello          | Controllo disabilitato e aiuto visibile, nessuna chiamata.          |
| Notifiche abilitate  | Deselezionarle           | Stato false e persistenza aggiornata, zero nuovi prompt.            |
| Preferenze diverse   | Cambiare foto o tema     | Le notifiche non cambiano accidentalmente.                          |
| Errore adapter       | Attendere fine           | Stato non inventato, feedback presente, pending terminato.          |

Verificare associazione label e descrizione anche in un test di CheckboxField
nel suo `__test__/`, senza duplicare l'intera suite dei componenti Radix.

Aggiornare gli E2E che cercano button Abilita notifiche:
`getByRole('checkbox', { name: 'Notifiche', exact: true }).check()`.
Ricercare tutti i riferimenti, inclusi il test di consenso notifiche e
quello delle impostazioni sotto l'ingranaggio. Conservare il fake
Notification già presente e le asserzioni su numero di permessi/notifiche.
Un nuovo locator non deve diventare un pretesto per eliminare lo scenario.

## 5. Test browser dei font e layout

Aggiungere `Regressione UI #23: font e preferenze coerenti` agli E2E.
Aprire le impostazioni, selezionare retro, attendere document.fonts.ready
e controllare document.fonts.check per il font locale. Leggere lo stile
computato dell'elemento select, non soltanto quello del label.

Asserire che select, label delle due checkbox, intestazione Impostazioni
e testo dei comandi abbiano Press Start 2P come prima famiglia; messaggio
e textarea non devono averlo. Lo stesso controllo in light/dark deve
risolvere lo stack UI ordinario. Fare un cambio retro → light → dark →
retro per escludere stili rimasti dal tema precedente.

Verificare anche portali di Aggiungi Contatto e impostazioni Contatto,
schermata iniziale e DownloadLink nel viewer. Sul select nativo non
pretendere che il popup disegnato dal sistema abbia pixel identici:
testare il controllo chiuso e la famiglia CSS delle option.

A 320/390/1280 px: nessun overflow pagina, etichette delle preferenze
leggibili, allineamento delle checkbox invariato e target almeno 44 px.
Non ridurre il font sotto 12 px per mascherare un problema di layout;
consentire wrapping delle label e toolbar. Non comprimere messaggi o ID
nel font pixel per ottenere un test apparentemente «uniforme».

Da frontend, seguendo l'ordine dei controlli nell'incarico principale:

```bash
npm test -- src/ui/shell/__test__ src/ui/kit/__test__ src/infrastructure/theme/__test__
npm run typecheck
npm run lint
npm run build
npm run test:e2e -- --grep 'Regressione UI #23|notifica|impostazioni|tema segue'
```

Done: difetto Arial assente, due preferenze coerenti e test permessi
preservati; font leggibili nei ruoli di lettura, nessun nuovo servizio
di impostazioni. Ripetere le misure #22 con il font rétro definitivo.

# Issue #18 — Adapter UI e temi, in due fasi

Issue: https://github.com/ethos-adamas/tacitus/issues/18.
Stato: piano esecutivo, implementazione non eseguita.
Base analizzata: `f3b724928e6b48078ec6117d7d036992e67021a8`.
Decisione architetturale: [ADR 0001](../../frontend/docs/adr/0001-adapter-ui-shadcn-kibo.md).
Regole di consegna: [indice](README.md).

## Sequenza vincolante

Fase A dopo #17: integrare la base UI e rendere disponibile il confine locale.
Fase B dopo #19, #16, #15, #20 e #21: terminare migrazione, tema rétro e
selezione nelle impostazioni. NON chiudere #18 dopo A e NON creare una
dipendenza circolare tra issue intere: le altre issue dipendono dalla fase A,
non dal completamento della #18.

Ambito: tutte le schermate, inclusi Identità iniziale, Contatti, impostazioni,
Conversazione, Album, feedback ed Error Boundary. Le primitive vengono da
shadcn/UI, i componenti composti pertinenti da Kibo; HTML semantico e layout
restano nella UI di Tacitus. Non sostituire ogni div con un wrapper vuoto.

## Evidenze e scelte tecniche

Il progetto usa React 19, Vite 8, TypeScript 6, Redux e CSS proprietario,
senza Tailwind o shadcn. Kibo distribuisce sorgenti di componenti, non impone
un runtime globale, e richiede la base shadcn con variabili CSS:
[setup ufficiale](https://www.kibo-ui.com/docs/setup).

Usare sorgenti shadcn adattati localmente e Kibo Dropzone per #21.
Per #19, Kibo Image Zoom racchiude react-medium-image-zoom e non documenta
il controllo continuo richiesto: usare Modal shadcn + motore
react-zoom-pan-pinch, isolato nell'adapter PhotoViewer.
Non installare due motori di zoom per la stessa immagine. Vedere il
[sorgente Kibo verificato](https://github.com/haydenbleasel/kibo/blob/3d63cdb15b79d972e3dc38a10997987672f9b263/packages/image-zoom/index.tsx).

Versioni verificate sul registro npm durante la pianificazione (7 settembre
2026), da fissare nel lockfile, senza aggiornamenti indiscriminati:

| Momento     | Dipendenze                                                                                             |
| ----------- | ------------------------------------------------------------------------------------------------------ |
| A, sviluppo | tailwindcss 4.3.3, @tailwindcss/vite 4.3.3                                                             |
| A, runtime  | radix-ui 1.6.7, class-variance-authority 0.7.1, clsx 2.1.1, tailwind-merge 3.6.0, lucide-react 0.545.0 |
| #19         | react-zoom-pan-pinch 4.2.0                                                                             |
| #21         | react-dropzone 14.3.8                                                                                  |
| B, font     | @fontsource/press-start-2p 5.3.0                                                                       |

Non installare ora le dipendenze delle fasi successive. Non usare --force o
--legacy-peer-deps per mascherare incompatibilità. In caso di registry
cambiato, confrontare tipi e peer dependency prima di cambiare versioni.
La compatibilità di dichiarazioni e peer non equivale a test di integrazione.

## Fase A.1 — Configurazione senza sostituire il progetto

Leggere `frontend/package.json`, `vite.config.ts`, `tsconfig.app.json`,
`tsconfig.node.json`, `index.css`, `src/ui/contacts/AddContactDialog.tsx`
e `ConversationList.tsx`, poi:

```bash
npm install --save-exact radix-ui@1.6.7 class-variance-authority@0.7.1 clsx@2.1.1 tailwind-merge@3.6.0 lucide-react@0.545.0
npm install -D --save-exact tailwindcss@4.3.3 @tailwindcss/vite@4.3.3
```

Comandi dalla directory frontend. Integrare `tailwindcss()` nei plugin
Vite mantenendo React, Vitest, proxy /ws, test include e ogni altra opzione.
Aggiungere alias `@` con
`fileURLToPath(new URL('./src', import.meta.url))` da `node:url`.
In tsconfig.app aggiungere `paths: { "@/*": ["./src/*"] }`, senza
`baseUrl`. I percorsi sono relativi al tsconfig:
[documentazione TypeScript](https://www.typescriptlang.org/tsconfig/paths.html).

Creare `frontend/components.json` con schema shadcn, stile `new-york`,
rsc false, tsx true, Tailwind config vuota (v4), css `src/index.css`,
baseColor `neutral`, cssVariables true, iconLibrary `lucide`.
Alias: components `@/ui/kit/vendor`, ui `@/ui/kit/vendor`,
utils `@/ui/kit/classNames`, hooks `@/application/hooks`,
lib `@/ui/kit`. Nessuna cartella generica lib/utils.

Seguire l'[integrazione Vite ufficiale](https://ui.shadcn.com/docs/installation/vite)
solo per configurazione: NON copiare la sostituzione completa del CSS o
della demo App. Aggiungere manualmente i soli sorgenti registry necessari
(button, input, textarea, native-select, checkbox, dialog, alert-dialog,
popover), al momento del loro primo utilizzo. In A servono button, input,
dialog e alert-dialog; le conferme vanno verificate in un test renderizzato.
Gli altri contratti sotto sono fissati qui, ma il relativo file vendor può
essere creato dal primo piano che lo usa.

Prendere i sorgenti dal registry new-york-v4, per esempio
[Button](https://ui.shadcn.com/r/styles/new-york-v4/button.json) e
[Dialog](https://ui.shadcn.com/r/styles/new-york-v4/dialog.json).
Conservare attribuzione/licenza e registrare URL/versione o commit del
sorgente importato in `ui/kit/vendor/README.md`.
Riscrivere import interni ai percorsi locali e `cn` a classNames:
non installare il package omonimo `cn` eventualmente suggerito dal registry.
Convertire function declarations in const e nominare handler JSX.
Eliminare animazioni vendor se richiedono un'altra dipendenza solo estetica.

## Fase A.2 — CSS e token

Importare tema e utilities Tailwind, non Preflight. Questa modalità è
[documentata da Tailwind](https://tailwindcss.com/docs/preflight).
Usare l'ordine `@layer theme, base, components, utilities;` e import
`tailwindcss/theme.css` nel layer theme, `tailwindcss/utilities.css`
nel layer utilities. Spostare le regole CSS preesistenti, senza riscriverne
i valori, dentro `@layer base`: le utilities devono poter prevalere sulle
regole generali per input e button. Lasciarle fuori dai layer le renderebbe
più forti delle utilities.

Le regole legacy con !important rimangono solo per controlli non migrati:
NON passare classi `primary`, `danger`, `icon-action` con override
conflittuali ai nuovi adapter; rimuoverle dal chiamante migrato.
I controlli vendor devono impostare esplicitamente padding, bordo e
background necessari, perché Preflight è assente. Conservare box-sizing
globale e focus accessibile. Verificare stili computati, non solo screenshot.

In `@theme inline` mappare:

| Token utilities                                                         | Valore Tacitus      |
| ----------------------------------------------------------------------- | ------------------- |
| --color-background, --color-card, --color-popover                       | var(--surface)      |
| --color-foreground, --color-card-foreground, --color-popover-foreground | var(--text)         |
| --color-primary                                                         | var(--green)        |
| --color-primary-foreground                                              | var(--on-green)     |
| --color-secondary, --color-muted                                        | var(--surface-soft) |
| --color-secondary-foreground                                            | var(--text)         |
| --color-muted-foreground                                                | var(--muted)        |
| --color-accent                                                          | var(--pale)         |
| --color-accent-foreground                                               | var(--text)         |
| --color-border, --color-input                                           | var(--line)         |
| --color-ring                                                            | var(--focus)        |
| --color-destructive                                                     | var(--danger)       |

Attenzione: legacy `--input` è SFONDO, legacy `--muted` è TESTO;
non rinominarli implicitamente a significato shadcn. I campi usano lo
sfondo `var(--input)`; il loro bordo usa `--color-input`.
Per Button danger preferire bordo/testo danger su surface, evitando di
assumere che testo bianco contrasti con tutte le palette.
Definire `--radius: .5rem` e token radius derivati che non diventino
negativi con radius zero. Nessun nuovo colore chiaro/scuro in A.
Definire la variante dark sulle radici `.dark`; in A applyTheme mantiene
data-theme e sincronizza `.dark` senza cambiare scelta/persistenza.

## Fase A.3 — Contratti locali condivisi

Directory `frontend/src/ui/kit/`; i chiamanti importano solo questi file.
`vendor/` non si importa da altre schermate. Nessun adapter dipende da
Redux, relay o persistenza. Non esporre genericamente tutta l'API Radix.

| File ed export                       | Contratto                                                                                                                                                                       |
| ------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Button.tsx: Button                   | Props native button + variant primary/secondary/danger/ghost. Default type button, default variant secondary. Ref inoltrato. I form dichiarano type submit esplicito.           |
| Button.tsx: DownloadLink             | Props native a, presentazione come Button secondary; non annidare a in button. Introdotto in #19.                                                                               |
| Fields.tsx: TextInput, TextArea      | Props native dell'elemento, inclusi ref, value, onChange, onPaste, onSelect, disabled e aria-*.                                                                                 |
| Fields.tsx: SelectField              | Props native select e children option. NativeSelect shadcn, mapping size interno senza sostituire il tipo HTML size con una stringa pubblica.                                   |
| Fields.tsx: CheckboxField            | label string, checked boolean, onCheckedChange(boolean), disabled opzionale, id opzionale. useId se manca; scartare indeterminate al confine vendor, senza convertirlo in true. |
| Modal.tsx: Modal                     | open boolean, onOpenChange(boolean), trigger ReactElement, title string, description opzionale, children, footer opzionale, size standard/image.                                |
| ConfirmDialog.tsx: ConfirmDialog     | trigger ReactElement, title, description, confirmLabel, onConfirm(): void oppure Promise<void>. Stato apertura/pending/errore interno.                                          |
| SettingsPopover.tsx: SettingsPopover | trigger ReactElement, children; apertura locale, portale e gestione focus Radix; introdotto in B.                                                                               |

`classNames.ts` contiene soltanto `cn(...inputs)` con clsx + twMerge;
appartiene all'adapter UI, non è un modulo generico dell'applicazione.
Le varianti app definite sopra vengono tradotte a quelle vendor nel
rispettivo adapter. Evitare barrel che importi eager tutto il catalogo.

Modal: Radix Root controllato, Trigger asChild, Portal su document.body,
overlay fisso `inset:0`, sfondo var(--backdrop), blur 3 px, z-index 50;
content sopra, centrato, standard width min(500px, viewport - 2rem),
max-height calc(100dvh - 2rem), overflow-y auto. Image usa il layout #19.
Titolo/descrizione collegati semanticamente; bottone `Chiudi`.
Focus trap, Escape, clic sfondo e ritorno al trigger. Il portale è necessario:
.app-shell è trasformato e taglia contenuto/stacking context.

ConfirmDialog: AlertDialog, focus iniziale su `Annulla`, conferma danger,
nessuna conferma con clic sullo sfondo. Handler conferma nominato:
preventDefault sull'Action per evitare chiusura anticipata, pending true,
await onConfirm, chiudere solo al successo. Catch mostra errore inline
role alert nella conferma, non dietro l'overlay. Disabilitare doppio click
e annullamento durante pending. Una conferma annidata deve stare sopra la
modale chiamante e tornare al suo trigger quando annullata.

## Fase A.4 — Prima integrazione verificabile

Migrare AddContactDialog e il trigger nella ConversationList:
passare il bottone esistente come prop trigger, lasciando un solo bottone;
mantenere il controllo open/onClose attuale, mappando onOpenChange(false)
all'handler close che svuota l'input. Rimuovere dialogRef/showModal/close
nativi, non affiancare due sistemi modali. Usare Modal, TextInput, Button;
conservare form submit, validazione del Tacitus ID e limite Intenti.
Mostrare gli errori del submit anche dentro la modale in modo accessibile;
non cambiare il significato del feedback applicativo.

Test `ui/kit/__test__/Modal.test.tsx` e `ConfirmDialog.test.tsx`:
nome, apertura/chiusura, annullamento non chiama onConfirm, doppia conferma
non duplica, rigetto mantiene aperto con errore, successo chiude.
Focus reale/trap e layout si verificano in Playwright, non con rettangoli JSDOM.
Test `ui/contacts/__test__/AddContactDialog.test.tsx`: submit valido,
ID errato senza chiusura, chiusura e riapertura con campo vuoto.

Gate A: stessi temi e stessa funzionalità, nessun selettore nuovo; app build
e test esistenti passano. Ora #19/#16/#15 possono usare questi contratti.

## Fase B.1 — Inventario e migrazione completa

Eseguire `rg -n '<(button|input|textarea|select|dialog|details|summary)|confirm\\(' frontend/src/ui`.
Migrare una schermata alla volta, verificandola prima della successiva:

| Area                                             | Modifica richiesta                                                                                                                                |
| ------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| IdentitySetup                                    | TextInput e Button; sostituire toggle tema con impostazioni descritte sotto. Preservare validazione nickname e autofocus.                         |
| AppHeader                                        | Button per copia ID/notifiche; CheckboxField per foto; SettingsPopover per impostazioni; ConfirmDialog per Cancella dati.                         |
| ConversationList                                 | Button nelle righe Contatto, intenti, sblocco e aggiunta; conservare grid/allineamento attraverso className e non default inline-flex.            |
| Conversation                                     | Button per ritorno e Riattiva; ContactSettingsDialog già da #16.                                                                                  |
| Album e MessageComposer                          | Controlli #15, SelectField per consenso, PhotoViewer #19 e PhotoDropzone #21; non ripristinare i vecchi componenti.                               |
| EmojiComposer                                    | TextArea, Button per emoji/suggerimenti/invio; isolare il picker Web Component in EmojiPicker locale, conservando algoritmo e ref della textarea. |
| Feedback                                         | Controllo chiusura con Button; stesso feedback Redux e ruoli; portale su body per non essere nascosto dalle modali.                               |
| AppErrorBoundary                                 | Button ricarica senza dipendenza Redux; rimane class component.                                                                                   |
| Brand, ApplicationView, AuthenticatedApplication | Colori/token e layout coerenti; nessun wrapper artificiale per elementi semantici.                                                                |

Il file input nascosto di PhotoPicker rimane HTML nativo nell'adapter/UI,
non è un campo testuale da forzare in TextInput. Anche progress, time,
article, label, option e immagini restano elementi semantici.
Aggiornare `rg` fino a lasciare soltanto queste eccezioni motivate e HTML
interno agli adapter. Non trasformare questa migrazione in un nuovo router.

Creare `ui/kit/EmojiPicker.tsx` con props `{ theme: Tema, dataSource: string,
onChoose: (unicode: string) => void }`. Spostare qui import dinamico di
emoji-picker-element, contenitore/ref, creazione e cleanup del Web Component;
validare detail.unicode al suo confine. EmojiComposer continua a possedere
apertura, selectionRef, suggerimenti e inserimento: renderizza EmojiPicker
solo quando visibile, passando EMOJI_DATA_SOURCE e un handler nominato.
La mappatura tema descritta sotto vive nel nuovo adapter. Non spostare la
ricerca emoji o il testo del messaggio nel kit. Gli import di librerie UI
esterne devono risultare confinati al kit anche per questo componente.

CheckboxField deve mantenere tutti i criteri #17: testo cliccabile, una
sola modifica per click, allineamento, focus e area 44 px. Eliminare gli
stili della #17 solo se davvero sostituiti dal layout dell'adapter.

Feedback su body: riusare la sua UI e lo stato, aggiungere createPortal e
un livello sopra le modali; se una modale rende il resto aria-hidden,
mantenere anche gli errori dell'azione nel suo contenuto come già prescritto.
Non introdurre una libreria toast per questo spostamento.

## Fase B.2 — Scelta tema e compatibilità

Leggere domain/preferenze.ts, infrastructure/theme/theme.ts e test,
application/store/temaSlice.ts, application/hooks/useTheme.ts e tutti
i chiamanti di `state.tema`, `useTema`, `nextTheme`.

Definire:

```ts
type Tema = "light" | "dark" | "retro";
type SceltaTema = Tema | "system";
type TemaState = { scelta: SceltaTema; effettivo: Tema };
```

La scelta `system` conserva il comportamento iniziale già presente e
permette di tornarvi esplicitamente. Lo stato Redux contiene scelta ed
effettivo; listener matchMedia resta fuori dallo store.
Azioni `sceltaTemaCambiata({ scelta, effettivo })` e
`temaDiSistemaCambiato(tema: 'light' | 'dark')`: la seconda aggiorna
effettivo solo se scelta è system.

Nell'adapter theme mantenere chiave `tacitus.v3.theme`.
`loadThemeChoice(): SceltaTema` valida l'ingresso storage una volta:
light/dark/retro riconosciuti; null o valore sconosciuto => system.
`saveThemeChoice(scelta)`: system rimuove la chiave, altri la scrivono.
Se storage non è accessibile, usare system al caricamento; al salvataggio
segnalare che la scelta vale solo nella sessione, mantenendo UI e Redux
coerenti senza crash. Non cambiare chiavi della persistenza crittografica.

`resolveTheme(scelta, systemDark)` è pura, opera su SceltaTema già validata.
`applyTheme(tema)` imposta data-theme, classe dark per dark/retro,
color-scheme coerente via CSS. Eliminare nextTheme/followsSystemTheme
quando tutti i chiamanti sono migrati.

`useTheme`: inizializza scelta dall'adapter, ascolta matchMedia e pulisce
il listener; gli eventi del sistema non devono sovrascrivere una scelta
esplicita. `useTema` espone
`{ tema, scelta, selezionaTema(scelta): void }`; sincronizza Redux e DOM
subito, persiste attraverso l'adapter con gestione errore.
Aggiornare i selector della Conversation/MessageComposer a effettivo.

Creare `ui/shell/ThemeSelector.tsx`: SelectField label `Tema`,
opzioni `Sistema`, `Chiaro`, `Scuro`, `Rétro`, valori system/light/dark/retro.
Handler change nominato valida il valore DOM al confine prima di chiamare
selezionaTema. Nessun toggle residuo.

AppHeader lo mostra soltanto dentro Impostazioni. Prima della creazione
Identità, un pulsante `Impostazioni` nella posizione dell'attuale toggle
apre SettingsPopover contenente lo stesso ThemeSelector, senza comandi
che richiedono un'Identità. Nessun selettore visibile permanentemente.

## Fase B.3 — Tema rétro confermato

Direzione approvata: quasi nero, verde fosforo, bordi squadrati, font 8-bit
nei titoli/comandi; testo dei messaggi facilmente leggibile. Nessun effetto
lampeggiante, scanline, suono o animazione aggiuntiva.

Aggiungere `:root[data-theme='retro']`:

| Token                             | Valore                    |
| --------------------------------- | ------------------------- |
| --page, --surface, --surface-soft | #050805, #0a100a, #101b10 |
| --input, --text, --muted          | #071007, #d7ffd7, #91ba91 |
| --green, --on-green, --pale       | #7cff6b, #061006, #143014 |
| --line, --focus                   | #527852, #adff98          |
| --danger, --error, --success      | #ffb4a8, #632b25, #195d31 |
| --avatar, --avatar-text           | #183a18, #adff98          |
| --backdrop                        | #020502cc                 |
| --card-shadow, --shell-shadow     | none, none                |
| --radius                          | 0px                       |

Palette di implementazione da verificare per contrasto sulle coppie
effettivamente usate; aggiustare solo il valore responsabile se non passa
4.5:1 per testo normale e 3:1 per controlli/focus. Non usare il solo colore
per errore, selezione o stato online. Mantenere testi/icone identificabili.

Installare il font della tabella e importare solo
`@fontsource/press-start-2p/latin-400.css`, servito localmente, non Google
Fonts remoto. [Fontsource](https://fontsource.org/fonts/press-start-2p)
documenta il pacchetto e i subset; controllare lettere accentate italiane.
Applicarlo a brand/titoli e comandi principali con fallback monospace;
messaggi, textarea, ID e testi lunghi rimangono system/monospace leggibili.
Dimensioni non inferiori a quelle che consentono lettura e target 44 px;
consentire wrapping dei comandi lunghi invece di tagliarli.

Molti radius legacy sono hardcoded: per retro aggiungere override
circoscritti a card, shell, messaggi, campi, pulsanti e pannelli emoji;
non azzerare indiscriminatamente ogni elemento (indicatori restano leggibili).
Per il picker emoji mappare retro a classe dark e personalizzare le sue
variabili CSS documentate già usate nel repo (border-color, border-radius,
indicator-color). Non passare la classe retro come se il vendor la supportasse.
Garantire leggibilità del suo contenuto anche se conserva la palette dark.

## Test e criteri di completamento

Unit/component, Given When Then:

- Adapter: forwarding ref/aria/disabled, type button predefinito e submit
  esplicito, checkbox boolean e label, errori di conferma.
- `infrastructure/theme/__test__/theme.test.ts`: vecchie scelte light/dark,
  retro, null/valore sconosciuto, system, storage non disponibile e classe DOM.
- `application/store/__test__/tema.test.ts`: cambiamenti sistema
  aggiornano solo la scelta system.
- `ui/shell/__test__/ThemeSelector.test.tsx`: opzioni, azione corretta,
  nessuna modifica a ricezione Album/notifiche.
- Test esistenti IdentitySetup/AppHeader: aggiornare contratti hook e
  selector, senza rimuovere le verifiche delle funzionalità precedenti.

E2E: aggiornare il test `il tema segue il sistema e può essere cambiato`
e ogni locator `Passa al tema`. Nuovo percorso: Impostazioni → Tema.
Testare prima/dopo creazione Identità, selezionare i tre temi e fare reload;
con system emulare cambio prefers-color-scheme, con retro lo stesso cambio
deve lasciare retro. Verificare che non esistano selettori esterni al pannello.

Matrice browser: 320, 390, 1280 px × light/dark/retro.
Aprire schermata Identità, lista Contatti, impostazioni generali e Contatto,
conferma, chat con testo lungo/Album, picker emoji, viewer, feedback.
Verificare focus, contrasto, scroll, no overflow, tema nei portali e nessuna
richiesta remota di font/foto. Rifare #17 e i gesti #19 dopo la migrazione.

Comandi da frontend, in A con test pertinenti e in B suite completa:

```bash
npm test
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:e2e -- --project=chromium-desktop
npm run test:e2e -- --project=chromium-mobile
```

I test nativi Android/iOS sono esclusi. Non disabilitare sicurezza/CSP o
modificare Tauri per far passare test browser.
Commit consigliati A: tooling/token; adapter e test; AddContactDialog.
Commit B: controlli per schermata; modello tema/test; selettore e retro;
regressioni e rimozione stili inutilizzati. La #18 è finita soltanto dopo B:
tutte le schermate migrate e temi verificati, non solo un campione.

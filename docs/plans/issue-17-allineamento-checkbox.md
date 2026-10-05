# Issue #17 — Allineamento di «Ricevi foto e album»

Issue: <https://github.com/ethos-adamas/tacitus/issues/17>.
Stato: piano esecutivo, implementazione non eseguita.
Codice di riferimento: `f3b724928e6b48078ec6117d7d036992e67021a8`.
Posizione: prima issue, prima della fase A della #18.
Prerequisiti funzionali: nessuno; non richiede Kibo o shadcn/UI.

Regole generali e prerequisiti ambiente: [indice dei piani](README.md).
Le verifiche delle app native sono escluse da questo ciclo; usare il browser.

## Obiettivo e risultato atteso

Nel pannello Impostazioni, mostrare la checkbox e il testo «Ricevi foto e
album» affiancati e centrati verticalmente. Il testo deve rimanere associato
al controllo: un clic sul testo cambia la preferenza, come un clic sulla
checkbox. Il controllo deve continuare a funzionare con tastiera e touch.

La modifica riguarda la disposizione del controllo. Lo stato della ricezione,
i consensi per Contatto, la persistenza e il trasferimento degli Album usano
il comportamento esistente.

## Letture obbligatorie per l'esecutore

Leggere le istruzioni `AGENTS.md` e `docs/agents/domain.md`, quindi:

| File                                                | Cosa verificare                                                                                          |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------- |
| `frontend/src/ui/shell/AppHeader.tsx`               | Il `label` della ricezione foto, `fotoAbilitate` e `togglePhotos`.                                       |
| `frontend/src/index.css`                            | Le regole generali `form, label`, `input, textarea` e quelle di `.settings-panel`.                       |
| `frontend/src/ui/shell/__test__/AppHeader.test.tsx` | Il test esistente del componente.                                                                        |
| `frontend/src/application/store/albumSlice.ts`      | La preferenza `abilitate` e l'azione `ricezioneFotoCambiata`, soltanto per comprenderne il collegamento. |

## Causa nel codice attuale

`AppHeader` contiene un `label` senza classe specifica, con un `input`
checkbox seguito dal testo. Il foglio di stile applica `display: grid` a
tutti i `label` senza dichiarare due colonne; inoltre applica `width: 100%`
e padding da campo testuale a tutti gli `input`.

Per risolvere questo caso, dare alla riga un nome specifico e correggerne il
layout e le dimensioni del controllo. Le regole globali servono anche ai
campi Nickname e Tacitus ID: non modificarle per questa issue.

## Implementazione passo per passo

1. In `AppHeader.tsx`, individuare il `label` che contiene esattamente il testo
   `Ricevi foto e album`. Aggiungere `className="photo-reception-setting"`.
   Conservare l'`input` dentro il `label`, `type="checkbox"`,
   `checked={fotoAbilitate}` e `onChange={togglePhotos}`. Conservare il testo
   visibile, che fornisce anche il nome accessibile del controllo.
2. In `index.css`, vicino alle regole `.settings-panel`, aggiungere gli stili
   specifici riportati sotto. La riga ha un'area cliccabile alta almeno
   `2.75rem`; il controllo rimane compatto e il testo può andare a capo.
3. Non aggiungere handler al `label`: l'associazione HTML inoltra già il clic
   al controllo. Un secondo handler rischierebbe di invertire due volte lo
   stato. Non sostituire l'`input` con un simbolo o un `div` cliccabile.
4. Controllare nei due temi che focus e checkbox rimangano visibili. Riutilizzare
   la regola `input:focus-visible` già presente, senza colori nuovi.
5. Verificare il risultato nel browser con la procedura seguente e controllare
   che il diff contenga soltanto la classe aggiunta e gli stili necessari.

Stili previsti:

```css
.photo-reception-setting {
  display: flex;
  align-items: center;
  gap: 0.55rem;
  min-height: 2.75rem;
  cursor: pointer;
}

.photo-reception-setting input[type="checkbox"] {
  width: 1rem;
  height: 1rem;
  flex-shrink: 0;
  margin: 0;
  padding: 0;
}
```

Questa specificità prevale sugli stili generali degli `input`, senza
`!important`. Se il codice di partenza è cambiato, trovare prima la nuova
posizione del controllo e confrontare gli stili effettivi; non duplicare
regole già introdotte da un'altra modifica.

## Stato, errori e vincoli

- Lo stato rimane `state.album.preferenze.abilitate`; non introdurre uno stato
  React locale che possa divergere dalla preferenza Redux.
- L'handler esistente continua a dispatchare `ricezioneFotoCambiata`.
- Non aggiungere validazioni, richieste di rete, nuovi adapter o dipendenze:
  questa modifica non introduce ingressi o operazioni aggiuntive.
- Le funzioni applicative restano dichiarate con `const`; JSX e HTML rimangono
  in `frontend/src/ui/` e gli eventi referenziano handler nominati.

## Verifica visiva e funzionale

Avviare frontend e backend locali con i comandi descritti nei rispettivi
README. Nel frontend `npm run dev` esegue prima la compilazione WASM: servono
i prerequisiti già documentati in `frontend/README.md`.

Eseguire questa verifica in tema chiaro e scuro, a larghezze di 320, 390 e
1280 pixel. Bastano l'Identità locale e il pannello Impostazioni; non serve
un secondo Contatto.

1. **Given:** Identità creata, pannello Impostazioni aperto.
2. **When:** osservare la riga e ridurre la larghezza della finestra.
3. **Then:** la checkbox sta a sinistra del testo, è centrata verticalmente e
   non occupa l'intera larghezza del pannello. Se il testo va a capo, rimane
   nella propria area e non si sovrappone al controllo. Non compare overflow
   orizzontale dovuto alla riga.
4. **When:** fare clic sul testo e poi sulla checkbox.
5. **Then:** ciascun clic cambia la preferenza una sola volta; il testo resta
   leggibile in entrambi gli stati.
6. **When:** raggiungere il controllo con Tab e premere Spazio.
7. **Then:** il focus è visibile e la preferenza cambia; il nome accessibile è
   `Ricevi foto e album`.
8. **When:** chiudere e riaprire il pannello, poi ricaricare dopo che il
   salvataggio della preferenza è terminato.
9. **Then:** la preferenza conserva il valore scelto.

Verificare anche il campo Nickname nella schermata iniziale in un contesto
browser separato e il campo Tacitus ID nella modale Aggiungi Contatto: devono
mantenere dimensioni e layout precedenti. Usare un contesto separato evita di
cancellare un'Identità esistente per provare la schermata iniziale.

## Comandi di controllo

Dalla directory `frontend/`:

```bash
npm test -- src/ui/shell/__test__/AppHeader.test.tsx
npm run typecheck
npm run lint
npm run format:check
```

Il test esistente controlla il rendering del componente, non l'allineamento:
il layout deve essere verificato nel browser. Non aggiungere un test che
controlli soltanto il nome della classe CSS o misuri rettangoli in JSDOM.
Per questa correzione visiva circoscritta non è richiesta una nuova suite.

Se i controlli rilevano problemi già presenti al commit di partenza,
documentarli separatamente senza estendere il refactor ad altri file.

## Criterio di completamento e passaggio alla #18

La issue è completata quando la verifica visiva e quella da tastiera passano,
il valore della preferenza si conserva e i controlli pertinenti non mostrano
regressioni introdotte dalla modifica. Nel riepilogo dell'implementazione
indicare viewport e temi realmente verificati.

La fase di migrazione della #18 che sostituirà questa checkbox con l'adapter
locale dovrà preservare gli stessi criteri di allineamento, associazione del
testo, focus e area cliccabile. Solo dopo quella sostituzione potrà rimuovere
gli eventuali stili specifici diventati inutilizzati.

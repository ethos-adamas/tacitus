# Issue #16 — Impostazioni del Contatto in una modale

Issue: https://github.com/ethos-adamas/tacitus/issues/16.
Stato: piano esecutivo, implementazione non eseguita.
Base analizzata: `f3b724928e6b48078ec6117d7d036992e67021a8`.
Prerequisito: [#18 fase A](issue-18-adapter-ui-temi.md), contratti Modal,
ConfirmDialog, Button e SelectField. Regole generali: [indice](README.md).

## Risultato concordato

Nickname e Tacitus ID rimangono nell'intestazione attuale. Il termine
«chiave» dell'issue indica l'ID pubblico visualizzato, non una chiave privata.
A destra, un solo pulsante `Impostazioni del Contatto` sostituisce il vecchio
menu consensi e i due pulsanti Rimuovi/Blocca. Apre una modale centrata con
sfondo sfocato, contenente consensi foto e azioni distruttive.

Consensi immediati, senza Salva e senza rollback alla chiusura.
Rimozione/blocco richiedono sempre una seconda conferma esplicita.
Ricezione globale resta nelle impostazioni generali; Riattiva resta dov'è,
con le stesse condizioni. Non modificare protocollo o politiche di consenso.

## Codice da leggere e comportamento da preservare

| File sotto frontend/src                       | Evidenza                                                                                                  |
| --------------------------------------------- | --------------------------------------------------------------------------------------------------------- |
| ui/conversation/Conversation.tsx              | ConversationContent, header, remove/block con confirm nativo, reactivate.                                 |
| ui/conversation/Album.tsx                     | AlbumConsent seleziona Redux e dispatcha consensoFotoCambiato.                                            |
| application/store/albumSlice.ts               | ConsensoFoto ask/allow/block; assenza preferenza significa ask.                                           |
| application/hooks/useRelazioni.ts             | Rimozione chiama relay prima del dispatch; blocco dispatcha prima e tollera relay offline.                |
| application/album/trasferimentiAlbum.ts       | Revoca consenso interrompe ricezione; rimozione/blocco annullano trasferimenti e cancellano Album locali. |
| application/listeners/persistenzaListeners.ts | Persistenza consensi; gestione errore salvataggio.                                                        |
| ui/contacts/ConversationList.tsx              | Contatti rimossi/bloccati spariscono dalla lista attiva.                                                  |
| index.css                                     | contact-photo-setting assoluto e .remove con margin-left; da sostituire nel contesto della modale.        |

Non uniformare il comportamento differente di rimozione e blocco:
è una modifica applicativa non richiesta. Un errore relay nella rimozione
lascia il Contatto presente; il blocco locale è efficace anche offline.

## 1. Nuovo componente e contratti

Creare `frontend/src/ui/contacts/ContactSettingsDialog.tsx`:

```ts
type ContactSettingsDialogProps = {
  tacitusId: TacitusId;
  nickname: string;
};
```

Il componente possiede solo open locale; usa gli hook Redux/Relazioni già
esistenti. Il consenso resta Redux, senza copia locale.
Dentro usare Modal con title `Impostazioni del Contatto`, trigger Button
ghost con nome accessibile omonimo e icona ingranaggio. La modale mostra
nickname e Tacitus ID del destinatario, anche se già nell'header.

Contenuto in ordine:

1. Identificazione del Contatto.
2. AlbumConsent, stesso label `Foto da questo Contatto`.
3. `Le modifiche ai consensi si applicano subito.`
4. Se ricezione globale off: `La ricezione di foto e album è disattivata nelle impostazioni generali.`
5. Sezione `Gestione del Contatto`, con i due trigger di ConfirmDialog.

Montare in ConversationContent con `key={contact.tacitusId}`. Il cambio
Contatto smonta la vecchia modale e i callback catturano il proprio ID;
non rileggere il Contatto attivo al momento della conferma.
Quando un'azione elimina il Contatto, il normale rendering deve smontare
la modale. Non lasciare il suo stato in uno store globale.

## 2. Consensi e aggiornamenti immediati

Migrare l'elemento select di AlbumConsent a SelectField locale, mantenendo:

| Label                   | Valore | Effetto                                                                                 |
| ----------------------- | ------ | --------------------------------------------------------------------------------------- |
| Chiedi consenso         | ask    | Mantiene la richiesta di consenso prevista dal trasporto.                               |
| Accetta automaticamente | allow  | Abilita ricezione automatica per questo Contatto, subordinata all'interruttore globale. |
| Non ricevere            | block  | Rifiuta foto di questo Contatto; NON blocca la Relazione.                               |

L'handler `change` legge il valore DOM e lo restringe alla union esistente
prima del dispatch; non usare cast per fidarsi di una stringa arbitraria.
Lo stato visualizzato deriva subito da Redux.
Non chiamare manualmente annullaAlbum dall'handler: il listener del consenso
è già proprietario degli effetti sui trasferimenti.

Chiudi, Escape e clic sfondo non ripristinano la scelta precedente.
La persistenza continua attraverso il listener esistente. Se il salvataggio
fallisce, mostrare l'errore di persistenza anche dentro la modale, leggendo
il feedback esistente con un componente UI role alert; non dichiarare
`salvato`, non eseguire rollback impliciti. Non creare un secondo toast.
La fase B della #18 sistema anche il posizionamento globale del feedback.

## 3. Conferme distruttive

Usare ConfirmDialog della #18. Non usare contemporaneamente window.confirm.

| Azione    | Trigger          | Titolo conferma        | Descrizione                                                          | Conferma                |
| --------- | ---------------- | ---------------------- | -------------------------------------------------------------------- | ----------------------- |
| Rimuovere | Rimuovi Contatto | Rimuovere il Contatto? | Rimuovere NICKNAME e cancellare la Conversazione e gli Album locali? | Rimuovi definitivamente |
| Bloccare  | Blocca Contatto  | Bloccare il Contatto?  | Bloccare NICKNAME e cancellare la Conversazione e gli Album locali?  | Blocca definitivamente  |

Interpolare nickname come normale testo React, mai HTML.
`Annulla` è il focus iniziale e non chiama l'hook.
Handler nominati `removeContact` e `blockContact` chiamano rispettivamente
rimuoviContatto(tacitusId) e bloccaContatto(tacitusId), senza catch che
nasconda un fallimento al ConfirmDialog. Quest'ultimo mostra l'errore
inline, rimane aperto in caso di rigetto e impedisce doppia esecuzione.
Il successo locale del blocco offline non va presentato come fallimento.

Non aggiungere chiamate dirette a storage o azioni duplicate in UI:
gli eventi esistenti cancellano Conversazione/Album e interrompono trasferimenti.
La #15 aggiungerà a quegli eventi il cleanup delle anteprime volatili;
questa issue non introduce un proprio cleanup di foto.

## 4. Header, layout e accessibilità

In Conversation.tsx rimuovere details.contact-settings, handler remove/block
e due bottoni vecchi. Inserire ContactSettingsDialog nella stessa area,
dopo identificazione e Riattiva. Trigger con margin-inline-start auto;
nickname/ID non cambiano ordine né gerarchia.
Il ritorno alla lista mobile rimane disponibile.

Portale su body, overlay e focus trap sono responsabilità di Modal.
Rendere .contact-photo-setting statica nella modale: display grid, gap,
width 100%, niente top/right/z-index, select max-width 100%.
Eliminare .contact-settings e .remove solo dopo rg di tutti i riferimenti.

Larghezza standard min(500px, viewport - 2rem), padding che non sottragga
lo spazio dei controlli, contenuto scorrevole fino a viewport - 2rem.
Conferma annidata sopra la modale; Escape chiude prima la conferma, poi
eventualmente la modale. Annullando la conferma, focus torna al relativo
trigger; chiudendo la modale, al pulsante dell'header se ancora montato.
Se il Contatto sparisce, nessun focus forzato su un nodo rimosso.

## 5. Test implementabili

Creare `frontend/src/ui/contacts/__test__/ContactSettingsDialog.test.tsx`.
Usare createTestStore e Provider, eventi di associazione Contatto per uno
stato valido; mockare il relay nel test degli hook, non i reducer.
Dove si verifica la revoca effettiva usare i test del trasporto/E2E con
listener registrati: createTestStore da solo non li registra.

| Given                     | When                            | Then                                                                         |
| ------------------------- | ------------------------------- | ---------------------------------------------------------------------------- |
| Alice ask, Bob block      | Aprire Alice, cambiare ad allow | Solo Alice cambia; nessun Salva.                                             |
| Alice allow               | Chiudere Escape e riaprire      | Rimane allow.                                                                |
| Ricezione globale off     | Selezionare allow               | Preferenza Contatto allow, globale ancora off e avviso visibile.             |
| Modale aperta             | Scegliere Non ricevere          | Contatto e Conversazione restano; nessun blocco della Relazione.             |
| Conferma rimozione/blocco | Annullare                       | Nessuna chiamata distruttiva, focus restituito.                              |
| Conferma rimozione        | Confermare                      | Hook chiamato una volta con ID catturato, Contatto eliminato.                |
| Relay rimozione fallisce  | Confermare                      | Contatto presente, errore visibile nella conferma, possibilità di riprovare. |
| Relay offline             | Confermare blocco               | Blocco locale riuscito, stesso comportamento precedente.                     |
| Modale di Alice           | Rerender su Bob con key diversa | Vecchia modale chiusa; nessuna azione su Bob da callback di Alice.           |

In `frontend/e2e/messaggistica.spec.ts` aggiornare scenari di rimozione/blocco:
non più `page.once('dialog', ...)` per queste azioni, ma
Impostazioni del Contatto → trigger → alertdialog → Conferma/Annulla.
Usare locator scoped al dialog per distinguere il trigger dal titolo.

Aggiornare lo scenario Album che seleziona block/allow: aprire modale,
cambiare select, chiudere prima di interagire con chat. Aggiungere
revoca durante ricezione e persistenza dopo reload; riusare il flusso
con due browser e attendere segnali di stato, non timeout fissi.

Browser desktop/mobile: aprire a 320, 390, 1280 px in chiaro/scuro;
verificare centro, blur, scroll, Tab/Shift+Tab, Escape, focus ritorno,
header con nickname lungo e Riattiva. Il tema rétro sarà verificato da #18B.

## 6. Comandi e completamento

Dalla directory frontend:

```bash
npm test -- src/ui/contacts/__test__ src/ui/kit/__test__ src/application/store/__test__
npm run typecheck
npm run lint
npm run format:check
npm run build
npm run test:e2e -- --project=chromium-desktop
npm run test:e2e -- --project=chromium-mobile
```

Test nativi esclusi; browser mobile simulato non equivale a app nativa.
Commit consigliati: componente e consensi; conferme/header; test/layout.
Done: un accesso nell'header, modale usabile da tastiera, consensi immediati,
conferme sicure, nessuna regressione su revoca/cleanup/persistenza.

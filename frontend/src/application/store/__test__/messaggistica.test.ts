import { describe, expect, it } from 'vitest';
import {
  contattoBloccato,
  contattoAssociato,
  contattoRimosso,
  intentoDiContattoAnnullato,
  intentoDiContattoCreato,
  messaggioRicevuto,
  presenzaContattoCambiata,
  relazioneDisattivata,
  relayConnesso,
  relayDisconnesso,
  sessioneSicuraStabilita,
} from '../eventi';
import { createTestStore, type RootState } from '../store';
import { conversazioneSelezionata } from '../conversazioniSlice';
import { selectConversazione, selectStatoContatto } from '../selectors';
import { parseTacitusId } from '../../../domain/tacitusId';

const ALICE_ID = parseTacitusId('2G2DX-6P175-0PJ6E-Q37T0-Q94YJC');

const stato = (store: ReturnType<typeof createTestStore>): RootState =>
  store.getState();

describe('Messaggistica privata', () => {
  it('trasforma un Intento reciproco in Contatto, Relazione e Conversazione', () => {
    // Given
    const store = createTestStore();
    store.dispatch(intentoDiContattoCreato(ALICE_ID));

    // When
    store.dispatch(
      contattoAssociato({
        tacitusId: ALICE_ID,
        nickname: 'alice',
        online: true,
      }),
    );

    // Then
    expect(stato(store).relazioni.intenti[ALICE_ID]).toBeUndefined();
    expect(stato(store).relazioni.contatti[ALICE_ID]).toEqual({
      tacitusId: ALICE_ID,
      nickname: 'alice',
    });
    expect(stato(store).relazioni.relazioni[ALICE_ID]).toEqual({
      tacitusId: ALICE_ID,
      stato: 'attiva',
    });
    expect(selectConversazione(stato(store), ALICE_ID)).toMatchObject({
      tacitusId: ALICE_ID,
      bozza: '',
      nonLetti: 0,
      messaggi: [],
    });
  });

  it('annulla un Intento senza rimuovere un Contatto', () => {
    // Given
    const store = createTestStore();
    store.dispatch(intentoDiContattoCreato(ALICE_ID));

    // When
    store.dispatch(intentoDiContattoAnnullato(ALICE_ID));
    store.dispatch(relazioneDisattivata(ALICE_ID));

    // Then
    expect(stato(store).relazioni.intenti[ALICE_ID]).toBeUndefined();
    expect(stato(store).relazioni.contatti).toEqual({});
  });

  it('mantiene la Conversazione separata da Presenza, Relazione e Sessione sicura', () => {
    // Given
    const store = createTestStore();
    store.dispatch(
      contattoAssociato({
        tacitusId: ALICE_ID,
        nickname: 'alice',
        online: true,
      }),
    );
    store.dispatch(sessioneSicuraStabilita(ALICE_ID));
    store.dispatch(
      messaggioRicevuto({
        tacitusId: ALICE_ID,
        messaggio: {
          id: 'one',
          direzione: 'ricevuto',
          testo: 'ciao',
          creatoIl: 1,
        },
      }),
    );

    // When
    store.dispatch(relayDisconnesso());
    store.dispatch(
      presenzaContattoCambiata({ tacitusId: ALICE_ID, online: true }),
    );
    store.dispatch(relazioneDisattivata(ALICE_ID));

    // Then
    expect(selectConversazione(stato(store), ALICE_ID)?.messaggi).toEqual([
      {
        id: 'one',
        direzione: 'ricevuto',
        testo: 'ciao',
        creatoIl: 1,
      },
    ]);
    expect(selectStatoContatto(stato(store), ALICE_ID)).toBe(
      'riattivazione-necessaria',
    );
  });

  it('richiede la riattivazione soltanto se il Relay non risincronizza la Relazione', () => {
    // Given
    const store = createTestStore();
    store.dispatch(
      contattoAssociato({
        tacitusId: ALICE_ID,
        nickname: 'alice',
        online: true,
      }),
    );

    // When
    store.dispatch(relayDisconnesso());

    // Then
    expect(stato(store).relazioni.relazioni[ALICE_ID].stato).toBe('attiva');

    // When
    store.dispatch(relayConnesso());

    // Then
    expect(stato(store).relazioni.relazioni[ALICE_ID].stato).toBe(
      'da-riattivare',
    );
  });

  it('ignora la selezione tardiva di una Conversazione rimossa', () => {
    // Given
    const store = createTestStore();
    store.dispatch(
      contattoAssociato({
        tacitusId: ALICE_ID,
        nickname: 'alice',
        online: true,
      }),
    );
    store.dispatch(contattoRimosso(ALICE_ID));

    // When
    store.dispatch(conversazioneSelezionata(ALICE_ID));

    // Then
    expect(stato(store).conversazioni.idConversazioneAttiva).toBeUndefined();
  });

  it('sposta un Contatto tra le Identità bloccate e rimuove la Conversazione', () => {
    // Given
    const store = createTestStore();
    store.dispatch(
      contattoAssociato({
        tacitusId: ALICE_ID,
        nickname: 'alice',
        online: true,
      }),
    );

    // When
    store.dispatch(contattoBloccato(ALICE_ID));

    // Then
    expect(stato(store).relazioni.blocchi[ALICE_ID]).toEqual({
      tacitusId: ALICE_ID,
    });
    expect(stato(store).relazioni.contatti[ALICE_ID]).toBeUndefined();
    expect(selectConversazione(stato(store), ALICE_ID)).toBeUndefined();
  });
});

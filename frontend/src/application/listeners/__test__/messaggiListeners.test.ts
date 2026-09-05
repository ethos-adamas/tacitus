import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import { describe, expect, it, vi } from 'vitest';
import { parseTacitusId } from '../../../domain/tacitusId';
import type { GestoreSessioniSicure } from '../../../infrastructure/secure-session/sessioniSicure';
import type { RelayCommands } from '../../../infrastructure/relay/relayConnection';
import { registerMessaggiListeners } from '../messaggiListeners';
import {
  bozzaAggiornata,
  conversazioniReducer,
} from '../../store/conversazioniSlice';
import {
  contattoAssociato,
  invioMessaggioRichiesto,
  messaggioCifratoRicevuto,
  sessioneSicuraStabilita,
} from '../../store/eventi';
import { feedbackReducer } from '../../store/feedbackSlice';
import type { StartListening } from '../../store/listenerMiddleware';
import { presenzeContattiReducer } from '../../store/presenzeContattiSlice';
import { relazioniReducer } from '../../store/relazioniSlice';
import { sessioniSicureReducer } from '../../store/sessioniSicureSlice';

const ALICE_ID = parseTacitusId('2G2DX-6P175-0PJ6E-Q37T0-Q94YJC');

describe('ricezione dei Messaggi cifrati', () => {
  it('decifra il Contenuto e lo registra nella Conversazione', async () => {
    // Given
    const middleware = createListenerMiddleware();
    const sessioni: GestoreSessioniSicure = {
      avvia: vi.fn(),
      cifraContenuto: vi.fn(),
      cifra: vi.fn(),
      decifra: () => ({
        message_id: 'message-one',
        created_at: 7,
        text: 'ciao',
      }),
      elimina: vi.fn(),
      eliminaTutte: vi.fn(),
      pronta: vi.fn(),
      ricevi: vi.fn(),
    };
    registerMessaggiListeners(
      middleware.startListening as StartListening,
      sessioni,
    );
    const store = configureStore({
      reducer: {
        conversazioni: conversazioniReducer,
        feedback: feedbackReducer,
      },
      middleware: getDefaultMiddleware =>
        getDefaultMiddleware().prepend(middleware.middleware),
    });
    store.dispatch(
      contattoAssociato({
        tacitusId: ALICE_ID,
        nickname: 'alice',
        online: true,
      }),
    );

    // When
    store.dispatch(
      messaggioCifratoRicevuto({ tacitusId: ALICE_ID, body: 'ciphertext' }),
    );
    await Promise.resolve();

    // Then
    expect(
      store.getState().conversazioni.perContatto[ALICE_ID].messaggi,
    ).toEqual([
      {
        id: 'message-one',
        direzione: 'ricevuto',
        testo: 'ciao',
        creatoIl: 7,
      },
    ]);
  });

  it('cifra e invia la bozza attraverso gli effetti di Messaggistica', async () => {
    // Given
    const middleware = createListenerMiddleware();
    const sessioni: GestoreSessioniSicure = {
      avvia: vi.fn(),
      cifraContenuto: vi.fn(),
      cifra: vi.fn(() => 'ciphertext'),
      decifra: vi.fn(),
      elimina: vi.fn(),
      eliminaTutte: vi.fn(),
      pronta: vi.fn(() => true),
      ricevi: vi.fn(),
    };
    const relay: RelayCommands = {
      aggiungiContatto: vi.fn(),
      annullaIntento: vi.fn(),
      bloccaContatto: vi.fn(),
      rimuoviContatto: vi.fn(),
      sbloccaContatto: vi.fn(),
      inviaHandshake: vi.fn(),
      inviaMessaggio: vi.fn(),
    };
    registerMessaggiListeners(
      middleware.startListening as StartListening,
      sessioni,
      () => relay,
    );
    const store = configureStore({
      reducer: {
        conversazioni: conversazioniReducer,
        feedback: feedbackReducer,
        presenzeContatti: presenzeContattiReducer,
        relazioni: relazioniReducer,
        sessioniSicure: sessioniSicureReducer,
      },
      middleware: getDefaultMiddleware =>
        getDefaultMiddleware().prepend(middleware.middleware),
    });
    store.dispatch(
      contattoAssociato({
        tacitusId: ALICE_ID,
        nickname: 'alice',
        online: true,
      }),
    );
    store.dispatch(sessioneSicuraStabilita(ALICE_ID));
    store.dispatch(bozzaAggiornata({ tacitusId: ALICE_ID, bozza: ' ciao ' }));

    // When
    store.dispatch(invioMessaggioRichiesto(ALICE_ID));
    await Promise.resolve();

    // Then
    expect(sessioni.cifra).toHaveBeenCalledWith(
      ALICE_ID,
      'ciao',
      expect.any(Number),
    );
    expect(relay.inviaMessaggio).toHaveBeenCalledWith(ALICE_ID, 'ciphertext');
    expect(store.getState().conversazioni.perContatto[ALICE_ID].bozza).toBe('');
    expect(
      store.getState().conversazioni.perContatto[ALICE_ID].messaggi,
    ).toHaveLength(1);
  });
});

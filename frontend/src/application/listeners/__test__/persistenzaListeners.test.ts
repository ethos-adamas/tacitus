import { albumReducer } from '../../store/albumSlice';
import { configureStore, createListenerMiddleware } from '@reduxjs/toolkit';
import { describe, expect, it, vi } from 'vitest';
import { parseTacitusId } from '../../../domain/tacitusId';
import {
  conversazioneSelezionata,
  conversazioniReducer,
} from '../../store/conversazioniSlice';
import { contattoAssociato, messaggioRicevuto } from '../../store/eventi';
import { feedbackReducer } from '../../store/feedbackSlice';
import {
  identitaLocaleDisponibile,
  identitaLocaleReducer,
} from '../../store/identitaLocaleSlice';
import type { StartListening } from '../../store/listenerMiddleware';
import { relazioniReducer } from '../../store/relazioniSlice';
import { registerPersistenzaListeners } from '../persistenzaListeners';
import { enqueueStateSave } from '../../../infrastructure/persistence/localPersistence';

vi.mock('../../../infrastructure/identity/identitaLocaleCorrente', () => ({
  leggiIdentitaLocale: () => ({ provider: 'native' }),
}));

vi.mock('../../../infrastructure/persistence/localPersistence', () => ({
  enqueueStateSave: vi.fn(() => Promise.resolve()),
}));

const ALICE_ID = parseTacitusId('2G2DX-6P175-0PJ6E-Q37T0-Q94YJC');

describe('persistenza della Messaggistica', () => {
  it('salva l’azzeramento dei non letti senza lo stato UI transitorio', async () => {
    // Given
    const middleware = createListenerMiddleware();
    registerPersistenzaListeners(middleware.startListening as StartListening);
    const store = configureStore({
      reducer: {
        album: albumReducer,
        conversazioni: conversazioniReducer,
        feedback: feedbackReducer,
        identitaLocale: identitaLocaleReducer,
        relazioni: relazioniReducer,
      },
      middleware: getDefaultMiddleware =>
        getDefaultMiddleware().prepend(middleware.middleware),
    });
    store.dispatch(
      identitaLocaleDisponibile({ tacitusId: ALICE_ID, nickname: 'alice' }),
    );
    store.dispatch(
      contattoAssociato({
        tacitusId: ALICE_ID,
        nickname: 'alice',
        online: true,
      }),
    );
    store.dispatch(
      messaggioRicevuto({
        tacitusId: ALICE_ID,
        messaggio: {
          id: 'message-one',
          direzione: 'ricevuto',
          testo: 'ciao',
          creatoIl: 1,
        },
      }),
    );
    vi.mocked(enqueueStateSave).mockClear();

    // When
    store.dispatch(conversazioneSelezionata(ALICE_ID));
    await Promise.resolve();

    // Then
    expect(enqueueStateSave).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        conversazioni: {
          perContatto: {
            [ALICE_ID]: expect.objectContaining({ nonLetti: 0 }),
          },
        },
      }),
    );
  });
});

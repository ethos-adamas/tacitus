import {
  consensoFotoCambiato,
  ricezioneFotoCambiata,
} from '../store/albumSlice';
import { isAnyOf } from '@reduxjs/toolkit';
import {
  contattoAssociato,
  contattoBloccato,
  contattoRimosso,
  contattoSbloccato,
  intentoDiContattoAnnullato,
  intentoDiContattoCreato,
  messaggioInviato,
  messaggioRicevuto,
  relazioneDisattivata,
  relayConnesso,
} from '../store/eventi';
import {
  bozzaAggiornata,
  conversazioneSelezionata,
  conversazioniCaricate,
} from '../store/conversazioniSlice';
import { erroreMostrato } from '../store/feedbackSlice';
import type { StartListening } from '../store/listenerMiddleware';
import { relazioniCaricate } from '../store/relazioniSlice';
import type { RootState } from '../store/store';
import { leggiIdentitaLocale } from '../../infrastructure/identity/identitaLocaleCorrente';
import { enqueueStateSave } from '../../infrastructure/persistence/localPersistence';

const DRAFT_SAVE_DELAY_MS = 500;

export const registerPersistenzaListeners = (
  startListening: StartListening,
): void => {
  startListening({
    matcher: isAnyOf(
      consensoFotoCambiato,
      ricezioneFotoCambiata,
      bozzaAggiornata,
      contattoAssociato,
      contattoBloccato,
      contattoRimosso,
      contattoSbloccato,
      conversazioneSelezionata,
      conversazioniCaricate,
      intentoDiContattoAnnullato,
      intentoDiContattoCreato,
      messaggioInviato,
      messaggioRicevuto,
      relazioneDisattivata,
      relazioniCaricate,
      relayConnesso,
    ),
    effect: async (
      action,
      { cancelActiveListeners, delay, dispatch, getState },
    ) => {
      // Every keystroke updates the draft; saving the whole encrypted history each time lags typing.
      if (bozzaAggiornata.match(action)) {
        cancelActiveListeners();
        await delay(DRAFT_SAVE_DELAY_MS);
      }
      const state = getState() as RootState;
      if (state.identitaLocale.stato !== 'pronta') return;
      const persisted = {
        album: state.album.preferenze,
        conversazioni: {
          perContatto: state.conversazioni.perContatto,
        },
        relazioni: state.relazioni,
      };
      void enqueueStateSave(leggiIdentitaLocale(), persisted).catch(reason => {
        const message =
          reason instanceof DOMException && reason.name === 'QuotaExceededError'
            ? 'Spazio locale esaurito. I nuovi dati non sono stati salvati.'
            : 'Salvataggio locale non riuscito. I nuovi dati non sono stati salvati.';
        dispatch(erroreMostrato(message));
      });
    },
  });
};

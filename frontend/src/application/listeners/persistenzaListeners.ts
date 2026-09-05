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
    effect: (_action, { dispatch, getState }) => {
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

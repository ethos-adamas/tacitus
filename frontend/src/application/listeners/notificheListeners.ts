import { conversazioneSelezionata } from '../store/conversazioniSlice';
import { notificaMessaggioRichiesta } from '../store/eventi';
import { erroreMostrato } from '../store/feedbackSlice';
import type { StartListening } from '../store/listenerMiddleware';
import type { RootState } from '../store/store';
import {
  shouldNotify,
  showMessageNotification,
} from '../../infrastructure/notifications/notifications';

export const registerNotificheListeners = (
  startListening: StartListening,
): void => {
  startListening({
    actionCreator: notificaMessaggioRichiesta,
    effect: async ({ payload }, { dispatch, getState }) => {
      const state = getState() as RootState;
      if (
        !shouldNotify(
          state.notifiche.abilitate,
          document.visibilityState,
          document.hasFocus(),
        )
      )
        return;
      try {
        await showMessageNotification(payload, () =>
          dispatch(conversazioneSelezionata(payload)),
        );
      } catch {
        dispatch(erroreMostrato('Notifica non riuscita.'));
      }
    },
  });
};

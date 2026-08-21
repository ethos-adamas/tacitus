import {
  contattoAssociato,
  contattoRimosso,
  handshakeRicevuto,
  presenzaContattoCambiata,
  relazioneDisattivata,
  relayDisconnesso,
  sessioneSicuraStabilita,
} from '../store/eventi';
import { erroreMostrato } from '../store/feedbackSlice';
import type { StartListening } from '../store/listenerMiddleware';
import { leggiIdentitaLocale } from '../../infrastructure/identity/identitaLocaleCorrente';
import type { GestoreSessioniSicure } from '../../infrastructure/secure-session/sessioniSicure';

export const registerSessioniSicureListeners = (
  startListening: StartListening,
  sessioni: GestoreSessioniSicure,
): void => {
  startListening({
    actionCreator: contattoAssociato,
    effect: ({ payload }) => {
      if (payload.online)
        sessioni.avvia(leggiIdentitaLocale(), payload.tacitusId);
    },
  });
  startListening({
    actionCreator: presenzaContattoCambiata,
    effect: ({ payload }) => {
      if (payload.online)
        sessioni.avvia(leggiIdentitaLocale(), payload.tacitusId);
      else sessioni.elimina(payload.tacitusId);
    },
  });
  startListening({
    actionCreator: handshakeRicevuto,
    effect: async ({ payload }, { dispatch }) => {
      try {
        const result = await sessioni.ricevi(
          leggiIdentitaLocale(),
          payload.tacitusId,
          payload.body,
        );
        if (result.pronta) dispatch(sessioneSicuraStabilita(payload.tacitusId));
      } catch {
        dispatch(erroreMostrato('Negoziazione della Sessione sicura fallita.'));
      }
    },
  });
  startListening({
    actionCreator: relazioneDisattivata,
    effect: ({ payload }) => sessioni.elimina(payload),
  });
  startListening({
    actionCreator: contattoRimosso,
    effect: ({ payload }) => sessioni.elimina(payload),
  });
  startListening({
    actionCreator: relayDisconnesso,
    effect: () => sessioni.eliminaTutte(),
  });
};

import {
  invioMessaggioRichiesto,
  messaggioCifratoRicevuto,
  messaggioInviato,
  messaggioRicevuto,
  notificaMessaggioRichiesta,
} from '../store/eventi';
import { MAX_MESSAGE_LENGTH } from '../../domain/messaggi';
import type { RelayCommands } from '../../infrastructure/relay/relayConnection';
import { leggiRelay } from '../../infrastructure/relay/relayAttivo';
import { erroreMostrato } from '../store/feedbackSlice';
import type { StartListening } from '../store/listenerMiddleware';
import type { RootState } from '../store/store';
import type { GestoreSessioniSicure } from '../../infrastructure/secure-session/sessioniSicure';

export const registerMessaggiListeners = (
  startListening: StartListening,
  sessioni: GestoreSessioniSicure,
  relayAttivo: () => RelayCommands = leggiRelay,
): void => {
  startListening({
    actionCreator: invioMessaggioRichiesto,
    effect: ({ payload: tacitusId }, { dispatch, getState }) => {
      try {
        const state = getState() as RootState;
        const testo = state.conversazioni.perContatto[tacitusId].bozza.trim();
        if (!testo) return;
        if (testo.length > MAX_MESSAGE_LENGTH) {
          throw new Error('Il Messaggio supera il limite consentito.');
        }
        if (
          state.presenzeContatti[tacitusId] !== 'online' ||
          state.sessioniSicure[tacitusId] !== 'pronta'
        ) {
          throw new Error('Sessione sicura assente.');
        }
        const creatoIl = Date.now();
        const body = sessioni.cifra(tacitusId, testo, creatoIl);
        relayAttivo().inviaMessaggio(tacitusId, body);
        dispatch(
          messaggioInviato({
            tacitusId,
            messaggio: {
              id: crypto.randomUUID(),
              direzione: 'inviato',
              testo,
              creatoIl,
            },
          }),
        );
      } catch (reason) {
        dispatch(
          erroreMostrato(
            reason instanceof Error ? reason.message : 'Invio non riuscito.',
          ),
        );
      }
    },
  });

  startListening({
    actionCreator: messaggioCifratoRicevuto,
    effect: ({ payload }, { dispatch }) => {
      try {
        const message = sessioni.decifra(payload.tacitusId, payload.body);
        dispatch(
          messaggioRicevuto({
            tacitusId: payload.tacitusId,
            messaggio: {
              id: message.message_id,
              direzione: 'ricevuto',
              testo: message.text,
              creatoIl: message.created_at,
            },
          }),
        );
        dispatch(notificaMessaggioRichiesta(payload.tacitusId));
      } catch {
        dispatch(erroreMostrato('Messaggio ricevuto non valido.'));
      }
    },
  });
};

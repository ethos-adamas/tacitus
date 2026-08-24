import { createAction } from '@reduxjs/toolkit';
import type { Messaggio } from '../../domain/messaggi';
import type { TacitusId } from '../../domain/tacitusId';

export const intentoDiContattoCreato = createAction<TacitusId>(
  'relazioni/intentoDiContattoCreato',
);

export const intentoDiContattoAnnullato = createAction<TacitusId>(
  'relazioni/intentoDiContattoAnnullato',
);

export const contattoAssociato = createAction<{
  tacitusId: TacitusId;
  nickname: string;
  online: boolean;
}>('relazioni/contattoAssociato');

export const presenzaContattoCambiata = createAction<{
  tacitusId: TacitusId;
  online: boolean;
}>('presenze/presenzaContattoCambiata');

export const relazioneDisattivata = createAction<TacitusId>(
  'relazioni/relazioneDisattivata',
);

export const contattoRimosso = createAction<TacitusId>(
  'relazioni/contattoRimosso',
);

export const contattoBloccato = createAction<TacitusId>(
  'relazioni/contattoBloccato',
);

export const contattoSbloccato = createAction<TacitusId>(
  'relazioni/contattoSbloccato',
);

export const sessioneSicuraInNegoziazione = createAction<TacitusId>(
  'sessioniSicure/sessioneSicuraInNegoziazione',
);

export const sessioneSicuraStabilita = createAction<TacitusId>(
  'sessioniSicure/sessioneSicuraStabilita',
);

export const messaggioRicevuto = createAction<{
  tacitusId: TacitusId;
  messaggio: Messaggio;
}>('conversazioni/messaggioRicevuto');

export const messaggioInviato = createAction<{
  tacitusId: TacitusId;
  messaggio: Messaggio;
}>('conversazioni/messaggioInviato');

export const invioMessaggioRichiesto = createAction<TacitusId>(
  'conversazioni/invioMessaggioRichiesto',
);

export const handshakeRicevuto = createAction<{
  tacitusId: TacitusId;
  body: string;
}>('sessioniSicure/handshakeRicevuto');

export const messaggioCifratoRicevuto = createAction<{
  tacitusId: TacitusId;
  body: string;
}>('conversazioni/messaggioCifratoRicevuto');

export const notificaMessaggioRichiesta = createAction<TacitusId>(
  'notifiche/notificaMessaggioRichiesta',
);

export const relayInConnessione = createAction('relay/inConnessione');
export const relayConnesso = createAction('relay/connesso');
export const relayDisconnesso = createAction('relay/disconnesso');

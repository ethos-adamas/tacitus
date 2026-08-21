import { useEffect } from 'react';
import {
  contattoAssociato,
  contattoRimosso,
  handshakeRicevuto,
  intentoDiContattoCreato,
  messaggioCifratoRicevuto,
  presenzaContattoCambiata,
  relazioneDisattivata,
  relayConnesso,
  relayDisconnesso,
  relayInConnessione,
} from '../store/eventi';
import { erroreMostrato } from '../store/feedbackSlice';
import { useDispatch, useSelector } from '../store/hooks';
import { leggiIdentitaLocale } from '../../infrastructure/identity/identitaLocaleCorrente';
import { createRelayConnection } from '../../infrastructure/relay/relayConnection';
import {
  registraRelay,
  rimuoviRelay,
} from '../../infrastructure/relay/relayAttivo';

export const useRelayConnection = (): void => {
  const dispatch = useDispatch();
  const identitaState = useSelector(state => state.identitaLocale);

  useEffect(() => {
    if (identitaState.stato !== 'pronta') return;
    const relay = createRelayConnection({
      onDisconnected: () => dispatch(relayDisconnesso()),
      onError: message => dispatch(erroreMostrato(message)),
      onFrame: frame => {
        switch (frame.tipo) {
          case 'intento-confermato':
            dispatch(intentoDiContattoCreato(frame.tacitusId));
            break;
          case 'contatto-associato':
            dispatch(contattoAssociato(frame));
            break;
          case 'relazione-cambiata':
            if (!frame.attiva) dispatch(relazioneDisattivata(frame.tacitusId));
            break;
          case 'contatto-rimosso':
            dispatch(contattoRimosso(frame.tacitusId));
            break;
          case 'presenza-cambiata':
            dispatch(presenzaContattoCambiata(frame));
            break;
          case 'handshake-ricevuto':
            dispatch(handshakeRicevuto(frame));
            break;
          case 'messaggio-ricevuto':
            dispatch(messaggioCifratoRicevuto(frame));
            break;
          case 'autenticazione-richiesta':
          case 'autenticazione-completata':
          case 'errore':
            throw new Error('Frame Relay instradato al livello errato.');
        }
      },
      onStateChanged: state =>
        dispatch(state === 'online' ? relayConnesso() : relayInConnessione()),
    });
    registraRelay(relay);
    relay.connect(leggiIdentitaLocale());
    return () => {
      rimuoviRelay(relay);
      relay.close();
    };
  }, [dispatch, identitaState]);
};

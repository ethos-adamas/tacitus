import { parseTacitusId, type TacitusId } from '../../domain/tacitusId';
import { leggiRelay } from '../../infrastructure/relay/relayAttivo';
import {
  contattoBloccato,
  contattoRimosso,
  contattoSbloccato,
  intentoDiContattoAnnullato,
} from '../store/eventi';
import { useDispatch, useSelector } from '../store/hooks';

export const useRelazioni = () => {
  const dispatch = useDispatch();
  const identita = useSelector(state => state.identitaLocale);

  const creaIntento = (tacitusIdInserito: string) => {
    const tacitusId = parseTacitusId(tacitusIdInserito);
    if (identita.stato !== 'pronta') {
      throw new Error('Identità locale assente.');
    }
    if (tacitusId === identita.identita.tacitusId) {
      throw new Error('Non puoi aggiungere la tua Identità.');
    }
    leggiRelay().aggiungiContatto(tacitusId);
  };

  const riattiva = (tacitusId: TacitusId) => {
    leggiRelay().aggiungiContatto(tacitusId);
  };

  const annullaIntento = (tacitusId: TacitusId) => {
    leggiRelay().annullaIntento(tacitusId);
    dispatch(intentoDiContattoAnnullato(tacitusId));
  };

  const rimuoviContatto = (tacitusId: TacitusId) => {
    leggiRelay().rimuoviContatto(tacitusId);
    dispatch(contattoRimosso(tacitusId));
  };

  const bloccaContatto = (tacitusId: TacitusId) => {
    dispatch(contattoBloccato(tacitusId));
    try {
      leggiRelay().bloccaContatto(tacitusId);
    } catch {
      return;
    }
  };

  const sbloccaContatto = (tacitusId: TacitusId) => {
    dispatch(contattoSbloccato(tacitusId));
    try {
      leggiRelay().sbloccaContatto(tacitusId);
    } catch {
      return;
    }
  };

  return {
    annullaIntento,
    bloccaContatto,
    creaIntento,
    riattiva,
    rimuoviContatto,
    sbloccaContatto,
  };
};

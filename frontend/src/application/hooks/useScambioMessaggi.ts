import type { TacitusId } from '../../domain/tacitusId';
import { bozzaAggiornata } from '../store/conversazioniSlice';
import { invioMessaggioRichiesto } from '../store/eventi';
import { useDispatch } from '../store/hooks';

export const useScambioMessaggi = (tacitusId: TacitusId) => {
  const dispatch = useDispatch();

  const aggiornaBozza = (bozza: string) => {
    dispatch(bozzaAggiornata({ tacitusId, bozza }));
  };

  const invia = () => dispatch(invioMessaggioRichiesto(tacitusId));

  return { aggiornaBozza, invia };
};

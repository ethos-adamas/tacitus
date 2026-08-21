import type { TacitusId } from '../../domain/tacitusId';
import { conversazioneSelezionata } from '../store/conversazioniSlice';
import { useDispatch, useSelector } from '../store/hooks';
import { selectElencoConversazioni } from '../store/selectors';

export const useElencoConversazioni = () => {
  const dispatch = useDispatch();
  const voci = useSelector(selectElencoConversazioni);
  const seleziona = (tacitusId: TacitusId) => {
    dispatch(conversazioneSelezionata(tacitusId));
  };
  return { seleziona, voci };
};

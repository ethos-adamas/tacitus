import { conversazioneSelezionata } from '../store/conversazioniSlice';
import { useDispatch, useSelector } from '../store/hooks';
import { selectConversazioneAttiva } from '../store/selectors';

export const useConversazioneAttiva = () => {
  const dispatch = useDispatch();
  const conversazioneAttiva = useSelector(selectConversazioneAttiva);
  const chiudi = () => dispatch(conversazioneSelezionata(undefined));
  return { chiudi, conversazioneAttiva };
};

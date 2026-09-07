import {
  aggiungiFoto,
  annullaAnteprima,
  inviaAnteprima,
  leggiFotoAnteprima,
  rimuoviFoto,
} from '../album/anteprimeAlbum';
import { useSelector } from '../store/hooks';
import { useDispatch } from '../store/hooks';
import { erroreMostrato } from '../store/feedbackSlice';
import type { TacitusId } from '../../domain/tacitusId';

export const useAnteprimaAlbum = (tacitusId: TacitusId, disabled: boolean) => {
  const dispatch = useDispatch();
  const meta = useSelector(state => state.album.anteprime[tacitusId]);
  const progress = useSelector(state => state.album.progresso[tacitusId]);
  const anotherSending = useSelector(state =>
    Object.entries(state.album.anteprime).some(
      ([peer, anteprima]) => peer !== tacitusId && anteprima.invio,
    ),
  );
  const foto = leggiFotoAnteprima(tacitusId);
  const preparing = meta?.preparazione ?? false;
  const sending = meta?.invio ?? false;
  const photosDisabled = disabled || preparing || sending || !!progress;
  const sendDisabled = photosDisabled || !foto.length || anotherSending;

  const onFiles = (files: File[]) => {
    void aggiungiFoto(tacitusId, files);
  };
  const onFilesError = (reason: unknown) => {
    dispatch(
      erroreMostrato(
        reason instanceof Error && reason.message
          ? reason.message
          : 'Acquisizione foto non riuscita.',
      ),
    );
  };
  const onRemove = (fotoId: string) => rimuoviFoto(tacitusId, fotoId);
  const onCancel = () => annullaAnteprima(tacitusId);
  const onSend = () => {
    void inviaAnteprima(tacitusId);
  };

  return {
    foto,
    preparing,
    sending,
    photosDisabled,
    sendDisabled,
    onFiles,
    onFilesError,
    onRemove,
    onCancel,
    onSend,
  };
};

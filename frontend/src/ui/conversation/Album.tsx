import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { TacitusId } from '../../domain/tacitusId';
import {
  annullaAlbum,
  inviaAlbum,
  rifiutaFoto,
  rispondiAlbum,
} from '../../application/album/trasferimentiAlbum';
import { consensoFotoCambiato } from '../../application/store/albumSlice';
import { useDispatch, useSelector } from '../../application/store/hooks';
import { erroreMostrato } from '../../application/store/feedbackSlice';
import { prepareImages } from '../../infrastructure/album/album';
import { toBase64Url } from '../../infrastructure/encoding/base64Url';
import { leggiIdentitaLocale } from '../../infrastructure/identity/identitaLocaleCorrente';
import { loadAlbum } from '../../infrastructure/persistence/localPersistence';

export const AlbumGallery = ({
  tacitusId,
  id,
}: {
  tacitusId: TacitusId;
  id: string;
}) => {
  const [images, setImages] = useState<string[]>([]);
  const [error, setError] = useState('');
  useEffect(() => {
    let active = true;
    void loadAlbum(leggiIdentitaLocale(), tacitusId, id)
      .then(value => {
        if (active) setImages(value);
      })
      .catch(() => {
        if (active) setError('Foto locali non disponibili.');
      });
    return () => {
      active = false;
    };
  }, [tacitusId, id]);
  return (
    <div className="album-gallery">
      {error && <p role="alert">{error}</p>}
      {images.map((src, index) => (
        <a key={index} href={src} download={`foto-${index + 1}.webp`}>
          <img src={src} alt={`Foto ${index + 1}`} loading="lazy" />
        </a>
      ))}
    </div>
  );
};

export const AlbumConsent = ({ tacitusId }: { tacitusId: TacitusId }) => {
  const dispatch = useDispatch();
  const consent = useSelector(
    state => state.album.preferenze.contatti[tacitusId] ?? 'ask',
  );
  const change = (event: ChangeEvent<HTMLSelectElement>) => {
    const value = event.target.value;
    if (value === 'ask' || value === 'allow' || value === 'block')
      dispatch(consensoFotoCambiato({ tacitusId, consenso: value }));
  };
  return (
    <label className="contact-photo-setting">
      Foto
      <select
        aria-label="Foto da questo Contatto"
        value={consent}
        onChange={change}>
        <option value="ask">Chiedi consenso</option>
        <option value="allow">Accetta automaticamente</option>
        <option value="block">Non ricevere</option>
      </select>
    </label>
  );
};

export const AlbumComposer = ({
  tacitusId,
  disabled,
}: {
  tacitusId: TacitusId;
  disabled: boolean;
}) => {
  const dispatch = useDispatch();
  // Prepared image buffers belong to this preview, not to the persisted application state.
  const [images, setImages] = useState<Uint8Array[]>([]);
  const [preparing, setPreparing] = useState(false);
  const generation = useRef(0);
  const offer = useSelector(state => state.album.offerte[tacitusId]);
  const progress = useSelector(state => state.album.progresso[tacitusId]);
  const showError = (reason: unknown) =>
    dispatch(
      erroreMostrato(
        reason instanceof Error
          ? reason.message
          : 'Preparazione Album non riuscita.',
      ),
    );
  const choose = async (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    const current = ++generation.current;
    setImages([]);
    if (!files.length) return;
    setPreparing(true);
    try {
      const prepared = await prepareImages(files);
      if (current === generation.current) setImages(prepared);
    } catch (reason) {
      if (current === generation.current) showError(reason);
    } finally {
      if (current === generation.current) setPreparing(false);
    }
  };
  const cancelPreview = () => {
    generation.current++;
    setImages([]);
    setPreparing(false);
  };
  const send = () => {
    const prepared = images;
    setImages([]);
    void inviaAlbum(tacitusId, prepared).catch(showError);
  };
  const accept = () => rispondiAlbum(tacitusId, true);
  const reject = () => rifiutaFoto(tacitusId);
  const cancelTransfer = () => annullaAlbum(tacitusId);
  useEffect(
    () => () => {
      generation.current++;
    },
    [tacitusId],
  );
  return (
    <div className="album-composer">
      {offer && (
        <div className="album-consent" role="status">
          <p>Accettare foto da questo Contatto?</p>
          <small>
            {offer.count} foto. Accettando, anche le successive saranno
            accettate. Puoi revocare il consenso nelle impostazioni del
            Contatto.
          </small>
          <button onClick={accept}>Accetta foto</button>
          <button onClick={reject}>Rifiuta foto</button>
        </div>
      )}
      {progress && (
        <div role="status">
          {progress}
          <button onClick={cancelTransfer}>Interrompi album</button>
        </div>
      )}
      {!!images.length && (
        <div className="album-preview">
          <div>
            {images.map((image, index) => (
              <img
                key={index}
                src={
                  'data:image/webp;base64,' +
                  toBase64Url(image).replace(/-/g, '+').replace(/_/g, '/')
                }
                alt={`Anteprima ${index + 1}`}
              />
            ))}
          </div>
          <button onClick={cancelPreview}>Annulla album</button>
          <button disabled={disabled} onClick={send}>
            Invia album
          </button>
        </div>
      )}
      <label className="photo-input">
        ＋ Foto
        <input
          aria-label="Scegli foto"
          type="file"
          accept="image/jpeg,image/png,image/webp"
          multiple
          disabled={disabled || preparing || !!progress}
          onChange={choose}
        />
      </label>
      <small>
        {preparing
          ? 'Preparazione foto…'
          : '1–10 foto · JPEG, PNG, WebP · originali ≤20 MiB/24 MP · invio WebP ≤5 MiB/foto, lato ≤2048 px'}
      </small>
    </div>
  );
};

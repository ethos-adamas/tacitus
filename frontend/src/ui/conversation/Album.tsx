import { useEffect, useRef, useState, type ChangeEvent } from 'react';
import type { TacitusId } from '../../domain/tacitusId';
import {
  annullaAlbum,
  rifiutaFoto,
  rispondiAlbum,
} from '../../application/album/trasferimentiAlbum';
import { consensoFotoCambiato } from '../../application/store/albumSlice';
import { useDispatch, useSelector } from '../../application/store/hooks';
import { MAX_IMAGES } from '../../infrastructure/album/album';
import { leggiIdentitaLocale } from '../../infrastructure/identity/identitaLocaleCorrente';
import { loadAlbum } from '../../infrastructure/persistence/localPersistence';
import PhotoViewer from '../kit/PhotoViewer';
import { SelectField } from '../kit/Fields';
import { Button } from '../kit/Button';

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
    setImages([]);
    setError('');
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
        <PhotoViewer
          key={`${tacitusId}-${id}-${index}`}
          src={src}
          alt={`Foto ${index + 1}`}
          downloadName={`foto-${index + 1}.webp`}
        />
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
    <SelectField
      className="contact-photo-select"
      label="Foto"
      aria-label="Foto da questo Contatto"
      value={consent}
      onChange={change}>
      <option value="ask">Chiedi consenso</option>
      <option value="allow">Accetta automaticamente</option>
      <option value="block">Non ricevere</option>
    </SelectField>
  );
};

type PhotoPickerProps = {
  disabled: boolean;
  onFiles: (files: File[]) => void;
};

export const PhotoPicker = ({ disabled, onFiles }: PhotoPickerProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const openPicker = () => inputRef.current?.click();
  const chooseFiles = (event: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = '';
    if (files.length) onFiles(files);
  };
  return (
    <>
      <Button type="button" disabled={disabled} onClick={openPicker}>
        Aggiungi foto
      </Button>
      <input
        ref={inputRef}
        className="photo-picker-input"
        aria-label="Scegli foto"
        type="file"
        accept="image/jpeg,image/png,image/webp"
        multiple
        disabled={disabled}
        onChange={chooseFiles}
      />
    </>
  );
};

type FotoPreview = Readonly<{ id: string; src: string }>;

type AlbumPreviewProps = {
  foto: readonly FotoPreview[];
  preparing: boolean;
  sending: boolean;
  sendDisabled: boolean;
  onRemove: (fotoId: string) => void;
  onCancel: () => void;
  onSend: () => void;
};

type PhotoThumbnailProps = {
  foto: FotoPreview;
  index: number;
  disabled: boolean;
  onRemove: (fotoId: string) => void;
};

const PhotoThumbnail = ({
  disabled,
  foto,
  index,
  onRemove,
}: PhotoThumbnailProps) => {
  const remove = () => onRemove(foto.id);
  return (
    <figure>
      <img src={foto.src} alt={`Anteprima ${index + 1}`} />
      <Button
        type="button"
        variant="ghost"
        disabled={disabled}
        aria-label={`Rimuovi foto ${index + 1}`}
        onClick={remove}>
        ×
      </Button>
    </figure>
  );
};

export const AlbumPreview = ({
  foto,
  onCancel,
  onRemove,
  onSend,
  preparing,
  sendDisabled,
  sending,
}: AlbumPreviewProps) => {
  if (!foto.length && !preparing && !sending) return null;
  return (
    <section className="album-preview" aria-label="Anteprima Album">
      <div className="album-preview-heading">
        <strong>
          {foto.length}/{MAX_IMAGES} foto
        </strong>
        {preparing && <span role="status">Preparazione foto…</span>}
      </div>
      <div className="album-preview-list">
        {foto.map((item, index) => (
          <PhotoThumbnail
            key={item.id}
            foto={item}
            index={index}
            disabled={preparing || sending}
            onRemove={onRemove}
          />
        ))}
      </div>
      <div className="album-preview-actions">
        <Button type="button" disabled={sending} onClick={onCancel}>
          Annulla album
        </Button>
        <Button
          type="button"
          variant="primary"
          disabled={sendDisabled}
          onClick={onSend}>
          Invia album
        </Button>
      </div>
    </section>
  );
};

export const AlbumTransferStatus = ({
  tacitusId,
}: {
  tacitusId: TacitusId;
}) => {
  const offer = useSelector(state => state.album.offerte[tacitusId]);
  const progress = useSelector(state => state.album.progresso[tacitusId]);
  const accept = () => rispondiAlbum(tacitusId, true);
  const reject = () => rifiutaFoto(tacitusId);
  const cancelTransfer = () => annullaAlbum(tacitusId);
  return (
    <>
      {offer && (
        <div className="album-consent" role="status">
          <p>Accettare foto da questo Contatto?</p>
          <small>
            {offer.count} foto. Accettando, anche le successive saranno
            accettate. Puoi revocare il consenso nelle impostazioni del
            Contatto.
          </small>
          <Button type="button" onClick={accept}>
            Accetta foto
          </Button>
          <Button type="button" onClick={reject}>
            Rifiuta foto
          </Button>
        </div>
      )}
      {progress && (
        <div role="status">
          {progress}
          <Button type="button" onClick={cancelTransfer}>
            Interrompi album
          </Button>
        </div>
      )}
    </>
  );
};

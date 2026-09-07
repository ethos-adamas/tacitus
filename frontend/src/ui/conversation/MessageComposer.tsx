import type { ReactNode } from 'react';
import { useAnteprimaAlbum } from '../../application/hooks/useAnteprimaAlbum';
import type { Tema } from '../../domain/preferenze';
import type { TacitusId } from '../../domain/tacitusId';
import { AlbumPreview, AlbumTransferStatus, PhotoPicker } from './Album';
import EmojiComposer from '../emoji/EmojiComposer';
import PhotoDropzone from '../kit/PhotoDropzone';

type MessageComposerProps = {
  tacitusId: TacitusId;
  value: string;
  theme: Tema;
  disabled: boolean;
  placeholder: string;
  maxLength: number;
  onChange: (value: string) => void;
  onSend: () => void;
};

const MessageComposer = ({
  disabled,
  maxLength,
  onChange,
  onSend,
  placeholder,
  tacitusId,
  theme,
  value,
}: MessageComposerProps) => {
  const {
    foto,
    onCancel,
    onFiles,
    onFilesError,
    onRemove,
    onSend: sendAlbum,
    photosDisabled,
    preparing,
    sendDisabled,
    sending,
  } = useAnteprimaAlbum(tacitusId, disabled);
  const attachment: ReactNode = (
    <PhotoPicker disabled={photosDisabled} onFiles={onFiles} />
  );

  return (
    <div className="message-composer">
      <AlbumTransferStatus tacitusId={tacitusId} />
      <AlbumPreview
        foto={foto}
        preparing={preparing}
        sending={sending}
        sendDisabled={sendDisabled}
        onRemove={onRemove}
        onCancel={onCancel}
        onSend={sendAlbum}
      />
      <PhotoDropzone
        disabled={photosDisabled}
        onFiles={onFiles}
        onFilesError={onFilesError}>
        <EmojiComposer
          value={value}
          maxLength={maxLength}
          placeholder={placeholder}
          disabled={disabled}
          theme={theme}
          attachment={attachment}
          onFiles={onFiles}
          onFilesError={onFilesError}
          onChange={onChange}
          onSend={onSend}
        />
      </PhotoDropzone>
    </div>
  );
};

export default MessageComposer;

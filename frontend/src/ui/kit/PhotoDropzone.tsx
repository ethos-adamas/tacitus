import { useEffect, type DragEvent, type ReactNode } from 'react';
import {
  useDropzone,
  type DropEvent,
  type FileRejection,
} from 'react-dropzone';

type PhotoDropzoneProps = {
  children: ReactNode;
  disabled: boolean;
  onFiles: (files: File[]) => void;
  onFilesError: (reason: unknown) => void;
};

export const contieneFile = (
  dataTransfer: DataTransfer | null | undefined,
): boolean =>
  Boolean(
    dataTransfer &&
    (Array.from(dataTransfer.types).includes('Files') ||
      Array.from(dataTransfer.items).some(item => item.kind === 'file')),
  );

const dataTransferFrom = (event: DropEvent): DataTransfer | undefined => {
  if (typeof event !== 'object' || event === null || !('dataTransfer' in event))
    return undefined;
  return event.dataTransfer ?? undefined;
};

export const getFilesFromEvent = (
  event: DropEvent,
): Promise<Array<File | DataTransferItem>> => {
  try {
    const dataTransfer = dataTransferFrom(event);
    if (!dataTransfer) return Promise.resolve([]);
    const eventType = 'type' in event ? event.type : '';
    if (eventType !== 'drop')
      return Promise.resolve(
        Array.from(dataTransfer.items).filter(item => item.kind === 'file'),
      );
    const hasDirectory = Array.from(dataTransfer.items).some(item => {
      const entry = item.webkitGetAsEntry?.();
      return entry?.isDirectory === true;
    });
    if (hasDirectory)
      return Promise.reject(new Error('Trascina file foto, non cartelle.'));
    return Promise.resolve(Array.from(dataTransfer.files));
  } catch (reason) {
    return Promise.reject(reason);
  }
};

const firstRejectionReason = (rejections: FileRejection[]) =>
  rejections[0]?.errors[0]?.message ?? 'Trascina file foto non validi.';

export const PhotoDropzone = ({
  children,
  disabled,
  onFiles,
  onFilesError,
}: PhotoDropzoneProps) => {
  const onDrop = (acceptedFiles: File[], fileRejections: FileRejection[]) => {
    if (fileRejections.length) {
      onFilesError(new Error(firstRejectionReason(fileRejections)));
      return;
    }
    if (acceptedFiles.length) onFiles(acceptedFiles);
  };
  const { getRootProps, isDragActive } = useDropzone({
    disabled,
    getFilesFromEvent,
    maxFiles: 0,
    maxSize: Infinity,
    minSize: 0,
    multiple: true,
    noClick: true,
    noDragEventsBubbling: false,
    noKeyboard: true,
    onDrop,
    onError: onFilesError,
    preventDropOnDocument: false,
  });
  const rootProps = getRootProps();
  const onDragEnter = (event: DragEvent<HTMLDivElement>) => {
    if (!contieneFile(event.dataTransfer)) return;
    event.preventDefault();
    rootProps.onDragEnter?.(event);
  };
  const onDragOver = (event: DragEvent<HTMLDivElement>) => {
    if (!contieneFile(event.dataTransfer)) return;
    event.preventDefault();
    rootProps.onDragOver?.(event);
  };
  const onDropEvent = (event: DragEvent<HTMLDivElement>) => {
    if (!contieneFile(event.dataTransfer)) return;
    event.preventDefault();
    if (disabled) {
      onFilesError(new Error('Il Contatto non è pronto per ricevere foto.'));
      return;
    }
    rootProps.onDrop?.(event);
  };
  const onDragLeave = (event: DragEvent<HTMLDivElement>) => {
    rootProps.onDragLeave?.(event);
  };

  return (
    <div
      {...rootProps}
      className="photo-dropzone"
      data-photo-dropzone="true"
      data-disabled={disabled}
      onDragEnter={onDragEnter}
      onDragLeave={onDragLeave}
      onDragOver={onDragOver}
      onDrop={onDropEvent}>
      {children}
      {isDragActive && !disabled && (
        <div className="photo-dropzone-active" role="status">
          Rilascia le foto per aggiungerle all&apos;Album
        </div>
      )}
    </div>
  );
};

export const usePhotoDropProtection = (): void => {
  useEffect(() => {
    const protectFileDrag = (event: globalThis.DragEvent) => {
      if (!contieneFile(event.dataTransfer)) return;
      event.preventDefault();
      if (event.type === 'dragover' && event.dataTransfer) {
        const target = event.target;
        const dropzone =
          target instanceof Element
            ? target.closest<HTMLElement>('[data-photo-dropzone]')
            : null;
        event.dataTransfer.dropEffect =
          dropzone?.dataset.disabled === 'false' ? 'copy' : 'none';
      }
    };
    window.addEventListener('dragover', protectFileDrag);
    window.addEventListener('drop', protectFileDrag);
    return () => {
      window.removeEventListener('dragover', protectFileDrag);
      window.removeEventListener('drop', protectFileDrag);
    };
  }, []);
};

export default PhotoDropzone;

import {
  useRef,
  useState,
  type KeyboardEvent,
  type MouseEvent,
  type TouchEvent,
  type WheelEvent,
} from 'react';
import { Download, X } from 'lucide-react';
import * as DialogPrimitive from 'radix-ui';
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
} from 'react-zoom-pan-pinch';
import { Button, DownloadLink } from './Button';

export type Photo = Readonly<{
  src: string;
  alt: string;
  downloadName: string;
}>;

type PhotoViewerProps = {
  photos: readonly Photo[];
  index: number | undefined;
  onIndexChange: (index: number) => void;
  onClose: () => void;
};

// A pause this long between wheel events starts a new gesture: one photo per gesture.
const WHEEL_GESTURE_GAP_MS = 200;
const SWIPE_DISTANCE_PX = 60;
const MAX_ZOOM = 4;

const PhotoViewer = ({
  index,
  onClose,
  onIndexChange,
  photos,
}: PhotoViewerProps) => {
  const zoom = useRef<ReactZoomPanPinchContentRef>(null);
  const lastWheel = useRef(Number.NEGATIVE_INFINITY);
  const touchStart = useRef<{ x: number; y: number } | undefined>(undefined);
  const returnFocus = useRef<HTMLElement | null>(null);
  const [failed, setFailed] = useState<string>();
  const photo = index === undefined ? undefined : photos[index];

  const zoomed = () => (zoom.current?.state.scale ?? 1) > 1.001;
  const show = (step: number) => {
    if (index === undefined) return;
    const next = index + step;
    if (next >= 0 && next < photos.length) onIndexChange(next);
  };

  const changeOpen = (open: boolean) => {
    if (!open) onClose();
  };
  const rememberFocus = () => {
    returnFocus.current =
      document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
  };
  const restoreFocus = (event: Event) => {
    event.preventDefault();
    returnFocus.current?.focus();
  };
  // Ctrl/⌘ + wheel (and trackpad pinch, which sets ctrlKey) belongs to the zoom.
  const browseWithWheel = (event: WheelEvent) => {
    if (event.ctrlKey || event.metaKey) return;
    const delta =
      Math.abs(event.deltaY) >= Math.abs(event.deltaX)
        ? event.deltaY
        : event.deltaX;
    const newGesture =
      event.timeStamp - lastWheel.current > WHEEL_GESTURE_GAP_MS;
    lastWheel.current = event.timeStamp;
    if (delta && newGesture) show(delta > 0 ? 1 : -1);
  };
  const browseWithKeyboard = (event: KeyboardEvent) => {
    if (event.key === 'ArrowRight' || event.key === 'PageDown') show(1);
    else if (event.key === 'ArrowLeft' || event.key === 'PageUp') show(-1);
    else if (event.key === '+' || event.key === '=')
      zoom.current?.zoomIn(0.5, 0);
    else if (event.key === '-') zoom.current?.zoomOut(0.5, 0);
    else if (event.key === '0') zoom.current?.resetTransform(0);
  };
  const startSwipe = (event: TouchEvent) => {
    const touch = event.touches[0];
    touchStart.current =
      event.touches.length === 1 && !zoomed()
        ? { x: touch.clientX, y: touch.clientY }
        : undefined;
  };
  const endSwipe = (event: TouchEvent) => {
    const start = touchStart.current;
    const touch = event.changedTouches[0];
    touchStart.current = undefined;
    if (!start || !touch) return;
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (Math.abs(dx) > SWIPE_DISTANCE_PX && Math.abs(dx) > Math.abs(dy))
      show(dx < 0 ? 1 : -1);
  };
  const closeOnBackground = (event: MouseEvent) => {
    if (!(event.target instanceof HTMLImageElement) && !zoomed()) onClose();
  };
  const markFailed = () => setFailed(photo?.src);

  return (
    <DialogPrimitive.Dialog.Root
      open={photo !== undefined}
      onOpenChange={changeOpen}>
      <DialogPrimitive.Dialog.Portal>
        <DialogPrimitive.Dialog.Overlay className="photo-viewer-backdrop" />
        <DialogPrimitive.Dialog.Content
          className="photo-viewer"
          onOpenAutoFocus={rememberFocus}
          onCloseAutoFocus={restoreFocus}
          onWheel={browseWithWheel}
          onKeyDown={browseWithKeyboard}>
          {photo && index !== undefined && (
            <>
              <DialogPrimitive.Dialog.Title className="sr-only">
                {photo.alt}
              </DialogPrimitive.Dialog.Title>
              <DialogPrimitive.Dialog.Description className="sr-only">
                Ctrl e rotellina o pizzico per lo zoom; rotellina, frecce o
                scorrimento per cambiare foto.
              </DialogPrimitive.Dialog.Description>
              <div
                className="photo-viewer-stage"
                onClick={closeOnBackground}
                onTouchStart={startSwipe}
                onTouchEnd={endSwipe}>
                {failed === photo.src ? (
                  <p className="photo-viewer-error" role="alert">
                    Impossibile visualizzare questa foto.
                  </p>
                ) : (
                  <TransformWrapper
                    key={index}
                    ref={zoom}
                    minScale={1}
                    maxScale={MAX_ZOOM}
                    limitToBounds
                    wheel={{ step: 0.1, activationKeys: ['Control'] }}
                    trackPadPanning={{ disabled: true }}
                    doubleClick={{ mode: 'toggle', step: 1 }}
                    panning={{ velocityDisabled: true }}>
                    <TransformComponent
                      wrapperClass="photo-viewer-zoom-area"
                      contentClass="photo-viewer-zoom-content">
                      <img
                        className="photo-viewer-image"
                        src={photo.src}
                        alt={photo.alt}
                        draggable={false}
                        onError={markFailed}
                      />
                    </TransformComponent>
                  </TransformWrapper>
                )}
              </div>
              <div className="photo-viewer-bar">
                {photos.length > 1 && (
                  <span className="photo-viewer-count" aria-live="polite">
                    {index + 1} / {photos.length}
                  </span>
                )}
                <DownloadLink
                  className="photo-viewer-action"
                  href={photo.src}
                  download={photo.downloadName}
                  aria-label="Scarica foto"
                  title="Scarica foto">
                  <Download size={22} aria-hidden="true" />
                </DownloadLink>
                <DialogPrimitive.Dialog.Close asChild>
                  <Button
                    variant="ghost"
                    className="photo-viewer-action"
                    aria-label="Chiudi"
                    title="Chiudi">
                    <X size={24} aria-hidden="true" />
                  </Button>
                </DialogPrimitive.Dialog.Close>
              </div>
            </>
          )}
        </DialogPrimitive.Dialog.Content>
      </DialogPrimitive.Dialog.Portal>
    </DialogPrimitive.Dialog.Root>
  );
};

export default PhotoViewer;

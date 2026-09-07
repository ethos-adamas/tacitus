import { useEffect, useState, type SyntheticEvent } from 'react';
import {
  TransformComponent,
  TransformWrapper,
  type ReactZoomPanPinchContentRef,
} from 'react-zoom-pan-pinch';
import { Button, DownloadLink } from './Button';
import { Modal } from './Modal';

type PhotoViewerProps = {
  src: string;
  alt: string;
  downloadName: string;
};

type Size = { width: number; height: number };

export type Fit = { fit: number; x: number; y: number };

export const calculateFit = (
  stageWidth: number,
  stageHeight: number,
  imageWidth: number,
  imageHeight: number,
): Fit | undefined => {
  if (
    stageWidth <= 0 ||
    stageHeight <= 0 ||
    imageWidth <= 0 ||
    imageHeight <= 0
  )
    return undefined;
  const fit = Math.min(1, stageWidth / imageWidth, stageHeight / imageHeight);
  return {
    fit,
    x: (stageWidth - imageWidth * fit) / 2,
    y: (stageHeight - imageHeight * fit) / 2,
  };
};

const roundedSizeKey = (size: Size, stage: Size) =>
  `${Math.round(size.width)}-${Math.round(size.height)}-${Math.round(stage.width)}-${Math.round(stage.height)}`;

const PhotoViewer = ({ alt, downloadName, src }: PhotoViewerProps) => {
  const [open, setOpen] = useState(false);
  const [natural, setNatural] = useState<Size>();
  const [stage, setStage] = useState<Size>();
  const [decodeError, setDecodeError] = useState(false);
  const [scale, setScale] = useState(0);
  const [transform, setTransform] = useState<ReactZoomPanPinchContentRef>();
  const [stageElement, setStageElement] = useState<HTMLDivElement | null>(null);
  const fit =
    natural && stage
      ? calculateFit(stage.width, stage.height, natural.width, natural.height)
      : undefined;

  useEffect(() => {
    if (!open) {
      setNatural(undefined);
      setStage(undefined);
      setDecodeError(false);
      setScale(0);
      setTransform(undefined);
      return;
    }
    if (!stageElement) return;
    const measure = () => {
      const rect = stageElement.getBoundingClientRect();
      const next = { width: rect.width, height: rect.height };
      setStage(current =>
        current?.width === next.width && current.height === next.height
          ? current
          : next,
      );
    };
    measure();
    if (typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver(measure);
    observer.observe(stageElement);
    return () => observer.disconnect();
  }, [open, stageElement]);

  const loadNaturalSize = (event: SyntheticEvent<HTMLImageElement>) => {
    const image = event.currentTarget;
    if (image.naturalWidth > 0 && image.naturalHeight > 0) {
      setDecodeError(false);
      setNatural({ width: image.naturalWidth, height: image.naturalHeight });
    } else setDecodeError(true);
  };

  const imageError = () => {
    setDecodeError(true);
    setNatural(undefined);
    setScale(0);
  };

  const minScale = fit?.fit ?? 0;
  const displayedScale = scale || minScale;
  const maxScale = minScale * 4;
  const step = minScale * 0.2;
  const zoomInDisabled = !transform || scale >= maxScale - 0.001;
  const zoomOutDisabled = !transform || scale <= minScale + 0.001;
  const zoomIn = () => {
    if (transform) void transform.zoomIn(step, 0);
  };
  const zoomOut = () => {
    if (transform) void transform.zoomOut(step, 0);
  };
  const reset = () => {
    if (transform && fit) void transform.setTransform(fit.x, fit.y, fit.fit, 0);
  };

  return (
    <Modal
      open={open}
      onOpenChange={setOpen}
      trigger={
        <Button
          type="button"
          variant="ghost"
          className="album-photo"
          aria-label={`Apri ${alt}`}>
          <img src={src} alt={alt} loading="lazy" />
        </Button>
      }
      title={alt}
      description="Usa la rotellina o due dita per lo zoom."
      size="image">
      <div className="photo-viewer">
        <div className="photo-viewer-stage" ref={setStageElement}>
          {decodeError && (
            <p className="photo-viewer-error" role="alert">
              Impossibile visualizzare questa foto.
            </p>
          )}
          {!decodeError && (!natural || !fit) && (
            <img
              className="photo-viewer-preload"
              src={src}
              alt=""
              aria-hidden="true"
              onLoad={loadNaturalSize}
              onError={imageError}
            />
          )}
          {!decodeError && fit && natural && stage && (
            <TransformWrapper
              key={`${src}-${roundedSizeKey(natural, stage)}`}
              initialScale={fit.fit}
              minScale={fit.fit}
              maxScale={fit.fit * 4}
              initialPositionX={fit.x}
              initialPositionY={fit.y}
              limitToBounds
              centerZoomedOut
              wheel={{
                disabled: false,
                step: 0.1,
                touchPadDisabled: true,
                wheelDisabled: false,
              }}
              pinch={{ step: 5, allowPanning: true }}
              panning={{ velocityDisabled: true }}
              trackPadPanning={{ disabled: true }}
              doubleClick={{ disabled: true }}
              zoomAnimation={{ disabled: true }}
              velocityAnimation={{ disabled: true }}
              autoAlignment={{ disabled: true, animationTime: 0 }}
              keyboard={{
                panStep: 40,
                zoomStep: fit.fit * 0.2,
                animationTime: 0,
              }}
              onInit={ref => setTransform(() => ref)}
              onTransform={(_ref, state) => setScale(state.scale)}>
              <TransformComponent
                wrapperClass="photo-viewer-zoom-area"
                contentClass="photo-viewer-zoom-content"
                wrapperProps={{
                  tabIndex: 0,
                  'aria-label': 'Foto ingrandita',
                }}>
                <img
                  className="photo-viewer-image"
                  src={src}
                  alt={alt}
                  width={natural.width}
                  height={natural.height}
                  draggable={false}
                  onError={imageError}
                />
              </TransformComponent>
            </TransformWrapper>
          )}
        </div>
        <div className="photo-viewer-toolbar" aria-label="Controlli foto">
          <Button
            type="button"
            onClick={zoomOut}
            disabled={zoomOutDisabled}
            aria-label="Riduci zoom">
            −
          </Button>
          <output aria-label="Zoom foto">
            {minScale ? Math.round((displayedScale / minScale) * 100) : 100}%
          </output>
          <Button
            type="button"
            onClick={zoomIn}
            disabled={zoomInDisabled}
            aria-label="Aumenta zoom">
            +
          </Button>
          <Button type="button" onClick={reset} aria-label="Ripristina zoom">
            100%
          </Button>
          <DownloadLink href={src} download={downloadName}>
            Scarica foto
          </DownloadLink>
        </div>
      </div>
    </Modal>
  );
};

export default PhotoViewer;

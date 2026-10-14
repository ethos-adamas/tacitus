import {
  cleanup,
  createEvent,
  fireEvent,
  render,
  screen,
} from '@testing-library/react';
import { useState } from 'react';
import { afterEach, expect, it } from 'vitest';
import PhotoViewer, { type Photo } from '../PhotoViewer';

afterEach(cleanup);

const photos: readonly Photo[] = [
  {
    src: 'data:image/webp;base64,AAAA',
    alt: 'Foto 1',
    downloadName: 'foto-1.webp',
  },
  {
    src: 'data:image/webp;base64,BBBB',
    alt: 'Foto 2',
    downloadName: 'foto-2.webp',
  },
  {
    src: 'data:image/webp;base64,CCCC',
    alt: 'Foto 3',
    downloadName: 'foto-3.webp',
  },
];

const Harness = ({ initial }: { initial: number | undefined }) => {
  const [index, setIndex] = useState(initial);
  const close = () => setIndex(undefined);
  return (
    <PhotoViewer
      photos={photos}
      index={index}
      onIndexChange={setIndex}
      onClose={close}
    />
  );
};

const wheel = (
  target: Element,
  init: { deltaY: number; ctrlKey?: boolean },
  timeStamp: number,
) => {
  const event = createEvent.wheel(target, init);
  Object.defineProperty(event, 'timeStamp', { value: timeStamp });
  fireEvent(target, event);
};

const shownPhoto = () =>
  screen.getByRole('dialog').querySelector('img')?.getAttribute('alt');

it('mostra soltanto foto, contatore, download e chiusura senza istruzioni', () => {
  // Given / When
  render(<Harness initial={0} />);

  // Then
  expect(shownPhoto()).toBe('Foto 1');
  expect(screen.getByText('1 / 3')).toBeDefined();
  const download = screen.getByRole('link', { name: 'Scarica foto' });
  expect(download.getAttribute('download')).toBe('foto-1.webp');
  expect(screen.getAllByRole('button')).toHaveLength(1);
  expect(screen.getByRole('button', { name: 'Chiudi' })).toBeDefined();
  expect(screen.queryByText(/rotellina/i, { ignore: '.sr-only' })).toBeNull();
});

it('la rotellina senza Ctrl scorre la galleria, con Ctrl resta allo zoom', () => {
  // Given
  render(<Harness initial={0} />);
  const dialog = screen.getByRole('dialog');

  // When
  wheel(dialog, { deltaY: 100 }, 1_000);

  // Then
  expect(shownPhoto()).toBe('Foto 2');

  // When: the rest of the same gesture and a Ctrl+wheel zoom
  wheel(dialog, { deltaY: 100 }, 1_050);
  wheel(dialog, { deltaY: 100, ctrlKey: true }, 2_000);

  // Then
  expect(shownPhoto()).toBe('Foto 2');

  // When: a new gesture upwards
  wheel(dialog, { deltaY: -100 }, 3_000);

  // Then
  expect(shownPhoto()).toBe('Foto 1');
});

it('le frecce scorrono la galleria senza oltrepassarne i limiti', () => {
  // Given
  render(<Harness initial={2} />);
  const dialog = screen.getByRole('dialog');

  // When
  fireEvent.keyDown(dialog, { key: 'ArrowRight' });

  // Then
  expect(shownPhoto()).toBe('Foto 3');

  // When
  fireEvent.keyDown(dialog, { key: 'ArrowLeft' });

  // Then
  expect(shownPhoto()).toBe('Foto 2');
});

it('lo scorrimento orizzontale con un dito cambia foto su mobile', () => {
  // Given
  render(<Harness initial={0} />);
  const stage = screen
    .getByRole('dialog')
    .querySelector('.photo-viewer-stage')!;

  // When
  const start = [{ clientX: 300, clientY: 400 }];
  const end = [{ clientX: 150, clientY: 410 }];
  fireEvent.touchStart(stage, { touches: start, changedTouches: start });
  fireEvent.touchEnd(stage, { touches: [], changedTouches: end });

  // Then
  expect(shownPhoto()).toBe('Foto 2');
});

it('chiude con il pulsante e cliccando fuori dalla foto', () => {
  // Given
  const { unmount } = render(<Harness initial={0} />);

  // When
  fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));

  // Then
  expect(screen.queryByRole('dialog')).toBeNull();
  unmount();

  // Given
  render(<Harness initial={0} />);

  // When
  fireEvent.click(
    screen.getByRole('dialog').querySelector('.photo-viewer-stage')!,
  );

  // Then
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('mantiene la chiusura disponibile quando la foto non è decodificabile', () => {
  // Given
  render(<Harness initial={0} />);

  // When
  fireEvent.error(screen.getByRole('dialog').querySelector('img')!);

  // Then
  expect(screen.getByRole('alert').textContent).toContain(
    'Impossibile visualizzare questa foto.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Chiudi' }));
  expect(screen.queryByRole('dialog')).toBeNull();
});

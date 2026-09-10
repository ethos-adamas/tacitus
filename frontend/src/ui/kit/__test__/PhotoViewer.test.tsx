import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import PhotoViewer, { calculateFit } from '../PhotoViewer';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

it('calcola il fit orizzontale e il limite massimo quattro volte', () => {
  // Given
  const fit = calculateFit(500, 400, 2000, 1000);

  // When / Then
  expect(fit).toEqual({ fit: 0.25, x: 0, y: 75 });
  expect(fit && fit.fit * 4).toBe(1);
});

it('calcola il fit verticale e centra una foto piccola senza ingrandirla', () => {
  // Given / When
  const vertical = calculateFit(500, 400, 1000, 2000);
  const small = calculateFit(500, 400, 200, 100);

  // Then
  expect(vertical).toEqual({ fit: 0.2, x: 150, y: 0 });
  expect(small).toEqual({ fit: 1, x: 150, y: 150 });
  expect(calculateFit(0, 400, 200, 100)).toBeUndefined();
});

it('apre senza download automatico e offre il download soltanto nella modale', () => {
  // Given
  render(
    <PhotoViewer
      src="data:image/webp;base64,AAAA"
      alt="Foto 1"
      downloadName="foto-1.webp"
    />,
  );

  // When
  fireEvent.click(screen.getByRole('button', { name: 'Apri Foto 1' }));

  // Then
  expect(screen.getByRole('dialog')).toBeDefined();
  const download = screen.getByRole('link', { name: 'Scarica foto' });
  expect(download.getAttribute('download')).toBe('foto-1.webp');
  expect(screen.queryByRole('link', { name: 'Apri Foto 1' })).toBeNull();
});

it('mantiene disponibile la chiusura quando la foto non è decodificabile', () => {
  // Given
  render(
    <PhotoViewer
      src="data:image/webp;base64,AAAA"
      alt="Foto 1"
      downloadName="foto-1.webp"
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Apri Foto 1' }));

  // When
  fireEvent.error(document.querySelector('.photo-viewer-preload')!);

  // Then
  expect(screen.getByRole('alert').textContent).toContain(
    'Impossibile visualizzare questa foto.',
  );
  fireEvent.click(screen.getAllByRole('button', { name: 'Chiudi' }).at(-1)!);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('collega un aiuto tastiera visibile con un ID distinto per ogni viewer', async () => {
  // Given
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      disconnect() {}
    },
  );
  const originalRect = HTMLElement.prototype.getBoundingClientRect;
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockImplementation(
    function (this: HTMLElement) {
      if (this.classList.contains('photo-viewer-stage'))
        return {
          width: 500,
          height: 400,
          top: 0,
          left: 0,
          right: 500,
          bottom: 400,
          x: 0,
          y: 0,
          toJSON: () => ({}),
        } as DOMRect;
      return originalRect.call(this);
    },
  );
  render(
    <>
      <PhotoViewer
        src="data:image/webp;base64,AAAA"
        alt="Foto 1"
        downloadName="foto-1.webp"
      />
      <PhotoViewer
        src="data:image/webp;base64,BBBB"
        alt="Foto 2"
        downloadName="foto-2.webp"
      />
    </>,
  );

  // When
  for (const trigger of screen.getAllByRole('button', {
    name: /^Apri Foto [12]$/,
  }))
    fireEvent.click(trigger);
  const preloads = Array.from(
    document.querySelectorAll<HTMLImageElement>('.photo-viewer-preload'),
  );
  for (const preload of preloads) {
    Object.defineProperties(preload, {
      naturalWidth: { configurable: true, value: 1000 },
      naturalHeight: { configurable: true, value: 800 },
    });
    fireEvent.load(preload);
  }

  // Then
  await waitFor(() =>
    expect(screen.getAllByLabelText('Foto ingrandita')).toHaveLength(2),
  );
  const helpIds = screen
    .getAllByText('+/− ingrandisci, frecce spostano, 0 ripristina.')
    .map(element => element.id);
  expect(new Set(helpIds).size).toBe(2);
  for (const wrapper of screen.getAllByLabelText('Foto ingrandita'))
    expect(helpIds).toContain(wrapper.getAttribute('aria-describedby'));
});

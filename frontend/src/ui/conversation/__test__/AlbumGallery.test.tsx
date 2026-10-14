import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { parseTacitusId } from '../../../domain/tacitusId';
import { AlbumGallery } from '../Album';

const { loadAlbum } = vi.hoisted(() => ({ loadAlbum: vi.fn() }));
vi.mock('../../../infrastructure/persistence/localPersistence', () => ({
  loadAlbum,
}));
vi.mock('../../../infrastructure/identity/identitaLocaleCorrente', () => ({
  leggiIdentitaLocale: vi.fn(() => ({ provider: 'browser' })),
}));

afterEach(() => {
  cleanup();
  loadAlbum.mockReset();
});

const tacitusId = parseTacitusId('2G2DX-6P175-0PJ6E-Q37T0-Q94YJC');
const onLoaded = vi.fn();
const onOpen = vi.fn();

afterEach(() => {
  onLoaded.mockReset();
  onOpen.mockReset();
});

it('apre la foto scelta senza un link di download implicito', async () => {
  // Given
  loadAlbum.mockResolvedValue([
    'data:image/webp;base64,AAAA',
    'data:image/webp;base64,BBBB',
  ]);
  render(
    <AlbumGallery
      tacitusId={tacitusId}
      id="album-1"
      onLoaded={onLoaded}
      onOpen={onOpen}
    />,
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Apri Foto 2' })).toBeDefined(),
  );

  // When
  fireEvent.click(screen.getByRole('button', { name: 'Apri Foto 2' }));

  // Then
  expect(screen.queryByRole('link')).toBeNull();
  expect(onLoaded).toHaveBeenCalledWith('album-1', [
    'data:image/webp;base64,AAAA',
    'data:image/webp;base64,BBBB',
  ]);
  expect(onOpen).toHaveBeenCalledWith('album-1', 1);
});

it('ignora il risultato di un Album precedente quando cambia Contatto', async () => {
  // Given
  let resolveFirst: ((value: string[]) => void) | undefined;
  let resolveSecond: ((value: string[]) => void) | undefined;
  loadAlbum
    .mockImplementationOnce(
      () => new Promise(resolve => (resolveFirst = resolve)),
    )
    .mockImplementationOnce(
      () => new Promise(resolve => (resolveSecond = resolve)),
    );
  const { rerender } = render(
    <AlbumGallery
      tacitusId={tacitusId}
      id="album-1"
      onLoaded={onLoaded}
      onOpen={onOpen}
    />,
  );

  // When
  rerender(
    <AlbumGallery
      tacitusId={tacitusId}
      id="album-2"
      onLoaded={onLoaded}
      onOpen={onOpen}
    />,
  );
  await waitFor(() => expect(loadAlbum).toHaveBeenCalledTimes(2));
  resolveFirst?.(['data:image/webp;base64,old']);
  resolveSecond?.(['data:image/webp;base64,new']);

  // Then
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Apri Foto 1' })).toBeDefined(),
  );
  expect(onLoaded).toHaveBeenCalledTimes(1);
  expect(onLoaded).toHaveBeenCalledWith('album-2', [
    'data:image/webp;base64,new',
  ]);
  expect(screen.queryByText('Foto locali non disponibili.')).toBeNull();
});

it('mostra un errore esplicito se il contenuto locale non è disponibile', async () => {
  // Given
  loadAlbum.mockRejectedValue(new Error('offline'));
  render(
    <AlbumGallery
      tacitusId={tacitusId}
      id="album-1"
      onLoaded={onLoaded}
      onOpen={onOpen}
    />,
  );

  // When / Then
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Foto locali non disponibili.',
  );
});

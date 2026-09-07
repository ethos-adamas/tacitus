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

it('mostra miniature apribili senza un link di download implicito', async () => {
  // Given
  loadAlbum.mockResolvedValue(['data:image/webp;base64,AAAA']);
  render(<AlbumGallery tacitusId={tacitusId} id="album-1" />);

  // When
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Apri Foto 1' })).toBeDefined(),
  );

  // Then
  expect(screen.queryByRole('link')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Apri Foto 1' }));
  expect(screen.getByRole('link', { name: 'Scarica foto' })).toBeDefined();
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
    <AlbumGallery tacitusId={tacitusId} id="album-1" />,
  );

  // When
  rerender(<AlbumGallery tacitusId={tacitusId} id="album-2" />);
  await waitFor(() => expect(loadAlbum).toHaveBeenCalledTimes(2));
  resolveFirst?.(['data:image/webp;base64,old']);
  resolveSecond?.(['data:image/webp;base64,new']);

  // Then
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Apri Foto 1' })).toBeDefined(),
  );
  expect(screen.getByRole('button', { name: 'Apri Foto 1' })).toBeDefined();
  expect(screen.queryByText('Foto locali non disponibili.')).toBeNull();
});

it('mostra un errore esplicito se il contenuto locale non è disponibile', async () => {
  // Given
  loadAlbum.mockRejectedValue(new Error('offline'));
  render(<AlbumGallery tacitusId={tacitusId} id="album-1" />);

  // When / Then
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Foto locali non disponibili.',
  );
});

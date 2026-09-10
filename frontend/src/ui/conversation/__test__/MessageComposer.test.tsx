import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { createTestStore } from '../../../application/store/store';
import {
  offertaAlbumRicevuta,
  progressoAlbumCambiato,
} from '../../../application/store/albumSlice';
import { parseTacitusId } from '../../../domain/tacitusId';
import MessageComposer from '../MessageComposer';

const { album, transfers } = vi.hoisted(() => ({
  album: {
    foto: [{ id: 'foto-1', src: 'data:image/webp;base64,AAAA' }],
    preparing: false,
    sending: false,
    photosDisabled: false,
    sendDisabled: false,
    onFiles: vi.fn(),
    onRemove: vi.fn(),
    onCancel: vi.fn(),
    onSend: vi.fn(),
  },
  transfers: {
    annullaAlbum: vi.fn(),
    rifiutaFoto: vi.fn(),
    rispondiAlbum: vi.fn(),
  },
}));
vi.mock('../../../application/hooks/useAnteprimaAlbum', () => ({
  useAnteprimaAlbum: () => album,
}));
vi.mock(
  '../../../application/album/trasferimentiAlbum',
  async importOriginal => ({
    ...(await importOriginal()),
    ...transfers,
  }),
);

afterEach(() => {
  cleanup();
  album.photosDisabled = false;
  album.foto = [{ id: 'foto-1', src: 'data:image/webp;base64,AAAA' }];
  vi.clearAllMocks();
});

const tacitusId = parseTacitusId('2G2DX-6P175-0PJ6E-Q37T0-Q94YJC');

it('conserva il testo e offre rimozione foto con nomi accessibili', () => {
  // Given
  const onChange = vi.fn();
  render(
    <Provider store={createTestStore()}>
      <MessageComposer
        tacitusId={tacitusId}
        value="testo già scritto"
        theme="light"
        disabled={false}
        placeholder="Scrivi"
        maxLength={100}
        onChange={onChange}
        onSend={vi.fn()}
      />
    </Provider>,
  );

  // When
  fireEvent.click(screen.getByRole('button', { name: 'Rimuovi foto 1' }));
  fireEvent.change(screen.getByLabelText('Messaggio'), {
    target: { value: 'testo aggiornato' },
  });

  // Then
  expect(album.onRemove).toHaveBeenCalledWith('foto-1');
  expect(onChange).toHaveBeenCalledWith('testo aggiornato');
});

it('disabilita il percorso foto e invio testo quando la Sessione non è pronta', () => {
  // Given
  album.photosDisabled = true;
  render(
    <Provider store={createTestStore()}>
      <MessageComposer
        tacitusId={tacitusId}
        value=""
        theme="light"
        disabled
        placeholder="Offline"
        maxLength={100}
        onChange={vi.fn()}
        onSend={vi.fn()}
      />
    </Provider>,
  );

  // When / Then
  expect(
    (screen.getByRole('button', { name: 'Aggiungi foto' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
  expect(
    (screen.getByRole('button', { name: 'Invia' }) as HTMLButtonElement)
      .disabled,
  ).toBe(true);
});

it('non monta un pannello di trasferimento quando non ci sono stati attivi', () => {
  // Given
  album.foto = [];
  render(
    <Provider store={createTestStore()}>
      <MessageComposer
        tacitusId={tacitusId}
        value=""
        theme="light"
        disabled={false}
        placeholder="Scrivi"
        maxLength={100}
        onChange={vi.fn()}
        onSend={vi.fn()}
      />
    </Provider>,
  );

  // When / Then
  expect(screen.queryByRole('status')).toBeNull();
  expect(screen.queryByRole('region', { name: 'Anteprima Album' })).toBeNull();
});

it('raggruppa i comandi del trasferimento e conserva i relativi handler', () => {
  // Given
  album.foto = [];
  const store = createTestStore();
  store.dispatch(offertaAlbumRicevuta({ tacitusId, id: 'album-1', count: 2 }));
  render(
    <Provider store={store}>
      <MessageComposer
        tacitusId={tacitusId}
        value=""
        theme="light"
        disabled={false}
        placeholder="Scrivi"
        maxLength={100}
        onChange={vi.fn()}
        onSend={vi.fn()}
      />
    </Provider>,
  );

  // When
  fireEvent.click(screen.getByRole('button', { name: 'Accetta foto' }));
  fireEvent.click(screen.getByRole('button', { name: 'Rifiuta foto' }));

  // Then
  expect(screen.getByRole('status').className).toContain('album-consent');
  expect(
    screen.getByRole('status').querySelector('.album-transfer-actions'),
  ).not.toBeNull();
  expect(transfers.rispondiAlbum).toHaveBeenCalledWith(tacitusId, true);
  expect(transfers.rifiutaFoto).toHaveBeenCalledWith(tacitusId);
});

it('mostra il progresso nel gruppo annullabile del trasferimento', () => {
  // Given
  album.foto = [];
  const store = createTestStore();
  store.dispatch(
    progressoAlbumCambiato({
      tacitusId,
      testo: 'Invio foto 1 di 2…',
    }),
  );
  render(
    <Provider store={store}>
      <MessageComposer
        tacitusId={tacitusId}
        value=""
        theme="light"
        disabled={false}
        placeholder="Scrivi"
        maxLength={100}
        onChange={vi.fn()}
        onSend={vi.fn()}
      />
    </Provider>,
  );

  // When
  fireEvent.click(screen.getByRole('button', { name: 'Interrompi album' }));

  // Then
  expect(screen.getByRole('status').className).toContain('album-progress');
  expect(transfers.annullaAlbum).toHaveBeenCalledWith(tacitusId);
});

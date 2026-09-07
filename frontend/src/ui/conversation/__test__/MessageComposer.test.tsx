import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { createTestStore } from '../../../application/store/store';
import { parseTacitusId } from '../../../domain/tacitusId';
import MessageComposer from '../MessageComposer';

const { album } = vi.hoisted(() => ({
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
}));
vi.mock('../../../application/hooks/useAnteprimaAlbum', () => ({
  useAnteprimaAlbum: () => album,
}));

afterEach(() => {
  cleanup();
  album.photosDisabled = false;
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

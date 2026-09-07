import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { createTestStore } from '../../../application/store/store';
import { contattoAssociato } from '../../../application/store/eventi';
import { ricezioneFotoCambiata } from '../../../application/store/albumSlice';
import { parseTacitusId } from '../../../domain/tacitusId';
import ContactSettingsDialog from '../ContactSettingsDialog';

const { bloccaContatto, rimuoviContatto } = vi.hoisted(() => ({
  bloccaContatto: vi.fn(),
  rimuoviContatto: vi.fn(),
}));
vi.mock('../../../application/hooks/useRelazioni', () => ({
  useRelazioni: () => ({ bloccaContatto, rimuoviContatto }),
}));

afterEach(() => {
  cleanup();
  bloccaContatto.mockReset();
  rimuoviContatto.mockReset();
});

const tacitusId = parseTacitusId('2G2DX-6P175-0PJ6E-Q37T0-Q94YJC');

const renderDialog = () => {
  const store = createTestStore();
  store.dispatch(
    contattoAssociato({ tacitusId, nickname: 'alice', online: true }),
  );
  render(
    <Provider store={store}>
      <ContactSettingsDialog tacitusId={tacitusId} nickname="alice" />
    </Provider>,
  );
  return store;
};

it('aggiorna il consenso subito e lo conserva alla riapertura', () => {
  // Given
  const store = renderDialog();
  fireEvent.click(
    screen.getByRole('button', { name: 'Impostazioni del Contatto' }),
  );

  // When
  fireEvent.change(screen.getByLabelText('Foto da questo Contatto'), {
    target: { value: 'allow' },
  });

  // Then
  expect(store.getState().album.preferenze.contatti[tacitusId]).toBe('allow');
  expect(
    (screen.getByLabelText('Foto da questo Contatto') as HTMLSelectElement)
      .value,
  ).toBe('allow');

  // When
  fireEvent.click(screen.getAllByRole('button', { name: 'Chiudi' }).at(-1)!);
  fireEvent.click(
    screen.getByRole('button', { name: 'Impostazioni del Contatto' }),
  );

  // Then
  expect(
    (screen.getByLabelText('Foto da questo Contatto') as HTMLSelectElement)
      .value,
  ).toBe('allow');
});

it('mostra l’avviso quando la ricezione globale è disattivata', () => {
  // Given
  const store = renderDialog();
  store.dispatch(ricezioneFotoCambiata(false));

  // When
  fireEvent.click(
    screen.getByRole('button', { name: 'Impostazioni del Contatto' }),
  );

  // Then
  expect(screen.getByRole('status').textContent).toContain(
    'disattivata nelle impostazioni generali',
  );
});

it('richiede una seconda conferma per rimuovere e bloccare', () => {
  // Given
  renderDialog();
  fireEvent.click(
    screen.getByRole('button', { name: 'Impostazioni del Contatto' }),
  );

  // When
  fireEvent.click(screen.getByRole('button', { name: 'Rimuovi Contatto' }));
  fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
  fireEvent.click(screen.getByRole('button', { name: 'Blocca Contatto' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Blocca definitivamente' }),
  );

  // Then
  expect(rimuoviContatto).not.toHaveBeenCalled();
  expect(bloccaContatto).toHaveBeenCalledTimes(1);
  expect(bloccaContatto).toHaveBeenCalledWith(tacitusId);
});

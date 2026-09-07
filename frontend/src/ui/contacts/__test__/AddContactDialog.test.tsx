import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useState } from 'react';
import { Provider } from 'react-redux';
import { createTestStore } from '../../../application/store/store';
import AddContactDialog from '../AddContactDialog';

const { creaIntento } = vi.hoisted(() => ({ creaIntento: vi.fn() }));
vi.mock('../../../application/hooks/useRelazioni', () => ({
  useRelazioni: () => ({ creaIntento }),
}));

afterEach(() => {
  cleanup();
  creaIntento.mockReset();
});

const renderDialog = (onClose = vi.fn()) => {
  const Harness = () => {
    const [open, setOpen] = useState(false);
    const close = () => {
      setOpen(false);
      onClose();
    };
    return (
      <Provider store={createTestStore()}>
        <AddContactDialog
          open={open}
          onClose={close}
          trigger={
            <button type="button" onClick={() => setOpen(true)}>
              Apri
            </button>
          }
        />
      </Provider>
    );
  };
  return render(<Harness />);
};

it('invia un Tacitus ID valido e chiude la modale', () => {
  // Given
  const onClose = vi.fn();
  renderDialog(onClose);
  fireEvent.click(screen.getByRole('button', { name: 'Apri' }));
  const input = screen.getByLabelText('Tacitus ID');

  // When
  fireEvent.change(input, {
    target: { value: '2G2DX-6P175-0PJ6E-Q37T0-Q94YJC' },
  });
  fireEvent.submit(input.closest('form')!);

  // Then
  expect(creaIntento).toHaveBeenCalledWith('2G2DX-6P175-0PJ6E-Q37T0-Q94YJC');
  expect(onClose).toHaveBeenCalledTimes(1);
});

it('mantiene aperta la modale per un ID errato e svuota il campo alla riapertura', async () => {
  // Given
  creaIntento.mockImplementation(() => {
    throw new Error('Tacitus ID non valido.');
  });
  renderDialog();
  fireEvent.click(screen.getByRole('button', { name: 'Apri' }));
  const input = screen.getByLabelText('Tacitus ID');

  // When
  fireEvent.change(input, { target: { value: 'errato' } });
  fireEvent.submit(input.closest('form')!);

  // Then
  expect((await screen.findByRole('alert')).textContent).toContain(
    'Tacitus ID non valido.',
  );
  expect(screen.getByRole('dialog')).toBeDefined();

  // When
  fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));
  fireEvent.click(screen.getByRole('button', { name: 'Apri' }));

  // Then
  await waitFor(() =>
    expect(
      (screen.getByLabelText('Tacitus ID') as HTMLInputElement).value,
    ).toBe(''),
  );
});

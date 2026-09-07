import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Button } from '../Button';
import { ConfirmDialog } from '../ConfirmDialog';

afterEach(cleanup);

it('annulla senza chiamare la conferma', () => {
  // Given
  const onConfirm = vi.fn();
  render(
    <ConfirmDialog
      trigger={<Button>Rimuovi</Button>}
      title="Rimuovere?"
      description="I dati verranno cancellati."
      confirmLabel="Rimuovi"
      onConfirm={onConfirm}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Rimuovi' }));

  // When
  fireEvent.click(screen.getByRole('button', { name: 'Annulla' }));

  // Then
  expect(onConfirm).not.toHaveBeenCalled();
  expect(screen.queryByRole('alertdialog')).toBeNull();
});

it('mantiene aperta la conferma rifiutata e mostra l’errore', async () => {
  // Given
  const onConfirm = vi.fn().mockRejectedValue(new Error('Errore di prova'));
  render(
    <ConfirmDialog
      trigger={<Button>Rimuovi</Button>}
      title="Rimuovere?"
      description="I dati verranno cancellati."
      confirmLabel="Conferma rimozione"
      onConfirm={onConfirm}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Rimuovi' }));

  // When
  fireEvent.click(screen.getByRole('button', { name: 'Conferma rimozione' }));

  // Then
  await waitFor(() =>
    expect(screen.getByRole('alert').textContent).toContain('Errore di prova'),
  );
  expect(screen.getByRole('alertdialog')).toBeDefined();
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

it('chiude dopo il successo e ignora un secondo clic mentre è in corso', async () => {
  // Given
  let resolve: (() => void) | undefined;
  const onConfirm = vi.fn(() => new Promise<void>(done => (resolve = done)));
  render(
    <ConfirmDialog
      trigger={<Button>Rimuovi</Button>}
      title="Rimuovere?"
      description="I dati verranno cancellati."
      confirmLabel="Conferma rimozione"
      onConfirm={onConfirm}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Rimuovi' }));

  // When
  const confirm = screen.getByRole('button', { name: 'Conferma rimozione' });
  fireEvent.click(confirm);
  fireEvent.click(confirm);
  resolve?.();

  // Then
  await waitFor(() => expect(screen.queryByRole('alertdialog')).toBeNull());
  expect(onConfirm).toHaveBeenCalledTimes(1);
});

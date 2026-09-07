import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Button } from '../Button';
import { Modal } from '../Modal';

afterEach(cleanup);

it('apre una modale con titolo, descrizione e chiusura accessibile', () => {
  // Given
  const onOpenChange = vi.fn();
  render(
    <Modal
      open={false}
      onOpenChange={onOpenChange}
      trigger={<Button>Apri</Button>}
      title="Titolo"
      description="Descrizione">
      Contenuto
    </Modal>,
  );

  // When
  fireEvent.click(screen.getByRole('button', { name: 'Apri' }));

  // Then
  expect(onOpenChange).toHaveBeenCalledWith(true);
  expect(screen.queryByRole('dialog')).toBeNull();
});

it('mostra il contenuto quando è controllata come aperta e chiude con Escape', () => {
  // Given
  const onOpenChange = vi.fn();
  render(
    <Modal
      open
      onOpenChange={onOpenChange}
      trigger={<Button>Apri</Button>}
      title="Titolo"
      description="Descrizione">
      Contenuto
    </Modal>,
  );

  // When
  fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });

  // Then
  expect(screen.getByRole('heading', { name: 'Titolo' })).toBeDefined();
  expect(screen.getByText('Descrizione')).toBeDefined();
  expect(screen.getByText('Contenuto')).toBeDefined();
  expect(onOpenChange).toHaveBeenCalledWith(false);
});

import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { createTestStore } from '../../../application/store/store';
import ThemeSelector from '../ThemeSelector';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

it('espone tutte le scelte e aggiorna il tema selezionato', () => {
  // Given
  vi.stubGlobal('matchMedia', () => ({ matches: false }));
  const store = createTestStore();
  render(
    <Provider store={store}>
      <ThemeSelector />
    </Provider>,
  );
  const select = screen.getByLabelText('Tema') as HTMLSelectElement;

  // When
  fireEvent.change(select, { target: { value: 'retro' } });

  // Then
  expect(Array.from(select.options).map(option => option.value)).toEqual([
    'system',
    'light',
    'dark',
    'retro',
  ]);
  expect(store.getState().tema).toEqual({
    scelta: 'retro',
    effettivo: 'retro',
  });
});

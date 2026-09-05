import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Provider } from 'react-redux';
import { createTestStore } from '../../../application/store/store';
import { identitaLocaleDisponibile } from '../../../application/store/identitaLocaleSlice';
import { parseTacitusId } from '../../../domain/tacitusId';
import { version } from '../../../../package.json';
import AppHeader from '../AppHeader';

afterEach(cleanup);

it('mostra brand, organizzazione e versione della build insieme', () => {
  // Given
  const store = createTestStore();
  store.dispatch(
    identitaLocaleDisponibile({
      nickname: 'alice',
      tacitusId: parseTacitusId('2G2DX-6P175-0PJ6E-Q37T0-Q94YJC'),
    }),
  );
  // When
  render(
    <Provider store={store}>
      <AppHeader />
    </Provider>,
  );
  // Then
  expect(screen.getByText('TACITUS')).toBeDefined();
  expect(screen.getByText('ethos-adamas')).toBeDefined();
  expect(screen.getByText(`v${version}`)).toBeDefined();
});

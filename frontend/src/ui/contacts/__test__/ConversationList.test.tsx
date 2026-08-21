import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';
import { Provider } from 'react-redux';
import { createTestStore } from '../../../application/store/store';
import { intentoDiContattoCreato } from '../../../application/store/eventi';
import { parseTacitusId } from '../../../domain/tacitusId';
import ConversationList from '../ConversationList';

describe('elenco delle Conversazioni', () => {
  afterEach(cleanup);

  it('mostra un Intento non ricambiato senza creare una Conversazione', () => {
    // Given
    const store = createTestStore();
    store.dispatch(
      intentoDiContattoCreato(parseTacitusId('2G2DX-6P175-0PJ6E-Q37T0-Q94YJC')),
    );

    // When
    render(
      <Provider store={store}>
        <ConversationList />
      </Provider>,
    );

    // Then
    expect(screen.getByText('Intento di contatto')).toBeDefined();
    expect(screen.queryByText('La Conversazione è vuota.')).toBeNull();
  });
});

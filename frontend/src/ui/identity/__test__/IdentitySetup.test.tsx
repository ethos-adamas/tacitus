import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it } from 'vitest';
import { Provider } from 'react-redux';
import { createTestStore } from '../../../application/store/store';
import IdentitySetup from '../IdentitySetup';

afterEach(cleanup);

it('spiega il formato del nickname e normalizza le maiuscole prima della validazione HTML', () => {
  // Given
  render(
    <Provider store={createTestStore()}>
      <IdentitySetup />
    </Provider>,
  );
  const input = screen.getByLabelText(
    'Nickname immutabile',
  ) as HTMLInputElement;
  // When
  fireEvent.change(input, { target: { value: 'Mario_Rossi' } });
  // Then
  expect(input.value).toBe('mario_rossi');
  expect(input.checkValidity()).toBe(true);
  expect(
    document.getElementById(input.getAttribute('aria-describedby') ?? '')
      ?.textContent,
  ).toContain('3–24 caratteri');
  expect(input.getAttribute('autocapitalize')).toBe('none');
});

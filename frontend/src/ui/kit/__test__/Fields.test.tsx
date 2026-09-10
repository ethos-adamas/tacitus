import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { CheckboxField } from '../Fields';

afterEach(cleanup);

it('associa label e descrizione al controllo checkbox', () => {
  // Given
  render(
    <>
      <CheckboxField
        id="notifications-setting"
        label="Notifiche"
        checked={false}
        onCheckedChange={vi.fn()}
        descriptionId="notifications-help"
      />
      <p id="notifications-help">Aiuto notifiche</p>
    </>,
  );
  const checkbox = screen.getByRole('checkbox', { name: 'Notifiche' });

  // When
  fireEvent.click(screen.getByText('Notifiche'));

  // Then
  expect(checkbox.getAttribute('aria-describedby')).toBe('notifications-help');
});

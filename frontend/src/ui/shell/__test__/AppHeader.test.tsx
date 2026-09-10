import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { Provider } from 'react-redux';
import { createTestStore } from '../../../application/store/store';
import { identitaLocaleDisponibile } from '../../../application/store/identitaLocaleSlice';
import { notificheConfigurate } from '../../../application/store/notificheSlice';
import type { PermessoNotifiche } from '../../../domain/preferenze';
import { parseTacitusId } from '../../../domain/tacitusId';
import { version } from '../../../../package.json';
import AppHeader from '../AppHeader';

const { requestNotificationPermission, saveNotificationsEnabled } = vi.hoisted(
  () => ({
    requestNotificationPermission: vi.fn(),
    saveNotificationsEnabled: vi.fn(),
  }),
);
vi.mock('../../../infrastructure/notifications/notifications', () => ({
  listenForNotificationClicks: vi.fn(),
  notificationPermission: vi.fn(),
  notificationsEnabled: vi.fn(),
  requestNotificationPermission,
  saveNotificationsEnabled,
}));

afterEach(cleanup);

const tacitusId = parseTacitusId('2G2DX-6P175-0PJ6E-Q37T0-Q94YJC');

const renderHeader = (
  notifications: { abilitate: boolean; permesso: PermessoNotifiche } = {
    abilitate: false,
    permesso: 'default',
  },
) => {
  const store = createTestStore();
  store.dispatch(identitaLocaleDisponibile({ nickname: 'alice', tacitusId }));
  store.dispatch(notificheConfigurate(notifications));
  render(
    <Provider store={store}>
      <AppHeader />
    </Provider>,
  );
  fireEvent.click(screen.getByLabelText('Impostazioni', { exact: true }));
  return store;
};

afterEach(() => {
  requestNotificationPermission.mockReset();
  saveNotificationsEnabled.mockReset();
});

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

it('mostra due checkbox con aiuto senza chiedere permessi all’apertura', () => {
  // Given
  renderHeader();

  // When / Then
  expect(
    screen.getByRole('checkbox', { name: 'Ricevi foto e album' }),
  ).toBeDefined();
  expect(
    screen
      .getByRole('checkbox', { name: 'Notifiche' })
      .getAttribute('aria-describedby'),
  ).toBe('notifications-help');
  expect(
    screen.getByText(
      'Attivando Notifiche, il browser può chiedere il permesso.',
    ),
  ).toBeDefined();
  expect(requestNotificationPermission).not.toHaveBeenCalled();
});

it('impedisce una seconda richiesta mentre il permesso è pendente', async () => {
  // Given
  let resolvePermission: ((permission: 'granted') => void) | undefined;
  requestNotificationPermission.mockReturnValue(
    new Promise(resolve => {
      resolvePermission = resolve;
    }),
  );
  renderHeader();
  const checkbox = screen.getByRole('checkbox', {
    name: 'Notifiche',
  }) as HTMLButtonElement;

  // When
  fireEvent.click(checkbox);
  fireEvent.click(checkbox);

  // Then
  expect(requestNotificationPermission).toHaveBeenCalledTimes(1);
  expect(checkbox.disabled).toBe(true);
  expect(screen.getByText('Richiesta del permesso…')).toBeDefined();

  // When
  resolvePermission?.('granted');

  // Then
  await waitFor(() =>
    expect(checkbox.getAttribute('data-state')).toBe('checked'),
  );
  expect(checkbox.disabled).toBe(false);
});

it('mostra il motivo e disabilita le notifiche negate', () => {
  // Given
  renderHeader({ abilitate: false, permesso: 'denied' });

  // When / Then
  const checkbox = screen.getByRole('checkbox', {
    name: 'Notifiche',
  });
  expect((checkbox as HTMLButtonElement).disabled).toBe(true);
  expect(
    screen.getByText(
      'Notifiche bloccate: consentile nelle impostazioni del browser.',
    ),
  ).toBeDefined();
  expect(requestNotificationPermission).not.toHaveBeenCalled();
});

it('disabilita le notifiche e spiega l’ambiente non supportato', () => {
  // Given
  renderHeader({ abilitate: false, permesso: 'unsupported' });

  // When / Then
  const checkbox = screen.getByRole('checkbox', {
    name: 'Notifiche',
  });
  expect((checkbox as HTMLButtonElement).disabled).toBe(true);
  expect(
    screen.getByText('Notifiche non supportate in questo ambiente.'),
  ).toBeDefined();
  expect(requestNotificationPermission).not.toHaveBeenCalled();
});

it('segnala un errore e libera il controllo se la richiesta fallisce', async () => {
  // Given
  requestNotificationPermission.mockRejectedValue(new Error('negato'));
  const store = renderHeader();
  const checkbox = screen.getByRole('checkbox', {
    name: 'Notifiche',
  }) as HTMLButtonElement;

  // When
  fireEvent.click(checkbox);

  // Then
  await waitFor(() =>
    expect(store.getState().feedback.errore).toBe(
      'Configurazione delle notifiche non riuscita.',
    ),
  );
  expect(checkbox.disabled).toBe(false);
  expect(checkbox.getAttribute('data-state')).toBe('unchecked');
  expect(store.getState().notifiche.abilitate).toBe(false);
});

it('disattiva una preferenza già concessa senza un nuovo prompt', async () => {
  // Given
  const store = renderHeader({ abilitate: true, permesso: 'granted' });
  const checkbox = screen.getByRole('checkbox', {
    name: 'Notifiche',
  });

  // When
  fireEvent.click(checkbox);

  // Then
  await waitFor(() => expect(store.getState().notifiche.abilitate).toBe(false));
  expect(requestNotificationPermission).not.toHaveBeenCalled();
  expect(saveNotificationsEnabled).toHaveBeenCalledWith(false);
});

import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from '@playwright/test';

type Persona = {
  context: BrowserContext;
  page: Page;
  tacitusId: string;
};

declare global {
  interface Window {
    __tacitusNotificationPermissionRequests: number;
    __tacitusNotifications: string[];
  }
}

const createPersonaInContext = async (
  context: BrowserContext,
  nickname: string,
): Promise<Persona> => {
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Nickname immutabile').fill(nickname);
  await page.getByRole('button', { name: 'Crea Identità' }).click();
  await expect(page.locator('.connection')).toHaveText('online', {
    timeout: 15_000,
  });
  const tacitusId = await page.locator('header .identity code').innerText();
  return { context, page, tacitusId };
};

const createPersona = async (
  browser: Browser,
  nickname: string,
): Promise<Persona> => {
  const context = await browser.newContext();
  return createPersonaInContext(context, nickname);
};

const addContact = async (page: Page, tacitusId: string) => {
  await page.locator('.panel-title .add').click();
  await page.getByLabel('Tacitus ID').fill(tacitusId);
  await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
};

const matchContacts = async (alice: Persona, bob: Persona) => {
  await addContact(alice.page, bob.tacitusId);
  await addContact(bob.page, alice.tacitusId);
  await expect(alice.page.getByText('Sessione sicura')).toBeVisible({
    timeout: 15_000,
  });
  await expect(bob.page.getByText('Sessione sicura')).toBeVisible({
    timeout: 15_000,
  });
};

const closePersonas = async (...personas: Persona[]) => {
  await Promise.all(personas.map(persona => persona.context.close()));
};

test.describe('use case della Messaggistica privata', () => {
  test('un Intento non ricambiato rimane in attesa e può essere annullato', async ({
    browser,
  }) => {
    // Given
    const alice = await createPersona(browser, 'alice_pending');
    const bob = await createPersona(browser, 'bob_pending');

    // When
    await addContact(alice.page, bob.tacitusId);

    // Then
    await expect(alice.page.getByText('In attesa del Contatto')).toBeVisible();
    await expect(bob.page.getByText('alice_pending')).toHaveCount(0);

    // When
    await alice.page.getByRole('button', { name: 'Annulla Intento' }).click();

    // Then
    await expect(alice.page.getByText('In attesa del Contatto')).toHaveCount(0);
    await expect(
      alice.page.getByText('Frame ricevuto non valido.'),
    ).toHaveCount(0);
    await closePersonas(alice, bob);
  });

  test('due Contatti scambiano Messaggi e ristabiliscono la Sessione dopo un reload', async ({
    browser,
  }) => {
    // Given
    const alice = await createPersona(browser, 'alice_message');
    const bob = await createPersona(browser, 'bob_message');
    await matchContacts(alice, bob);
    await bob.page.getByRole('button', { name: /alice_message/ }).click();

    // When
    await bob.page.getByLabel('Messaggio').fill('ciao Alice');
    await bob.page.getByRole('button', { name: 'Invia' }).click();
    const bobConversation = alice.page.getByRole('button', {
      name: /bob_message/,
    });
    await expect(bobConversation.locator('.unread')).toHaveText('1');
    await bobConversation.click();
    await expect(bobConversation.locator('.unread')).toHaveCount(0);

    // Then
    await expect(alice.page.getByText('ciao Alice')).toBeVisible();
    await alice.page.reload();
    await expect(alice.page.getByText('Sessione sicura')).toBeVisible({
      timeout: 15_000,
    });
    await expect(
      alice.page
        .getByRole('button', { name: /bob_message/ })
        .locator('.unread'),
    ).toHaveCount(0);
    await alice.page.getByRole('button', { name: /bob_message/ }).click();
    await expect(alice.page.getByText('ciao Alice')).toBeVisible();
    await closePersonas(alice, bob);
  });

  test('la rimozione disattiva la Relazione e due nuovi Intenti la ricreano', async ({
    browser,
  }) => {
    // Given
    const alice = await createPersona(browser, 'alice_remove');
    const bob = await createPersona(browser, 'bob_remove');
    await matchContacts(alice, bob);
    await alice.page.getByRole('button', { name: /bob_remove/ }).click();
    alice.page.once('dialog', dialog => dialog.accept());

    // When
    await alice.page.getByRole('button', { name: 'Rimuovi' }).click();

    // Then
    await expect(bob.page.getByText('Riattivazione necessaria')).toBeVisible();
    await addContact(alice.page, bob.tacitusId);
    await bob.page.getByRole('button', { name: /alice_remove/ }).click();
    await bob.page
      .getByRole('button', { name: 'Riattiva', exact: true })
      .click();
    await expect(alice.page.getByText('Sessione sicura')).toBeVisible({
      timeout: 15_000,
    });
    await closePersonas(alice, bob);
  });

  test('il tema segue il sistema e può essere cambiato', async ({
    browser,
  }) => {
    // Given
    const context = await browser.newContext({
      colorScheme: 'dark',
      permissions: ['notifications'],
    });
    const page = await context.newPage();
    await page.goto('/');

    // When
    const initialTheme = await page.locator('html').getAttribute('data-theme');
    await page.getByRole('button', { name: 'Passa al tema chiaro' }).click();

    // Then
    expect(initialTheme).toBe('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await context.close();
  });

  test('il consenso abilita una notifica per ogni Messaggio ricevuto', async ({
    browser,
  }) => {
    // Given
    const aliceContext = await browser.newContext();
    await aliceContext.addInitScript(() => {
      window.__tacitusNotificationPermissionRequests = 0;
      window.__tacitusNotifications = [];
      class FakeNotification {
        static permission: NotificationPermission = 'default';
        static requestPermission = async () => {
          window.__tacitusNotificationPermissionRequests += 1;
          FakeNotification.permission = 'granted';
          return FakeNotification.permission;
        };
        onclick: (() => void) | null = null;
        constructor(_title: string, options?: NotificationOptions) {
          window.__tacitusNotifications.push(options?.body ?? '');
        }
        close = () => undefined;
      }
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: FakeNotification,
      });
      Object.defineProperty(document, 'hasFocus', {
        configurable: true,
        value: () => false,
      });
    });
    const alice = await createPersonaInContext(
      aliceContext,
      'alice_notification',
    );
    const bob = await createPersona(browser, 'bob_notification');
    await matchContacts(alice, bob);
    await bob.page.getByRole('button', { name: /alice_notification/ }).click();

    // When
    await alice.page.getByRole('button', { name: 'Abilita notifiche' }).click();
    await bob.page.getByLabel('Messaggio').fill('prima notifica');
    await bob.page.getByRole('button', { name: 'Invia' }).click();
    await bob.page.getByLabel('Messaggio').fill('seconda notifica');
    await bob.page.getByRole('button', { name: 'Invia' }).click();

    // Then
    await expect
      .poll(() =>
        alice.page.evaluate(
          () => window.__tacitusNotificationPermissionRequests,
        ),
      )
      .toBe(1);
    await expect
      .poll(() =>
        alice.page.evaluate(() => window.__tacitusNotifications.length),
      )
      .toBe(2);
    await closePersonas(alice, bob);
  });
});

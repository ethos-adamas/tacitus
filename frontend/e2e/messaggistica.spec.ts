import { readFileSync } from 'node:fs';
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

const readTacitusId = async (page: Page) => {
  await page.getByLabel('Impostazioni Tacitus', { exact: true }).click();
  const tacitusId = await page
    .locator('.settings-content .identity code')
    .innerText();
  await page.keyboard.press('Escape');
  return tacitusId;
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
  const tacitusId = await readTacitusId(page);
  return { context, page, tacitusId };
};

const createPersona = async (
  browser: Browser,
  nickname: string,
): Promise<Persona> => {
  const { viewport, isMobile, hasTouch, deviceScaleFactor, userAgent } =
    test.info().project.use;
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch,
    deviceScaleFactor,
    userAgent,
  });
  return createPersonaInContext(context, nickname);
};

const addContact = async (page: Page, tacitusId: string) => {
  await page.locator('.panel-title .add').click();
  await page
    .getByRole('textbox', { name: 'Tacitus ID', exact: true })
    .fill(tacitusId);
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

const settleLayout = async (page: Page) => {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await new Promise<void>(resolve =>
      requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
    );
  });
};

const waitForStableViewer = async (page: Page) => {
  let previous = '';
  let stableSamples = 0;
  await expect
    .poll(
      async () => {
        const current = await page
          .locator('.photo-viewer-zoom-content')
          .evaluate(element => {
            const image = element.querySelector('img')!.getBoundingClientRect();
            const matrix = new DOMMatrixReadOnly(
              getComputedStyle(element).transform,
            );
            return `${matrix.a}:${matrix.e}:${matrix.f}:${image.width}:${image.height}`;
          });
        if (current === previous) stableSamples += 1;
        else {
          previous = current;
          stableSamples = 0;
        }
        return stableSamples;
      },
      { timeout: 10_000 },
    )
    .toBeGreaterThanOrEqual(3);
};

const createPng = async (page: Page, color: string, size = 32, height = size) =>
  page.evaluate(
    ({ color: fill, size: side, height }) => {
      const canvas = document.createElement('canvas');
      canvas.width = side;
      canvas.height = height;
      const context = canvas.getContext('2d')!;
      context.fillStyle = fill;
      context.fillRect(0, 0, side, height);
      return canvas.toDataURL('image/png').split(',')[1];
    },
    { color, size, height },
  );

const pastePngs = async (page: Page, pngs: string[], withText = false) => {
  await page.getByLabel('Messaggio').evaluate(
    (textarea, { pngs: encoded, withText: addText }) => {
      const transfer = new DataTransfer();
      encoded.forEach((png, index) => {
        const bytes = Uint8Array.from(atob(png), character =>
          character.charCodeAt(0),
        );
        transfer.items.add(
          new File([bytes], `incollata-${index}.png`, { type: 'image/png' }),
        );
      });
      if (addText) transfer.setData('text/plain', 'testo clipboard');
      const event = new Event('paste', {
        bubbles: true,
        cancelable: true,
      });
      Object.defineProperty(event, 'clipboardData', { value: transfer });
      textarea.dispatchEvent(event);
    },
    { pngs, withText },
  );
};

const dropPngs = async (page: Page, pngs: string[]) => {
  const transfer = await page.evaluateHandle(encoded => {
    const dataTransfer = new DataTransfer();
    encoded.forEach((png, index) => {
      const bytes = Uint8Array.from(atob(png), character =>
        character.charCodeAt(0),
      );
      dataTransfer.items.add(
        new File([bytes], `trascinata-${index}.png`, { type: 'image/png' }),
      );
    });
    return dataTransfer;
  }, pngs);
  try {
    const target = page.getByLabel('Messaggio');
    await target.dispatchEvent('dragenter', { dataTransfer: transfer });
    await target.dispatchEvent('dragover', { dataTransfer: transfer });
    await target.dispatchEvent('drop', { dataTransfer: transfer });
  } finally {
    await transfer.dispose();
  }
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

    // When
    await alice.page
      .getByRole('button', { name: 'Impostazioni del Contatto' })
      .click();
    await alice.page.getByRole('button', { name: 'Rimuovi Contatto' }).click();
    await alice.page
      .getByRole('button', { name: 'Rimuovi definitivamente' })
      .click();

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

  test('un Blocco impedisce la Relazione finché non viene rimosso', async ({
    browser,
  }) => {
    // Given
    const alice = await createPersona(browser, 'alice_block');
    const bob = await createPersona(browser, 'bob_block');
    await matchContacts(alice, bob);
    await alice.page.getByRole('button', { name: /bob_block/ }).click();

    // When
    await alice.page
      .getByRole('button', { name: 'Impostazioni del Contatto' })
      .click();
    await alice.page.getByRole('button', { name: 'Blocca Contatto' }).click();
    await alice.page
      .getByRole('button', { name: 'Blocca definitivamente' })
      .click();

    // Then
    await expect(alice.page.getByText('Identità bloccate')).toBeVisible();
    await expect(bob.page.getByText('Riattivazione necessaria')).toBeVisible();

    // When
    await alice.page.getByRole('button', { name: 'Sblocca' }).click();
    await addContact(alice.page, bob.tacitusId);
    await bob.page.getByRole('button', { name: /alice_block/ }).click();
    await bob.page
      .getByRole('button', { name: 'Riattiva', exact: true })
      .click();

    // Then
    await expect(alice.page.getByText('Sessione sicura')).toBeVisible({
      timeout: 15_000,
    });
    await closePersonas(alice, bob);
  });

  test('il tema segue il sistema e può essere cambiato dalle impostazioni', async ({
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
    await page.getByLabel('Impostazioni Tacitus', { exact: true }).click();
    await page.getByLabel('Tema').selectOption('light');

    // Then
    expect(initialTheme).toBe('dark');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'light');
    await page.getByLabel('Tema').selectOption('retro');
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'retro');
    await page.reload();
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'retro');
    await page.emulateMedia({ colorScheme: 'light' });
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'retro');
    const settings = page.getByLabel('Impostazioni Tacitus', { exact: true });
    const settingsBox = await settings.boundingBox();
    expect(settingsBox).toBeTruthy();
    await page.mouse.click(
      settingsBox!.x + settingsBox!.width / 2,
      settingsBox!.y + settingsBox!.height / 2,
    );
    await page.getByLabel('Tema').selectOption('system');
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
    await alice.page
      .getByLabel('Impostazioni Tacitus', { exact: true })
      .click();
    await alice.page
      .getByRole('checkbox', { name: 'Notifiche', exact: true })
      .check();
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

  test('un rifiuto del permesso disabilita il controllo e ne spiega il motivo', async ({
    browser,
  }) => {
    // Given
    const context = await browser.newContext();
    await context.addInitScript(() => {
      class FakeNotification {
        static permission: NotificationPermission = 'default';
        static requestPermission = async () => {
          FakeNotification.permission = 'denied';
          return FakeNotification.permission;
        };
        onclick: (() => void) | null = null;
        constructor() {}
        close = () => undefined;
      }
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: FakeNotification,
      });
    });
    const alice = await createPersonaInContext(context, 'alice_denied');

    // When
    await alice.page
      .getByLabel('Impostazioni Tacitus', { exact: true })
      .click();
    const checkbox = alice.page.getByRole('checkbox', {
      name: 'Notifiche',
      exact: true,
    });
    await checkbox.click();

    // Then
    await expect(checkbox).toHaveJSProperty('disabled', true);
    await expect(checkbox).not.toBeChecked();
    await expect(
      alice.page.getByText(
        'Notifiche bloccate: consentile nelle impostazioni del browser.',
      ),
    ).toBeVisible();
    await alice.context.close();
  });

  test('un ambiente senza API Notification disabilita il controllo', async ({
    browser,
  }) => {
    // Given
    const context = await browser.newContext();
    await context.addInitScript(() => {
      Reflect.deleteProperty(window, 'Notification');
    });
    const alice = await createPersonaInContext(context, 'alice_unsupported');

    // When
    await alice.page
      .getByLabel('Impostazioni Tacitus', { exact: true })
      .click();
    const checkbox = alice.page.getByRole('checkbox', {
      name: 'Notifiche',
      exact: true,
    });

    // Then
    await expect(checkbox).toHaveJSProperty('disabled', true);
    await expect(
      alice.page.getByText('Notifiche non supportate in questo ambiente.'),
    ).toBeVisible();
    await alice.context.close();
  });

  test('un errore durante la richiesta del permesso non blocca il controllo', async ({
    browser,
  }) => {
    // Given
    const context = await browser.newContext();
    await context.addInitScript(() => {
      class FakeNotification {
        static permission: NotificationPermission = 'default';
        static requestPermission = async () => {
          throw new Error('permesso non disponibile');
        };
        onclick: (() => void) | null = null;
        constructor() {}
        close = () => undefined;
      }
      Object.defineProperty(window, 'Notification', {
        configurable: true,
        value: FakeNotification,
      });
    });
    const alice = await createPersonaInContext(context, 'alice_error');

    // When
    await alice.page
      .getByLabel('Impostazioni Tacitus', { exact: true })
      .click();
    const checkbox = alice.page.getByRole('checkbox', {
      name: 'Notifiche',
      exact: true,
    });
    await checkbox.click();

    // Then
    await expect(
      alice.page.getByText('Configurazione delle notifiche non riuscita.'),
    ).toBeVisible();
    await expect(checkbox).not.toBeChecked();
    await expect(checkbox).toHaveJSProperty('disabled', false);
    await alice.context.close();
  });
});

const expectNoHorizontalOverflow = async (page: Page) => {
  const { scrollWidth, innerWidth } = await page.evaluate(() => ({
    scrollWidth: document.documentElement.scrollWidth,
    innerWidth: window.innerWidth,
  }));
  expect(scrollWidth).toBeLessThanOrEqual(innerWidth + 1);
};

const VIEWPORT_MATRIX = [
  { width: 320, height: 740 },
  { width: 390, height: 844 },
  { width: 1280, height: 900 },
];
const THEME_MATRIX = ['light', 'dark', 'retro'] as const;

test('Regressione UI: schermata iniziale e applicazione senza overflow nella matrice viewport/tema', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  for (const viewport of VIEWPORT_MATRIX) {
    for (const theme of THEME_MATRIX) {
      // Given
      const context = await browser.newContext({ viewport });
      const page = await context.newPage();
      await page.goto('/');
      await page.evaluate(
        selectedTheme =>
          localStorage.setItem('tacitus.v3.theme', selectedTheme),
        theme,
      );
      await page.reload();
      await settleLayout(page);

      // When / Then: onboarding, before an Identity exists
      await expectNoHorizontalOverflow(page);

      await page
        .getByLabel('Nickname immutabile')
        .fill(`m${viewport.width}${theme}`.slice(0, 24));
      await page.getByRole('button', { name: 'Crea Identità' }).click();
      await expect(page.locator('.connection')).toHaveText('online', {
        timeout: 15_000,
      });
      await settleLayout(page);

      // When / Then: main application shell, after an Identity exists
      await expectNoHorizontalOverflow(page);
      await context.close();
    }
  }
});

test('Regressione UI: dialoghi del Contatto senza overflow a 320/390/1280px in rétro', async ({
  browser,
}) => {
  test.setTimeout(180_000);
  for (const viewport of VIEWPORT_MATRIX) {
    // Given
    const aliceContext = await browser.newContext({ viewport });
    await aliceContext.addInitScript(() => {
      localStorage.setItem('tacitus.v3.theme', 'retro');
    });
    const alice = await createPersonaInContext(
      aliceContext,
      `alice_matrix${viewport.width}`,
    );
    const bob = await createPersona(browser, `bob_matrix${viewport.width}`);

    // When / Then: Aggiungi Contatto, before matching
    await alice.page.locator('.panel-title .add').click();
    await settleLayout(alice.page);
    await expectNoHorizontalOverflow(alice.page);
    await alice.page.getByRole('button', { name: 'Annulla' }).click();

    await matchContacts(alice, bob);
    await alice.page
      .getByRole('button', { name: new RegExp(`bob_matrix${viewport.width}`) })
      .click();

    // When / Then: Impostazioni del Contatto
    await alice.page
      .getByRole('button', { name: 'Impostazioni del Contatto' })
      .click();
    await settleLayout(alice.page);
    await expectNoHorizontalOverflow(alice.page);

    // When / Then: conferma distruttiva annullata
    await alice.page.getByRole('button', { name: 'Rimuovi Contatto' }).click();
    await settleLayout(alice.page);
    await expectNoHorizontalOverflow(alice.page);
    await alice.page.getByRole('button', { name: 'Annulla' }).click();
    await alice.page.getByRole('button', { name: 'Chiudi' }).last().click();

    await closePersonas(alice, bob);
  }
});

test('Regressione UI #22: spaziatura comune di modali e trasferimenti Album', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  // Given
  const alice = await createPersona(browser, 'alice_ui22');
  const bob = await createPersona(browser, 'bob_ui22');
  await alice.page.locator('.panel-title .add').click();
  await settleLayout(alice.page);

  // When / Then
  const addContactGeometry = await alice.page
    .getByRole('dialog')
    .evaluate(dialog => {
      const dialogBox = dialog.getBoundingClientRect();
      const titleBox = dialog.querySelector('h2')!.getBoundingClientRect();
      const descriptionBox = dialog
        .querySelector('.modal-description')!
        .getBoundingClientRect();
      const footer = dialog.querySelector('.dialog-actions')!;
      const footerBox = footer.getBoundingClientRect();
      const lastButton = footer.querySelector('button:last-of-type')!;
      const lastButtonBox = lastButton.getBoundingClientRect();
      return {
        titleLeft: titleBox.left - dialogBox.left,
        descriptionLeft: descriptionBox.left - dialogBox.left,
        right: dialogBox.right - lastButtonBox.right,
        bottom: dialogBox.bottom - footerBox.bottom,
      };
    });
  expect(addContactGeometry.titleLeft).toBeGreaterThanOrEqual(15);
  expect(addContactGeometry.descriptionLeft).toBeGreaterThanOrEqual(15);
  expect(addContactGeometry.right).toBeGreaterThanOrEqual(15);
  expect(addContactGeometry.bottom).toBeGreaterThanOrEqual(15);
  await alice.page.getByRole('button', { name: 'Annulla' }).click();

  await matchContacts(alice, bob);
  await alice.page.getByRole('button', { name: /bob_ui22/ }).click();
  await alice.page
    .getByRole('button', { name: 'Impostazioni del Contatto' })
    .click();
  await settleLayout(alice.page);
  const contactGeometry = await alice.page
    .getByRole('dialog')
    .evaluate(dialog => {
      const dialogBox = dialog.getBoundingClientRect();
      const titleBox = dialog.querySelector('h2')!.getBoundingClientRect();
      const footer = dialog.querySelector('.dialog-actions')!;
      const footerBox = footer.getBoundingClientRect();
      return {
        titleLeft: titleBox.left - dialogBox.left,
        bottom: dialogBox.bottom - footerBox.bottom,
      };
    });
  expect(contactGeometry.titleLeft).toBeGreaterThanOrEqual(15);
  expect(contactGeometry.bottom).toBeGreaterThanOrEqual(15);
  await alice.page.getByRole('button', { name: 'Chiudi' }).last().click();

  const png = await createPng(alice.page, '#2f8f67', 120);
  await alice.page.getByLabel('Scegli foto').setInputFiles({
    name: 'foto-ui22.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await alice.page.getByRole('button', { name: 'Invia album' }).click();
  await bob.page.getByRole('button', { name: /alice_ui22/ }).click();
  const status = bob.page.locator('.album-transfer-status');
  await expect(status).toBeVisible();
  const transferGeometry = await status.evaluate(element => {
    const statusBox = element.getBoundingClientRect();
    const buttons = [...element.querySelectorAll('button')].map(button =>
      button.getBoundingClientRect(),
    );
    return {
      inset: buttons[0].left - statusBox.left,
      sameRow: Math.abs(buttons[1].top - buttons[0].top) < 1,
      horizontalGap:
        buttons.length > 1 ? buttons[1].left - buttons[0].right : undefined,
      verticalGap:
        buttons.length > 1 ? buttons[1].top - buttons[0].bottom : undefined,
    };
  });
  expect(transferGeometry.inset).toBeGreaterThanOrEqual(15);
  if (transferGeometry.sameRow)
    expect(transferGeometry.horizontalGap).toBeGreaterThanOrEqual(7);
  else if (transferGeometry.verticalGap !== undefined)
    expect(transferGeometry.verticalGap).toBeGreaterThanOrEqual(7);
  expect(
    await bob.page.evaluate(() => document.documentElement.scrollWidth),
  ).toBeLessThanOrEqual(await bob.page.evaluate(() => innerWidth));
  await closePersonas(alice, bob);
});

test('Regressione UI #23: font e preferenze coerenti', async ({ browser }) => {
  test.setTimeout(90_000);
  // Given
  const { viewport, isMobile, hasTouch, deviceScaleFactor, userAgent } =
    test.info().project.use;
  const context = await browser.newContext({
    viewport,
    isMobile,
    hasTouch,
    deviceScaleFactor,
    userAgent,
  });
  const page = await context.newPage();
  await page.goto('/');
  await page.getByLabel('Impostazioni Tacitus', { exact: true }).click();
  await page.getByLabel('Tema').selectOption('retro');
  await settleLayout(page);

  // When / Then: the landing settings use the same UI font
  await expect(page.getByLabel('Tema')).toHaveCSS(
    'font-family',
    /Press Start 2P/,
  );
  await page.keyboard.press('Escape');
  await page.getByLabel('Nickname immutabile').fill('alice_ui23');
  await page.getByRole('button', { name: 'Crea Identità' }).click();
  await expect(page.locator('.connection')).toHaveText('online', {
    timeout: 15_000,
  });
  const alice: Persona = {
    context,
    page,
    tacitusId: await readTacitusId(page),
  };
  const bob = await createPersona(browser, 'bob_ui23');
  await matchContacts(alice, bob);
  await alice.page.getByRole('button', { name: /bob_ui23/ }).click();
  await alice.page.getByLabel('Messaggio').fill('testo leggibile');
  await alice.page.getByRole('button', { name: 'Invia' }).click();
  await expect(alice.page.getByText('testo leggibile')).toBeVisible();

  for (const theme of ['retro', 'light', 'dark', 'retro']) {
    await alice.page
      .getByLabel('Impostazioni Tacitus', { exact: true })
      .click();
    await alice.page.getByLabel('Tema').selectOption(theme);
    await settleLayout(alice.page);
    const fonts = await alice.page.evaluate(() => {
      const select = document.querySelector('.settings-content select')!;
      const checkboxLabels = [
        ...document.querySelectorAll(
          '.settings-content .checkbox-field > span',
        ),
      ];
      const heading = document.querySelector('.settings-heading')!;
      const message = document.querySelector('.message p')!;
      const textarea = document.querySelector('.message-input textarea')!;
      const option = select.querySelector('option')!;
      return {
        select: getComputedStyle(select).fontFamily,
        option: getComputedStyle(option).fontFamily,
        labels: checkboxLabels.map(label => getComputedStyle(label).fontFamily),
        heading: getComputedStyle(heading).fontFamily,
        message: getComputedStyle(message).fontFamily,
        textarea: getComputedStyle(textarea).fontFamily,
        overflow: document.documentElement.scrollWidth <= innerWidth,
        checkboxHeight: document
          .querySelector('.settings-content .checkbox-field')!
          .getBoundingClientRect().height,
      };
    });
    if (theme === 'retro') {
      expect(fonts.select).toContain('Press Start 2P');
      expect(fonts.option).toContain('Press Start 2P');
      expect(fonts.heading).toContain('Press Start 2P');
      expect(fonts.labels.every(font => font.includes('Press Start 2P'))).toBe(
        true,
      );
    } else {
      expect(fonts.select).not.toContain('Press Start 2P');
    }
    expect(fonts.message).not.toContain('Press Start 2P');
    expect(fonts.textarea).not.toContain('Press Start 2P');
    expect(fonts.overflow).toBe(true);
    expect(fonts.checkboxHeight).toBeGreaterThanOrEqual(44);
    await alice.page.keyboard.press('Escape');
  }
  await closePersonas(alice, bob);
});

test('i controlli del compositore condividono il centro verticale', async ({
  browser,
}) => {
  // Given
  const alice = await createPersona(browser, 'alice_layout');
  const bob = await createPersona(browser, 'bob_layout');
  await matchContacts(alice, bob);
  await alice.page.getByRole('button', { name: /bob_layout/ }).click();
  // When / Then
  for (const width of [1100, 390]) {
    await alice.page.setViewportSize({ width, height: 800 });
    const centers = await alice.page.locator('.composer').evaluate(composer =>
      [...composer.querySelectorAll('button, textarea')].map(element => {
        const box = element.getBoundingClientRect();
        return box.y + box.height / 2;
      }),
    );
    expect(Math.max(...centers) - Math.min(...centers)).toBeLessThan(2);
  }
  await closePersonas(alice, bob);
});

test('Regressione UI: il compositore mantiene testo, focus e spazio durante il resize', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  // Given
  const alice = await createPersona(browser, 'alice_composer');
  const bob = await createPersona(browser, 'bob_composer');
  await matchContacts(alice, bob);
  await alice.page.getByRole('button', { name: /bob_composer/ }).click();

  // When / Then
  for (const theme of ['light', 'dark', 'retro']) {
    await alice.page
      .getByLabel('Impostazioni Tacitus', { exact: true })
      .click();
    await alice.page.getByLabel('Tema').selectOption(theme);
    await alice.page.keyboard.press('Escape');
    await settleLayout(alice.page);
    for (const width of [850, 1024, 1280, 1536, 390, 320]) {
      await alice.page.setViewportSize({ width, height: 800 });
      const input = alice.page.getByLabel('Messaggio');
      for (const value of [
        '',
        'Prima riga\nSeconda riga che deve rimanere leggibile dopo il ridimensionamento.',
      ]) {
        await input.fill(value);
        await input.focus();
        await settleLayout(alice.page);
        const geometry = await input.evaluate(textarea => {
          const composer = textarea.closest('.composer')!;
          const wrapper = composer.closest('.conversation-composer')!;
          return {
            clientHeight: textarea.clientHeight,
            scrollHeight: textarea.scrollHeight,
            composerOutline: getComputedStyle(composer).outlineStyle,
            overflowY: getComputedStyle(textarea).overflowY,
            textareaOutlineStyle: getComputedStyle(textarea).outlineStyle,
            activeElement: document.activeElement?.getAttribute('aria-label'),
            topGap:
              composer.getBoundingClientRect().top -
              wrapper.getBoundingClientRect().top,
          };
        });
        expect(
          geometry.clientHeight,
          `${theme} ${width}px: ${JSON.stringify(geometry)}`,
        ).toBe(Math.min(144, geometry.scrollHeight));
        expect(geometry.overflowY).toBe('auto');
        expect(
          geometry.composerOutline,
          `${theme} ${width}px: ${JSON.stringify(geometry)}`,
        ).toBe('solid');
        expect(
          geometry.textareaOutlineStyle,
          `${theme} ${width}px: ${JSON.stringify(geometry)}`,
        ).toBe('none');
        expect(geometry.topGap).toBeGreaterThanOrEqual(12);
      }
    }
  }
  await closePersonas(alice, bob);
});

test('Regressione UI: Contatti riducibili, impostazioni distinte e timestamp per catena', async ({
  browser,
}) => {
  // Given
  const alice = await createPersona(browser, 'alice_catene');
  const bob = await createPersona(browser, 'bob_catene');
  await matchContacts(alice, bob);
  await alice.page.getByRole('button', { name: /bob_catene/ }).click();
  await bob.page.getByRole('button', { name: /alice_catene/ }).click();

  // When / Then: a timestamp belongs only to the last message of each chain.
  for (const [sender, text] of [
    [alice, 'Prima parte'],
    [alice, 'Seconda parte'],
    [bob, 'Prima risposta'],
    [bob, 'Seconda risposta'],
    [alice, 'Ultima parte'],
  ] as const) {
    await sender.page.getByLabel('Messaggio').fill(text);
    await sender.page
      .getByRole('button', { name: 'Invia', exact: true })
      .click();
    await expect(alice.page.getByText(text, { exact: true })).toBeVisible();
  }
  await expect(alice.page.locator('.messages time')).toHaveCount(3);
  await expect(
    alice.page.locator('.message', { hasText: 'Prima parte' }).locator('time'),
  ).toHaveCount(0);
  await expect(
    alice.page
      .locator('.message', { hasText: 'Prima risposta' })
      .locator('time'),
  ).toHaveCount(0);
  for (const text of ['Seconda parte', 'Seconda risposta', 'Ultima parte']) {
    await expect(
      alice.page.locator('.message', { hasText: text }).locator('time'),
    ).toHaveCount(1);
  }

  // When / Then: reducing navigation preserves the selected chat and its draft.
  await alice.page.setViewportSize({ width: 1280, height: 800 });
  await alice.page.getByLabel('Messaggio').fill('Bozza da conservare');
  await expect(
    alice.page.getByLabel('Impostazioni Tacitus', { exact: true }),
  ).toHaveAttribute('title', 'Impostazioni Tacitus');
  await expect(
    alice.page.getByLabel('Impostazioni del Contatto', { exact: true }),
  ).toHaveAttribute('title', 'Opzioni di bob_catene');
  for (const theme of ['light', 'dark', 'retro']) {
    await alice.page
      .getByLabel('Impostazioni Tacitus', { exact: true })
      .click();
    await alice.page.getByLabel('Tema').selectOption(theme);
    await alice.page.keyboard.press('Escape');
    await alice.page
      .getByRole('button', { name: 'Riduci Contatti', exact: true })
      .click();
    await expect(
      alice.page.getByRole('button', { name: 'Espandi Contatti', exact: true }),
    ).toHaveAttribute('aria-expanded', 'false');
    await expect(alice.page.getByLabel('Messaggio')).toHaveValue(
      'Bozza da conservare',
    );
    const sidebar = await alice.page
      .getByRole('complementary', { name: 'Conversazioni' })
      .boundingBox();
    expect(sidebar!.width).toBe(88);
    await expect(
      alice.page.getByRole('button', { name: /bob_catene/ }),
    ).toBeVisible();
    await alice.page
      .getByRole('button', { name: 'Espandi Contatti', exact: true })
      .click();
  }
  await alice.page
    .getByRole('button', { name: 'Riduci Contatti', exact: true })
    .click();
  await alice.page.setViewportSize({ width: 390, height: 740 });
  await expect(
    alice.page.getByRole('button', { name: 'Espandi Contatti', exact: true }),
  ).not.toBeVisible();
  await alice.page
    .getByRole('button', { name: 'Torna alle Conversazioni' })
    .click();
  await expect(
    alice.page.getByRole('button', { name: /bob_catene/ }),
  ).toBeVisible();
  await alice.page.setViewportSize({ width: 1280, height: 800 });
  await alice.page
    .getByRole('button', { name: 'Espandi Contatti', exact: true })
    .click();
  const sidebar = await alice.page
    .getByRole('complementary', { name: 'Conversazioni' })
    .boundingBox();
  expect(sidebar!.width).toBeGreaterThanOrEqual(280);

  // Then: the reduced rail keeps the unblock action within its bounds in rétro.
  await alice.page.getByRole('button', { name: /bob_catene/ }).click();
  await alice.page
    .getByLabel('Impostazioni del Contatto', { exact: true })
    .click();
  await alice.page.getByRole('button', { name: 'Blocca Contatto' }).click();
  await alice.page
    .getByRole('button', { name: 'Blocca definitivamente' })
    .click();
  await alice.page.getByRole('button', { name: 'Riduci Contatti' }).click();
  const unblock = alice.page.getByRole('button', {
    name: 'Sblocca',
    exact: true,
  });
  await expect(unblock).toBeVisible();
  const unblockRect = await unblock.boundingBox();
  expect(unblockRect!.width).toBe(44);
  await unblock.click();
  await expect(unblock).toHaveCount(0);
  await closePersonas(alice, bob);
});

test('il selettore emoji mantiene griglia e ricerca con la policy di produzione', async ({
  browser,
}) => {
  // Given
  const alice = await createPersona(browser, 'alice_emoji');
  const bob = await createPersona(browser, 'bob_emoji');
  await matchContacts(alice, bob);
  await alice.page.getByRole('button', { name: /bob_emoji/ }).click();
  const policy = readFileSync('nginx.conf', 'utf8').match(
    /Content-Security-Policy "([^"]+)"/,
  )![1];
  await alice.page.evaluate(policy => {
    const meta = document.createElement('meta');
    meta.httpEquiv = 'Content-Security-Policy';
    meta.content = policy;
    document.head.append(meta);
  }, policy);
  // When
  await alice.page.getByRole('button', { name: 'Choose an emoji' }).click();
  const picker = alice.page.locator('emoji-picker');
  await expect(picker.locator('.emoji-menu').first()).toBeVisible();
  // Then
  await expect(picker.locator('.sr-only').first()).toHaveCSS(
    'position',
    'absolute',
  );
  await expect(picker.locator('.emoji-menu').first()).toHaveCSS(
    'display',
    'grid',
  );
  await picker.getByRole('combobox').fill('smile');
  await picker.locator('#search-results button').first().click();
  await expect(alice.page.getByLabel('Messaggio')).not.toHaveValue('');
  await closePersonas(alice, bob);
});

test('le impostazioni sono raccolte sotto l’ingranaggio', async ({
  browser,
}) => {
  // Given
  const alice = await createPersona(browser, 'alice_settings');
  // When / Then
  await expect(
    alice.page.getByRole('button', { name: 'Cancella dati' }),
  ).not.toBeVisible();
  await alice.page.getByLabel('Impostazioni Tacitus', { exact: true }).click();
  await expect(
    alice.page.getByRole('button', { name: 'Cancella dati' }),
  ).toBeVisible();
  await expect(alice.page.getByLabel('Tema')).toHaveValue('system');
  await expect(
    alice.page.getByRole('checkbox', { name: 'Notifiche', exact: true }),
  ).toBeVisible();
  await closePersonas(alice);
});

test('su mobile dopo invio e ridimensionamento scorre solo la cronologia', async ({
  browser,
}) => {
  // Given
  const alice = await createPersona(browser, 'alice_viewport');
  const bob = await createPersona(browser, 'bob_viewport');
  await matchContacts(alice, bob);
  await alice.page.setViewportSize({ width: 390, height: 740 });
  await alice.page.getByRole('button', { name: /bob_viewport/ }).click();
  // When / Then: tastiera aperta/chiusa e controlli del browser
  for (const height of [460, 740, 650]) {
    await alice.page.setViewportSize({ width: 390, height });
    await alice.page.getByLabel('Messaggio').fill('messaggio dopo resize');
    await alice.page
      .getByRole('button', { name: 'Invia', exact: true })
      .click();
    await expect(alice.page.getByLabel('Messaggio')).toHaveValue('');
    const bounds = await alice.page.locator('.composer').boundingBox();
    expect(bounds!.y + bounds!.height).toBeLessThanOrEqual(height);
    expect(await alice.page.evaluate(() => window.scrollY)).toBe(0);
    await expect(alice.page.locator('header .brand')).toBeVisible();
  }
  await closePersonas(alice, bob);
});

test('lo spazio esaurito produce un errore senza cancellare la cronologia', async ({
  browser,
}) => {
  // Given
  const alice = await createPersona(browser, 'alice_space');
  const bob = await createPersona(browser, 'bob_space');
  await matchContacts(alice, bob);
  await alice.page.getByRole('button', { name: /bob_space/ }).click();
  await alice.page.getByLabel('Messaggio').fill('da conservare');
  await alice.page.getByRole('button', { name: 'Invia', exact: true }).click();
  await expect(
    alice.page.getByText('da conservare', { exact: true }),
  ).toBeVisible();
  await alice.page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      if (this.name === 'snapshot')
        throw new DOMException('Quota piena', 'QuotaExceededError');
      return put.apply(this, args);
    };
  });
  // When
  await alice.page.getByLabel('Messaggio').fill('nuova bozza');
  // Then
  await expect(alice.page.getByRole('alert')).toContainText(
    'Spazio locale esaurito',
  );
  await expect(
    alice.page.getByText('da conservare', { exact: true }),
  ).toBeVisible();
  await closePersonas(alice, bob);
});

test('un commit locale interrotto viene segnalato come salvataggio fallito', async ({
  browser,
}) => {
  // Given
  const alice = await createPersona(browser, 'alice_abort');
  const bob = await createPersona(browser, 'bob_abort');
  await matchContacts(alice, bob);
  await alice.page.getByRole('button', { name: /bob_abort/ }).click();
  await alice.page.evaluate(() => {
    const put = IDBObjectStore.prototype.put;
    IDBObjectStore.prototype.put = function (...args) {
      const request = put.apply(this, args);
      if (this.name === 'snapshot')
        request.addEventListener('success', () => this.transaction.abort());
      return request;
    };
  });
  // When
  await alice.page.getByLabel('Messaggio').fill('bozza non salvata');
  // Then
  await expect(alice.page.getByRole('alert')).toContainText(
    'Salvataggio locale non riuscito',
  );
  await closePersonas(alice, bob);
});

test('il sesto Intento è rifiutato senza comparire come richiesta in attesa', async ({
  browser,
}) => {
  // Given
  const alice = await createPersona(browser, 'alice_five');
  for (let n = 1; n <= 5; n++) {
    await addContact(alice.page, `00000-00000-00000-00000-00000${n}`);
  }
  await expect(
    alice.page.getByRole('button', { name: 'Annulla Intento' }),
  ).toHaveCount(5);
  // When
  await addContact(alice.page, '00000-00000-00000-00000-000006');
  // Then
  await expect(alice.page.getByRole('alert')).toContainText(
    'massimo 5 Intenti',
  );
  await expect(
    alice.page.getByRole('button', { name: 'Annulla Intento' }),
  ).toHaveCount(5);
  // When: la disconnessione elimina gli Intenti anche dal relay
  await alice.page.reload();
  await expect(alice.page.locator('.connection')).toHaveText('online');
  // Then
  await expect(
    alice.page.getByRole('button', { name: 'Annulla Intento' }),
  ).toHaveCount(0);
  await closePersonas(alice);
});

test('dopo la chiusura di entrambi i client Riattiva recupera la stessa Conversazione', async ({
  browser,
}) => {
  test.setTimeout(60_000);
  // Given
  const alice = await createPersona(browser, 'alice_resume');
  const bob = await createPersona(browser, 'bob_resume');
  await matchContacts(alice, bob);
  await alice.page.getByRole('button', { name: /bob_resume/ }).click();
  await alice.page.getByLabel('Messaggio').fill('prima della chiusura');
  await alice.page.getByRole('button', { name: 'Invia', exact: true }).click();
  // When
  await Promise.all([
    alice.page.goto('about:blank'),
    bob.page.goto('about:blank'),
  ]);
  await new Promise(resolve => setTimeout(resolve, 31_000));
  await Promise.all([alice.page.goto('/'), bob.page.goto('/')]);
  await expect(alice.page.getByText('Riattivazione necessaria')).toBeVisible();
  await expect(bob.page.getByText('Riattivazione necessaria')).toBeVisible();
  await alice.page.getByRole('button', { name: /bob_resume/ }).click();
  await bob.page.getByRole('button', { name: /alice_resume/ }).click();
  await alice.page
    .getByRole('button', { name: 'Riattiva', exact: true })
    .click();
  await bob.page.getByRole('button', { name: 'Riattiva', exact: true }).click();
  // Then
  await expect(alice.page.getByLabel('Messaggio')).toBeEnabled();
  await expect(bob.page.getByLabel('Messaggio')).toBeEnabled();
  await expect(
    alice.page.getByText('prima della chiusura', { exact: true }),
  ).toBeVisible();
  await bob.page.getByLabel('Messaggio').fill('dopo la riattivazione');
  await bob.page.getByRole('button', { name: 'Invia', exact: true }).click();
  await expect(
    alice.page.getByText('dopo la riattivazione', { exact: true }),
  ).toBeVisible();
  await closePersonas(alice, bob);
});

test('riattivare un Contatto già associato non blocca una Sessione sicura pronta', async ({
  browser,
}) => {
  // Given
  const alice = await createPersona(browser, 'alice_repeat');
  const bob = await createPersona(browser, 'bob_repeat');
  await matchContacts(alice, bob);
  // When: il relay riconferma una Relazione esistente
  await addContact(alice.page, bob.tacitusId);
  await alice.page.getByRole('button', { name: /bob_repeat/ }).click();
  // Then
  await expect(alice.page.getByLabel('Messaggio')).toBeEnabled();
  await closePersonas(alice, bob);
});

test('Album: consenso iniziale, accettazione successiva, persistenza e revoca', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  // Given
  const alice = await createPersona(browser, 'alice_album');
  const bob = await createPersona(browser, 'bob_album');
  await matchContacts(alice, bob);
  await alice.page.getByRole('button', { name: /bob_album/ }).click();
  const png = await alice.page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 800;
    const ctx = canvas.getContext('2d')!;
    const pixels = ctx.createImageData(800, 800);
    let seed = 7;
    for (let i = 0; i < pixels.data.length; i++) {
      seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
      pixels.data[i] = i % 4 === 3 ? 255 : seed >>> 24;
    }
    ctx.putImageData(pixels, 0, 0);
    return canvas.toDataURL('image/png').split(',')[1];
  });
  const files = [1, 2].map(n => ({
    name: `foto-${n}.png`,
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  }));
  await alice.page.getByLabel('Messaggio').fill('bozza da conservare');
  // When: preview can be cancelled without sending anything
  await alice.page.getByLabel('Scegli foto').setInputFiles(files);
  await expect(
    alice.page.getByAltText('Anteprima 1', { exact: true }),
  ).toBeVisible();
  await alice.page.getByRole('button', { name: 'Annulla album' }).click();
  await expect(
    bob.page.getByText('Accettare foto da questo Contatto?'),
  ).toHaveCount(0);
  await alice.page.getByLabel('Scegli foto').setInputFiles(files);
  await alice.page.getByRole('button', { name: 'Invia album' }).click();
  await expect(
    bob.page.getByRole('button', { name: /alice_album/ }),
  ).toContainText('Foto da accettare');
  await bob.page.getByRole('button', { name: /alice_album/ }).click();
  // Then: no image before consent
  await expect(
    bob.page.getByText('Accettare foto da questo Contatto?'),
  ).toBeVisible();
  await expect(bob.page.locator('.album-gallery img')).toHaveCount(0);
  await bob.page.getByRole('button', { name: 'Accetta foto' }).click();
  await expect(bob.page.locator('.album-gallery img')).toHaveCount(2, {
    timeout: 30_000,
  });
  await expect(alice.page.locator('.album-gallery img')).toHaveCount(2);
  await expect(alice.page.getByLabel('Messaggio')).toHaveValue(
    'bozza da conservare',
  );
  await expect(bob.page.locator('.album-gallery img').first()).toBeVisible();
  // When: trusted sender sends another album
  await alice.page.getByLabel('Scegli foto').setInputFiles(files.slice(0, 1));
  await alice.page.getByRole('button', { name: 'Invia album' }).click();
  await expect(bob.page.locator('.album-gallery img')).toHaveCount(3, {
    timeout: 30_000,
  });
  await expect(
    bob.page.getByText('Accettare foto da questo Contatto?'),
  ).toHaveCount(0);
  await bob.page.reload();
  await expect(bob.page.getByText('Sessione sicura')).toBeVisible();
  await bob.page.getByRole('button', { name: /alice_album/ }).click();
  await expect(bob.page.locator('.album-gallery img')).toHaveCount(3);
  await bob.page
    .getByLabel('Impostazioni del Contatto', { exact: true })
    .click();
  await expect(bob.page.getByLabel('Foto da questo Contatto')).toHaveValue(
    'allow',
  );
  // When: revoke this contact
  await bob.page.getByLabel('Foto da questo Contatto').selectOption('block');
  await bob.page.getByRole('button', { name: 'Chiudi' }).last().click();
  await alice.page.getByLabel('Scegli foto').setInputFiles(files.slice(0, 1));
  await alice.page.getByRole('button', { name: 'Invia album' }).click();
  // Then
  await expect(
    alice.page.getByText('Album rifiutato dal Contatto.'),
  ).toBeVisible();
  await expect(bob.page.locator('.album-gallery img')).toHaveCount(3);
  // When: global block overrides per-contact acceptance
  await bob.page
    .getByLabel('Impostazioni del Contatto', { exact: true })
    .click();
  await bob.page.getByLabel('Foto da questo Contatto').selectOption('allow');
  await bob.page.getByRole('button', { name: 'Chiudi' }).last().click();
  await bob.page.getByLabel('Impostazioni Tacitus', { exact: true }).click();
  await bob.page.getByText('Ricevi foto e album', { exact: true }).click();
  await bob.page.getByLabel('Impostazioni Tacitus', { exact: true }).click();
  await alice.page.getByLabel('Scegli foto').setInputFiles(files.slice(0, 1));
  await alice.page.getByRole('button', { name: 'Invia album' }).click();
  await expect(
    alice.page.getByText('Album rifiutato dal Contatto.'),
  ).toBeVisible();
  await expect(bob.page.locator('.album-gallery img')).toHaveCount(3);
  await bob.page
    .getByLabel('Impostazioni del Contatto', { exact: true })
    .click();
  // Then: removing a contact deletes encrypted assets too
  await bob.page.getByRole('button', { name: 'Rimuovi Contatto' }).click();
  await bob.page
    .getByRole('button', { name: 'Rimuovi definitivamente' })
    .click();
  await expect
    .poll(() =>
      bob.page.evaluate(
        () =>
          new Promise<number>((resolve, reject) => {
            const open = indexedDB.open('tacitus-v3');
            open.onsuccess = () => {
              const db = open.result;
              const count = db
                .transaction('assets')
                .objectStore('assets')
                .count();
              count.onsuccess = () => {
                resolve(count.result);
                db.close();
              };
              count.onerror = () => reject(count.error);
            };
          }),
      ),
    )
    .toBe(0);
  await closePersonas(alice, bob);
});

test('Regressione UI #19: tastiera zoom — Album: anteprima e download esplicito', async ({
  browser,
}) => {
  test.skip(
    test.info().project.name !== 'chromium-desktop',
    'Rotellina e pan sono verificati nel progetto desktop; il progetto mobile copre il pinch.',
  );
  test.setTimeout(90_000);
  // Given
  const alice = await createPersona(browser, 'alice_viewer');
  const bob = await createPersona(browser, 'bob_viewer');
  await matchContacts(alice, bob);
  await bob.page.getByRole('button', { name: /alice_viewer/ }).click();
  await bob.page
    .getByRole('button', { name: 'Impostazioni del Contatto' })
    .click();
  await bob.page.getByLabel('Foto da questo Contatto').selectOption('allow');
  await bob.page.getByRole('button', { name: 'Chiudi' }).last().click();
  await alice.page.getByRole('button', { name: /bob_viewer/ }).click();
  const png = await createPng(alice.page, '#2f8f67', 1200, 600);
  await alice.page.getByLabel('Scegli foto').setInputFiles({
    name: 'foto-viewer.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await alice.page.getByRole('button', { name: 'Invia album' }).click();
  await expect(alice.page.locator('.album-gallery img')).toHaveCount(1, {
    timeout: 30_000,
  });

  // When: opening the thumbnail must not download anything
  let automaticDownload = false;
  const rememberDownload = () => {
    automaticDownload = true;
  };
  alice.page.on('download', rememberDownload);
  await alice.page.getByRole('button', { name: 'Apri Foto 1' }).click();
  await expect(alice.page.getByRole('dialog')).toBeVisible();
  await settleLayout(alice.page);
  await waitForStableViewer(alice.page);
  alice.page.off('download', rememberDownload);

  // Then: wheel changes the real transform and reset restores the fit
  const zoomArea = alice.page.locator('.photo-viewer-zoom-area');
  await expect(zoomArea).toBeVisible();
  const readTransform = () =>
    zoomArea.locator('.photo-viewer-zoom-content').evaluate(element => {
      const matrix = new DOMMatrixReadOnly(getComputedStyle(element).transform);
      const image = element.querySelector('img')!.getBoundingClientRect();
      return { scale: matrix.a, width: image.width, x: matrix.e, y: matrix.f };
    });
  const initial = await readTransform();
  await zoomArea.focus();
  await expect(zoomArea).toBeFocused();
  await zoomArea.press('+');
  await expect
    .poll(async () => (await readTransform()).scale)
    .toBeGreaterThan(initial.scale);
  const keyboardZoomed = await readTransform();
  await zoomArea.press('-');
  await expect
    .poll(async () => (await readTransform()).scale)
    .toBeLessThan(keyboardZoomed.scale);
  for (let index = 0; index < 16; index++) await zoomArea.press('+');
  await expect
    .poll(async () => (await readTransform()).scale)
    .toBeGreaterThan(initial.scale * 3);
  const beforePan = await readTransform();
  await zoomArea.press('ArrowLeft');
  let afterPan = await readTransform();
  if (afterPan.x === beforePan.x) {
    await zoomArea.press('ArrowRight');
    afterPan = await readTransform();
  }
  expect(afterPan.x).not.toBe(beforePan.x);
  await zoomArea.press('0');
  await expect
    .poll(async () => (await readTransform()).scale)
    .toBeCloseTo(initial.scale, 2);
  await expect
    .poll(async () => (await readTransform()).width)
    .toBeCloseTo(initial.width, 0);

  const area = await zoomArea.boundingBox();
  expect(area).toBeTruthy();
  await zoomArea.hover();
  await alice.page.mouse.move(
    area!.x + area!.width / 2,
    area!.y + area!.height / 2,
  );
  await zoomArea.dispatchEvent('wheel', {
    deltaY: -300,
    clientX: area!.x + area!.width / 2,
    clientY: area!.y + area!.height / 2,
  });
  await expect
    .poll(async () => (await readTransform()).scale)
    .toBeGreaterThan(initial.scale);
  const zoomed = await readTransform();
  expect(zoomed.width).toBeGreaterThan(initial.width);
  await zoomArea.dispatchEvent('mousedown', {
    button: 0,
    clientX: area!.x + area!.width / 2,
    clientY: area!.y + area!.height / 2,
  });
  await zoomArea.dispatchEvent('mousemove', {
    buttons: 1,
    clientX: area!.x + area!.width / 2 - 100,
    clientY: area!.y + area!.height / 2,
  });
  await zoomArea.dispatchEvent('mouseup', {
    button: 0,
    clientX: area!.x + area!.width / 2 - 100,
    clientY: area!.y + area!.height / 2,
  });
  await expect.poll(async () => (await readTransform()).x).not.toBe(zoomed.x);
  await alice.page.getByRole('button', { name: 'Ripristina zoom' }).click();
  await expect
    .poll(async () => (await readTransform()).scale)
    .toBeCloseTo(initial.scale, 2);
  expect(automaticDownload).toBe(false);
  await alice.page.getByRole('button', { name: 'Aumenta zoom' }).focus();
  const toolbarFocused = await readTransform();
  await alice.page.keyboard.press('ArrowRight');
  await expect
    .poll(async () => (await readTransform()).x)
    .toBeCloseTo(toolbarFocused.x, 0);

  // When / Then: only the explicit control downloads the file
  const downloadPromise = alice.page.waitForEvent('download');
  await alice.page.getByRole('link', { name: 'Scarica foto' }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe('foto-1.webp');
  await alice.page.keyboard.press('Escape');
  await expect(alice.page.getByRole('dialog')).toBeHidden();
  await expect(
    alice.page.getByRole('button', { name: 'Apri Foto 1' }),
  ).toBeFocused();
  // When / Then: landscape images stay centered and controls fit every theme.
  for (const theme of ['light', 'dark', 'retro']) {
    await alice.page
      .getByLabel('Impostazioni Tacitus', { exact: true })
      .click();
    await alice.page.getByLabel('Tema').selectOption(theme);
    await alice.page.keyboard.press('Escape');
    await settleLayout(alice.page);
    for (const width of [1280, 390, 320]) {
      await alice.page.setViewportSize({ width, height: 844 });
      await alice.page.getByRole('button', { name: 'Apri Foto 1' }).click();
      await waitForStableViewer(alice.page);
      const geometry = await alice.page
        .locator('.photo-viewer-stage')
        .evaluate(stage => {
          const rect = stage.getBoundingClientRect();
          const image = stage
            .querySelector('.photo-viewer-image')!
            .getBoundingClientRect();
          const dialog = stage.closest('[role="dialog"]')!;
          return {
            xOffset: Math.abs(
              image.x + image.width / 2 - rect.x - rect.width / 2,
            ),
            yOffset: Math.abs(
              image.y + image.height / 2 - rect.y - rect.height / 2,
            ),
            inside:
              image.width <= rect.width + 1 && image.height <= rect.height + 1,
            overflow:
              dialog.scrollWidth > dialog.clientWidth ||
              dialog.scrollHeight > dialog.clientHeight,
          };
        });
      expect(
        geometry.xOffset,
        `${theme} ${width}px: ${JSON.stringify(geometry)}`,
      ).toBeLessThanOrEqual(1);
      expect(
        geometry.yOffset,
        `${theme} ${width}px: ${JSON.stringify(geometry)}`,
      ).toBeLessThanOrEqual(1);
      expect(geometry.inside).toBe(true);
      expect(geometry.overflow).toBe(false);
      await expect(
        alice.page.getByRole('button', { name: 'Chiudi', exact: true }),
      ).toHaveCount(1);
      await alice.page.keyboard.press('Escape');
    }
  }
  await closePersonas(alice, bob);
});

test('Album: anteprima pinch emulato su Chromium mobile', async ({
  browser,
}) => {
  test.skip(
    test.info().project.name !== 'chromium-mobile',
    'Il pinch CDP richiede il progetto mobile.',
  );
  test.setTimeout(90_000);
  // Given
  const alice = await createPersona(browser, 'alice_pinch');
  const bob = await createPersona(browser, 'bob_pinch');
  await matchContacts(alice, bob);
  await bob.page.getByRole('button', { name: /alice_pinch/ }).click();
  await bob.page
    .getByRole('button', { name: 'Impostazioni del Contatto' })
    .click();
  await bob.page.getByLabel('Foto da questo Contatto').selectOption('allow');
  await bob.page.getByRole('button', { name: 'Chiudi' }).last().click();
  await alice.page.getByRole('button', { name: /bob_pinch/ }).click();
  const png = await createPng(alice.page, '#4b65b5', 1200);
  await alice.page.getByLabel('Scegli foto').setInputFiles({
    name: 'foto-pinch.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  });
  await alice.page.getByRole('button', { name: 'Invia album' }).click();
  await expect(alice.page.locator('.album-gallery img')).toHaveCount(1, {
    timeout: 30_000,
  });
  await alice.page.getByRole('button', { name: 'Apri Foto 1' }).click();
  await expect(alice.page.locator('.photo-viewer-zoom-area')).toBeVisible();
  const area = await alice.page
    .locator('.photo-viewer-zoom-area')
    .boundingBox();
  expect(area).toBeTruthy();
  const readScale = () =>
    alice.page.locator('.photo-viewer-zoom-content').evaluate(element => {
      const matrix = new DOMMatrix(getComputedStyle(element).transform);
      return matrix.a;
    });
  const initial = await readScale();
  const session = await alice.page.context().newCDPSession(alice.page);
  const centerX = area!.x + area!.width / 2;
  const centerY = area!.y + area!.height / 2;
  try {
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchStart',
      touchPoints: [
        { id: 1, x: centerX - 20, y: centerY },
        { id: 2, x: centerX + 20, y: centerY },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchMove',
      touchPoints: [
        { id: 1, x: centerX - 100, y: centerY },
        { id: 2, x: centerX + 100, y: centerY },
      ],
    });
    await session.send('Input.dispatchTouchEvent', {
      type: 'touchEnd',
      touchPoints: [],
    });
  } finally {
    await session.detach();
  }
  await expect.poll(readScale).toBeGreaterThan(initial);
  await alice.page.keyboard.press('Escape');
  await expect(alice.page.getByRole('dialog')).toBeHidden();
  await closePersonas(alice, bob);
});

test('Album: incolla immagini nella stessa anteprima del picker', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  // Given
  const alice = await createPersona(browser, 'alice_paste');
  const bob = await createPersona(browser, 'bob_paste');
  await matchContacts(alice, bob);
  await alice.page.getByRole('button', { name: /bob_paste/ }).click();
  const png = await createPng(alice.page, '#2f8f67');
  await alice.page.getByLabel('Messaggio').fill('abc');
  await alice.page.getByLabel('Messaggio').evaluate(textarea => {
    if (!(textarea instanceof HTMLTextAreaElement))
      throw new Error('Il campo Messaggio non è una textarea.');
    textarea.setSelectionRange(1, 2);
  });

  // When
  await pastePngs(alice.page, [png], true);

  // Then
  await expect(
    alice.page.getByAltText('Anteprima 1', { exact: true }),
  ).toBeVisible();
  await expect(alice.page.getByLabel('Messaggio')).toHaveValue('abc');
  await expect(bob.page.locator('.album-gallery img')).toHaveCount(0);
  const selection = await alice.page
    .getByLabel('Messaggio')
    .evaluate(textarea => {
      if (!(textarea instanceof HTMLTextAreaElement))
        throw new Error('Il campo Messaggio non è una textarea.');
      return [textarea.selectionStart, textarea.selectionEnd];
    });
  expect(selection).toEqual([1, 2]);

  // When: a group exceeding the remaining capacity is pasted
  await alice.page.getByRole('button', { name: 'Annulla album' }).click();
  const photo = {
    name: 'base.png',
    mimeType: 'image/png',
    buffer: Buffer.from(png, 'base64'),
  };
  await alice.page
    .getByLabel('Scegli foto')
    .setInputFiles(Array(9).fill(photo));
  await expect(
    alice.page.getByAltText('Anteprima 9', { exact: true }),
  ).toBeVisible();
  await pastePngs(alice.page, [png, png, png]);

  // Then
  await expect(alice.page.getByRole('alert')).toContainText(
    'Puoi aggiungere ancora 1 foto.',
  );
  await expect(alice.page.locator('.album-preview img')).toHaveCount(9);
  await closePersonas(alice, bob);
});

test('Album: trascinamento foto converge con picker e incolla', async ({
  browser,
}) => {
  test.setTimeout(90_000);
  // Given
  const alice = await createPersona(browser, 'alice_drop');
  const bob = await createPersona(browser, 'bob_drop');
  await matchContacts(alice, bob);
  await alice.page.getByRole('button', { name: /bob_drop/ }).click();
  const pickerPng = await createPng(alice.page, '#2f8f67');
  const pastePng = await createPng(alice.page, '#b97836');
  const dropPng = await createPng(alice.page, '#4b65b5');
  const photo = {
    name: 'picker.png',
    mimeType: 'image/png',
    buffer: Buffer.from(pickerPng, 'base64'),
  };

  // When
  await alice.page.getByLabel('Scegli foto').setInputFiles(photo);
  await pastePngs(alice.page, [pastePng]);
  await dropPngs(alice.page, [dropPng]);

  // Then
  await expect(
    alice.page.getByAltText('Anteprima 3', { exact: true }),
  ).toBeVisible();
  await expect(bob.page.locator('.album-gallery img')).toHaveCount(0);

  // When: a file is released outside the composer
  const url = alice.page.url();
  const outside = await alice.page.evaluateHandle(encoded => {
    const dataTransfer = new DataTransfer();
    const bytes = Uint8Array.from(atob(encoded), character =>
      character.charCodeAt(0),
    );
    dataTransfer.items.add(
      new File([bytes], 'fuori.png', { type: 'image/png' }),
    );
    return dataTransfer;
  }, dropPng);
  try {
    await alice.page.locator('aside').dispatchEvent('drop', {
      dataTransfer: outside,
    });
  } finally {
    await outside.dispose();
  }

  // Then
  expect(alice.page.url()).toBe(url);
  await expect(alice.page.locator('.album-preview img')).toHaveCount(3);
  await closePersonas(alice, bob);
});

test('Album: input non valido e conversione senza encoder WebP nel browser', async ({
  browser,
}) => {
  // Given
  const alice = await createPersona(browser, 'alice_format');
  const bob = await createPersona(browser, 'bob_format');
  await matchContacts(alice, bob);
  await alice.page.getByRole('button', { name: /bob_format/ }).click();
  await bob.page.getByRole('button', { name: /alice_format/ }).click();
  const input = alice.page.getByLabel('Scegli foto');
  // When / Then
  await input.setInputFiles({
    name: 'fake.svg',
    mimeType: 'image/svg+xml',
    buffer: Buffer.from('<svg/>'),
  });
  await expect(alice.page.getByRole('alert')).toContainText(
    'Formato non supportato',
  );
  await input.setInputFiles({
    name: 'fake.png',
    mimeType: 'image/png',
    buffer: Buffer.from('not an image'),
  });
  await expect(alice.page.getByRole('alert')).toContainText(
    'Impossibile leggere',
  );
  const photo = {
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
      'base64',
    ),
  };
  await input.setInputFiles(Array(11).fill(photo));
  await expect(alice.page.getByRole('alert')).toContainText('da 1 a 10 foto');
  await expect(bob.page.locator('.album-gallery img')).toHaveCount(0);
  // Given: Safari-like browser without canvas WebP encoding
  await alice.page.evaluate(() => {
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = function (callback) {
      return original.call(this, callback, 'image/png');
    };
  });
  // When
  await input.setInputFiles(Array(10).fill(photo));
  await expect(
    alice.page.getByAltText('Anteprima 1', { exact: true }),
  ).toBeVisible();
  await alice.page.getByRole('button', { name: 'Invia album' }).click();
  await bob.page.getByRole('button', { name: 'Accetta foto' }).click();
  // Then
  await expect(bob.page.locator('.album-gallery img')).toHaveCount(10);
  await expect
    .poll(() =>
      bob.page
        .locator('.album-gallery img')
        .first()
        .evaluate((image: HTMLImageElement) => image.naturalWidth),
    )
    .toBe(1);
  await closePersonas(alice, bob);
});

test('Album: un mittente non può anticipare il consenso e gli errori di spazio non creano foto incomplete', async ({
  browser,
}) => {
  // Given
  const alice = await createPersona(browser, 'alice_guard');
  const bob = await createPersona(browser, 'bob_guard');
  await matchContacts(alice, bob);
  await alice.page.getByRole('button', { name: /bob_guard/ }).click();
  await bob.page.getByRole('button', { name: /alice_guard/ }).click();
  const id = await alice.page.evaluate(async peer => {
    const securePath =
      '/src/infrastructure/secure-session/sessioniSicureAttive.ts';
    const relayPath = '/src/infrastructure/relay/relayAttivo.ts';
    const { sessioniSicureAttive } = await import(securePath);
    const { leggiRelay } = await import(relayPath);
    const id = crypto.randomUUID();
    for (const frame of [
      { type: 'album.offer', id, sizes: [12] },
      {
        type: 'album.chunk',
        id,
        index: 0,
        offset: 0,
        data: 'AAAAAAAAAAAAAAAA',
      },
    ])
      leggiRelay().inviaMessaggio(
        peer,
        sessioniSicureAttive.cifraContenuto(
          peer,
          JSON.stringify(frame),
          Date.now(),
        ),
      );
    return id;
  }, bob.tacitusId);
  // Then
  expect(id).toBeTruthy();
  await expect(bob.page.getByRole('alert')).toContainText(
    'Album ricevuto non valido',
  );
  await expect(bob.page.locator('.album-gallery img')).toHaveCount(0);
  await expect(
    bob.page.getByText('Accettare foto da questo Contatto?'),
  ).toHaveCount(0);
  // Given: recipient storage cannot commit an album
  await bob.page.evaluate(() => {
    const original = IDBObjectStore.prototype.add;
    IDBObjectStore.prototype.add = function (value, key) {
      if (this.name === 'assets')
        throw new DOMException('full', 'QuotaExceededError');
      return original.call(this, value, key!);
    };
  });
  // When
  await alice.page.getByLabel('Scegli foto').setInputFiles({
    name: 'foto.png',
    mimeType: 'image/png',
    buffer: Buffer.from(
      'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR4nGP4z8DwHwAFAAH/iZk9HQAAAABJRU5ErkJggg==',
      'base64',
    ),
  });
  await alice.page.getByRole('button', { name: 'Invia album' }).click();
  await bob.page.getByRole('button', { name: 'Accetta foto' }).click();
  // Then
  await expect(bob.page.getByRole('alert')).toContainText(
    'Spazio locale esaurito. Album non salvato.',
  );
  await expect(alice.page.getByRole('alert')).toContainText('Album rifiutato');
  await expect(bob.page.locator('.album-gallery img')).toHaveCount(0);
  await expect(alice.page.locator('.album-gallery img')).toHaveCount(0);
  await closePersonas(alice, bob);
});

test('Album: un contenitore WebP corrotto non entra nella cronologia', async ({
  browser,
}) => {
  // Given
  const alice = await createPersona(browser, 'alice_corrupt');
  const bob = await createPersona(browser, 'bob_corrupt');
  await matchContacts(alice, bob);
  await bob.page.getByRole('button', { name: /alice_corrupt/ }).click();
  const id = await alice.page.evaluate(async peer => {
    const securePath =
      '/src/infrastructure/secure-session/sessioniSicureAttive.ts';
    const relayPath = '/src/infrastructure/relay/relayAttivo.ts';
    const { sessioniSicureAttive } = await import(securePath);
    const { leggiRelay } = await import(relayPath);
    const id = crypto.randomUUID();
    leggiRelay().inviaMessaggio(
      peer,
      sessioniSicureAttive.cifraContenuto(
        peer,
        JSON.stringify({ type: 'album.offer', id, sizes: [30] }),
        Date.now(),
      ),
    );
    return id;
  }, bob.tacitusId);
  await bob.page.getByRole('button', { name: 'Accetta foto' }).click();
  // When: valid 1×1 dimensions, missing VP8 bitstream
  await alice.page.evaluate(
    async ({ peer, id }) => {
      const securePath =
        '/src/infrastructure/secure-session/sessioniSicureAttive.ts';
      const relayPath = '/src/infrastructure/relay/relayAttivo.ts';
      const { sessioniSicureAttive } = await import(securePath);
      const { leggiRelay } = await import(relayPath);
      const bytes = new Uint8Array([
        82, 73, 70, 70, 22, 0, 0, 0, 87, 69, 66, 80, 86, 80, 56, 32, 10, 0, 0,
        0, 0, 0, 0, 157, 1, 42, 1, 0, 1, 0,
      ]);
      const data = btoa(String.fromCharCode(...bytes))
        .replaceAll('+', '-')
        .replaceAll('/', '_')
        .replace(/=+$/, '');
      leggiRelay().inviaMessaggio(
        peer,
        sessioniSicureAttive.cifraContenuto(
          peer,
          JSON.stringify({
            type: 'album.chunk',
            id,
            index: 0,
            offset: 0,
            data,
          }),
          Date.now(),
        ),
      );
    },
    { peer: bob.tacitusId, id },
  );
  // Then
  await expect(bob.page.getByRole('alert')).toContainText(
    'Album ricevuto non valido',
  );
  await expect(bob.page.locator('.album-gallery img')).toHaveCount(0);
  await closePersonas(alice, bob);
});

test('Cancella dati impedisce a un salvataggio tardivo di ricreare la cronologia', async ({
  browser,
}) => {
  // Given
  const alice = await createPersona(browser, 'alice_clear');
  // When
  const result = await alice.page.evaluate(async () => {
    const path = '/src/infrastructure/persistence/localPersistence.ts';
    const { loadIdentity, clearLocalData, enqueueStateSave } = await import(
      path
    );
    const identity = await loadIdentity();
    await clearLocalData();
    await enqueueStateSave(identity, {
      conversazioni: { perContatto: {} },
      relazioni: { intenti: {}, blocchi: {}, contatti: {}, relazioni: {} },
    }).catch(() => undefined);
    return (await indexedDB.databases()).map(db => db.name);
  });
  // Then
  expect(result).not.toContain('tacitus-v3');
  await closePersonas(alice);
});

test('gli asset locali hanno indici opachi e un Album non può sovrascriverne un altro', async ({
  browser,
}) => {
  // Given
  const alice = await createPersona(browser, 'alice_assets');
  const result = await alice.page.evaluate(async () => {
    const path = '/src/infrastructure/persistence/localPersistence.ts';
    const protocolPath = '/src/generated/tacitus_protocol.js';
    const { loadIdentity, saveAlbum, loadAlbum, deleteContactAlbums } =
      await import(path);
    const { encodeWebP } = await import(protocolPath);
    const identity = await loadIdentity();
    const peer = '00000-00000-00000-00000-000000';
    const id = crypto.randomUUID();
    await saveAlbum(identity, peer, id, [
      encodeWebP(new Uint8Array([255, 0, 0, 255]), 1, 1),
    ]);
    const before = await loadAlbum(identity, peer, id);
    // When
    let duplicateRejected = false;
    try {
      await saveAlbum(identity, peer, id, [
        encodeWebP(new Uint8Array([0, 0, 255, 255]), 1, 1),
      ]);
    } catch {
      duplicateRejected = true;
    }
    const after = await loadAlbum(identity, peer, id);
    const keys = await new Promise<IDBValidKey[]>(resolve => {
      const open = indexedDB.open('tacitus-v3');
      open.onsuccess = () => {
        const db = open.result;
        const read = db
          .transaction('assets')
          .objectStore('assets')
          .getAllKeys();
        read.onsuccess = () => {
          resolve(read.result);
          db.close();
        };
      };
    });
    await deleteContactAlbums(peer);
    return {
      duplicateRejected,
      unchanged: JSON.stringify(before) === JSON.stringify(after),
      keys,
      id,
    };
  });
  // Then
  expect(result.duplicateRejected).toBe(true);
  expect(result.unchanged).toBe(true);
  expect(result.keys).toEqual([result.id]);
  await closePersonas(alice);
});

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

  test('un Blocco impedisce la Relazione finché non viene rimosso', async ({
    browser,
  }) => {
    // Given
    const alice = await createPersona(browser, 'alice_block');
    const bob = await createPersona(browser, 'bob_block');
    await matchContacts(alice, bob);
    await alice.page.getByRole('button', { name: /bob_block/ }).click();
    alice.page.once('dialog', dialog => dialog.accept());

    // When
    await alice.page.getByRole('button', { name: 'Blocca' }).click();

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
    await alice.page.getByLabel('Impostazioni', { exact: true }).click();
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
  await alice.page.getByLabel('Impostazioni', { exact: true }).click();
  await expect(
    alice.page.getByRole('button', { name: 'Cancella dati' }),
  ).toBeVisible();
  await expect(
    alice.page.getByRole('button', { name: /Passa al tema/ }),
  ).toBeVisible();
  await expect(
    alice.page.getByRole('button', { name: 'Abilita notifiche' }),
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
  await alice.page.getByLabel('Scegli foto').setInputFiles(files.slice(0, 1));
  await alice.page.getByRole('button', { name: 'Invia album' }).click();
  // Then
  await expect(
    alice.page.getByText('Album rifiutato dal Contatto.'),
  ).toBeVisible();
  await expect(bob.page.locator('.album-gallery img')).toHaveCount(3);
  // When: global block overrides per-contact acceptance
  await bob.page.getByLabel('Foto da questo Contatto').selectOption('allow');
  await bob.page.getByLabel('Impostazioni', { exact: true }).click();
  await bob.page.getByLabel('Ricevi foto e album').uncheck();
  await bob.page.getByLabel('Impostazioni', { exact: true }).click();
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
  bob.page.once('dialog', dialog => dialog.accept());
  await bob.page.getByRole('button', { name: 'Rimuovi', exact: true }).click();
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

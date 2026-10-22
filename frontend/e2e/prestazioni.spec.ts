import {
  chromium,
  expect,
  firefox,
  test,
  type Browser,
  type CDPSession,
  type Page,
} from '@playwright/test';

// Opt-in benchmark: `npm run test:perf`. Timings depend on the machine, so it reports instead of asserting.
test.skip(!process.env.TACITUS_PERF, 'imposta TACITUS_PERF=1');

const CPU_THROTTLING = 4;
const HISTORY_STEPS = (process.env.TACITUS_PERF_HISTORY ?? '0,200,500')
  .split(',')
  .map(Number);
// Firefox has no CDP: it measures latency without CPU throttling or profile.
const BROWSER =
  process.env.TACITUS_PERF_BROWSER === 'firefox' ? firefox : chromium;
const TYPED_TEXT = 'ciao, come va? tutto bene qui';

declare global {
  interface Window {
    __tacitusKeyLatencies: number[];
  }
}

type ProfileNode = {
  id: number;
  callFrame: { functionName: string; url: string; lineNumber: number };
  children?: number[];
};

type Profile = {
  nodes: ProfileNode[];
  samples: number[];
  timeDeltas: number[];
};

const createPersona = async (
  browser: Browser,
  baseURL: string | undefined,
  nickname: string,
) => {
  const page = await (await browser.newContext({ baseURL })).newPage();
  await page.goto('/');
  await page.getByLabel('Nickname immutabile').fill(nickname);
  await page.getByRole('button', { name: 'Crea Identità' }).click();
  await expect(page.locator('.connection')).toHaveText('online', {
    timeout: 15_000,
  });
  await page.getByLabel('Impostazioni Tacitus', { exact: true }).click();
  const tacitusId = await page
    .locator('.settings-content .identity code')
    .innerText();
  await page.keyboard.press('Escape');
  return { page, tacitusId };
};

const addContact = async (page: Page, tacitusId: string) => {
  await page.locator('.panel-title .add').click();
  await page
    .getByRole('textbox', { name: 'Tacitus ID', exact: true })
    .fill(tacitusId);
  await page.getByRole('button', { name: 'Aggiungi', exact: true }).click();
};

const fillHistory = async (page: Page, total: number) => {
  const composer = page.getByLabel('Messaggio');
  const messages = page.locator('.messages .message');
  for (let sent = await messages.count(); sent < total; sent++) {
    await composer.fill(`messaggio di riempimento numero ${sent}`);
    await composer.press('Enter');
    await expect(messages).toHaveCount(sent + 1);
  }
};

// Key-to-next-frame latency: rAF then a macrotask lands after the frame that shows the keystroke.
const recordKeyLatencies = () => {
  window.__tacitusKeyLatencies = [];
  addEventListener(
    'keydown',
    () => {
      const start = performance.now();
      requestAnimationFrame(() =>
        setTimeout(() =>
          window.__tacitusKeyLatencies.push(performance.now() - start),
        ),
      );
    },
    true,
  );
};

const percentile = (values: number[], p: number) =>
  [...values].sort((a, b) => a - b)[
    Math.min(values.length - 1, Math.floor((values.length * p) / 100))
  ];

const isAppFrame = ({ callFrame: { url } }: ProfileNode) =>
  url.includes('/src/') && !url.includes('/src/generated/');

// Library time (React, Redux) is charged to the nearest app function that called it.
const hottestFunctions = (profile: Profile, limit = 12) => {
  const nodes = new Map(profile.nodes.map(node => [node.id, node]));
  const parents = new Map<number, number>();
  profile.nodes.forEach(node =>
    node.children?.forEach(child => parents.set(child, node.id)),
  );
  const time = new Map<string, number>();
  profile.samples.forEach((id, index) => {
    let node = nodes.get(id);
    if (!node?.callFrame.url) return;
    while (node && !isAppFrame(node)) node = nodes.get(parents.get(node.id)!);
    const name = node
      ? `${node.callFrame.functionName || '(anonima)'} ${node.callFrame.url.split('/src/')[1].split('?')[0]}:${node.callFrame.lineNumber + 1}`
      : '(librerie senza chiamante app)';
    time.set(name, (time.get(name) ?? 0) + profile.timeDeltas[index]);
  });
  return [...time]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(
      ([name, micros]) =>
        `${(micros / 1000).toFixed(1).padStart(8)} ms  ${name}`,
    );
};

const measureTyping = async (page: Page, cdp?: CDPSession) => {
  const composer = page.getByLabel('Messaggio');
  await composer.fill('');
  await page.evaluate(() => (window.__tacitusKeyLatencies = []));
  await cdp?.send('Emulation.setCPUThrottlingRate', { rate: CPU_THROTTLING });
  await cdp?.send('Profiler.start');
  await composer.pressSequentially(TYPED_TEXT, { delay: 80 });
  await page.waitForTimeout(300);
  const profile = (await cdp?.send('Profiler.stop'))?.profile;
  await cdp?.send('Emulation.setCPUThrottlingRate', { rate: 1 });
  const latencies = await page.evaluate(() => window.__tacitusKeyLatencies);
  await composer.fill('');
  return {
    latencies,
    hot: profile ? hottestFunctions(profile as Profile) : [],
  };
};

test('latenza della digitazione al crescere della cronologia', async ({
  baseURL,
}, testInfo) => {
  test.skip(testInfo.project.name !== 'chromium-desktop', 'misura desktop');
  test.setTimeout(1_800_000);
  const browser = await BROWSER.launch();
  const alice = await createPersona(browser, baseURL, 'alice_perf');
  const bob = await createPersona(browser, baseURL, 'bob_perf');
  await addContact(alice.page, bob.tacitusId);
  await addContact(bob.page, alice.tacitusId);
  await expect(alice.page.getByText('Sessione sicura')).toBeVisible({
    timeout: 15_000,
  });
  await alice.page.getByRole('button', { name: /bob_perf/ }).click();
  await alice.page.evaluate(recordKeyLatencies);
  const cdp =
    BROWSER === chromium
      ? await alice.page.context().newCDPSession(alice.page)
      : undefined;
  await cdp?.send('Profiler.enable');
  await cdp?.send('Profiler.setSamplingInterval', { interval: 200 });

  const report: string[] = [
    `${BROWSER.name()}, CPU rallentata ${cdp ? CPU_THROTTLING : 1}x, ${TYPED_TEXT.length} tasti a 80 ms`,
  ];
  // Warm-up run: the first keystrokes pay for JIT and lazy chunks, not for the history.
  await measureTyping(alice.page, cdp);
  for (const total of HISTORY_STEPS) {
    await fillHistory(alice.page, total);
    const { hot, latencies } = await measureTyping(alice.page, cdp);
    report.push(
      '',
      `${total} messaggi: tasto→frame p50 ${percentile(latencies, 50).toFixed(1)} ms, ` +
        `p95 ${percentile(latencies, 95).toFixed(1)} ms, ` +
        `max ${Math.max(...latencies).toFixed(1)} ms`,
      ...(hot.length
        ? [
            'tempo CPU per funzione app (incluse le librerie che chiama):',
            ...hot,
          ]
        : []),
    );
  }

  console.log(report.join('\n'));
  await testInfo.attach('prestazioni.txt', { body: report.join('\n') });
  await browser.close();
});

// Diagnostic only: `localStorage.setItem('tacitus.perf', '1')`, reload, then read the console.
const ENABLED_KEY = 'tacitus.perf';
const SLOW_EVENT_MS = 50;

type LongAnimationFrameScript = {
  duration: number;
  invoker: string;
  sourceFunctionName: string;
  sourceURL: string;
  sourceCharPosition: number;
};

type LongAnimationFrame = PerformanceEntry & {
  blockingDuration: number;
  scripts: LongAnimationFrameScript[];
};

const enabled = () => {
  try {
    return localStorage.getItem(ENABLED_KEY) === '1';
  } catch {
    return false;
  }
};

const logLongFrames = (list: PerformanceObserverEntryList) => {
  for (const frame of list.getEntries() as LongAnimationFrame[])
    console.warn(
      `[tacitus/perf] frame ${Math.round(frame.duration)} ms, bloccante ${Math.round(frame.blockingDuration)} ms`,
      frame.scripts.map(script => ({
        ms: Math.round(script.duration),
        invoker: script.invoker,
        funzione: script.sourceFunctionName,
        sorgente: `${script.sourceURL}:${script.sourceCharPosition}`,
      })),
    );
};

const logSlowEvents = (list: PerformanceObserverEntryList) => {
  for (const event of list.getEntries() as PerformanceEventTiming[])
    console.warn(
      `[tacitus/perf] ${event.name} ${Math.round(event.duration)} ms: ` +
        `attesa ${Math.round(event.processingStart - event.startTime)}, ` +
        `handler ${Math.round(event.processingEnd - event.processingStart)}, ` +
        `rendering ${Math.round(event.startTime + event.duration - event.processingEnd)}`,
    );
};

export const startPerformanceMonitor = () => {
  if (!enabled() || typeof PerformanceObserver === 'undefined') return;
  const supported = PerformanceObserver.supportedEntryTypes;
  if (supported.includes('long-animation-frame'))
    new PerformanceObserver(logLongFrames).observe({
      type: 'long-animation-frame',
      buffered: true,
    });
  if (supported.includes('event'))
    new PerformanceObserver(logSlowEvents).observe({
      type: 'event',
      durationThreshold: SLOW_EVENT_MS,
      buffered: true,
    } as PerformanceObserverInit);
  console.info(
    `[tacitus/perf] monitor attivo; disattiva con localStorage.removeItem('${ENABLED_KEY}')`,
  );
};

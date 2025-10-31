/**
 * Fake timer orchestration helpers for Cockatiel-powered backend specs.
 *
 * Aligns backend tests with standards/testing-standards.md by centralising
 * the logic that advances Jest timers until resilience policies settle their
 * retry/timeout sequences. Avoids bespoke `while` loops in each suite.
 */

/** Flush pending microtasks to let promise callbacks progress under fake timers. */
export async function flushMicrotasks(iterations = 2): Promise<void> {
  for (let index = 0; index < iterations; index += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

interface AdvanceTimersOptions {
  /** Milliseconds to advance per cycle; defaults to 100 for provider backoff delays. */
  stepMs?: number;
  /** Maximum cycles before aborting to surface runaway polling. */
  maxCycles?: number;
}

/**
 * Advance Jest fake timers in fixed increments until the supplied promise settles.
 * Throws if the promise remains pending after `maxCycles` iterations to prevent
 * infinite loops caused by misconfigured Cockatiel timelines.
 */
export async function advanceTimersUntilSettled<T>(
  promise: Promise<T>,
  options: AdvanceTimersOptions = {}
): Promise<T> {
  const { stepMs = 100, maxCycles = 200 } = options;

  let settled = false;
  const tracked = promise.finally(() => {
    settled = true;
  });

  await flushMicrotasks();

  for (let cycle = 0; cycle < maxCycles && !settled; cycle += 1) {
    // eslint-disable-next-line no-await-in-loop
    await jest.advanceTimersByTimeAsync(stepMs);
    // eslint-disable-next-line no-await-in-loop
    await flushMicrotasks();
  }

  if (!settled) {
    const pendingTimers = typeof jest.getTimerCount === 'function'
      ? jest.getTimerCount()
      : 'unknown';
    throw new Error(
      `advanceTimersUntilSettled exceeded ${maxCycles} cycles (step ${stepMs}ms). Pending timers: ${pendingTimers}`
    );
  }

  return tracked;
}

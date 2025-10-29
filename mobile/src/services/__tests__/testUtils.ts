/**
 * Shared test utilities for service-layer specs.
 *
 * Centralises fake-timer orchestration so polling tests avoid copy/paste
 * `advanceTimersByTimeAsync` loops and stay compliant with
 * standards/testing-standards.md (no sleep-based polling).
 */

import { z, type ZodTypeAny } from 'zod';

import { schemaSafeResponse } from './stubs';

type SchemaInfer<TSchema extends ZodTypeAny> = z.infer<TSchema>;

export async function flushMicrotasks(iterations = 2): Promise<void> {
  for (let i = 0; i < iterations; i += 1) {
    // eslint-disable-next-line no-await-in-loop
    await Promise.resolve();
  }
}

interface AdvanceTimersOptions {
  /** Milliseconds to advance per cycle; defaults to 5000 (poll interval). */
  stepMs?: number;
  /** Maximum number of iterations before aborting to prevent infinite loops. */
  maxCycles?: number;
}

/**
 * Advance fake timers in fixed steps until the provided promise settles.
 *
 * Useful for cockatiel retry/poll loops that rely on `setTimeout` under
 * Jest's modern fake timers. Throws if the promise does not settle within
 * the configured cycle budget to surface runaway polling bugs.
 */
export async function advanceTimersUntilSettled<T>(
  promise: Promise<T>,
  options: AdvanceTimersOptions = {}
): Promise<T> {
  const { stepMs = 5000, maxCycles = 300 } = options;

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

interface PollingScenarioOptions<TSchema extends ZodTypeAny> {
  fetchMock: jest.MockedFunction<typeof fetch>;
  /** Determines which fetch calls the scenario should satisfy. */
  matcher: (input: RequestInfo | URL, init?: RequestInit) => boolean;
  /** Zod schema for validation. */
  schema: TSchema;
  /** Builder providing schema-complete defaults. */
  build: (overrides?: Partial<SchemaInfer<TSchema>>) => SchemaInfer<TSchema>;
  /** Ordered list of states returned for successive polls. */
  timeline: (Partial<SchemaInfer<TSchema>> | (() => Partial<SchemaInfer<TSchema>>) | SchemaInfer<TSchema>)[];
  /** Optional fallback state once the timeline is exhausted. */
  fallback?: Partial<SchemaInfer<TSchema>> | (() => Partial<SchemaInfer<TSchema>>) | SchemaInfer<TSchema>;
  /** Repeat the last timeline entry when true (useful for timeouts). */
  repeatLast?: boolean;
  /** Human-friendly name for diagnostics. */
  scenarioName?: string;
  /** Additional Response init overrides. */
  responseInit?: {
    ok?: boolean;
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
  };
}

interface PollingScenarioHandle {
  /** Number of times the scenario satisfied the matcher. */
  callCount: () => number;
  /** Restore the previous fetch implementation. */
  restore: () => void;
}

function resolveStep<TSchema extends ZodTypeAny>(
  options: {
    schema: TSchema;
    build: (overrides?: Partial<SchemaInfer<TSchema>>) => SchemaInfer<TSchema>;
    step: Partial<SchemaInfer<TSchema>> | (() => Partial<SchemaInfer<TSchema>>) | SchemaInfer<TSchema>;
  }
): SchemaInfer<TSchema> {
  const { schema, build, step } = options;

  if (typeof step === 'function') {
    const overrides = (step as () => Partial<SchemaInfer<TSchema>>)();
    return schema.parse(build(overrides));
  }

  if (step && typeof step === 'object' && !Array.isArray(step)) {
    const directCandidate = schema.safeParse(step);
    if (directCandidate.success) {
      return directCandidate.data;
    }
    return schema.parse(build(step as Partial<SchemaInfer<TSchema>>));
  }

  return schema.parse(build());
}

export function createPollingScenario<TSchema extends ZodTypeAny>(
  options: PollingScenarioOptions<TSchema>
): PollingScenarioHandle {
  const {
    fetchMock,
    matcher,
    schema,
    build,
    timeline,
    fallback,
    repeatLast = false,
    scenarioName = 'polling',
    responseInit,
  } = options;

  if (timeline.length === 0 && !fallback && !repeatLast) {
    throw new Error(`createPollingScenario(${scenarioName}) requires at least one timeline state, a fallback, or repeatLast=true.`);
  }

  const resolvedTimeline = timeline.map((step, index) => {
    // Validate step at scenario setup time to catch schema errors early
    return () => {
      try {
        return resolveStep({ schema, build, step });
      } catch (error) {
        throw new Error(`createPollingScenario(${scenarioName}) failed to validate timeline step ${index}: ${(error as Error).message}`);
      }
    };
  });

  const finalStepFactory = repeatLast && resolvedTimeline.length > 0
    ? resolvedTimeline[resolvedTimeline.length - 1]
    : undefined;

  const fallbackFactory = fallback !== undefined
    ? () => resolveStep({ schema, build, step: typeof fallback === 'function' ? (fallback as () => Partial<SchemaInfer<TSchema>>)() : fallback })
    : undefined;

  let callIndex = 0;
  const previousImplementation = fetchMock.getMockImplementation();

  const scenarioImpl = (input: RequestInfo | URL, init?: RequestInit) => {
    if (!matcher(input, init)) {
      if (previousImplementation) {
        return previousImplementation(input as RequestInfo, init);
      }
      throw new Error(`createPollingScenario(${scenarioName}) received unexpected fetch call to ${String(input)}`);
    }

    let payload: SchemaInfer<TSchema> | undefined;

    if (callIndex < resolvedTimeline.length) {
      payload = resolvedTimeline[callIndex]() as SchemaInfer<TSchema>;
    } else if (finalStepFactory) {
      payload = finalStepFactory() as SchemaInfer<TSchema>;
    } else if (fallbackFactory) {
      payload = fallbackFactory() as SchemaInfer<TSchema>;
    } else {
      throw new Error(
        `createPollingScenario(${scenarioName}) exhausted timeline after ${callIndex} calls without fallback. ` +
        'Provide additional states, set repeatLast=true, or configure a fallback.'
      );
    }

    callIndex += 1;

    const responseOptions: Parameters<typeof schemaSafeResponse<TSchema>>[0] = {
      schema,
      build,
      value: payload,
    };
    if (responseInit) {
      responseOptions.responseInit = responseInit;
    }

    return Promise.resolve(schemaSafeResponse(responseOptions));
  };

  fetchMock.mockImplementation(scenarioImpl as typeof fetch);

  return {
    callCount: () => callIndex,
    restore: () => {
      if (previousImplementation) {
        fetchMock.mockImplementation(previousImplementation as typeof fetch);
      } else {
        fetchMock.mockImplementation(() => {
          throw new Error(`createPollingScenario(${scenarioName}) restore called but no original implementation was available.`);
        });
      }
    },
  };
}

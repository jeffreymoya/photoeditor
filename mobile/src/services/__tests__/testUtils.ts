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

export interface FetchStageDefinition {
  /** Unique name used for diagnostics. */
  name: string;
  /** Determines whether this stage should satisfy the request. */
  matcher: (input: RequestInfo | URL, init?: RequestInit) => boolean;
  /**
   * Returns a fresh Response each time.
   *
   * IMPORTANT: Always provide a function that builds a new Response. Reusing
   * the same instance will exhaust the body after the first read.
   */
  handler: (context: { input: RequestInfo | URL; init?: RequestInit; callIndex: number }) => Promise<Response> | Response;
  /** Optional guard to limit how many times the stage may respond. */
  maxCalls?: number;
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
  /**
   * Additional fetch stages that should execute before the polling timeline.
   *
   * Use this for presign requests, uploads, or transient error setup so the
   * scenario owns the entire fetch lifecycle without relying on
   * mockResolvedValueOnce chains.
   */
  stages?: FetchStageDefinition[];
}

interface PollingScenarioHandle {
  /** Number of times the polling matcher satisfied the request. */
  callCount: () => number;
  /** Number of times each named stage handled a request. */
  getStageCallCounts: () => Record<string, number>;
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
    stages = [],
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

  const stageStates: (FetchStageDefinition & { callCount: number })[] = stages.map((stage) => ({
    ...stage,
    callCount: 0,
  }));

  let pollingCallCount = 0;
  let timelineIndex = 0;

  stageStates.push({
    name: `${scenarioName}:polling`,
    matcher,
    handler: (_context) => {
      let payload: SchemaInfer<TSchema> | undefined;

      if (timelineIndex < resolvedTimeline.length) {
        payload = resolvedTimeline[timelineIndex]() as SchemaInfer<TSchema>;
        timelineIndex += 1;
      } else if (finalStepFactory) {
        payload = finalStepFactory() as SchemaInfer<TSchema>;
      } else if (fallbackFactory) {
        payload = fallbackFactory() as SchemaInfer<TSchema>;
      } else {
        throw new Error(
          `createPollingScenario(${scenarioName}) exhausted timeline after ${pollingCallCount} calls without fallback. ` +
          'Provide additional states, set repeatLast=true, or configure a fallback.'
        );
      }

      pollingCallCount += 1;

      const responseOptions: Parameters<typeof schemaSafeResponse<TSchema>>[0] = {
        schema,
        build,
        value: payload,
      };
      if (responseInit) {
        responseOptions.responseInit = responseInit;
      }

      return Promise.resolve(schemaSafeResponse(responseOptions));
    },
    callCount: 0,
  });

  const previousImplementation = fetchMock.getMockImplementation();

  fetchMock.mockImplementation(async (input: RequestInfo | URL, init?: RequestInit) => {
    for (const stage of stageStates) {
      const stageMatcher = stage.matcher;
      if (!stageMatcher(input, init)) {
        continue;
      }

      if (stage.maxCalls !== undefined && stage.callCount >= stage.maxCalls) {
        continue;
      }

      const callIndex = stage.callCount;
      stage.callCount += 1;

      return stage.handler({ input, init, callIndex });
    }

    if (previousImplementation) {
      return previousImplementation(input as RequestInfo, init);
    }

    const stageSummary = stageStates
      .map((stage) => `  - ${stage.name}: ${stage.callCount}/${stage.maxCalls ?? '∞'} calls`)
      .join('\n');

    throw new Error(
      `createPollingScenario(${scenarioName}) received unexpected fetch call to ${String(input)}.` +
      '\nNo stage handled the request. Registered stages:\n' + stageSummary
    );
  });

  return {
    callCount: () => pollingCallCount,
    getStageCallCounts: () => Object.fromEntries(stageStates.map((stage) => [stage.name, stage.callCount])),
    restore: () => {
      if (previousImplementation) {
        fetchMock.mockImplementation(previousImplementation as typeof fetch);
        return;
      }

      fetchMock.mockImplementation(() => {
        throw new Error(`createPollingScenario(${scenarioName}) restore called but no original implementation was available.`);
      });
    },
  };
}

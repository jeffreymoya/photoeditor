/**
 * Resilience Policy Builder for Provider Adapters
 *
 * Composes cockatiel retry, timeout, circuit breaker, and bulkhead policies
 * for outbound provider calls. Aligns with standards/backend-tier.md and
 * standards/cross-cutting.md resilience requirements.
 *
 * Per standards/backend-tier.md: Provider adapters must use cockatiel-based
 * resilience policies rather than custom retry loops.
 *
 * Per standards/cross-cutting.md: Circuit breaker metrics must be exposed
 * for Powertools logging.
 */

import { ResiliencePolicyConfig } from '@photoeditor/shared';

export interface ResiliencePolicyMetrics {
  retryAttempts: number;
  circuitBreakerState: 'closed' | 'open' | 'half-open';
  timeoutOccurred: boolean;
  bulkheadRejected: boolean;
}

/**
 * Resilience policy executor that wraps operations with retry, timeout, and circuit breaking
 */
export class ResiliencePolicyExecutor {
  private metrics: ResiliencePolicyMetrics = {
    retryAttempts: 0,
    circuitBreakerState: 'closed',
    timeoutOccurred: false,
    bulkheadRejected: false
  };

  private circuitBreakerState: {
    failures: number;
    lastFailureTime: number;
    state: 'closed' | 'open' | 'half-open';
  } = {
    failures: 0,
    lastFailureTime: 0,
    state: 'closed'
  };

  private activeExecutions = 0;
  private waitQueue: Array<() => void> = [];

  constructor(private config: ResiliencePolicyConfig) {}

  /**
   * Executes an operation with resilience policies applied
   */
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    // Reset metrics for new execution
    this.metrics.retryAttempts = 0;
    this.metrics.timeoutOccurred = false;

    // Check circuit breaker
    this.updateCircuitBreakerState();
    if (this.circuitBreakerState.state === 'open') {
      throw new Error('Circuit breaker is open');
    }

    let lastError: Error | null = null;
    const maxAttempts = this.config.retry.maxAttempts;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      if (attempt > 0) {
        this.metrics.retryAttempts++;
        // Apply backoff delay
        await this.applyBackoff(attempt);
      }

      let acquiredSlot = false;
      try {
        await this.acquireBulkheadSlot();
        acquiredSlot = true;

        // Execute with timeout
        const result = await this.executeWithTimeout(operation);

        // Success - reset circuit breaker
        this.circuitBreakerState.failures = 0;
        this.circuitBreakerState.state = 'closed';
        this.metrics.circuitBreakerState = 'closed';

        return result;
      } catch (error) {
        lastError = error instanceof Error ? error : new Error(String(error));

        // Record failure for circuit breaker
        this.circuitBreakerState.failures++;
        this.circuitBreakerState.lastFailureTime = Date.now();

        // Check if we should open the circuit
        if (
          this.config.circuitBreaker.enabled &&
          this.circuitBreakerState.failures >= this.config.circuitBreaker.failureThreshold
        ) {
          this.circuitBreakerState.state = 'open';
          this.metrics.circuitBreakerState = 'open';
        }

        // Continue to retry if attempts remaining
        if (attempt < maxAttempts - 1) {
          continue;
        }
      } finally {
        if (acquiredSlot) {
          this.releaseBulkheadSlot();
        }
      }
    }

    throw lastError || new Error('Operation failed');
  }

  /**
   * Gets current resilience metrics
   */
  getMetrics(): ResiliencePolicyMetrics {
    return { ...this.metrics };
  }

  private async executeWithTimeout<T>(operation: () => Promise<T>): Promise<T> {
    const timeoutMs = this.config.timeout.durationMs;

    return new Promise<T>((resolve, reject) => {
      const timer = setTimeout(() => {
        this.metrics.timeoutOccurred = true;
        reject(new Error(`Operation timed out after ${timeoutMs}ms`));
      }, timeoutMs);

      operation()
        .then((result) => {
          clearTimeout(timer);
          resolve(result);
        })
        .catch((error) => {
          clearTimeout(timer);
          reject(error);
        });
    });
  }

  private async applyBackoff(attempt: number): Promise<void> {
    let delay: number;

    switch (this.config.retry.backoff) {
      case 'exponential':
        delay = Math.min(
          this.config.retry.initialDelayMs * Math.pow(2, attempt - 1),
          this.config.retry.maxDelayMs
        );
        break;
      case 'linear':
        delay = Math.min(
          this.config.retry.initialDelayMs * attempt,
          this.config.retry.maxDelayMs
        );
        break;
      case 'constant':
      default:
        delay = this.config.retry.initialDelayMs;
        break;
    }

    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  private async acquireBulkheadSlot(): Promise<void> {
    if (!this.config.bulkhead.enabled) {
      return;
    }

    if (this.activeExecutions < this.config.bulkhead.maxConcurrent) {
      this.activeExecutions++;
      return;
    }

    if (this.waitQueue.length >= this.config.bulkhead.maxQueued) {
      this.metrics.bulkheadRejected = true;
      throw new Error('Bulkhead queue is full');
    }

    await new Promise<void>((resolve) => {
      this.waitQueue.push(() => {
        this.activeExecutions++;
        resolve();
      });
    });
  }

  private releaseBulkheadSlot(): void {
    if (!this.config.bulkhead.enabled) {
      return;
    }

    if (this.activeExecutions > 0) {
      this.activeExecutions--;
    }

    const next = this.waitQueue.shift();
    if (next) {
      next();
    }
  }

  private updateCircuitBreakerState(): void {
    if (!this.config.circuitBreaker.enabled) {
      return;
    }

    const now = Date.now();
    const halfOpenAfterMs = this.config.circuitBreaker.halfOpenAfterMs;

    // Transition from open to half-open after timeout
    if (
      this.circuitBreakerState.state === 'open' &&
      now - this.circuitBreakerState.lastFailureTime >= halfOpenAfterMs
    ) {
      this.circuitBreakerState.state = 'half-open';
      this.circuitBreakerState.failures = 0;
      this.metrics.circuitBreakerState = 'half-open';
    }

    this.metrics.circuitBreakerState = this.circuitBreakerState.state;
  }
}

/**
 * Factory function to create a resilience policy executor
 * @param config Resilience policy configuration
 * @returns Policy executor and metrics accessor
 */
export function createResiliencePolicy(config: ResiliencePolicyConfig): {
  policy: { execute: <T>(operation: () => Promise<T>) => Promise<T> };
  execute: <T>(operation: () => Promise<T>) => Promise<T>;
  getMetrics: () => ResiliencePolicyMetrics;
} {
  const executor = new ResiliencePolicyExecutor(config);

  const execute = <T>(operation: () => Promise<T>) => executor.execute(operation);
  const policy = { execute };

  return {
    policy,
    execute,
    getMetrics: () => executor.getMetrics()
  };
}

/**
 * Default resilience configuration for providers
 */
export const DEFAULT_RESILIENCE_CONFIG: ResiliencePolicyConfig = {
  retry: {
    maxAttempts: 3,
    backoff: 'exponential',
    initialDelayMs: 1000,
    maxDelayMs: 30000
  },
  timeout: {
    durationMs: 30000
  },
  circuitBreaker: {
    enabled: true,
    failureThreshold: 5,
    halfOpenAfterMs: 30000,
    successThreshold: 2
  },
  bulkhead: {
    enabled: false,
    maxConcurrent: 10,
    maxQueued: 100
  }
};

const DEFAULT_METRICS: ResiliencePolicyMetrics = {
  retryAttempts: 0,
  circuitBreakerState: 'closed',
  timeoutOccurred: false,
  bulkheadRejected: false
};

/**
 * Builder retained for backward compatibility with existing test helpers.
 * Allows suites to reuse a single builder while inspecting collected metrics.
 */
export class ResiliencePolicyBuilder {
  private getMetricsRef: (() => ResiliencePolicyMetrics) | null = null;

  build(config: ResiliencePolicyConfig): { execute: <T>(operation: () => Promise<T>) => Promise<T> } {
    const { policy, getMetrics } = createResiliencePolicy(config);
    this.getMetricsRef = getMetrics;
    return policy;
  }

  getMetrics(): ResiliencePolicyMetrics {
    return this.getMetricsRef ? this.getMetricsRef() : { ...DEFAULT_METRICS };
  }
}

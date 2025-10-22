/**
 * Unit tests for Resilience Policy Builder
 *
 * Tests cockatiel-based retry, timeout, circuit breaker, and bulkhead policies
 * for provider adapters. Validates alignment with standards/backend-tier.md
 * and standards/cross-cutting.md resilience requirements.
 */
// @ts-nocheck


import {
  ResiliencePolicyBuilder,
  createResiliencePolicy,
  DEFAULT_RESILIENCE_CONFIG
} from '../../../src/libs/core/providers/resilience-policy';
import { ResiliencePolicyConfig } from '@photoeditor/shared';

beforeEach(() => {
  jest.useRealTimers();
});

describe('ResiliencePolicyBuilder', () => {
  describe('Retry Policy', () => {
    it('should retry failed operations up to maxAttempts', async () => {
      const config: ResiliencePolicyConfig = {
        ...DEFAULT_RESILIENCE_CONFIG,
        retry: {
          maxAttempts: 3,
          backoff: 'constant',
          initialDelayMs: 10,
          maxDelayMs: 100
        },
        circuitBreaker: {
          ...DEFAULT_RESILIENCE_CONFIG.circuitBreaker,
          enabled: false
        },
        timeout: {
          durationMs: 5000
        }
      };

      const { policy, getMetrics } = createResiliencePolicy(config);

      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Simulated failure');
        }
        return 'success';
      };

      const result = await policy.execute(operation);

      expect(result).toBe('success');
      expect(attemptCount).toBe(3);
      const metrics = getMetrics();
      expect(metrics.retryAttempts).toBe(2); // 2 retries after initial attempt
    });

    it('should fail after exhausting retry attempts', async () => {
      const config: ResiliencePolicyConfig = {
        ...DEFAULT_RESILIENCE_CONFIG,
        retry: {
          maxAttempts: 2,
          backoff: 'constant',
          initialDelayMs: 10,
          maxDelayMs: 100
        },
        circuitBreaker: {
          ...DEFAULT_RESILIENCE_CONFIG.circuitBreaker,
          enabled: false
        },
        timeout: {
          durationMs: 5000
        }
      };

      const { policy, getMetrics } = createResiliencePolicy(config);

      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        throw new Error('Persistent failure');
      };

      await expect(policy.execute(operation)).rejects.toThrow('Persistent failure');
      expect(attemptCount).toBe(2);
      const metrics = getMetrics();
      expect(metrics.retryAttempts).toBe(1); // 1 retry after initial attempt
    });

    it('should use exponential backoff strategy', async () => {
      const config: ResiliencePolicyConfig = {
        ...DEFAULT_RESILIENCE_CONFIG,
        retry: {
          maxAttempts: 3,
          backoff: 'exponential',
          initialDelayMs: 100,
          maxDelayMs: 5000
        },
        circuitBreaker: {
          ...DEFAULT_RESILIENCE_CONFIG.circuitBreaker,
          enabled: false
        },
        timeout: {
          durationMs: 10000
        }
      };

      const { policy } = createResiliencePolicy(config);

      const timestamps: number[] = [];
      let attemptCount = 0;
      const operation = async () => {
        timestamps.push(Date.now());
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Simulated failure');
        }
        return 'success';
      };

      const result = await policy.execute(operation);
      expect(result).toBe('success');

      // Verify backoff delays are increasing (approximately)
      const delay1 = timestamps[1] - timestamps[0];
      const delay2 = timestamps[2] - timestamps[1];
      expect(delay1).toBeGreaterThanOrEqual(90); // ~100ms initial delay
      expect(delay2).toBeGreaterThan(delay1); // Exponential increase
    });
  });

  describe('Timeout Policy', () => {
    it('should timeout long-running operations', async () => {
      const config: ResiliencePolicyConfig = {
        ...DEFAULT_RESILIENCE_CONFIG,
        retry: {
          maxAttempts: 1,
          backoff: 'constant',
          initialDelayMs: 100,
          maxDelayMs: 1000
        },
        timeout: {
          durationMs: 100 // Very short timeout
        },
        circuitBreaker: {
          ...DEFAULT_RESILIENCE_CONFIG.circuitBreaker,
          enabled: false
        }
      };

      const { policy } = createResiliencePolicy(config);

      const operation = async () => {
        await new Promise(resolve => setTimeout(resolve, 500)); // Exceeds timeout
        return 'should-not-reach';
      };

      await expect(policy.execute(operation)).rejects.toThrow();
    });

    it('should not timeout fast operations', async () => {
      const config: ResiliencePolicyConfig = {
        ...DEFAULT_RESILIENCE_CONFIG,
        retry: {
          maxAttempts: 1,
          backoff: 'constant',
          initialDelayMs: 100,
          maxDelayMs: 1000
        },
        timeout: {
          durationMs: 1000
        },
        circuitBreaker: {
          ...DEFAULT_RESILIENCE_CONFIG.circuitBreaker,
          enabled: false
        }
      };

      const { policy } = createResiliencePolicy(config);

      const operation = async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return 'success';
      };

      const result = await policy.execute(operation);
      expect(result).toBe('success');
    });
  });

  describe('Circuit Breaker Policy', () => {
    it('should open circuit after consecutive failures', async () => {
      const config: ResiliencePolicyConfig = {
        ...DEFAULT_RESILIENCE_CONFIG,
        retry: {
          maxAttempts: 1, // No retries to test circuit breaker
          backoff: 'constant',
          initialDelayMs: 10,
          maxDelayMs: 100
        },
        timeout: {
          durationMs: 5000
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 3,
          halfOpenAfterMs: 1000,
          successThreshold: 2
        }
      };

      const { policy, getMetrics } = createResiliencePolicy(config);

      const failingOperation = async () => {
        throw new Error('Simulated failure');
      };

      // Execute failing operations to open circuit
      for (let i = 0; i < 3; i++) {
        await expect(policy.execute(failingOperation)).rejects.toThrow();
      }

      const metrics = getMetrics();
      expect(metrics.circuitBreakerState).toBe('open');

      // Next call should fail immediately due to open circuit
      await expect(policy.execute(failingOperation)).rejects.toThrow();
    });

    it('should track circuit breaker state in metrics', async () => {
      const config: ResiliencePolicyConfig = {
        ...DEFAULT_RESILIENCE_CONFIG,
        retry: {
          maxAttempts: 1,
          backoff: 'constant',
          initialDelayMs: 10,
          maxDelayMs: 100
        },
        timeout: {
          durationMs: 5000
        },
        circuitBreaker: {
          enabled: true,
          failureThreshold: 2,
          halfOpenAfterMs: 100,
          successThreshold: 1
        }
      };

      const { policy, getMetrics } = createResiliencePolicy(config);

      const successOperation = async () => 'success';

      // Initial state should be closed
      await policy.execute(successOperation);
      let metrics = getMetrics();
      expect(metrics.circuitBreakerState).toBe('closed');
    });
  });

  describe('Bulkhead Policy', () => {
    it('should limit concurrent executions when enabled', async () => {
      const config: ResiliencePolicyConfig = {
        ...DEFAULT_RESILIENCE_CONFIG,
        retry: {
          maxAttempts: 1,
          backoff: 'constant',
          initialDelayMs: 10,
          maxDelayMs: 100
        },
        timeout: {
          durationMs: 5000
        },
        circuitBreaker: {
          ...DEFAULT_RESILIENCE_CONFIG.circuitBreaker,
          enabled: false
        },
        bulkhead: {
          enabled: true,
          maxConcurrent: 2,
          maxQueued: 1
        }
      };

      const { policy } = createResiliencePolicy(config);

      let concurrentCount = 0;
      let maxConcurrent = 0;

      const operation = async () => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        await new Promise(resolve => setTimeout(resolve, 100));
        concurrentCount--;
        return 'success';
      };

      // Execute multiple operations concurrently
      const promises = Array.from({ length: 5 }, () => policy.execute(operation));

      await Promise.allSettled(promises);

      // Should not exceed bulkhead limit
      expect(maxConcurrent).toBeLessThanOrEqual(2);
    });

    it('should not limit concurrency when disabled', async () => {
      const config: ResiliencePolicyConfig = {
        ...DEFAULT_RESILIENCE_CONFIG,
        retry: {
          maxAttempts: 1,
          backoff: 'constant',
          initialDelayMs: 10,
          maxDelayMs: 100
        },
        timeout: {
          durationMs: 5000
        },
        circuitBreaker: {
          ...DEFAULT_RESILIENCE_CONFIG.circuitBreaker,
          enabled: false
        },
        bulkhead: {
          enabled: false,
          maxConcurrent: 1,
          maxQueued: 0
        }
      };

      const { policy } = createResiliencePolicy(config);

      let concurrentCount = 0;
      let maxConcurrent = 0;

      const operation = async () => {
        concurrentCount++;
        maxConcurrent = Math.max(maxConcurrent, concurrentCount);
        await new Promise(resolve => setTimeout(resolve, 50));
        concurrentCount--;
        return 'success';
      };

      // Execute multiple operations concurrently
      const promises = Array.from({ length: 5 }, () => policy.execute(operation));
      await Promise.all(promises);

      // All operations should execute concurrently when bulkhead is disabled
      expect(maxConcurrent).toBeGreaterThan(1);
    });
  });

  describe('Default Configuration', () => {
    it('should use default configuration when not specified', () => {
      const builder = new ResiliencePolicyBuilder();
      const policy = builder.build(DEFAULT_RESILIENCE_CONFIG);

      expect(policy).toBeDefined();
    });

    it('should apply default resilience config values', () => {
      expect(DEFAULT_RESILIENCE_CONFIG.retry.maxAttempts).toBe(3);
      expect(DEFAULT_RESILIENCE_CONFIG.retry.backoff).toBe('exponential');
      expect(DEFAULT_RESILIENCE_CONFIG.timeout.durationMs).toBe(30000);
      expect(DEFAULT_RESILIENCE_CONFIG.circuitBreaker.enabled).toBe(true);
      expect(DEFAULT_RESILIENCE_CONFIG.bulkhead.enabled).toBe(false);
    });
  });

  describe('Metrics Collection', () => {
    it('should track retry attempts in metrics', async () => {
      const config: ResiliencePolicyConfig = {
        ...DEFAULT_RESILIENCE_CONFIG,
        retry: {
          maxAttempts: 3,
          backoff: 'constant',
          initialDelayMs: 10,
          maxDelayMs: 100
        },
        circuitBreaker: {
          ...DEFAULT_RESILIENCE_CONFIG.circuitBreaker,
          enabled: false
        },
        timeout: {
          durationMs: 5000
        }
      };

      const { policy, getMetrics } = createResiliencePolicy(config);

      let attemptCount = 0;
      const operation = async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Simulated failure');
        }
        return 'success';
      };

      await policy.execute(operation);

      const metrics = getMetrics();
      expect(metrics.retryAttempts).toBe(1); // 1 retry
    });

    it('should reset metrics between policy executions', async () => {
      const builder = new ResiliencePolicyBuilder();
      const config: ResiliencePolicyConfig = {
        ...DEFAULT_RESILIENCE_CONFIG,
        retry: {
          maxAttempts: 2,
          backoff: 'constant',
          initialDelayMs: 10,
          maxDelayMs: 100
        },
        circuitBreaker: {
          ...DEFAULT_RESILIENCE_CONFIG.circuitBreaker,
          enabled: false
        }
      };

      const policy = builder.build(config);

      let attemptCount = 0;
      const operation1 = async () => {
        attemptCount++;
        if (attemptCount < 2) {
          throw new Error('Failure');
        }
        return 'success';
      };

      await policy.execute(operation1);
      let metrics = builder.getMetrics();
      expect(metrics.retryAttempts).toBeGreaterThan(0);

      // Build new policy - should reset metrics
      builder.build(config);
      metrics = builder.getMetrics();
      expect(metrics.retryAttempts).toBe(0);
    });
  });
});

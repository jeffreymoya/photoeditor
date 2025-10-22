/**
 * Unit tests for BaseProvider with Cockatiel Resilience Policies
 *
 * Tests provider retry, timeout, and circuit breaker behavior through
 * cockatiel policies. Validates alignment with standards/backend-tier.md.
 */

import { BaseProvider } from '../../../src/providers/base.provider';
import { ProviderConfig, ProviderResponse } from '@photoeditor/shared';

class TestProvider extends BaseProvider {
  private mockOperation: (() => Promise<unknown>) | null = null;

  constructor(config: ProviderConfig) {
    super(config);
  }

  setMockOperation(operation: () => Promise<unknown>): void {
    this.mockOperation = operation;
  }

  async testRequest<T>(): Promise<ProviderResponse> {
    if (!this.mockOperation) {
      throw new Error('Mock operation not set');
    }
    return this.makeRequest(this.mockOperation as () => Promise<T>);
  }

  getName(): string {
    return 'TestProvider';
  }

  async isHealthy(): Promise<boolean> {
    return true;
  }
}

describe('BaseProvider with Resilience Policies', () => {
  describe('Configuration and Initialization', () => {
    it('should initialize with default resilience config when not provided', () => {
      const config: ProviderConfig = {
        name: 'TestProvider',
        apiKey: 'test-key',
        baseUrl: 'https://test.example.com',
        timeout: 5000,
        retries: 3,
        enabled: true
      };

      const provider = new TestProvider(config);
      expect(provider).toBeDefined();
    });

    it('should initialize with custom resilience config', () => {
      const config: ProviderConfig = {
        name: 'TestProvider',
        apiKey: 'test-key',
        baseUrl: 'https://test.example.com',
        timeout: 5000,
        retries: 3,
        enabled: true,
        resilience: {
          retry: {
            maxAttempts: 5,
            backoff: 'constant',
            initialDelayMs: 500,
            maxDelayMs: 5000
          },
          timeout: {
            durationMs: 10000
          },
          circuitBreaker: {
            enabled: true,
            failureThreshold: 3,
            halfOpenAfterMs: 20000,
            successThreshold: 1
          },
          bulkhead: {
            enabled: false,
            maxConcurrent: 10,
            maxQueued: 100
          }
        }
      };

      const provider = new TestProvider(config);
      expect(provider).toBeDefined();
    });
  });

  describe('Retry Behavior', () => {
    it('should retry failed operations and eventually succeed', async () => {
      jest.useRealTimers();
      const config: ProviderConfig = {
        name: 'TestProvider',
        apiKey: 'test-key',
        baseUrl: 'https://test.example.com',
        timeout: 5000,
        retries: 3,
        enabled: true,
        resilience: {
          retry: {
            maxAttempts: 3,
            backoff: 'constant',
            initialDelayMs: 10,
            maxDelayMs: 100
          },
          timeout: {
            durationMs: 5000
          },
          circuitBreaker: {
            enabled: false,
            failureThreshold: 5,
            halfOpenAfterMs: 30000,
            successThreshold: 2
          },
          bulkhead: {
            enabled: false,
            maxConcurrent: 10,
            maxQueued: 100
          }
        }
      };

      const provider = new TestProvider(config);

      let attemptCount = 0;
      provider.setMockOperation(async () => {
        attemptCount++;
        if (attemptCount < 3) {
          throw new Error('Simulated transient failure');
        }
        return { result: 'success' };
      });

      const response = await provider.testRequest();

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ result: 'success' });
      expect(attemptCount).toBe(3);
      expect((response.metadata?.resilience as any)?.retryAttempts).toBe(2);
    });

    it('should fail after exhausting retries', async () => {
      jest.useRealTimers();
      const config: ProviderConfig = {
        name: 'TestProvider',
        apiKey: 'test-key',
        baseUrl: 'https://test.example.com',
        timeout: 5000,
        retries: 2,
        enabled: true,
        resilience: {
          retry: {
            maxAttempts: 2,
            backoff: 'constant',
            initialDelayMs: 10,
            maxDelayMs: 100
          },
          timeout: {
            durationMs: 5000
          },
          circuitBreaker: {
            enabled: false,
            failureThreshold: 5,
            halfOpenAfterMs: 30000,
            successThreshold: 2
          },
          bulkhead: {
            enabled: false,
            maxConcurrent: 10,
            maxQueued: 100
          }
        }
      };

      const provider = new TestProvider(config);

      let attemptCount = 0;
      provider.setMockOperation(async () => {
        attemptCount++;
        throw new Error('Persistent failure');
      });

      const response = await provider.testRequest();

      expect(response.success).toBe(false);
      expect(response.error).toContain('Persistent failure');
      expect(attemptCount).toBe(2);
      expect((response.metadata?.resilience as any)?.retryAttempts).toBe(1);
    });
  });

  describe('Timeout Behavior', () => {
    it('should timeout long-running operations', async () => {
      jest.useRealTimers();
      const config: ProviderConfig = {
        name: 'TestProvider',
        apiKey: 'test-key',
        baseUrl: 'https://test.example.com',
        timeout: 100,
        retries: 1,
        enabled: true,
        resilience: {
          retry: {
            maxAttempts: 1,
            backoff: 'constant',
            initialDelayMs: 10,
            maxDelayMs: 100
          },
          timeout: {
            durationMs: 100
          },
          circuitBreaker: {
            enabled: false,
            failureThreshold: 5,
            halfOpenAfterMs: 30000,
            successThreshold: 2
          },
          bulkhead: {
            enabled: false,
            maxConcurrent: 10,
            maxQueued: 100
          }
        }
      };

      const provider = new TestProvider(config);

      provider.setMockOperation(async () => {
        await new Promise(resolve => setTimeout(resolve, 500));
        return { result: 'should-not-reach' };
      });

      const response = await provider.testRequest();

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });

    it('should complete fast operations successfully', async () => {
      jest.useRealTimers();
      const config: ProviderConfig = {
        name: 'TestProvider',
        apiKey: 'test-key',
        baseUrl: 'https://test.example.com',
        timeout: 1000,
        retries: 1,
        enabled: true,
        resilience: {
          retry: {
            maxAttempts: 1,
            backoff: 'constant',
            initialDelayMs: 10,
            maxDelayMs: 100
          },
          timeout: {
            durationMs: 1000
          },
          circuitBreaker: {
            enabled: false,
            failureThreshold: 5,
            halfOpenAfterMs: 30000,
            successThreshold: 2
          },
          bulkhead: {
            enabled: false,
            maxConcurrent: 10,
            maxQueued: 100
          }
        }
      };

      const provider = new TestProvider(config);

      provider.setMockOperation(async () => {
        await new Promise(resolve => setTimeout(resolve, 50));
        return { result: 'success' };
      });

      const response = await provider.testRequest();

      expect(response.success).toBe(true);
      expect(response.data).toEqual({ result: 'success' });
    });
  });

  describe('Provider Enabled/Disabled', () => {
    it('should reject requests when provider is disabled', async () => {
      const config: ProviderConfig = {
        name: 'TestProvider',
        apiKey: 'test-key',
        baseUrl: 'https://test.example.com',
        timeout: 5000,
        retries: 3,
        enabled: false
      };

      const provider = new TestProvider(config);

      provider.setMockOperation(async () => {
        return { result: 'should-not-execute' };
      });

      const response = await provider.testRequest();

      expect(response.success).toBe(false);
      expect(response.error).toContain('disabled');
    });
  });

  describe('Response Metadata', () => {
    it('should include resilience metrics in successful response', async () => {
      const config: ProviderConfig = {
        name: 'TestProvider',
        apiKey: 'test-key',
        baseUrl: 'https://test.example.com',
        timeout: 5000,
        retries: 3,
        enabled: true,
        resilience: {
          retry: {
            maxAttempts: 3,
            backoff: 'constant',
            initialDelayMs: 10,
            maxDelayMs: 100
          },
          timeout: {
            durationMs: 5000
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
        }
      };

      const provider = new TestProvider(config);

      provider.setMockOperation(async () => {
        return { result: 'success' };
      });

      const response = await provider.testRequest();

      expect(response.success).toBe(true);
      expect(response.metadata).toBeDefined();
      expect(response.metadata?.resilience).toBeDefined();
      expect((response.metadata?.resilience as any)?.retryAttempts).toBe(0);
      expect((response.metadata?.resilience as any)?.circuitBreakerState).toBeDefined();
    });

    it('should include resilience metrics in failed response', async () => {
      jest.useRealTimers();
      const config: ProviderConfig = {
        name: 'TestProvider',
        apiKey: 'test-key',
        baseUrl: 'https://test.example.com',
        timeout: 5000,
        retries: 2,
        enabled: true,
        resilience: {
          retry: {
            maxAttempts: 2,
            backoff: 'constant',
            initialDelayMs: 10,
            maxDelayMs: 100
          },
          timeout: {
            durationMs: 5000
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
        }
      };

      const provider = new TestProvider(config);

      provider.setMockOperation(async () => {
        throw new Error('Operation failed');
      });

      const response = await provider.testRequest();

      expect(response.success).toBe(false);
      expect(response.metadata).toBeDefined();
      expect(response.metadata?.resilience).toBeDefined();
      expect((response.metadata?.resilience as any)?.retryAttempts).toBeGreaterThan(0);
      expect((response.metadata?.resilience as any)?.circuitBreakerState).toBeDefined();
    });
  });

  describe('Provider Response Structure', () => {
    it('should return properly structured ProviderResponse', async () => {
      const config: ProviderConfig = {
        name: 'TestProvider',
        apiKey: 'test-key',
        baseUrl: 'https://test.example.com',
        timeout: 5000,
        retries: 3,
        enabled: true
      };

      const provider = new TestProvider(config);

      provider.setMockOperation(async () => {
        return { result: 'success' };
      });

      const response = await provider.testRequest();

      expect(response).toHaveProperty('success');
      expect(response).toHaveProperty('data');
      expect(response).toHaveProperty('duration');
      expect(response).toHaveProperty('provider');
      expect(response).toHaveProperty('timestamp');
      expect(response.provider).toBe('TestProvider');
      expect(typeof response.duration).toBe('number');
      expect(typeof response.timestamp).toBe('string');
    });
  });
});

/**
 * Tests for retry utilities with exponential backoff
 */

import {
  calculateBackoffDelay,
  withRetry,
  createRetryState,
  updateRetryState,
} from '../retry';

describe('retry utilities', () => {
  describe('calculateBackoffDelay', () => {
    it('calculates exponential backoff correctly', () => {
      const delay0 = calculateBackoffDelay(0, {
        initialDelay: 1000,
        backoffMultiplier: 2,
        useJitter: false,
      });
      expect(delay0).toBe(1000);

      const delay1 = calculateBackoffDelay(1, {
        initialDelay: 1000,
        backoffMultiplier: 2,
        useJitter: false,
      });
      expect(delay1).toBe(2000);

      const delay2 = calculateBackoffDelay(2, {
        initialDelay: 1000,
        backoffMultiplier: 2,
        useJitter: false,
      });
      expect(delay2).toBe(4000);
    });

    it('respects max delay cap', () => {
      const delay = calculateBackoffDelay(10, {
        initialDelay: 1000,
        maxDelay: 5000,
        backoffMultiplier: 2,
        useJitter: false,
      });
      expect(delay).toBeLessThanOrEqual(5000);
      expect(delay).toBe(5000);
    });

    it('applies jitter when enabled', () => {
      const delays = [];
      for (let i = 0; i < 10; i++) {
        delays.push(
          calculateBackoffDelay(1, {
            initialDelay: 1000,
            backoffMultiplier: 2,
            useJitter: true,
          })
        );
      }

      // With jitter, we should get varying delays
      const uniqueDelays = new Set(delays);
      expect(uniqueDelays.size).toBeGreaterThan(1);

      // All delays should be between 50% and 100% of base delay (2000)
      delays.forEach(delay => {
        expect(delay).toBeGreaterThanOrEqual(1000);
        expect(delay).toBeLessThanOrEqual(2000);
      });
    });

    it('uses default options when not specified', () => {
      const delay = calculateBackoffDelay(0);
      expect(delay).toBeGreaterThan(0);
      expect(delay).toBeLessThanOrEqual(1000);
    });
  });

  describe('withRetry', () => {
    it('succeeds on first attempt', async () => {
      const fn = jest.fn().mockResolvedValue('success');
      const result = await withRetry(fn);

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('retries on failure and eventually succeeds', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      const result = await withRetry(fn, { maxAttempts: 3 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('throws after max retries exhausted', async () => {
      const fn = jest.fn().mockRejectedValue(new Error('Network error'));

      await expect(withRetry(fn, { maxAttempts: 3 })).rejects.toThrow(
        'Network error'
      );

      expect(fn).toHaveBeenCalledTimes(3);
    });

    it('does not retry non-retryable errors', async () => {
      const error = new Error('Bad request') as Error & { status?: number };
      error.status = 400;

      const fn = jest.fn().mockRejectedValue(error);

      await expect(
        withRetry(fn, {
          maxAttempts: 3,
          isRetryable: (err) => {
            const errorWithStatus = err as Error & { status?: number };
            const status = errorWithStatus.status;
            return status ? status >= 500 : false;
          },
        })
      ).rejects.toThrow('Bad request');

      expect(fn).toHaveBeenCalledTimes(1);
    });

    it('calls onRetry callback', async () => {
      const fn = jest
        .fn()
        .mockRejectedValueOnce(new Error('Network error'))
        .mockResolvedValue('success');

      const onRetry = jest.fn();

      await withRetry(fn, {
        maxAttempts: 3,
        onRetry,
      });

      expect(onRetry).toHaveBeenCalledTimes(1);
      expect(onRetry).toHaveBeenCalledWith(
        1,
        expect.any(Error),
        expect.any(Number)
      );
    });

    it('retries 5xx server errors by default', async () => {
      const error = new Error('Server error') as Error & { status?: number };
      error.status = 503;

      const fn = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const result = await withRetry(fn, { maxAttempts: 2 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });

    it('retries 429 Too Many Requests by default', async () => {
      const error = new Error('Rate limited') as Error & { status?: number };
      error.status = 429;

      const fn = jest
        .fn()
        .mockRejectedValueOnce(error)
        .mockResolvedValue('success');

      const result = await withRetry(fn, { maxAttempts: 2 });

      expect(result).toBe('success');
      expect(fn).toHaveBeenCalledTimes(2);
    });
  });

  describe('createRetryState', () => {
    it('creates initial retry state', () => {
      const state = createRetryState(3);

      expect(state).toEqual({
        attempt: 0,
        maxAttempts: 3,
        isRetrying: false,
      });
    });

    it('uses default maxAttempts', () => {
      const state = createRetryState();

      expect(state.maxAttempts).toBe(3);
    });
  });

  describe('updateRetryState', () => {
    it('updates state after failed attempt', () => {
      const state = createRetryState(3);
      const error = new Error('Network error');

      const updated = updateRetryState(state, error);

      expect(updated.attempt).toBe(1);
      expect(updated.lastError).toBe(error);
      expect(updated.isRetrying).toBe(true);
      expect(updated.nextRetryDelay).toBeGreaterThan(0);
    });

    it('sets isRetrying to false when max attempts reached', () => {
      const state = {
        attempt: 2,
        maxAttempts: 3,
        isRetrying: true,
      };
      const error = new Error('Network error');

      const updated = updateRetryState(state, error);

      expect(updated.attempt).toBe(3);
      expect(updated.isRetrying).toBe(false);
      expect(updated.nextRetryDelay).toBeUndefined();
    });
  });
});

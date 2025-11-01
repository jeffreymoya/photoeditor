/**
 * Retry utilities with exponential backoff
 * Implements retry/backoff requirements
 */

/**
 * Retry configuration options
 */
export type RetryOptions = {
  /**
   * Maximum number of retry attempts. Default: 3
   */
  maxAttempts?: number;
  /**
   * Initial delay in milliseconds. Default: 1000
   */
  initialDelay?: number;
  /**
   * Maximum delay in milliseconds. Default: 30000
   */
  maxDelay?: number;
  /**
   * Backoff multiplier. Default: 2
   */
  backoffMultiplier?: number;
  /**
   * Whether to add jitter to delay. Default: true
   */
  useJitter?: boolean;
  /**
   * Optional function to determine if error is retryable
   */
  isRetryable?: (error: Error) => boolean;
  /**
   * Optional callback called before each retry
   */
  onRetry?: (attempt: number, error: Error, delay: number) => void;
};

/**
 * Default retry options
 */
const DEFAULT_OPTIONS: Required<Omit<RetryOptions, 'isRetryable' | 'onRetry'>> = {
  maxAttempts: 3,
  initialDelay: 1000,
  maxDelay: 30000,
  backoffMultiplier: 2,
  useJitter: true,
};

/**
 * Calculates delay for next retry attempt with exponential backoff
 *
 * @param attempt - Current attempt number (0-based)
 * @param options - Retry options
 * @returns Delay in milliseconds
 */
export function calculateBackoffDelay(
  attempt: number,
  options: RetryOptions = {}
): number {
  const {
    initialDelay = DEFAULT_OPTIONS.initialDelay,
    maxDelay = DEFAULT_OPTIONS.maxDelay,
    backoffMultiplier = DEFAULT_OPTIONS.backoffMultiplier,
    useJitter = DEFAULT_OPTIONS.useJitter,
  } = options;

  // Calculate exponential delay
  const exponentialDelay = initialDelay * Math.pow(backoffMultiplier, attempt);

  // Cap at max delay
  let delay = Math.min(exponentialDelay, maxDelay);

  // Add jitter to prevent thundering herd
  if (useJitter) {
    delay = delay * (0.5 + Math.random() * 0.5);
  }

  return Math.floor(delay);
}

/**
 * Sleeps for specified duration
 *
 * @param ms - Duration in milliseconds
 * @returns Promise that resolves after delay
 */
export function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Default retry predicate - retries on network errors and 5xx responses
 *
 * @param error - Error to check
 * @returns True if error should be retried
 */
function defaultIsRetryable(error: Error): boolean {
  const message = error.message.toLowerCase();

  // Network errors
  if (
    message.includes('network') ||
    message.includes('timeout') ||
    message.includes('connection') ||
    message.includes('fetch')
  ) {
    return true;
  }

  // 5xx server errors (check if error has status code)
  const errorWithStatus = error as Error & { status?: number; statusCode?: number };
  const statusCode = errorWithStatus.status || errorWithStatus.statusCode;
  if (statusCode && statusCode >= 500 && statusCode < 600) {
    return true;
  }

  // 429 Too Many Requests
  if (statusCode === 429) {
    return true;
  }

  return false;
}

/**
 * Executes a function with retry logic and exponential backoff
 *
 * Implements:
 * - Exponential backoff with configurable parameters
 * - Jitter to prevent thundering herd
 * - Configurable retry predicates
 *
 * @param fn - Async function to execute with retry
 * @param options - Retry configuration
 * @returns Result of successful function execution
 * @throws Last error if all retries exhausted
 */
export async function withRetry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const {
    maxAttempts = DEFAULT_OPTIONS.maxAttempts,
    isRetryable = defaultIsRetryable,
    onRetry,
  } = options;

  let lastError: Error | undefined;

  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error instanceof Error ? error : new Error(String(error));

      // If this is the last attempt, throw
      if (attempt === maxAttempts - 1) {
        throw lastError;
      }

      // Check if error is retryable
      if (!isRetryable(lastError)) {
        throw lastError;
      }

      // Calculate delay for next attempt
      const delay = calculateBackoffDelay(attempt, options);

      // Call retry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, lastError, delay);
      }

      // Wait before retrying
      await sleep(delay);
    }
  }

  // Should never reach here, but TypeScript needs this
  throw lastError || new Error('Retry failed with unknown error');
}

/**
 * Retry state for tracking upload progress
 */
export interface RetryState {
  /**
   * Current attempt number (1-based)
   */
  attempt: number;
  /**
   * Maximum attempts allowed
   */
  maxAttempts: number;
  /**
   * Last error encountered
   */
  lastError?: Error;
  /**
   * Next retry delay in milliseconds
   */
  nextRetryDelay?: number;
  /**
   * Whether operation is currently retrying
   */
  isRetrying: boolean;
}

/**
 * Creates an initial retry state
 *
 * @param maxAttempts - Maximum retry attempts
 * @returns Initial retry state
 */
export function createRetryState(maxAttempts: number = 3): RetryState {
  return {
    attempt: 0,
    maxAttempts,
    isRetrying: false,
  };
}

/**
 * Updates retry state after a failed attempt
 *
 * @param state - Current retry state
 * @param error - Error that occurred
 * @param options - Retry options
 * @returns Updated retry state
 */
export function updateRetryState(
  state: RetryState,
  error: Error,
  options: RetryOptions = {}
): RetryState {
  const nextAttempt = state.attempt + 1;
  const willRetry = nextAttempt < state.maxAttempts;

  const baseState: RetryState = {
    ...state,
    attempt: nextAttempt,
    lastError: error,
    isRetrying: willRetry,
  };

  if (willRetry) {
    return {
      ...baseState,
      nextRetryDelay: calculateBackoffDelay(nextAttempt - 1, options),
    };
  }

  return baseState;
}

/**
 * Polling Service for E2E Tests
 *
 * Provides bounded polling logic per testing-standards.md (no sleep-based waits).
 * Complexity: ≤8, LOC: ≤200 per STANDARDS.md line 37
 */

export interface PollingOptions {
  maxAttempts: number;
  intervalMs: number;
  timeoutMs?: number;
}

export class PollingService {
  /**
   * Poll until condition is met or timeout (CC=4)
   */
  async pollUntil<T>(
    pollFn: () => Promise<T>,
    conditionFn: (result: T) => boolean,
    options: PollingOptions
  ): Promise<T> {
    const startTime = Date.now();
    let attempts = 0;

    while (attempts < options.maxAttempts) {
      const result = await pollFn();

      if (conditionFn(result)) {
        return result;
      }

      attempts++;

      if (options.timeoutMs && Date.now() - startTime > options.timeoutMs) {
        throw new Error(`Polling timeout after ${options.timeoutMs}ms`);
      }

      if (attempts < options.maxAttempts) {
        await this.sleep(options.intervalMs);
      }
    }

    throw new Error(`Polling failed after ${attempts} attempts`);
  }

  /**
   * Poll for job status transition (CC=2)
   */
  async pollForJobStatus(
    getStatusFn: () => Promise<{ status: string }>,
    targetStatus: string,
    maxWaitMs: number = 120000
  ): Promise<{ status: string }> {
    return await this.pollUntil(
      getStatusFn,
      (result) => result.status === targetStatus,
      {
        maxAttempts: Math.floor(maxWaitMs / 1000),
        intervalMs: 1000,
        timeoutMs: maxWaitMs
      }
    );
  }

  /**
   * Poll for S3 object existence (CC=2)
   */
  async pollForS3Object(
    checkExistsFn: () => Promise<boolean>,
    maxWaitMs: number = 30000
  ): Promise<boolean> {
    return await this.pollUntil(
      checkExistsFn,
      (exists) => exists === true,
      {
        maxAttempts: Math.floor(maxWaitMs / 1000),
        intervalMs: 1000,
        timeoutMs: maxWaitMs
      }
    );
  }

  /**
   * Helper for bounded delay (CC=1)
   */
  private async sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

import { ProviderConfig, ProviderResponse } from '@photoeditor/shared';

export abstract class BaseProvider {
  protected config: ProviderConfig;

  constructor(config: ProviderConfig) {
    this.config = config;
  }

  protected async makeRequest<T>(
    request: () => Promise<T>,
    operation: string
  ): Promise<ProviderResponse> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    try {
      if (!this.config.enabled) {
        throw new Error(`Provider ${this.config.name} is disabled`);
      }

      const data = await this.withRetry(request, this.config.retries);
      const duration = Date.now() - startTime;

      return {
        success: true,
        data,
        duration,
        provider: this.config.name,
        timestamp
      };
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';

      return {
        success: false,
        data: null,
        error: errorMessage,
        duration,
        provider: this.config.name,
        timestamp
      };
    }
  }

  private async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number,
    currentAttempt: number = 0
  ): Promise<T> {
    try {
      return await this.withTimeout(operation(), this.config.timeout);
    } catch (error) {
      if (currentAttempt >= maxRetries) {
        throw error;
      }

      const delay = Math.pow(2, currentAttempt) * 1000; // Exponential backoff
      await this.sleep(delay);

      return this.withRetry(operation, maxRetries, currentAttempt + 1);
    }
  }

  private async withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) => {
      setTimeout(() => reject(new Error(`Operation timed out after ${timeoutMs}ms`)), timeoutMs);
    });

    return Promise.race([promise, timeoutPromise]);
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  abstract getName(): string;
  abstract isHealthy(): Promise<boolean>;
}
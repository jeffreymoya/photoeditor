import { ProviderConfig, ProviderResponse } from '@photoeditor/shared';

import {
  createResiliencePolicy,
  DEFAULT_RESILIENCE_CONFIG,
  ResiliencePolicyMetrics
} from '../libs/core/providers/resilience-policy';

export abstract class BaseProvider {
  protected config: ProviderConfig;
  private resiliencePolicyExecute: <T>(operation: () => Promise<T>) => Promise<T>;
  private getResilienceMetrics: () => ResiliencePolicyMetrics;

  constructor(config: ProviderConfig) {
    this.config = config;

    // Initialize resilience policy with config or defaults
    const resilienceConfig = config.resilience || DEFAULT_RESILIENCE_CONFIG;
    const { execute, getMetrics } = createResiliencePolicy(resilienceConfig);
    this.resiliencePolicyExecute = execute;
    this.getResilienceMetrics = getMetrics;
  }

  protected async makeRequest<T>(request: () => Promise<T>): Promise<ProviderResponse> {
    const startTime = Date.now();
    const timestamp = new Date().toISOString();

    try {
      if (!this.config.enabled) {
        throw new Error(`Provider ${this.config.name} is disabled`);
      }

      // Execute request through resilience policy pipeline
      const data = await this.resiliencePolicyExecute(request);

      const duration = Date.now() - startTime;
      const metrics = this.getResilienceMetrics();

      return {
        success: true,
        data,
        duration,
        provider: this.config.name,
        timestamp,
        metadata: {
          resilience: {
            retryAttempts: metrics.retryAttempts,
            circuitBreakerState: metrics.circuitBreakerState
          }
        }
      } as ProviderResponse;
    } catch (error) {
      const duration = Date.now() - startTime;
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      const metrics = this.getResilienceMetrics();

      return {
        success: false,
        data: null,
        error: errorMessage,
        duration,
        provider: this.config.name,
        timestamp,
        metadata: {
          resilience: {
            retryAttempts: metrics.retryAttempts,
            circuitBreakerState: metrics.circuitBreakerState,
            timeoutOccurred: metrics.timeoutOccurred
          }
        }
      } as ProviderResponse;
    }
  }

  abstract getName(): string;
  abstract isHealthy(): Promise<boolean>;
}

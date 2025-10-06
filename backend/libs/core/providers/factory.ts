/**
 * Provider Factory
 *
 * Central factory for creating and managing AI provider instances (analysis and editing).
 * Supports dynamic provider selection and stub providers for testing.
 *
 * This factory ensures:
 * - Single source of truth for provider configuration (STANDARDS.md line 90)
 * - Consistent provider initialization across BFF and workers
 * - Testability through stub provider injection
 * - No mutable singleton state (STANDARDS.md line 59)
 *
 * @module core/providers
 */

import { ProviderConfig } from '@photoeditor/shared';

/**
 * Analysis provider interface
 */
export interface AnalysisProvider {
  analyzeImage(request: { imageUrl: string; prompt: string }): Promise<ProviderResponse>;
  isHealthy(): Promise<boolean>;
  getName(): string;
}

/**
 * Editing provider interface
 */
export interface EditingProvider {
  editImage(request: { imageUrl: string; analysis: string; editingInstructions: string }): Promise<ProviderResponse>;
  isHealthy(): Promise<boolean>;
  getName(): string;
}

/**
 * Generic provider response
 */
export interface ProviderResponse {
  success: boolean;
  data?: unknown;
  error?: string;
  metadata?: {
    provider: string;
    timestamp: string;
    latencyMs?: number;
  };
}

/**
 * Configuration for provider factory initialization
 */
export interface ProviderFactoryConfig {
  analysis: {
    provider: 'gemini' | 'stub';
    config: ProviderConfig;
  };
  editing: {
    provider: 'seedream' | 'stub';
    config: ProviderConfig;
  };
}

/**
 * Provider factory for creating analysis and editing providers
 *
 * This is a stateless factory - providers are passed to the constructor,
 * eliminating mutable singleton state (STANDARDS.md line 59)
 */
export class ProviderFactory {
  private analysisProvider: AnalysisProvider;
  private editingProvider: EditingProvider;

  /**
   * Creates a new ProviderFactory instance
   *
   * @param analysisProvider - Configured analysis provider instance
   * @param editingProvider - Configured editing provider instance
   */
  constructor(analysisProvider: AnalysisProvider, editingProvider: EditingProvider) {
    this.analysisProvider = analysisProvider;
    this.editingProvider = editingProvider;
  }

  /**
   * Gets the configured analysis provider
   *
   * @returns Analysis provider instance
   */
  getAnalysisProvider(): AnalysisProvider {
    return this.analysisProvider;
  }

  /**
   * Gets the configured editing provider
   *
   * @returns Editing provider instance
   */
  getEditingProvider(): EditingProvider {
    return this.editingProvider;
  }

  /**
   * Performs health checks on all providers
   *
   * @returns Health status for analysis and editing providers
   */
  async healthCheck(): Promise<{ analysis: boolean; editing: boolean }> {
    const [analysisHealthy, editingHealthy] = await Promise.all([
      this.analysisProvider.isHealthy(),
      this.editingProvider.isHealthy()
    ]);

    return {
      analysis: analysisHealthy,
      editing: editingHealthy
    };
  }
}

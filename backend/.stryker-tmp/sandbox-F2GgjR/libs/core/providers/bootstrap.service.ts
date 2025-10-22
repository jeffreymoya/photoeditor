/**
 * Bootstrap Service
 *
 * Orchestrates provider initialization based on configuration.
 * Creates appropriate provider instances (real or stub) and wires them into the factory.
 *
 * This service ensures:
 * - Consistent provider initialization across BFF and workers
 * - Single source of truth for provider selection (STANDARDS.md line 90)
 * - Support for stub providers in testing environments
 *
 * @module core/providers
 */

import { ProviderConfig } from '@photoeditor/shared';
import { ConfigService } from '../config/config.service';
import { ProviderFactory, ProviderFactoryConfig } from './factory';

/**
 * Creates provider instances based on type and configuration
 */
export interface ProviderCreator {
  createAnalysisProvider(type: 'gemini' | 'stub', config: ProviderConfig): any;
  createEditingProvider(type: 'seedream' | 'stub', config: ProviderConfig): any;
}

/**
 * Bootstrap service for initializing providers
 *
 * Orchestrates the creation of provider instances based on SSM configuration
 * and environment settings. Supports both real and stub providers.
 */
export class BootstrapService {
  private configService: ConfigService;
  private providerCreator: ProviderCreator;

  /**
   * Creates a new BootstrapService instance
   *
   * @param configService - Configuration service for loading provider settings
   * @param providerCreator - Factory for creating provider instances
   */
  constructor(configService: ConfigService, providerCreator: ProviderCreator) {
    this.configService = configService;
    this.providerCreator = providerCreator;
  }

  /**
   * Initializes providers based on configuration
   *
   * @returns Configured ProviderFactory instance
   */
  async initializeProviders(): Promise<ProviderFactory> {
    const useStubs = await this.configService.isStubProvidersEnabled();

    if (useStubs) {
      return this.initializeStubProviders();
    }

    return this.initializeRealProviders();
  }

  /**
   * Initializes stub providers for testing/development
   *
   * @returns ProviderFactory with stub providers
   */
  private initializeStubProviders(): ProviderFactory {
    const config: ProviderFactoryConfig = {
      analysis: {
        provider: 'stub',
        config: {
          name: 'stub-analysis',
          baseUrl: 'https://stub.endpoint',
          apiKey: 'stub',
          timeout: 30000,
          retries: 3,
          enabled: true
        }
      },
      editing: {
        provider: 'stub',
        config: {
          name: 'stub-editing',
          baseUrl: 'https://stub.endpoint',
          apiKey: 'stub',
          timeout: 30000,
          retries: 3,
          enabled: true
        }
      }
    };

    const analysisProvider = this.providerCreator.createAnalysisProvider(
      config.analysis.provider,
      config.analysis.config
    );

    const editingProvider = this.providerCreator.createEditingProvider(
      config.editing.provider,
      config.editing.config
    );

    return new ProviderFactory(analysisProvider, editingProvider);
  }

  /**
   * Initializes real providers from SSM configuration
   *
   * @returns ProviderFactory with real providers
   */
  private async initializeRealProviders(): Promise<ProviderFactory> {
    const [analysisProviderName, editingProviderName] = await Promise.all([
      this.configService.getAnalysisProviderName(),
      this.configService.getEditingProviderName()
    ]);

    // Validate provider names
    const validAnalysisProviders = ['gemini'];
    const validEditingProviders = ['seedream'];

    if (!validAnalysisProviders.includes(analysisProviderName)) {
      throw new Error(
        `Invalid analysis provider: ${analysisProviderName}. Valid options: ${validAnalysisProviders.join(', ')}`
      );
    }

    if (!validEditingProviders.includes(editingProviderName)) {
      throw new Error(
        `Invalid editing provider: ${editingProviderName}. Valid options: ${validEditingProviders.join(', ')}`
      );
    }

    // Fetch provider configurations
    const config: ProviderFactoryConfig = {
      analysis: await this.getAnalysisProviderConfig(analysisProviderName as 'gemini'),
      editing: await this.getEditingProviderConfig(editingProviderName as 'seedream')
    };

    const analysisProvider = this.providerCreator.createAnalysisProvider(
      config.analysis.provider,
      config.analysis.config
    );

    const editingProvider = this.providerCreator.createEditingProvider(
      config.editing.provider,
      config.editing.config
    );

    return new ProviderFactory(analysisProvider, editingProvider);
  }

  /**
   * Retrieves configuration for the analysis provider
   *
   * @param provider - Provider type
   * @returns Provider configuration
   */
  private async getAnalysisProviderConfig(
    provider: 'gemini'
  ): Promise<{ provider: 'gemini'; config: ProviderConfig }> {
    const [apiKey, endpoint] = await Promise.all([
      this.configService.getGeminiApiKey(),
      this.configService.getGeminiEndpoint()
    ]);

    if (!apiKey) {
      throw new Error(`${provider} API key not configured in SSM`);
    }

    return {
      provider,
      config: {
        name: 'Gemini',
        baseUrl: endpoint || 'https://generativelanguage.googleapis.com',
        apiKey,
        timeout: 30000,
        retries: 3,
        enabled: true
      } as ProviderConfig
    };
  }

  /**
   * Retrieves configuration for the editing provider
   *
   * @param provider - Provider type
   * @returns Provider configuration
   */
  private async getEditingProviderConfig(
    provider: 'seedream'
  ): Promise<{ provider: 'seedream'; config: ProviderConfig }> {
    const [apiKey, endpoint] = await Promise.all([
      this.configService.getSeedreamApiKey(),
      this.configService.getSeedreamEndpoint()
    ]);

    if (!apiKey) {
      throw new Error(`${provider} API key not configured in SSM`);
    }

    return {
      provider,
      config: {
        name: 'Seedream',
        baseUrl: endpoint || 'https://api.seedream.com',
        apiKey,
        timeout: 60000,
        retries: 3,
        enabled: true
      } as ProviderConfig
    };
  }
}

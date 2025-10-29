import { ProviderConfig } from '@photoeditor/shared';

import { ProviderFactory, ProviderFactoryConfig } from '../providers/factory';

import { ConfigService } from './config.service';

export class BootstrapService {
  private configService: ConfigService;

  constructor(configService: ConfigService) {
    this.configService = configService;
  }

  async initializeProviders(): Promise<ProviderFactory> {
    const factory = ProviderFactory.getInstance();

    // Check if stub providers should be used
    const useStubs = await this.configService.isStubProvidersEnabled();

    if (useStubs) {
      // Use stub providers for testing
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

      factory.initialize(config);
    } else {
      // Fetch provider names from SSM
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

      // Fetch provider configurations based on selected providers
      const config: ProviderFactoryConfig = {
        analysis: await this.getAnalysisProviderConfig(analysisProviderName as 'gemini'),
        editing: await this.getEditingProviderConfig(editingProviderName as 'seedream')
      };

      factory.initialize(config);
    }

    return factory;
  }

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
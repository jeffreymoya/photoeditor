import { ConfigService } from './config.service';
import { ProviderFactory, ProviderFactoryConfig } from '../providers/factory';
import { ProviderConfig } from '@photoeditor/shared';

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
      // Use real providers with configuration from SSM
      const [geminiApiKey, seedreamApiKey, geminiEndpoint, seedreamEndpoint] = await Promise.all([
        this.configService.getGeminiApiKey(),
        this.configService.getSeedreamApiKey(),
        this.configService.getGeminiEndpoint(),
        this.configService.getSeedreamEndpoint()
      ]);

      if (!geminiApiKey || !seedreamApiKey) {
        throw new Error('Provider API keys not configured in SSM');
      }

      const config: ProviderFactoryConfig = {
        analysis: {
          provider: 'gemini',
          config: {
            name: 'Gemini',
            baseUrl: geminiEndpoint || 'https://generativelanguage.googleapis.com',
            apiKey: geminiApiKey,
            timeout: 30000,
            retries: 3,
            enabled: true
          } as ProviderConfig
        },
        editing: {
          provider: 'seedream',
          config: {
            name: 'Seedream',
            baseUrl: seedreamEndpoint || 'https://api.seedream.com',
            apiKey: seedreamApiKey,
            timeout: 60000,
            retries: 3,
            enabled: true
          } as ProviderConfig
        }
      };

      factory.initialize(config);
    }

    return factory;
  }
}
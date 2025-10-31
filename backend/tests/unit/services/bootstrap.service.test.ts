/**
 * Unit tests for BootstrapService
 * Tests provider initialization logic with ConfigService and ProviderFactory
 */

import { BootstrapService } from '../../../src/services/bootstrap.service';
import { ConfigService } from '../../../src/services/config.service';
import { ProviderFactory } from '../../../src/providers/factory';

// Mock the ProviderFactory singleton
jest.mock('../../../src/providers/factory');

describe('BootstrapService', () => {
  let bootstrapService: BootstrapService;
  let mockConfigService: jest.Mocked<ConfigService>;
  let mockProviderFactory: jest.Mocked<ProviderFactory>;

  beforeEach(() => {
    // Create mock ConfigService
    mockConfigService = {
      isStubProvidersEnabled: jest.fn(),
      getAnalysisProviderName: jest.fn(),
      getEditingProviderName: jest.fn(),
      getGeminiApiKey: jest.fn(),
      getGeminiEndpoint: jest.fn(),
      getSeedreamApiKey: jest.fn(),
      getSeedreamEndpoint: jest.fn(),
      getParameter: jest.fn()
    } as unknown as jest.Mocked<ConfigService>;

    // Create mock ProviderFactory instance
    mockProviderFactory = {
      initialize: jest.fn(),
      getAnalysisProvider: jest.fn(),
      getEditingProvider: jest.fn(),
      healthCheck: jest.fn()
    } as unknown as jest.Mocked<ProviderFactory>;

    // Mock the static getInstance method
    (ProviderFactory.getInstance as jest.Mock).mockReturnValue(mockProviderFactory);

    bootstrapService = new BootstrapService(mockConfigService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('initializeProviders', () => {
    describe('with stub providers enabled', () => {
      beforeEach(() => {
        mockConfigService.isStubProvidersEnabled.mockResolvedValue(true);
      });

      it('should initialize with stub providers when enabled', async () => {
        const factory = await bootstrapService.initializeProviders();

        expect(factory).toBe(mockProviderFactory);
        expect(mockConfigService.isStubProvidersEnabled).toHaveBeenCalledTimes(1);
        expect(mockProviderFactory.initialize).toHaveBeenCalledWith({
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
        });
      });

      it('should not fetch real provider configurations when stubs enabled', async () => {
        await bootstrapService.initializeProviders();

        expect(mockConfigService.getAnalysisProviderName).not.toHaveBeenCalled();
        expect(mockConfigService.getEditingProviderName).not.toHaveBeenCalled();
        expect(mockConfigService.getGeminiApiKey).not.toHaveBeenCalled();
        expect(mockConfigService.getSeedreamApiKey).not.toHaveBeenCalled();
      });
    });

    describe('with real providers', () => {
      beforeEach(() => {
        mockConfigService.isStubProvidersEnabled.mockResolvedValue(false);
      });

      it('should initialize with Gemini and Seedream providers', async () => {
        mockConfigService.getAnalysisProviderName.mockResolvedValue('gemini');
        mockConfigService.getEditingProviderName.mockResolvedValue('seedream');
        mockConfigService.getGeminiApiKey.mockResolvedValue('gemini-api-key');
        mockConfigService.getGeminiEndpoint.mockResolvedValue(null);
        mockConfigService.getSeedreamApiKey.mockResolvedValue('seedream-api-key');
        mockConfigService.getSeedreamEndpoint.mockResolvedValue(null);

        const factory = await bootstrapService.initializeProviders();

        expect(factory).toBe(mockProviderFactory);
        expect(mockProviderFactory.initialize).toHaveBeenCalledWith({
          analysis: {
            provider: 'gemini',
            config: {
              name: 'Gemini',
              baseUrl: 'https://generativelanguage.googleapis.com',
              apiKey: 'gemini-api-key',
              timeout: 30000,
              retries: 3,
              enabled: true
            }
          },
          editing: {
            provider: 'seedream',
            config: {
              name: 'Seedream',
              baseUrl: 'https://api.seedream.com',
              apiKey: 'seedream-api-key',
              timeout: 60000,
              retries: 3,
              enabled: true
            }
          }
        });
      });

      it('should use custom endpoints when configured', async () => {
        mockConfigService.getAnalysisProviderName.mockResolvedValue('gemini');
        mockConfigService.getEditingProviderName.mockResolvedValue('seedream');
        mockConfigService.getGeminiApiKey.mockResolvedValue('gemini-key');
        mockConfigService.getGeminiEndpoint.mockResolvedValue('https://custom-gemini.example.com');
        mockConfigService.getSeedreamApiKey.mockResolvedValue('seedream-key');
        mockConfigService.getSeedreamEndpoint.mockResolvedValue('https://custom-seedream.example.com');

        await bootstrapService.initializeProviders();

        expect(mockProviderFactory.initialize).toHaveBeenCalledWith({
          analysis: expect.objectContaining({
            config: expect.objectContaining({
              baseUrl: 'https://custom-gemini.example.com'
            })
          }),
          editing: expect.objectContaining({
            config: expect.objectContaining({
              baseUrl: 'https://custom-seedream.example.com'
            })
          })
        });
      });

      it('should throw error when analysis provider name is invalid', async () => {
        mockConfigService.getAnalysisProviderName.mockResolvedValue('invalid-provider');
        mockConfigService.getEditingProviderName.mockResolvedValue('seedream');

        await expect(bootstrapService.initializeProviders()).rejects.toThrow(
          'Invalid analysis provider: invalid-provider. Valid options: gemini'
        );

        expect(mockProviderFactory.initialize).not.toHaveBeenCalled();
      });

      it('should throw error when editing provider name is invalid', async () => {
        mockConfigService.getAnalysisProviderName.mockResolvedValue('gemini');
        mockConfigService.getEditingProviderName.mockResolvedValue('invalid-provider');

        await expect(bootstrapService.initializeProviders()).rejects.toThrow(
          'Invalid editing provider: invalid-provider. Valid options: seedream'
        );

        expect(mockProviderFactory.initialize).not.toHaveBeenCalled();
      });

      it('should throw error when Gemini API key is not configured', async () => {
        mockConfigService.getAnalysisProviderName.mockResolvedValue('gemini');
        mockConfigService.getEditingProviderName.mockResolvedValue('seedream');
        mockConfigService.getGeminiApiKey.mockResolvedValue(null);
        mockConfigService.getGeminiEndpoint.mockResolvedValue(null);

        await expect(bootstrapService.initializeProviders()).rejects.toThrow(
          'gemini API key not configured in SSM'
        );
      });

      it('should throw error when Seedream API key is not configured', async () => {
        mockConfigService.getAnalysisProviderName.mockResolvedValue('gemini');
        mockConfigService.getEditingProviderName.mockResolvedValue('seedream');
        mockConfigService.getGeminiApiKey.mockResolvedValue('gemini-key');
        mockConfigService.getGeminiEndpoint.mockResolvedValue(null);
        mockConfigService.getSeedreamApiKey.mockResolvedValue(null);
        mockConfigService.getSeedreamEndpoint.mockResolvedValue(null);

        await expect(bootstrapService.initializeProviders()).rejects.toThrow(
          'seedream API key not configured in SSM'
        );
      });

      it('should fetch provider configurations in parallel', async () => {
        mockConfigService.getAnalysisProviderName.mockResolvedValue('gemini');
        mockConfigService.getEditingProviderName.mockResolvedValue('seedream');
        mockConfigService.getGeminiApiKey.mockResolvedValue('gemini-key');
        mockConfigService.getGeminiEndpoint.mockResolvedValue(null);
        mockConfigService.getSeedreamApiKey.mockResolvedValue('seedream-key');
        mockConfigService.getSeedreamEndpoint.mockResolvedValue(null);

        await bootstrapService.initializeProviders();

        // Verify that provider names were fetched together
        expect(mockConfigService.getAnalysisProviderName).toHaveBeenCalledTimes(1);
        expect(mockConfigService.getEditingProviderName).toHaveBeenCalledTimes(1);
      });

      it('should use correct timeout for Gemini provider', async () => {
        mockConfigService.getAnalysisProviderName.mockResolvedValue('gemini');
        mockConfigService.getEditingProviderName.mockResolvedValue('seedream');
        mockConfigService.getGeminiApiKey.mockResolvedValue('key');
        mockConfigService.getGeminiEndpoint.mockResolvedValue(null);
        mockConfigService.getSeedreamApiKey.mockResolvedValue('key');
        mockConfigService.getSeedreamEndpoint.mockResolvedValue(null);

        await bootstrapService.initializeProviders();

        const initCall = mockProviderFactory.initialize.mock.calls[0][0];
        expect(initCall.analysis.config.timeout).toBe(30000);
      });

      it('should use correct timeout for Seedream provider', async () => {
        mockConfigService.getAnalysisProviderName.mockResolvedValue('gemini');
        mockConfigService.getEditingProviderName.mockResolvedValue('seedream');
        mockConfigService.getGeminiApiKey.mockResolvedValue('key');
        mockConfigService.getGeminiEndpoint.mockResolvedValue(null);
        mockConfigService.getSeedreamApiKey.mockResolvedValue('key');
        mockConfigService.getSeedreamEndpoint.mockResolvedValue(null);

        await bootstrapService.initializeProviders();

        const initCall = mockProviderFactory.initialize.mock.calls[0][0];
        expect(initCall.editing.config.timeout).toBe(60000);
      });

      it('should set retries to 3 for both providers', async () => {
        mockConfigService.getAnalysisProviderName.mockResolvedValue('gemini');
        mockConfigService.getEditingProviderName.mockResolvedValue('seedream');
        mockConfigService.getGeminiApiKey.mockResolvedValue('key');
        mockConfigService.getGeminiEndpoint.mockResolvedValue(null);
        mockConfigService.getSeedreamApiKey.mockResolvedValue('key');
        mockConfigService.getSeedreamEndpoint.mockResolvedValue(null);

        await bootstrapService.initializeProviders();

        const initCall = mockProviderFactory.initialize.mock.calls[0][0];
        expect(initCall.analysis.config.retries).toBe(3);
        expect(initCall.editing.config.retries).toBe(3);
      });

      it('should enable both providers by default', async () => {
        mockConfigService.getAnalysisProviderName.mockResolvedValue('gemini');
        mockConfigService.getEditingProviderName.mockResolvedValue('seedream');
        mockConfigService.getGeminiApiKey.mockResolvedValue('key');
        mockConfigService.getGeminiEndpoint.mockResolvedValue(null);
        mockConfigService.getSeedreamApiKey.mockResolvedValue('key');
        mockConfigService.getSeedreamEndpoint.mockResolvedValue(null);

        await bootstrapService.initializeProviders();

        const initCall = mockProviderFactory.initialize.mock.calls[0][0];
        expect(initCall.analysis.config.enabled).toBe(true);
        expect(initCall.editing.config.enabled).toBe(true);
      });
    });
  });
});

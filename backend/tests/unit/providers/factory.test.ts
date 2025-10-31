/**
 * Unit tests for ProviderFactory
 * Tests singleton pattern and provider initialization
 */

import { ProviderFactory, ProviderFactoryConfig } from '../../../src/providers/factory';
import { GeminiProvider } from '../../../src/providers/gemini.provider';
import { SeedreamProvider } from '../../../src/providers/seedream.provider';
import { StubAnalysisProvider, StubEditingProvider } from '../../../src/providers/stub.providers';
import { ProviderConfig } from '@photoeditor/shared';

// Mock the provider implementations
jest.mock('../../../src/providers/gemini.provider');
jest.mock('../../../src/providers/seedream.provider');
jest.mock('../../../src/providers/stub.providers');

describe('ProviderFactory', () => {
  let factory: ProviderFactory;

  const mockGeminiConfig: ProviderConfig = {
    name: 'Gemini',
    baseUrl: 'https://generativelanguage.googleapis.com',
    apiKey: 'test-gemini-key',
    timeout: 30000,
    retries: 3,
    enabled: true
  };

  const mockSeedreamConfig: ProviderConfig = {
    name: 'Seedream',
    baseUrl: 'https://api.seedream.com',
    apiKey: 'test-seedream-key',
    timeout: 60000,
    retries: 3,
    enabled: true
  };

  const mockStubConfig: ProviderConfig = {
    name: 'Stub',
    baseUrl: 'https://stub.endpoint',
    apiKey: 'stub-key',
    timeout: 1000,
    retries: 1,
    enabled: true
  };

  beforeEach(() => {
    // Reset the singleton instance by accessing the private instance
    // This is a workaround for testing singleton patterns
    (ProviderFactory as unknown as { instance: ProviderFactory | null }).instance = null;

    jest.clearAllMocks();
    factory = ProviderFactory.getInstance();
  });

  describe('getInstance', () => {
    it('should return a singleton instance', () => {
      const instance1 = ProviderFactory.getInstance();
      const instance2 = ProviderFactory.getInstance();

      expect(instance1).toBe(instance2);
    });

    it('should create only one instance', () => {
      const instance1 = ProviderFactory.getInstance();
      const instance2 = ProviderFactory.getInstance();
      const instance3 = ProviderFactory.getInstance();

      expect(instance1).toBe(instance2);
      expect(instance2).toBe(instance3);
    });
  });

  describe('initialize', () => {
    it('should initialize with Gemini and Seedream providers', () => {
      const config: ProviderFactoryConfig = {
        analysis: {
          provider: 'gemini',
          config: mockGeminiConfig
        },
        editing: {
          provider: 'seedream',
          config: mockSeedreamConfig
        }
      };

      factory.initialize(config);

      expect(GeminiProvider).toHaveBeenCalledWith(mockGeminiConfig);
      expect(SeedreamProvider).toHaveBeenCalledWith(mockSeedreamConfig);
    });

    it('should initialize with stub providers', () => {
      const config: ProviderFactoryConfig = {
        analysis: {
          provider: 'stub',
          config: mockStubConfig
        },
        editing: {
          provider: 'stub',
          config: mockStubConfig
        }
      };

      factory.initialize(config);

      expect(StubAnalysisProvider).toHaveBeenCalledWith(mockStubConfig);
      expect(StubEditingProvider).toHaveBeenCalledWith(mockStubConfig);
    });

    it('should allow re-initialization with different providers', () => {
      const config1: ProviderFactoryConfig = {
        analysis: { provider: 'gemini', config: mockGeminiConfig },
        editing: { provider: 'seedream', config: mockSeedreamConfig }
      };

      const config2: ProviderFactoryConfig = {
        analysis: { provider: 'stub', config: mockStubConfig },
        editing: { provider: 'stub', config: mockStubConfig }
      };

      factory.initialize(config1);
      factory.initialize(config2);

      expect(StubAnalysisProvider).toHaveBeenCalledWith(mockStubConfig);
      expect(StubEditingProvider).toHaveBeenCalledWith(mockStubConfig);
    });
  });

  describe('getAnalysisProvider', () => {
    it('should return analysis provider after initialization', () => {
      const mockProvider = {} as any;
      (GeminiProvider as jest.Mock).mockImplementation(() => mockProvider);

      const config: ProviderFactoryConfig = {
        analysis: { provider: 'gemini', config: mockGeminiConfig },
        editing: { provider: 'seedream', config: mockSeedreamConfig }
      };

      factory.initialize(config);
      const provider = factory.getAnalysisProvider();

      expect(provider).toBe(mockProvider);
    });

    it('should throw error when not initialized', () => {
      expect(() => factory.getAnalysisProvider()).toThrow(
        'Analysis provider not initialized. Call initialize() first.'
      );
    });

    it('should return stub analysis provider when configured', () => {
      const mockProvider = {} as any;
      (StubAnalysisProvider as jest.Mock).mockImplementation(() => mockProvider);

      const config: ProviderFactoryConfig = {
        analysis: { provider: 'stub', config: mockStubConfig },
        editing: { provider: 'stub', config: mockStubConfig }
      };

      factory.initialize(config);
      const provider = factory.getAnalysisProvider();

      expect(provider).toBe(mockProvider);
    });
  });

  describe('getEditingProvider', () => {
    it('should return editing provider after initialization', () => {
      const mockProvider = {} as any;
      (SeedreamProvider as jest.Mock).mockImplementation(() => mockProvider);

      const config: ProviderFactoryConfig = {
        analysis: { provider: 'gemini', config: mockGeminiConfig },
        editing: { provider: 'seedream', config: mockSeedreamConfig }
      };

      factory.initialize(config);
      const provider = factory.getEditingProvider();

      expect(provider).toBe(mockProvider);
    });

    it('should throw error when not initialized', () => {
      expect(() => factory.getEditingProvider()).toThrow(
        'Editing provider not initialized. Call initialize() first.'
      );
    });

    it('should return stub editing provider when configured', () => {
      const mockProvider = {} as any;
      (StubEditingProvider as jest.Mock).mockImplementation(() => mockProvider);

      const config: ProviderFactoryConfig = {
        analysis: { provider: 'stub', config: mockStubConfig },
        editing: { provider: 'stub', config: mockStubConfig }
      };

      factory.initialize(config);
      const provider = factory.getEditingProvider();

      expect(provider).toBe(mockProvider);
    });
  });

  describe('healthCheck', () => {
    it('should return health status for both providers when initialized', async () => {
      const mockAnalysisProvider = {
        isHealthy: jest.fn().mockResolvedValue(true)
      } as any;
      const mockEditingProvider = {
        isHealthy: jest.fn().mockResolvedValue(true)
      } as any;

      (GeminiProvider as jest.Mock).mockImplementation(() => mockAnalysisProvider);
      (SeedreamProvider as jest.Mock).mockImplementation(() => mockEditingProvider);

      const config: ProviderFactoryConfig = {
        analysis: { provider: 'gemini', config: mockGeminiConfig },
        editing: { provider: 'seedream', config: mockSeedreamConfig }
      };

      factory.initialize(config);
      const health = await factory.healthCheck();

      expect(health).toEqual({
        analysis: true,
        editing: true
      });
      expect(mockAnalysisProvider.isHealthy).toHaveBeenCalledTimes(1);
      expect(mockEditingProvider.isHealthy).toHaveBeenCalledTimes(1);
    });

    it('should return false for providers when health check fails', async () => {
      const mockAnalysisProvider = {
        isHealthy: jest.fn().mockResolvedValue(false)
      } as any;
      const mockEditingProvider = {
        isHealthy: jest.fn().mockResolvedValue(false)
      } as any;

      (GeminiProvider as jest.Mock).mockImplementation(() => mockAnalysisProvider);
      (SeedreamProvider as jest.Mock).mockImplementation(() => mockEditingProvider);

      const config: ProviderFactoryConfig = {
        analysis: { provider: 'gemini', config: mockGeminiConfig },
        editing: { provider: 'seedream', config: mockSeedreamConfig }
      };

      factory.initialize(config);
      const health = await factory.healthCheck();

      expect(health).toEqual({
        analysis: false,
        editing: false
      });
    });

    it('should return false when providers not initialized', async () => {
      const health = await factory.healthCheck();

      expect(health).toEqual({
        analysis: false,
        editing: false
      });
    });

    it('should handle mixed health status', async () => {
      const mockAnalysisProvider = {
        isHealthy: jest.fn().mockResolvedValue(true)
      } as any;
      const mockEditingProvider = {
        isHealthy: jest.fn().mockResolvedValue(false)
      } as any;

      (GeminiProvider as jest.Mock).mockImplementation(() => mockAnalysisProvider);
      (SeedreamProvider as jest.Mock).mockImplementation(() => mockEditingProvider);

      const config: ProviderFactoryConfig = {
        analysis: { provider: 'gemini', config: mockGeminiConfig },
        editing: { provider: 'seedream', config: mockSeedreamConfig }
      };

      factory.initialize(config);
      const health = await factory.healthCheck();

      expect(health).toEqual({
        analysis: true,
        editing: false
      });
    });

    it('should perform health checks in parallel', async () => {
      const mockAnalysisProvider = {
        isHealthy: jest.fn().mockResolvedValue(true)
      } as any;
      const mockEditingProvider = {
        isHealthy: jest.fn().mockResolvedValue(true)
      } as any;

      (GeminiProvider as jest.Mock).mockImplementation(() => mockAnalysisProvider);
      (SeedreamProvider as jest.Mock).mockImplementation(() => mockEditingProvider);

      const config: ProviderFactoryConfig = {
        analysis: { provider: 'gemini', config: mockGeminiConfig },
        editing: { provider: 'seedream', config: mockSeedreamConfig }
      };

      factory.initialize(config);

      await factory.healthCheck();

      // Verify both providers were checked
      expect(mockAnalysisProvider.isHealthy).toHaveBeenCalledTimes(1);
      expect(mockEditingProvider.isHealthy).toHaveBeenCalledTimes(1);
    });
  });

  describe('error handling', () => {
    it('should throw error for unknown analysis provider type', () => {
      const config: any = {
        analysis: {
          provider: 'unknown',
          config: mockGeminiConfig
        },
        editing: {
          provider: 'seedream',
          config: mockSeedreamConfig
        }
      };

      expect(() => factory.initialize(config)).toThrow('Unknown analysis provider type: unknown');
    });

    it('should throw error for unknown editing provider type', () => {
      const config: any = {
        analysis: {
          provider: 'gemini',
          config: mockGeminiConfig
        },
        editing: {
          provider: 'unknown',
          config: mockSeedreamConfig
        }
      };

      expect(() => factory.initialize(config)).toThrow('Unknown editing provider type: unknown');
    });
  });
});

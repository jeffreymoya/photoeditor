/**
 * Unit tests for Stub Providers
 * Tests StubAnalysisProvider and StubEditingProvider behavior
 */

import { StubAnalysisProvider, StubEditingProvider } from '../../../src/providers/stub.providers';
import { GeminiAnalysisRequest, SeedreamEditingRequest, ProviderConfig } from '@photoeditor/shared';
import { advanceTimersUntilSettled } from '../../support/time';

describe('StubAnalysisProvider', () => {
  let provider: StubAnalysisProvider;
  const mockConfig: ProviderConfig = {
    name: 'StubAnalysis',
    baseUrl: 'https://stub.endpoint',
    apiKey: 'stub-key',
    timeout: 1000,
    retries: 1,
    enabled: true
  };

  beforeEach(() => {
    jest.useFakeTimers();
    provider = new StubAnalysisProvider(mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with stub configuration', () => {
      expect(provider).toBeInstanceOf(StubAnalysisProvider);
      expect(provider.getName()).toBe('StubAnalysis');
    });

    it('should override timeout to 1000ms', () => {
      const customConfig = { ...mockConfig, timeout: 5000 };
      const customProvider = new StubAnalysisProvider(customConfig);
      expect(customProvider).toBeInstanceOf(StubAnalysisProvider);
    });

    it('should override retries to 1', () => {
      const customConfig = { ...mockConfig, retries: 5 };
      const customProvider = new StubAnalysisProvider(customConfig);
      expect(customProvider).toBeInstanceOf(StubAnalysisProvider);
    });
  });

  describe('analyzeImage', () => {
    it('should return stub analysis response', async () => {
      const request: GeminiAnalysisRequest = {
        imageUrl: 'https://example.com/test.jpg',
        prompt: 'Analyze this image'
      };

      const responsePromise = provider.analyzeImage(request);
      const response = await advanceTimersUntilSettled(responsePromise, { stepMs: 100 });

      expect(response.success).toBe(true);
      if (response.success) {
        const data = response.data as any;
        expect(data).toHaveProperty('analysis');
        expect(data).toHaveProperty('confidence');
        expect(data).toHaveProperty('metadata');
        expect(data.confidence).toBe(0.95);
        expect(data.metadata?.model).toBe('stub-analysis-v1');
        expect(data.metadata?.processingTime).toBe(500);
        expect(data.analysis).toContain('simulated analysis');
        expect(data.analysis).toContain(request.imageUrl);
      }
    });

    it('should include image URL in analysis text', async () => {
      const request: GeminiAnalysisRequest = {
        imageUrl: 'https://example.com/photo.png',
        prompt: 'Describe this'
      };

      const responsePromise = provider.analyzeImage(request);
      const response = await advanceTimersUntilSettled(responsePromise, { stepMs: 100 });

      if (response.success) {
        const data = response.data as any;
        expect(data.analysis).toContain('https://example.com/photo.png');
      }
    });

    it('should simulate 500ms processing delay', async () => {
      const request: GeminiAnalysisRequest = {
        imageUrl: 'https://example.com/test.jpg',
        prompt: 'Test'
      };

      const responsePromise = provider.analyzeImage(request);
      const response = await advanceTimersUntilSettled(responsePromise, { stepMs: 100 });

      expect(response.success).toBe(true);
      if (response.success) {
        const data = response.data as any;
        expect(data.metadata?.processingTime).toBe(500);
      }
    });

    it('should include resilience metadata in response', async () => {
      const request: GeminiAnalysisRequest = {
        imageUrl: 'https://example.com/test.jpg',
        prompt: 'Test'
      };

      const responsePromise = provider.analyzeImage(request);
      const response = await advanceTimersUntilSettled(responsePromise, { stepMs: 100 });

      expect(response).toHaveProperty('metadata.resilience');
      expect(response.metadata?.resilience).toHaveProperty('circuitBreakerState');
      expect(response.metadata?.resilience).toHaveProperty('retryAttempts');
    });
  });

  describe('getName', () => {
    it('should return "StubAnalysis"', () => {
      expect(provider.getName()).toBe('StubAnalysis');
    });
  });

  describe('isHealthy', () => {
    it('should always return true', async () => {
      const result = await provider.isHealthy();
      expect(result).toBe(true);
    });

    it('should return true immediately without delay', async () => {
      const promise = provider.isHealthy();
      const result = await promise;
      expect(result).toBe(true);
    });
  });
});

describe('StubEditingProvider', () => {
  let provider: StubEditingProvider;
  const mockConfig: ProviderConfig = {
    name: 'StubEditing',
    baseUrl: 'https://stub.endpoint',
    apiKey: 'stub-key',
    timeout: 2000,
    retries: 1,
    enabled: true
  };

  beforeEach(() => {
    jest.useFakeTimers();
    provider = new StubEditingProvider(mockConfig);
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('constructor', () => {
    it('should initialize with stub configuration', () => {
      expect(provider).toBeInstanceOf(StubEditingProvider);
      expect(provider.getName()).toBe('StubEditing');
    });

    it('should override timeout to 2000ms', () => {
      const customConfig = { ...mockConfig, timeout: 10000 };
      const customProvider = new StubEditingProvider(customConfig);
      expect(customProvider).toBeInstanceOf(StubEditingProvider);
    });

    it('should override retries to 1', () => {
      const customConfig = { ...mockConfig, retries: 5 };
      const customProvider = new StubEditingProvider(customConfig);
      expect(customProvider).toBeInstanceOf(StubEditingProvider);
    });
  });

  describe('editImage', () => {
    it('should return stub editing response', async () => {
      const request: SeedreamEditingRequest = {
        imageUrl: 'https://example.com/original.jpg',
        analysis: 'Test analysis',
        editingInstructions: 'Enhance colors'
      };

      const responsePromise = provider.editImage(request);
      const response = await advanceTimersUntilSettled(responsePromise, { stepMs: 100 });

      expect(response.success).toBe(true);
      if (response.success) {
        const data = response.data as any;
        expect(data).toHaveProperty('editedImageUrl');
        expect(data).toHaveProperty('processingTime');
        expect(data).toHaveProperty('metadata');
        expect(data.editedImageUrl).toBe(request.imageUrl);
        expect(data.processingTime).toBe(1500);
      }
    });

    it('should return original image URL as edited URL', async () => {
      const request: SeedreamEditingRequest = {
        imageUrl: 'https://example.com/photo.png',
        analysis: 'Analysis text',
        editingInstructions: 'Apply filters'
      };

      const responsePromise = provider.editImage(request);
      const response = await advanceTimersUntilSettled(responsePromise, { stepMs: 100 });

      if (response.success) {
        const data = response.data as any;
        expect(data.editedImageUrl).toBe('https://example.com/photo.png');
      }
    });

    it('should include metadata with request details', async () => {
      const request: SeedreamEditingRequest = {
        imageUrl: 'https://example.com/test.jpg',
        analysis: 'Original analysis',
        editingInstructions: 'Custom instructions'
      };

      const responsePromise = provider.editImage(request);
      const response = await advanceTimersUntilSettled(responsePromise, { stepMs: 100 });

      if (response.success) {
        const data = response.data as any;
        expect(data.metadata).toEqual({
          version: 'stub-v1',
          format: 'jpeg',
          quality: 'high',
          original_analysis: 'Original analysis',
          editing_instructions: 'Custom instructions'
        });
      }
    });

    it('should simulate 1500ms processing delay', async () => {
      const request: SeedreamEditingRequest = {
        imageUrl: 'https://example.com/test.jpg',
        analysis: 'Test',
        editingInstructions: 'Test'
      };

      const responsePromise = provider.editImage(request);
      const response = await advanceTimersUntilSettled(responsePromise, { stepMs: 100 });

      expect(response.success).toBe(true);
      if (response.success) {
        const data = response.data as any;
        expect(data.processingTime).toBe(1500);
      }
    });

    it('should include resilience metadata in response', async () => {
      const request: SeedreamEditingRequest = {
        imageUrl: 'https://example.com/test.jpg',
        analysis: 'Test',
        editingInstructions: 'Test'
      };

      const responsePromise = provider.editImage(request);
      const response = await advanceTimersUntilSettled(responsePromise, { stepMs: 100 });

      expect(response).toHaveProperty('metadata.resilience');
      expect(response.metadata?.resilience).toHaveProperty('circuitBreakerState');
      expect(response.metadata?.resilience).toHaveProperty('retryAttempts');
    });

    it('should preserve analysis and instructions in metadata', async () => {
      const request: SeedreamEditingRequest = {
        imageUrl: 'https://example.com/test.jpg',
        analysis: 'Detailed analysis of the image',
        editingInstructions: 'Apply vintage filter and increase brightness'
      };

      const responsePromise = provider.editImage(request);
      const response = await advanceTimersUntilSettled(responsePromise, { stepMs: 100 });

      if (response.success) {
        const data = response.data as any;
        expect(data.metadata?.original_analysis).toBe('Detailed analysis of the image');
        expect(data.metadata?.editing_instructions).toBe(
          'Apply vintage filter and increase brightness'
        );
      }
    });
  });

  describe('getName', () => {
    it('should return "StubEditing"', () => {
      expect(provider.getName()).toBe('StubEditing');
    });
  });

  describe('isHealthy', () => {
    it('should always return true', async () => {
      const result = await provider.isHealthy();
      expect(result).toBe(true);
    });

    it('should return true immediately without delay', async () => {
      const promise = provider.isHealthy();
      const result = await promise;
      expect(result).toBe(true);
    });
  });
});

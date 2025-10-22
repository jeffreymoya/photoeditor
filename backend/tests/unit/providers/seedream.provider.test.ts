/**
 * Unit tests for SeedreamProvider
 *
 * Tests image editing functionality including success, retry, failure, and health check paths.
 * Validates alignment with standards/backend-tier.md provider adapter requirements.
 */

import { SeedreamProvider } from '../../../src/providers/seedream.provider';
import {
  ProviderConfig,
  SeedreamEditingRequest,
  PROVIDER_CONFIG
} from '@photoeditor/shared';

// Mock global fetch
global.fetch = jest.fn();

describe('SeedreamProvider', () => {
  let provider: SeedreamProvider;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  const baseConfig: ProviderConfig = {
    name: 'Seedream',
    apiKey: 'test-api-key',
    baseUrl: 'https://api.seedream.test',
    timeout: 5000,
    retries: 3,
    enabled: true,
    resilience: {
      retry: {
        maxAttempts: 3,
        backoff: 'constant',
        initialDelayMs: 10,
        maxDelayMs: 100
      },
      timeout: {
        durationMs: 5000
      },
      circuitBreaker: {
        enabled: false,
        failureThreshold: 5,
        halfOpenAfterMs: 30000,
        successThreshold: 2
      },
      bulkhead: {
        enabled: false,
        maxConcurrent: 10,
        maxQueued: 100
      }
    }
  };

  beforeEach(() => {
    mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;
    mockFetch.mockClear();
    provider = new SeedreamProvider(baseConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with provided config', () => {
      expect(provider.getName()).toBe('Seedream');
    });

    it('should apply timeout from PROVIDER_CONFIG when using defaults', () => {
      const configWithDefaults: ProviderConfig = {
        name: 'Seedream',
        apiKey: 'test-key',
        baseUrl: 'https://api.seedream.test',
        timeout: PROVIDER_CONFIG.SEEDREAM.TIMEOUT_MS,
        retries: PROVIDER_CONFIG.SEEDREAM.MAX_RETRIES,
        enabled: true
      };

      const providerWithDefaults = new SeedreamProvider(configWithDefaults);
      expect(providerWithDefaults).toBeDefined();
      expect(providerWithDefaults.getName()).toBe('Seedream');
    });
  });

  describe('editImage - Success Paths', () => {
    const validRequest: SeedreamEditingRequest = {
      imageUrl: 'https://example.com/test-image.jpg',
      analysis: 'This is a beautiful landscape photo',
      editingInstructions: 'Enhance colors and increase saturation'
    };

    it('should successfully edit image with valid request', async () => {
      const mockResponseData = {
        edited_image_url: 'https://cdn.seedream.test/edited/abc123.jpg',
        processing_time: 2.5,
        format: 'jpeg',
        quality: 'high',
        dimensions: { width: 1920, height: 1080 },
        credits_used: 1
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponseData
      } as unknown as Response);

      const response = await provider.editImage(validRequest);

      expect(response.success).toBe(true);
      expect(response.data).toMatchObject({
        editedImageUrl: mockResponseData.edited_image_url,
        processingTime: mockResponseData.processing_time,
        metadata: {
          version: PROVIDER_CONFIG.SEEDREAM.VERSION,
          format: mockResponseData.format,
          quality: mockResponseData.quality,
          dimensions: mockResponseData.dimensions,
          credits_used: mockResponseData.credits_used
        }
      });
      expect(response.provider).toBe('Seedream');
      expect(response.duration).toBeGreaterThanOrEqual(0);
    });

    it('should use default editing instructions when not provided', async () => {
      const requestWithoutInstructions: SeedreamEditingRequest = {
        imageUrl: 'https://example.com/test.jpg',
        analysis: 'Test analysis'
      };

      const mockResponseData = {
        edited_image_url: 'https://cdn.seedream.test/edited/def456.jpg'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponseData
      } as unknown as Response);

      const response = await provider.editImage(requestWithoutInstructions);

      expect(response.success).toBe(true);

      // Verify default instructions were used in request
      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);
      expect(requestBody.instructions).toBe('Enhance and improve the image based on the analysis');
    });

    it('should include correct headers in API request', async () => {
      const mockResponseData = {
        edited_image_url: 'https://cdn.seedream.test/edited/ghi789.jpg'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponseData
      } as unknown as Response);

      await provider.editImage(validRequest);

      const fetchCall = mockFetch.mock.calls[0];
      const headers = fetchCall[1]?.headers as Record<string, string>;

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBe('Bearer test-api-key');
      expect(headers['X-API-Version']).toBe(PROVIDER_CONFIG.SEEDREAM.VERSION);
    });

    it('should send correct request payload', async () => {
      const mockResponseData = {
        edited_image_url: 'https://cdn.seedream.test/edited/jkl012.jpg'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockResponseData
      } as unknown as Response);

      await provider.editImage(validRequest);

      const fetchCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(fetchCall[1]?.body as string);

      expect(requestBody).toMatchObject({
        image_url: validRequest.imageUrl,
        prompt: validRequest.analysis,
        instructions: validRequest.editingInstructions,
        quality: 'high',
        format: 'jpeg'
      });
    });
  });

  describe('editImage - Error Paths', () => {
    const validRequest: SeedreamEditingRequest = {
      imageUrl: 'https://example.com/test.jpg',
      analysis: 'Test analysis'
    };

    it('should handle API error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request',
        text: async () => 'Invalid image URL'
      } as unknown as Response);

      const response = await provider.editImage(validRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Seedream API error');
      expect(response.error).toContain('400');
      expect(response.error).toContain('Bad Request');
      expect(response.error).toContain('Invalid image URL');
    });

    it('should handle missing edited image URL in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          processing_time: 1.5
          // Missing edited_image_url
        })
      } as Response);

      const response = await provider.editImage(validRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('No edited image URL returned from Seedream');
    });

    it('should handle network errors', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network connection failed'));

      const response = await provider.editImage(validRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Network connection failed');
    });

    it('should return error when provider is disabled', async () => {
      const disabledProvider = new SeedreamProvider({
        ...baseConfig,
        enabled: false
      });

      const response = await disabledProvider.editImage(validRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('disabled');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle 500 server errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
        text: async () => 'Server error occurred'
      } as Response);

      const response = await provider.editImage(validRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('500');
    });

    it('should handle 401 unauthorized errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized',
        text: async () => 'Invalid API key'
      } as Response);

      const response = await provider.editImage(validRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('401');
      expect(response.error).toContain('Unauthorized');
    });

    it('should handle JSON parsing errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      } as unknown as Response);

      const response = await provider.editImage(validRequest);

      expect(response.success).toBe(false);
      expect(response.error).toBeDefined();
    });
  });

  describe('isHealthy', () => {
    it('should return true when health endpoint responds successfully', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200
      } as unknown as Response);

      const healthy = await provider.isHealthy();

      expect(healthy).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        'https://api.seedream.test/health',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer test-api-key'
          }
        })
      );
    });

    it('should return false when health endpoint fails', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 503
      } as unknown as Response);

      const healthy = await provider.isHealthy();

      expect(healthy).toBe(false);
    });

    it('should return false when health endpoint throws error', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      const healthy = await provider.isHealthy();

      expect(healthy).toBe(false);
    });

    it('should return false when fetch throws non-Error exception', async () => {
      mockFetch.mockRejectedValueOnce('String error');

      const healthy = await provider.isHealthy();

      expect(healthy).toBe(false);
    });
  });

  describe('getName', () => {
    it('should return provider name', () => {
      expect(provider.getName()).toBe('Seedream');
    });
  });

  describe('Retry Behavior (via BaseProvider)', () => {
    it('should retry on transient failures and eventually succeed', async () => {
      jest.useRealTimers();

      const validRequest: SeedreamEditingRequest = {
        imageUrl: 'https://example.com/test.jpg',
        analysis: 'Test'
      };

      const mockResponseData = {
        edited_image_url: 'https://cdn.seedream.test/edited/retry-success.jpg'
      };

      let callCount = 0;
      mockFetch.mockImplementation(async () => {
        callCount++;
        if (callCount < 2) {
          return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable',
            text: async () => 'Temporary error'
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => mockResponseData
        } as unknown as Response;
      });

      const response = await provider.editImage(validRequest);

      expect(response.success).toBe(true);
      expect(callCount).toBeGreaterThan(1);
      expect(response.metadata?.resilience).toBeDefined();
    });
  });

  describe('Response Metadata', () => {
    it('should include resilience metadata in response', async () => {
      const validRequest: SeedreamEditingRequest = {
        imageUrl: 'https://example.com/test.jpg',
        analysis: 'Test'
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          edited_image_url: 'https://cdn.seedream.test/edited/meta-test.jpg'
        })
      } as Response);

      const response = await provider.editImage(validRequest);

      expect(response.success).toBe(true);
      expect(response.metadata).toBeDefined();
      expect(response.metadata?.resilience).toBeDefined();
      expect(response.timestamp).toBeDefined();
      expect(typeof response.timestamp).toBe('string');
    });
  });
});

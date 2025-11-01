/**
 * Unit tests for GeminiProvider
 *
 * Tests image analysis functionality including success, retry, failure, and health check paths.
 * Validates alignment with the Backend Tier standard provider adapter requirements.
 */

import { GeminiProvider } from '../../../src/providers/gemini.provider';
import {
  ProviderConfig,
  GeminiAnalysisRequest,
  PROVIDER_CONFIG
} from '@photoeditor/shared';

// Mock global fetch
global.fetch = jest.fn();

describe('GeminiProvider', () => {
  let provider: GeminiProvider;
  let mockFetch: jest.MockedFunction<typeof fetch>;

  const baseConfig: ProviderConfig = {
    name: 'Gemini',
    apiKey: 'test-gemini-key',
    baseUrl: 'https://api.gemini.test',
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
    provider = new GeminiProvider(baseConfig);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('Constructor and Configuration', () => {
    it('should initialize with provided config', () => {
      expect(provider.getName()).toBe('Gemini');
    });

    it('should apply timeout from PROVIDER_CONFIG when using defaults', () => {
      const configWithDefaults: ProviderConfig = {
        name: 'Gemini',
        apiKey: 'test-key',
        baseUrl: 'https://api.gemini.test',
        timeout: PROVIDER_CONFIG.GEMINI.TIMEOUT_MS,
        retries: PROVIDER_CONFIG.GEMINI.MAX_RETRIES,
        enabled: true
      };

      const providerWithDefaults = new GeminiProvider(configWithDefaults);
      expect(providerWithDefaults).toBeDefined();
      expect(providerWithDefaults.getName()).toBe('Gemini');
    });
  });

  describe('analyzeImage - Success Paths', () => {
    const validRequest: GeminiAnalysisRequest = {
      imageUrl: 'https://example.com/test-image.jpg',
      prompt: 'Analyze this image and provide detailed insights'
    };

    const mockImageBuffer = Buffer.from('fake-image-data');

    it('should successfully analyze image with valid request', async () => {
      const mockAnalysisResponse = {
        candidates: [
          {
            content: {
              parts: [
                {
                  text: 'This image shows a beautiful sunset over mountains with vibrant orange and purple hues.'
                }
              ]
            },
            finishReason: 'STOP',
            safetyRatings: [
              { category: 'HARM_CATEGORY_HARASSMENT', probability: 'NEGLIGIBLE' }
            ]
          }
        ]
      };

      // Mock image fetch
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockImageBuffer.buffer
      } as unknown as Response);

      // Mock Gemini API call
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockAnalysisResponse
      } as unknown as Response);

      const response = await provider.analyzeImage(validRequest);

      expect(response.success).toBe(true);
      expect(response.data).toMatchObject({
        analysis: mockAnalysisResponse.candidates[0].content.parts[0].text,
        confidence: 0.9,
        metadata: {
          model: PROVIDER_CONFIG.GEMINI.MODEL,
          finishReason: 'STOP',
          safetyRatings: mockAnalysisResponse.candidates[0].safetyRatings
        }
      });
      expect(response.provider).toBe('Gemini');
    });

    it('should use default prompt when not provided', async () => {
      const requestWithoutPrompt = {
        imageUrl: 'https://example.com/test.jpg'
      } as GeminiAnalysisRequest;

      const mockAnalysisResponse = {
        candidates: [
          {
            content: {
              parts: [{ text: 'Analysis result' }]
            },
            finishReason: 'STOP'
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockImageBuffer.buffer
      } as unknown as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockAnalysisResponse
      } as unknown as Response);

      await provider.analyzeImage(requestWithoutPrompt);

      const geminiApiCall = mockFetch.mock.calls[1];
      const requestBody = JSON.parse(geminiApiCall[1]?.body as string);

      expect(requestBody.contents[0].parts[0].text).toBe(PROVIDER_CONFIG.GEMINI.DEFAULT_PROMPT);
    });

    it('should include correct headers in API request', async () => {
      const mockAnalysisResponse = {
        candidates: [
          {
            content: { parts: [{ text: 'Test analysis' }] },
            finishReason: 'STOP'
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockImageBuffer.buffer
      } as unknown as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockAnalysisResponse
      } as unknown as Response);

      await provider.analyzeImage(validRequest);

      const geminiApiCall = mockFetch.mock.calls[1];
      const headers = geminiApiCall[1]?.headers as Record<string, string>;

      expect(headers['Content-Type']).toBe('application/json');
      expect(headers['Authorization']).toBe('Bearer test-gemini-key');
    });

    it('should fetch image and convert to base64', async () => {
      const mockAnalysisResponse = {
        candidates: [
          {
            content: { parts: [{ text: 'Analysis' }] },
            finishReason: 'STOP'
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockImageBuffer.buffer
      } as unknown as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockAnalysisResponse
      } as unknown as Response);

      await provider.analyzeImage(validRequest);

      const imageFetchCall = mockFetch.mock.calls[0];
      expect(imageFetchCall[0]).toBe(validRequest.imageUrl);

      const geminiApiCall = mockFetch.mock.calls[1];
      const requestBody = JSON.parse(geminiApiCall[1]?.body as string);

      expect(requestBody.contents[0].parts[1].inline_data.mime_type).toBe('image/jpeg');
      expect(requestBody.contents[0].parts[1].inline_data.data).toBeDefined();
    });

    it('should set confidence to 0.7 when finishReason is not STOP', async () => {
      const mockAnalysisResponse = {
        candidates: [
          {
            content: { parts: [{ text: 'Partial analysis' }] },
            finishReason: 'MAX_TOKENS'
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockImageBuffer.buffer
      } as unknown as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockAnalysisResponse
      } as unknown as Response);

      const response = await provider.analyzeImage(validRequest);

      expect(response.success).toBe(true);
      expect((response.data as any).confidence).toBe(0.7);
    });

    it('should include generation config in request', async () => {
      const mockAnalysisResponse = {
        candidates: [
          {
            content: { parts: [{ text: 'Test' }] },
            finishReason: 'STOP'
          }
        ]
      };

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockImageBuffer.buffer
      } as unknown as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => mockAnalysisResponse
      } as unknown as Response);

      await provider.analyzeImage(validRequest);

      const geminiApiCall = mockFetch.mock.calls[1];
      const requestBody = JSON.parse(geminiApiCall[1]?.body as string);

      expect(requestBody.generationConfig).toMatchObject({
        temperature: 0.7,
        candidateCount: 1,
        maxOutputTokens: 1000
      });
    });
  });

  describe('analyzeImage - Error Paths', () => {
    let errorProvider: GeminiProvider;
    const validRequest: GeminiAnalysisRequest = {
      imageUrl: 'https://example.com/test.jpg',
      prompt: 'Analyze this'
    };

    const mockImageBuffer = Buffer.from('fake-image-data');

    beforeEach(() => {
      // Use provider with minimal retries for faster error tests
      errorProvider = new GeminiProvider({
        ...baseConfig,
        resilience: {
          retry: {
            maxAttempts: 1,
            backoff: 'constant',
            initialDelayMs: 1,
            maxDelayMs: 1
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
      });
    });

    it('should handle image fetch failures', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 404
      } as unknown as Response);

      const response = await errorProvider.analyzeImage(validRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Failed to fetch image');
      expect(response.error).toContain('404');
    });

    it('should handle Gemini API error responses', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockImageBuffer.buffer
      } as unknown as Response);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 400,
        statusText: 'Bad Request'
      } as unknown as Response);

      const response = await errorProvider.analyzeImage(validRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Gemini API error');
      expect(response.error).toContain('400');
    });

    it('should handle missing candidates in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockImageBuffer.buffer
      } as unknown as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: []
        })
      } as unknown as Response);

      const response = await errorProvider.analyzeImage(validRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('No analysis returned from Gemini');
    });

    it('should handle null candidates in response', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockImageBuffer.buffer
      } as unknown as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({})
      } as unknown as Response);

      const response = await errorProvider.analyzeImage(validRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('No analysis returned from Gemini');
    });

    it('should return error when provider is disabled', async () => {
      const disabledProvider = new GeminiProvider({
        ...baseConfig,
        enabled: false
      });

      const response = await disabledProvider.analyzeImage(validRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('disabled');
      expect(mockFetch).not.toHaveBeenCalled();
    });

    it('should handle network errors during image fetch', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network timeout'));

      const response = await errorProvider.analyzeImage(validRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('Network timeout');
    });

    it('should handle network errors during API call', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockImageBuffer.buffer
      } as unknown as Response);

      mockFetch.mockRejectedValueOnce(new Error('API connection failed'));

      const response = await errorProvider.analyzeImage(validRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('API connection failed');
    });

    it('should handle 401 unauthorized errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockImageBuffer.buffer
      } as unknown as Response);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 401,
        statusText: 'Unauthorized'
      } as unknown as Response);

      const response = await errorProvider.analyzeImage(validRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('401');
    });

    it('should handle 500 server errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockImageBuffer.buffer
      } as unknown as Response);

      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error'
      } as unknown as Response);

      const response = await errorProvider.analyzeImage(validRequest);

      expect(response.success).toBe(false);
      expect(response.error).toContain('500');
    });

    it('should handle JSON parsing errors', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockImageBuffer.buffer
      } as unknown as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => {
          throw new Error('Invalid JSON');
        }
      } as unknown as Response);

      const response = await errorProvider.analyzeImage(validRequest);

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
        'https://api.gemini.test/v1/models',
        expect.objectContaining({
          headers: {
            'Authorization': 'Bearer test-gemini-key'
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
      expect(provider.getName()).toBe('Gemini');
    });
  });

  describe('Retry Behavior (via BaseProvider)', () => {
    it('should retry on transient failures and eventually succeed', async () => {
      jest.useRealTimers();

      const validRequest: GeminiAnalysisRequest = {
        imageUrl: 'https://example.com/test.jpg',
        prompt: 'Test'
      };

      const mockImageBuffer = Buffer.from('fake-image-data');
      const mockAnalysisResponse = {
        candidates: [
          {
            content: { parts: [{ text: 'Success after retry' }] },
            finishReason: 'STOP'
          }
        ]
      };

      let callCount = 0;
      mockFetch.mockImplementation(async (url) => {
        // First call is always image fetch (succeeds)
        if (typeof url === 'string' && url.includes('example.com')) {
          return {
            ok: true,
            status: 200,
            arrayBuffer: async () => mockImageBuffer.buffer
          } as unknown as Response;
        }

        // Subsequent calls are Gemini API
        callCount++;
        if (callCount < 2) {
          return {
            ok: false,
            status: 503,
            statusText: 'Service Unavailable'
          } as unknown as Response;
        }
        return {
          ok: true,
          status: 200,
          json: async () => mockAnalysisResponse
        } as unknown as Response;
      });

      const response = await provider.analyzeImage(validRequest);

      expect(response.success).toBe(true);
      expect(callCount).toBeGreaterThan(1);
    });
  });

  describe('Response Metadata', () => {
    it('should include resilience metadata in response', async () => {
      const validRequest: GeminiAnalysisRequest = {
        imageUrl: 'https://example.com/test.jpg',
        prompt: 'Test'
      };

      const mockImageBuffer = Buffer.from('fake-image-data');

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        arrayBuffer: async () => mockImageBuffer.buffer
      } as unknown as Response);

      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          candidates: [
            {
              content: { parts: [{ text: 'Test' }] },
              finishReason: 'STOP'
            }
          ]
        })
      } as unknown as Response);

      const response = await provider.analyzeImage(validRequest);

      expect(response.success).toBe(true);
      expect(response.metadata).toBeDefined();
      expect(response.metadata?.resilience).toBeDefined();
      expect(response.timestamp).toBeDefined();
      expect(typeof response.timestamp).toBe('string');
    });
  });
});

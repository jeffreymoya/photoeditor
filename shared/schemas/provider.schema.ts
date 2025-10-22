import { z } from 'zod';

// Gemini Analysis Request & Response
export const GeminiAnalysisRequestSchema = z.object({
  imageUrl: z.string().url(),
  prompt: z.string().default('Analyze this image and provide a detailed description for photo editing purposes.')
});

export type GeminiAnalysisRequest = z.infer<typeof GeminiAnalysisRequestSchema>;

export const GeminiAnalysisResponseSchema = z.object({
  analysis: z.string(),
  confidence: z.number().min(0).max(1).optional(),
  metadata: z.record(z.unknown()).optional()
});

export type GeminiAnalysisResponse = z.infer<typeof GeminiAnalysisResponseSchema>;

// Seedream Editing Request & Response
export const SeedreamEditingRequestSchema = z.object({
  imageUrl: z.string().url(),
  analysis: z.string(),
  editingInstructions: z.string().optional()
});

export type SeedreamEditingRequest = z.infer<typeof SeedreamEditingRequestSchema>;

export const SeedreamEditingResponseSchema = z.object({
  editedImageUrl: z.string().url(),
  processingTime: z.number().optional(),
  metadata: z.record(z.unknown()).optional()
});

export type SeedreamEditingResponse = z.infer<typeof SeedreamEditingResponseSchema>;

// Resilience Policy Configuration
export const ResiliencePolicyConfigSchema = z.object({
  retry: z.object({
    maxAttempts: z.number().min(1).max(10).default(3),
    backoff: z.enum(['exponential', 'linear', 'constant']).default('exponential'),
    initialDelayMs: z.number().min(100).max(5000).default(1000),
    maxDelayMs: z.number().min(1000).max(60000).default(30000)
  }).default({
    maxAttempts: 3,
    backoff: 'exponential',
    initialDelayMs: 1000,
    maxDelayMs: 30000
  }),
  timeout: z.object({
    durationMs: z.number().min(1000).max(300000).default(30000)
  }).default({
    durationMs: 30000
  }),
  circuitBreaker: z.object({
    enabled: z.boolean().default(true),
    failureThreshold: z.number().min(1).max(100).default(5),
    halfOpenAfterMs: z.number().min(1000).max(300000).default(30000),
    successThreshold: z.number().min(1).max(10).default(2)
  }).default({
    enabled: true,
    failureThreshold: 5,
    halfOpenAfterMs: 30000,
    successThreshold: 2
  }),
  bulkhead: z.object({
    enabled: z.boolean().default(false),
    maxConcurrent: z.number().min(1).max(100).default(10),
    maxQueued: z.number().min(0).max(1000).default(100)
  }).default({
    enabled: false,
    maxConcurrent: 10,
    maxQueued: 100
  })
});

export type ResiliencePolicyConfig = z.infer<typeof ResiliencePolicyConfigSchema>;

// Generic Provider Interfaces
export const ProviderConfigSchema = z.object({
  name: z.string(),
  apiKey: z.string(),
  baseUrl: z.string().url(),
  timeout: z.number().default(30000),
  retries: z.number().default(3),
  enabled: z.boolean().default(true),
  resilience: ResiliencePolicyConfigSchema.optional()
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const ProviderResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown(),
  error: z.string().optional(),
  duration: z.number(),
  provider: z.string(),
  timestamp: z.string().datetime(),
  metadata: z.record(z.unknown()).optional()
});

export type ProviderResponse = z.infer<typeof ProviderResponseSchema>;
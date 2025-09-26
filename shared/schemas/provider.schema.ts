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

// Generic Provider Interfaces
export const ProviderConfigSchema = z.object({
  name: z.string(),
  apiKey: z.string(),
  baseUrl: z.string().url(),
  timeout: z.number().default(30000),
  retries: z.number().default(3),
  enabled: z.boolean().default(true)
});

export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;

export const ProviderResponseSchema = z.object({
  success: z.boolean(),
  data: z.unknown(),
  error: z.string().optional(),
  duration: z.number(),
  provider: z.string(),
  timestamp: z.string().datetime()
});

export type ProviderResponse = z.infer<typeof ProviderResponseSchema>;
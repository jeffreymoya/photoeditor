import { z } from 'zod';

// Presign Upload Request & Response
export const PresignUploadRequestSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().regex(/^image\/(jpeg|png|heic|webp)$/),
  fileSize: z.number().positive().max(50 * 1024 * 1024), // 50MB max
  prompt: z.string().min(1).optional()
});

export type PresignUploadRequest = z.infer<typeof PresignUploadRequestSchema>;

export const PresignUploadResponseSchema = z.object({
  jobId: z.string().uuid(),
  presignedUrl: z.string().url(),
  s3Key: z.string(),
  expiresAt: z.string().datetime()
});

export type PresignUploadResponse = z.infer<typeof PresignUploadResponseSchema>;

// API Error Response
export const ApiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
    details: z.record(z.unknown()).optional()
  }),
  timestamp: z.string().datetime(),
  requestId: z.string()
});

export type ApiError = z.infer<typeof ApiErrorSchema>;

// Common API Response Wrapper
export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) => z.object({
  data: dataSchema,
  timestamp: z.string().datetime(),
  requestId: z.string()
});

// Health Check
export const HealthCheckResponseSchema = z.object({
  status: z.literal('healthy'),
  version: z.string(),
  timestamp: z.string().datetime()
});

export type HealthCheckResponse = z.infer<typeof HealthCheckResponseSchema>;
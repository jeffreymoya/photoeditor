import { z } from 'zod';

// Single file upload schema (used by both single and batch flows)
export const FileUploadSchema = z.object({
  fileName: z.string().min(1),
  contentType: z.string().regex(/^image\/(jpeg|png|heic|webp)$/),
  fileSize: z.number().positive().max(50 * 1024 * 1024), // 50MB max
});

export type FileUpload = z.infer<typeof FileUploadSchema>;

// Batch Upload Request & Response
export const BatchUploadRequestSchema = z.object({
  files: z.array(FileUploadSchema).min(1).max(10), // Max 10 files per batch
  sharedPrompt: z.string().min(1), // Shared prompt for all images
  individualPrompts: z.array(z.string().optional()).optional(), // Optional per-image prompts
});

export type BatchUploadRequest = z.infer<typeof BatchUploadRequestSchema>;

export const PresignedUploadSchema = z.object({
  presignedUrl: z.string().url(),
  s3Key: z.string(),
  expiresAt: z.string().datetime()
});

export const BatchUploadResponseSchema = z.object({
  batchJobId: z.string().uuid(),
  uploads: z.array(PresignedUploadSchema),
  childJobIds: z.array(z.string().uuid()) // One job ID per file
});

export type BatchUploadResponse = z.infer<typeof BatchUploadResponseSchema>;

// Single upload request and response
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

// API Error Response - RFC 7807 Problem Details format
export const ApiErrorResponseSchema = z.object({
  code: z.string(),           // Machine-readable error code (e.g., "INVALID_FILE_TYPE")
  title: z.string(),          // Short, human-readable summary
  detail: z.string(),         // Human-readable explanation specific to this occurrence
  instance: z.string(),       // URI reference identifying the specific occurrence (typically requestId)
  type: z.string().optional(), // ErrorType enum value for client discrimination
  timestamp: z.string().datetime(),
  // Optional fields for additional context
  fieldErrors: z.record(z.array(z.string())).optional(), // For validation errors
  provider: z.string().optional(),       // For provider errors
  providerCode: z.string().optional(),   // For provider errors
  retryable: z.boolean().optional(),     // For provider errors
  stack: z.string().optional(),          // For internal errors (dev/staging only)
  context: z.record(z.unknown()).optional() // For additional debug context
});

// Error schema used by current HTTP responses
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

// Device Token Registration
export const DeviceTokenRegistrationSchema = z.object({
  expoPushToken: z.string().min(1),
  platform: z.enum(['ios', 'android']),
  deviceId: z.string().min(1)
});

export type DeviceTokenRegistration = z.infer<typeof DeviceTokenRegistrationSchema>;

export const DeviceTokenResponseSchema = z.object({
  success: z.boolean(),
  message: z.string()
});

export type DeviceTokenResponse = z.infer<typeof DeviceTokenResponseSchema>;

// Batch Job Status Response
export const BatchJobStatusResponseSchema = z.object({
  batchJobId: z.string().uuid(),
  userId: z.string(),
  status: z.enum(['QUEUED', 'PROCESSING', 'EDITING', 'COMPLETED', 'FAILED']),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  sharedPrompt: z.string(),
  completedCount: z.number().min(0),
  totalCount: z.number().positive(),
  childJobIds: z.array(z.string().uuid()),
  error: z.string().optional()
});

export type BatchJobStatusResponse = z.infer<typeof BatchJobStatusResponseSchema>;

// Job Status Updates (for websocket/SSE)
export const JobStatusUpdateSchema = z.object({
  jobId: z.string().uuid(),
  batchJobId: z.string().uuid().optional(),
  status: z.enum(['QUEUED', 'PROCESSING', 'EDITING', 'COMPLETED', 'FAILED']),
  progress: z.number().min(0).max(100).optional(),
  message: z.string().optional(),
  error: z.string().optional(),
  finalS3Key: z.string().optional(),
  timestamp: z.string().datetime()
});

export type JobStatusUpdate = z.infer<typeof JobStatusUpdateSchema>;

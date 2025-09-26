import { z } from 'zod';

export const JobStatus = {
  QUEUED: 'QUEUED',
  PROCESSING: 'PROCESSING',
  EDITING: 'EDITING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
} as const;

export type JobStatusType = keyof typeof JobStatus;

export const JobStatusSchema = z.enum(['QUEUED', 'PROCESSING', 'EDITING', 'COMPLETED', 'FAILED']);

export const JobSchema = z.object({
  jobId: z.string().uuid(),
  userId: z.string(),
  status: JobStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  tempS3Key: z.string().optional(),
  finalS3Key: z.string().optional(),
  error: z.string().optional(),
  locale: z.string().default('en'),
  settings: z.record(z.unknown()).optional(),
  expires_at: z.number().optional(),
  prompt: z.string().optional()
});

export type Job = z.infer<typeof JobSchema>;

export const CreateJobRequestSchema = z.object({
  userId: z.string(),
  locale: z.string().default('en'),
  settings: z.record(z.unknown()).optional(),
  prompt: z.string().optional()
});

export type CreateJobRequest = z.infer<typeof CreateJobRequestSchema>;

export const JobResponseSchema = z.object({
  jobId: z.string().uuid(),
  status: JobStatusSchema,
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  error: z.string().optional()
});

export type JobResponse = z.infer<typeof JobResponseSchema>;
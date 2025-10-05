/**
 * Job Test Fixtures
 *
 * Centralized test data builders for job-related entities
 * Uses deterministic defaults per testing-standards.md
 */

import { Job, BatchJob, JobStatus, CreateJobRequest, CreateBatchJobRequest } from '@photoeditor/shared';

/**
 * Build a Job with sensible defaults
 * Uses fixed UUID from setup.js stub for determinism
 */
export const buildJob = (overrides: Partial<Job> = {}): Job => ({
  jobId: '00000000-0000-4000-8000-000000000000',
  userId: 'test-user-id',
  status: JobStatus.QUEUED,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  locale: 'en',
  settings: {},
  expires_at: Math.floor(new Date('2024-01-08T00:00:00.000Z').getTime() / 1000), // 7 days from createdAt
  ...overrides
});

/**
 * Build a CreateJobRequest
 */
export const buildCreateJobRequest = (overrides: Partial<CreateJobRequest> = {}): CreateJobRequest => ({
  userId: 'test-user-id',
  locale: 'en',
  settings: {},
  prompt: 'Test prompt for image editing',
  ...overrides
});

/**
 * Build a BatchJob with sensible defaults
 */
export const buildBatchJob = (overrides: Partial<BatchJob> = {}): BatchJob => ({
  batchJobId: '00000000-0000-4000-8000-000000000001',
  userId: 'test-user-id',
  status: JobStatus.QUEUED,
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  sharedPrompt: 'Shared prompt for all images',
  childJobIds: [],
  completedCount: 0,
  totalCount: 3,
  locale: 'en',
  settings: {},
  expires_at: Math.floor(new Date('2024-01-08T00:00:00.000Z').getTime() / 1000),
  ...overrides
});

/**
 * Build a CreateBatchJobRequest
 */
export const buildCreateBatchJobRequest = (overrides: Partial<CreateBatchJobRequest> = {}): CreateBatchJobRequest => ({
  userId: 'test-user-id',
  sharedPrompt: 'Shared prompt for all images',
  fileCount: 3,
  locale: 'en',
  settings: {},
  ...overrides
});

/**
 * Build a presign upload request body (single file)
 */
export const buildPresignRequestBody = (overrides: {
  fileName?: string;
  contentType?: string;
  fileSize?: number;
  prompt?: string;
} = {}) => ({
  fileName: 'test-image.jpg',
  contentType: 'image/jpeg',
  fileSize: 1024 * 1024, // 1MB
  prompt: 'Edit this photo with dramatic lighting',
  ...overrides
});

/**
 * Build a batch presign upload request body
 */
export const buildBatchPresignRequestBody = (overrides: {
  fileCount?: number;
  sharedPrompt?: string;
  individualPrompts?: (string | undefined)[];
} = {}) => {
  const fileCount = overrides.fileCount || 3;
  const files = Array.from({ length: fileCount }, (_, i) => ({
    fileName: `test-image-${i + 1}.jpg`,
    contentType: 'image/jpeg',
    fileSize: 1024 * 1024
  }));

  return {
    files,
    sharedPrompt: overrides.sharedPrompt || 'Apply vintage filter to all images',
    individualPrompts: overrides.individualPrompts
  };
};

/**
 * Build expected presign response structure
 */
export const buildExpectedPresignResponse = () => ({
  jobId: expect.stringMatching(/^[0-9a-f-]{36}$/),
  presignedUrl: expect.stringMatching(/^https?:\/\/.+/),
  s3Key: expect.stringMatching(/^uploads\/.+/),
  expiresAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
});

/**
 * Build expected batch presign response structure
 */
export const buildExpectedBatchPresignResponse = (fileCount: number = 3) => ({
  batchJobId: expect.stringMatching(/^[0-9a-f-]{36}$/),
  uploads: expect.arrayContaining(
    Array.from({ length: fileCount }, () => ({
      presignedUrl: expect.stringMatching(/^https?:\/\/.+/),
      s3Key: expect.stringMatching(/^uploads\/.+/),
      expiresAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
    }))
  ),
  childJobIds: expect.arrayContaining(
    Array.from({ length: fileCount }, () => expect.stringMatching(/^[0-9a-f-]{36}$/))
  )
});

/**
 * Build expected job status response
 */
export const buildExpectedJobStatusResponse = () => ({
  jobId: expect.stringMatching(/^[0-9a-f-]{36}$/),
  status: expect.stringMatching(/^(QUEUED|PROCESSING|EDITING|COMPLETED|FAILED)$/),
  createdAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/),
  updatedAt: expect.stringMatching(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/)
});

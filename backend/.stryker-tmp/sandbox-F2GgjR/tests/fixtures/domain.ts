// @ts-nocheck
// Domain object builders for testing
// Centralized builders for domain entities with sensible defaults

/**
 * Build a Job object with overrides
 */
export const buildJob = (overrides: Partial<{
  jobId: string;
  status: string;
  userId: string;
  files: Array<{
    fileId: string;
    originalName: string;
    contentType: string;
    size: number;
    status: string;
  }>;
  createdAt: string;
  updatedAt: string;
}> = {}) => ({
  jobId: '00000000-0000-4000-8000-000000000000',
  status: 'pending',
  userId: 'test-user-id',
  files: [
    {
      fileId: '00000000-0000-4000-8000-000000000001',
      originalName: 'test.jpg',
      contentType: 'image/jpeg',
      size: 102400,
      status: 'pending',
    },
  ],
  createdAt: '2024-01-01T00:00:00.000Z',
  updatedAt: '2024-01-01T00:00:00.000Z',
  ...overrides,
});

/**
 * Build a File object with overrides
 */
export const buildFile = (overrides: Partial<{
  fileId: string;
  jobId: string;
  originalName: string;
  contentType: string;
  size: number;
  status: string;
  uploadUrl?: string;
  downloadUrl?: string;
  thumbnailUrl?: string;
}> = {}) => ({
  fileId: '00000000-0000-4000-8000-000000000001',
  jobId: '00000000-0000-4000-8000-000000000000',
  originalName: 'test.jpg',
  contentType: 'image/jpeg',
  size: 102400,
  status: 'pending',
  ...overrides,
});

/**
 * Build a presign upload request with overrides
 */
export const buildPresignRequest = (overrides: Partial<{
  files: Array<{
    name: string;
    contentType: string;
    sizeBytes: number;
  }>;
  userId?: string;
}> = {}) => ({
  files: [
    {
      name: 'test.jpg',
      contentType: 'image/jpeg',
      sizeBytes: 102400,
    },
  ],
  userId: 'test-user-id',
  ...overrides,
});

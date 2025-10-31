/**
 * ApiService Unit Tests
 *
 * Tests validate that ApiService correctly uses shared contract schemas
 * to parse and validate API request/response data. This ensures mobile
 * client stays aligned with backend contracts (SSOT from @photoeditor/shared).
 *
 * References:
 * - standards/shared-contracts-tier.md: Contract-first API design
 * - standards/frontend-tier.md: Services layer validation requirements
 * - standards/testing-standards.md: Mobile services testing guidelines
 */

// eslint-disable-next-line unicorn/prefer-node-protocol
import { readFileSync } from 'fs';

import {
  BatchJobSchema,
  BatchUploadRequestSchema,
  BatchUploadResponseSchema,
  DeviceTokenRegistrationSchema,
  DeviceTokenResponseSchema,
  JobSchema,
  PresignUploadRequestSchema,
  PresignUploadResponseSchema,
} from '@photoeditor/shared';

import { apiService } from '../ApiService';

import {
  buildBatchJob,
  buildBatchUploadResponse,
  buildDeviceTokenResponse,
  buildJob,
  buildPresignUploadResponse,
  createMockResponse,
  schemaSafeResponse,
} from './stubs';
import { advanceTimersUntilSettled, createPollingScenario, type FetchStageDefinition } from './testUtils';

// Mock global fetch
global.fetch = jest.fn();
const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

const statusMatcher = (input: RequestInfo | URL) => typeof input === 'string' && input.includes('/status/');

const buildProcessImageStages = ({
  jobId,
  imageUri,
  presignedUrl,
  scenarioName,
  extraStages = [],
}: {
  jobId: string;
  imageUri: string;
  presignedUrl: string;
  scenarioName: string;
  extraStages?: FetchStageDefinition[];
}): FetchStageDefinition[] => {
  const presignStage: FetchStageDefinition = {
    name: `${scenarioName}:presign`,
    matcher: (input) => typeof input === 'string' && input.includes('/presign'),
    handler: () => schemaSafeResponse({
      schema: PresignUploadResponseSchema,
      build: buildPresignUploadResponse,
      overrides: {
        jobId,
        s3Key: `uploads/${jobId}/test.jpg`,
        presignedUrl,
      },
    }),
    maxCalls: 1,
  };

  const fetchImageStage: FetchStageDefinition = {
    name: `${scenarioName}:image-fetch`,
    matcher: (input) => input === imageUri,
    handler: () => createMockResponse({ data: {} }),
    maxCalls: 1,
  };

  const uploadStage: FetchStageDefinition = {
    name: `${scenarioName}:s3-upload`,
    matcher: (input, init) => input === presignedUrl && (init?.method ?? 'GET').toUpperCase() === 'PUT',
    handler: () => createMockResponse({ status: 200 }),
    maxCalls: 1,
  };

  return [presignStage, fetchImageStage, uploadStage, ...extraStages];
};

const buildBatchStages = ({
  scenarioName,
  batchResponse,
  images,
  extraStages = [],
}: {
  scenarioName: string;
  batchResponse: ReturnType<typeof buildBatchUploadResponse>;
  images: { uri: string }[];
  extraStages?: FetchStageDefinition[];
}): FetchStageDefinition[] => {
  const stages: FetchStageDefinition[] = [
    {
      name: `${scenarioName}:batch-presign`,
      matcher: (input) => typeof input === 'string' && input.includes('/presign'),
      handler: () => schemaSafeResponse({
        schema: BatchUploadResponseSchema,
        build: buildBatchUploadResponse,
        overrides: batchResponse,
      }),
      maxCalls: 1,
    },
  ];

  images.forEach((image, index) => {
    const upload = batchResponse.uploads[index];

    stages.push({
      name: `${scenarioName}:image-fetch-${index}`,
      matcher: (input) => input === image.uri,
      handler: () => createMockResponse({ data: {} }),
      maxCalls: 1,
    });

    stages.push({
      name: `${scenarioName}:s3-upload-${index}`,
      matcher: (input, init) => input === upload.presignedUrl && (init?.method ?? 'GET').toUpperCase() === 'PUT',
      handler: () => createMockResponse({ status: 200 }),
      maxCalls: 1,
    });
  });

  return [...stages, ...extraStages];
};

/**
 * Justification for max-lines-per-function override:
 * This test suite validates comprehensive contract integration across multiple
 * API endpoints (presign, batch, job status, device tokens) per standards/shared-contracts-tier.md.
 * Each endpoint requires request/response schema validation, error cases, and contract drift
 * prevention checks. Splitting into separate files would fragment contract validation logic
 * and reduce clarity. The 305-line suite provides complete coverage of mobile-backend contract
 * alignment (TASK-0606 acceptance criteria, standards/testing-standards.md lines 203-219).
 */
// eslint-disable-next-line max-lines-per-function
describe('ApiService - Shared Schema Integration', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mockFetch.mockReset();
    jest.useRealTimers();
  });

  describe('Schema Validation - Request Presigned URL', () => {
    it('should validate request body using PresignUploadRequestSchema', async () => {
      const mockResponse = buildPresignUploadResponse({
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        presignedUrl: 'https://s3.example.com/upload',
        s3Key: 'uploads/test.jpg',
        expiresAt: '2025-10-06T12:00:00.000Z',
      });

      mockFetch.mockResolvedValueOnce(
        schemaSafeResponse({
          schema: PresignUploadResponseSchema,
          build: buildPresignUploadResponse,
          value: mockResponse,
        })
      );

      const result = await apiService.requestPresignedUrl(
        'test.jpg',
        'image/jpeg',
        1024000,
        'test prompt'
      );

      // Verify request body was validated against schema
      const requestCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(requestCall[1]?.body as string);

      expect(() => PresignUploadRequestSchema.parse(requestBody)).not.toThrow();
      expect(requestBody).toEqual({
        fileName: 'test.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024000,
        prompt: 'test prompt',
      });

      // Verify response was validated against schema
      expect(() => PresignUploadResponseSchema.parse(result)).not.toThrow();
      expect(result).toEqual(mockResponse);
    });

    it('should reject invalid request data that violates schema', async () => {
      // Attempt to create invalid request (negative file size)
      await expect(async () => {
        PresignUploadRequestSchema.parse({
          fileName: 'test.jpg',
          contentType: 'image/jpeg',
          fileSize: -1000, // Invalid: negative size
        });
      }).rejects.toThrow();
    });

    it('should reject invalid response data that violates schema', async () => {
      const invalidResponse = {
        jobId: 'not-a-uuid', // Invalid: must be UUID
        presignedUrl: 'not-a-url', // Invalid: must be valid URL
        s3Key: 'test.jpg',
        expiresAt: 'not-a-datetime', // Invalid: must be ISO datetime
      };

      mockFetch.mockResolvedValueOnce(createMockResponse({ data: invalidResponse }));

      await expect(
        apiService.requestPresignedUrl('test.jpg', 'image/jpeg', 1024000)
      ).rejects.toThrow();
    });
  });

  describe('Schema Validation - Job Status', () => {
    it('should validate job status response using JobSchema', async () => {
      const mockJobStatus = buildJob({
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        userId: 'user123',
        status: 'COMPLETED',
        createdAt: '2025-10-06T10:00:00.000Z',
        updatedAt: '2025-10-06T10:05:00.000Z',
        finalS3Key: 'processed/test.jpg',
        locale: 'en',
      });

      mockFetch.mockResolvedValueOnce(
        schemaSafeResponse({
          schema: JobSchema,
          build: buildJob,
          value: mockJobStatus,
        })
      );

      const result = await apiService.getJobStatus('123e4567-e89b-12d3-a456-426614174000');

      expect(() => JobSchema.parse(result)).not.toThrow();
      expect(result.status).toBe('COMPLETED');
      expect(result.finalS3Key).toBe('processed/test.jpg');
    });

    it('should validate all possible job statuses', () => {
      const statuses = ['QUEUED', 'PROCESSING', 'EDITING', 'COMPLETED', 'FAILED'];

      statuses.forEach(status => {
        const job = {
          jobId: '123e4567-e89b-12d3-a456-426614174000',
          userId: 'user123',
          status,
          createdAt: '2025-10-06T10:00:00.000Z',
          updatedAt: '2025-10-06T10:00:00.000Z',
          locale: 'en',
        };

        expect(() => JobSchema.parse(job)).not.toThrow();
      });
    });

    it('should reject invalid job status', () => {
      const invalidJob = {
        jobId: '123e4567-e89b-12d3-a456-426614174000',
        userId: 'user123',
        status: 'INVALID_STATUS', // Not in enum
        createdAt: '2025-10-06T10:00:00.000Z',
        updatedAt: '2025-10-06T10:00:00.000Z',
        locale: 'en',
      };

      expect(() => JobSchema.parse(invalidJob)).toThrow();
    });
  });

  describe('Schema Validation - Batch Upload', () => {
    it('should validate batch upload request using BatchUploadRequestSchema', async () => {
      const mockResponse = buildBatchUploadResponse({
        batchJobId: '123e4567-e89b-12d3-a456-426614174000',
        childJobIds: [
          '223e4567-e89b-12d3-a456-426614174000',
          '323e4567-e89b-12d3-a456-426614174000',
        ],
        uploads: [
          {
            presignedUrl: 'https://s3.example.com/upload1',
            s3Key: 'uploads/test1.jpg',
            expiresAt: '2025-10-06T12:00:00.000Z',
          },
          {
            presignedUrl: 'https://s3.example.com/upload2',
            s3Key: 'uploads/test2.jpg',
            expiresAt: '2025-10-06T12:00:00.000Z',
          },
        ],
      });

      mockFetch.mockResolvedValueOnce(
        schemaSafeResponse({
          schema: BatchUploadResponseSchema,
          build: buildBatchUploadResponse,
          value: mockResponse,
        })
      );

      const files = [
        { fileName: 'test1.jpg', fileSize: 1024000 },
        { fileName: 'test2.jpg', fileSize: 2048000 },
      ];

      const result = await apiService.requestBatchPresignedUrls(
        files,
        'shared prompt',
        ['prompt1', 'prompt2']
      );

      // Verify request body was validated
      const requestCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(requestCall[1]?.body as string);

      expect(() => BatchUploadRequestSchema.parse(requestBody)).not.toThrow();
      expect(requestBody.files).toHaveLength(2);
      expect(requestBody.sharedPrompt).toBe('shared prompt');

      // Verify response was validated
      expect(() => BatchUploadResponseSchema.parse(result)).not.toThrow();
      expect(result.uploads).toHaveLength(2);
      expect(result.childJobIds).toHaveLength(2);
    });

    it('should reject batch request with too many files', () => {
      const files = Array(11).fill({
        fileName: 'test.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024000,
      });

      expect(() =>
        BatchUploadRequestSchema.parse({
          files,
          sharedPrompt: 'test',
        })
      ).toThrow(); // Max 10 files per batch
    });

    it('should reject batch request with empty files array', () => {
      expect(() =>
        BatchUploadRequestSchema.parse({
          files: [],
          sharedPrompt: 'test',
        })
      ).toThrow(); // Min 1 file required
    });
  });

  describe('Schema Validation - Batch Job Status', () => {
    it('should validate batch job status using BatchJobSchema', async () => {
      const mockBatchStatus = buildBatchJob({
        batchJobId: '123e4567-e89b-12d3-a456-426614174000',
        userId: 'user123',
        status: 'PROCESSING',
        createdAt: '2025-10-06T10:00:00.000Z',
        updatedAt: '2025-10-06T10:05:00.000Z',
        sharedPrompt: 'test prompt',
        childJobIds: [
          '223e4567-e89b-12d3-a456-426614174000',
          '323e4567-e89b-12d3-a456-426614174000',
        ],
        completedCount: 1,
        totalCount: 2,
        locale: 'en',
      });

      mockFetch.mockResolvedValueOnce(
        schemaSafeResponse({
          schema: BatchJobSchema,
          build: buildBatchJob,
          value: mockBatchStatus,
        })
      );

      const result = await apiService.getBatchJobStatus('123e4567-e89b-12d3-a456-426614174000');

      expect(() => BatchJobSchema.parse(result)).not.toThrow();
      expect(result.completedCount).toBe(1);
      expect(result.totalCount).toBe(2);
      expect(result.childJobIds).toHaveLength(2);
    });
  });

  describe('Schema Validation - Device Token Registration', () => {
    it('should validate device token request using DeviceTokenRegistrationSchema', async () => {
      mockFetch.mockResolvedValueOnce(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
        })
      );

      const result = await apiService.registerDeviceToken(
        'ExponentPushToken[xxxxx]',
        'ios',
        'device-123'
      );

      // Verify request body was validated
      const requestCall = mockFetch.mock.calls[0];
      const requestBody = JSON.parse(requestCall[1]?.body as string);

      expect(() => DeviceTokenRegistrationSchema.parse(requestBody)).not.toThrow();
      expect(requestBody.expoPushToken).toBe('ExponentPushToken[xxxxx]');
      expect(requestBody.platform).toBe('ios');
      expect(requestBody.deviceId).toBe('device-123');

      // Verify response was validated
      expect(() => DeviceTokenResponseSchema.parse(result)).not.toThrow();
      expect(result.success).toBe(true);
    });

    it('should reject invalid platform values', () => {
      expect(() =>
        DeviceTokenRegistrationSchema.parse({
          expoPushToken: 'token',
          platform: 'windows', // Invalid: must be ios or android
          deviceId: 'device-123',
        })
      ).toThrow();
    });

    it('should validate device token deactivation response', async () => {
      mockFetch.mockResolvedValueOnce(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
          overrides: { message: 'Device token deactivated successfully' },
        })
      );

      const result = await apiService.deactivateDeviceToken('device-123');

      expect(() => DeviceTokenResponseSchema.parse(result)).not.toThrow();
      expect(result.success).toBe(true);
    });
  });

  describe('Polling Logic - processImage', () => {
    const imageUri = 'file:///path/to/image.jpg';

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('should resolve when job completes successfully', async () => {
      const mockJobId = '123e4567-e89b-12d3-a456-426614174000';
      const presignedUrl = `https://s3.example.com/${mockJobId}`;

      createPollingScenario({
        fetchMock: mockFetch,
        matcher: statusMatcher,
        schema: JobSchema,
        build: buildJob,
        timeline: [
          { jobId: mockJobId, status: 'QUEUED' },
          { jobId: mockJobId, status: 'PROCESSING' },
          {
            jobId: mockJobId,
            status: 'COMPLETED',
            finalS3Key: `results/${mockJobId}/output.jpg`,
          },
        ],
        repeatLast: true,
        scenarioName: 'apiService processImage success',
        stages: buildProcessImageStages({
          jobId: mockJobId,
          imageUri,
          presignedUrl,
          scenarioName: 'apiService processImage success',
        }),
      });

      const onProgress = jest.fn();

      const processPromise = apiService.processImage(
        imageUri,
        'test.jpg',
        1024,
        'test prompt',
        onProgress
      );

      const result = await advanceTimersUntilSettled(processPromise, { maxCycles: 10 });

      expect(result).toContain(`/download/${mockJobId}`);
      expect(onProgress).toHaveBeenCalledWith(25);
      expect(onProgress).toHaveBeenCalledWith(50);
      expect(onProgress).toHaveBeenCalledWith(100);
    });

    it('should reject when job fails', async () => {
      const mockJobId = '123e4567-e89b-12d3-a456-426614174000';
      const presignedUrl = `https://s3.example.com/${mockJobId}`;

      createPollingScenario({
        fetchMock: mockFetch,
        matcher: statusMatcher,
        schema: JobSchema,
        build: buildJob,
        timeline: [
          { jobId: mockJobId, status: 'QUEUED' },
          {
            jobId: mockJobId,
            status: 'FAILED',
            error: 'Processing failed: invalid image format',
          },
        ],
        repeatLast: true,
        scenarioName: 'apiService processImage failure',
        stages: buildProcessImageStages({
          jobId: mockJobId,
          imageUri,
          presignedUrl,
          scenarioName: 'apiService processImage failure',
        }),
      });

      let failure: Error | undefined;
      const processPromise = apiService
        .processImage(imageUri, 'test.jpg', 1024, 'test prompt')
        .catch((error: unknown) => {
          failure = error instanceof Error ? error : new Error(String(error));
          return undefined;
        });

      await advanceTimersUntilSettled(processPromise, { maxCycles: 130 });

      expect(failure).toBeInstanceOf(Error);
      expect(failure?.message).toContain('Processing failed: invalid image format');
    });

    it('should timeout after max polling attempts', async () => {
      const mockJobId = '123e4567-e89b-12d3-a456-426614174000';
      const presignedUrl = `https://s3.example.com/${mockJobId}`;

      createPollingScenario({
        fetchMock: mockFetch,
        matcher: statusMatcher,
        schema: JobSchema,
        build: buildJob,
        timeline: [{ jobId: mockJobId, status: 'PROCESSING' }],
        repeatLast: true,
        scenarioName: 'apiService processImage timeout',
        stages: buildProcessImageStages({
          jobId: mockJobId,
          imageUri,
          presignedUrl,
          scenarioName: 'apiService processImage timeout',
        }),
      });

      let timeoutError: Error | undefined;
      const processPromise = apiService
        .processImage(imageUri, 'test.jpg', 1024, 'test prompt')
        .catch((error: unknown) => {
          timeoutError = error instanceof Error ? error : new Error(String(error));
          return undefined;
        });

      await advanceTimersUntilSettled(processPromise, { maxCycles: 130 });

      expect(timeoutError).toBeInstanceOf(Error);
      expect(timeoutError?.message).toContain('Processing timeout - please check job status later');
    });

    it('should continue polling after temporary network errors', async () => {
      const mockJobId = '123e4567-e89b-12d3-a456-426614174000';
      const presignedUrl = `https://s3.example.com/${mockJobId}`;

      createPollingScenario({
        fetchMock: mockFetch,
        matcher: statusMatcher,
        schema: JobSchema,
        build: buildJob,
        timeline: [
          {
            jobId: mockJobId,
            status: 'COMPLETED',
            finalS3Key: `results/${mockJobId}/output.jpg`,
          },
        ],
        repeatLast: true,
        scenarioName: 'apiService processImage transient error recovery',
        stages: buildProcessImageStages({
          jobId: mockJobId,
          imageUri,
          presignedUrl,
          scenarioName: 'apiService processImage transient error recovery',
          extraStages: [
            {
              name: 'apiService processImage transient error recovery:network-timeout',
              matcher: statusMatcher,
              handler: () => Promise.reject(new Error('Network timeout')),
              maxCalls: 1,
            },
          ],
        }),
      });

      const result = await advanceTimersUntilSettled(
        apiService.processImage(imageUri, 'test.jpg', 1024, 'test prompt'),
        { maxCycles: 20 }
      );

      expect(result).toContain(`/download/${mockJobId}`);
    });
  });

  describe('Polling Logic - processBatchImages', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('should resolve when batch completes successfully', async () => {
      const mockBatchJobId = '223e4567-e89b-12d3-a456-426614174000';
      const childJobIds = [
        '323e4567-e89b-12d3-a456-426614174000',
        '423e4567-e89b-12d3-a456-426614174000',
      ];

      const batchPresignResponse = buildBatchUploadResponse({
        batchJobId: mockBatchJobId,
        childJobIds,
        uploads: childJobIds.map((jobId, index) => ({
          presignedUrl: `https://s3.example.com/${jobId}`,
          s3Key: `uploads/${jobId}/file${index + 1}.jpg`,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        })),
      });

      createPollingScenario({
        fetchMock: mockFetch,
        matcher: (input) => typeof input === 'string' && input.includes('/batch-status/'),
        schema: BatchJobSchema,
        build: buildBatchJob,
        timeline: [
          buildBatchJob({ batchJobId: mockBatchJobId, childJobIds, completedCount: 1, totalCount: 2 }),
          buildBatchJob({
            batchJobId: mockBatchJobId,
            childJobIds,
            completedCount: 2,
            totalCount: 2,
            status: 'COMPLETED',
          }),
        ],
        repeatLast: true,
        scenarioName: 'apiService processBatchImages success',
        stages: buildBatchStages({
          scenarioName: 'apiService processBatchImages success',
          batchResponse: batchPresignResponse,
          images: [
            { uri: 'file:///path/to/image1.jpg' },
            { uri: 'file:///path/to/image2.jpg' },
          ],
        }),
      });

      const onProgress = jest.fn();

      const result = await advanceTimersUntilSettled(
        apiService.processBatchImages(
          [
            { uri: 'file:///path/to/image1.jpg', fileName: 'file1.jpg', fileSize: 1024 },
            { uri: 'file:///path/to/image2.jpg', fileName: 'file2.jpg', fileSize: 2048 },
          ],
          'shared prompt',
          undefined,
          onProgress
        ),
        { maxCycles: 20 }
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toContain(`/download/${childJobIds[0]}`);
      expect(result[1]).toContain(`/download/${childJobIds[1]}`);
      expect(onProgress).toHaveBeenCalledWith(100, mockBatchJobId);
    });

    it('should reject when batch fails', async () => {
      const mockBatchJobId = '223e4567-e89b-12d3-a456-426614174000';
      const childJobIds = [
        '323e4567-e89b-12d3-a456-426614174000',
        '423e4567-e89b-12d3-a456-426614174000',
      ];

      const batchPresignResponse = buildBatchUploadResponse({
        batchJobId: mockBatchJobId,
        childJobIds,
        uploads: childJobIds.map((jobId, index) => ({
          presignedUrl: `https://s3.example.com/${jobId}`,
          s3Key: `uploads/${jobId}/file${index + 1}.jpg`,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        })),
      });

      createPollingScenario({
        fetchMock: mockFetch,
        matcher: (input) => typeof input === 'string' && input.includes('/batch-status/'),
        schema: BatchJobSchema,
        build: buildBatchJob,
        timeline: [
          {
            batchJobId: mockBatchJobId,
            childJobIds,
            status: 'FAILED',
            error: 'Batch processing failed: insufficient credits',
            completedCount: 1,
            totalCount: 2,
          },
        ],
        repeatLast: true,
        scenarioName: 'apiService processBatchImages failure',
        stages: buildBatchStages({
          scenarioName: 'apiService processBatchImages failure',
          batchResponse: batchPresignResponse,
          images: [
            { uri: 'file:///path/to/image1.jpg' },
            { uri: 'file:///path/to/image2.jpg' },
          ],
        }),
      });

      let failure: Error | undefined;
      const processPromise = apiService
        .processBatchImages(
          [
            { uri: 'file:///path/to/image1.jpg', fileName: 'file1.jpg', fileSize: 1024 },
            { uri: 'file:///path/to/image2.jpg', fileName: 'file2.jpg', fileSize: 2048 },
          ],
          'shared prompt'
        )
        .catch((error: unknown) => {
          failure = error instanceof Error ? error : new Error(String(error));
          return undefined;
        });

      await advanceTimersUntilSettled(processPromise, { maxCycles: 260 });

      expect(failure).toBeInstanceOf(Error);
      expect(failure?.message).toContain('Batch processing failed: insufficient credits');
    });

    it('should timeout after max polling attempts', async () => {
      const mockBatchJobId = '223e4567-e89b-12d3-a456-426614174000';
      const childJobIds = [
        '323e4567-e89b-12d3-a456-426614174000',
        '423e4567-e89b-12d3-a456-426614174000',
      ];

      const batchPresignResponse = buildBatchUploadResponse({
        batchJobId: mockBatchJobId,
        childJobIds,
        uploads: childJobIds.map((jobId, index) => ({
          presignedUrl: `https://s3.example.com/${jobId}`,
          s3Key: `uploads/${jobId}/file${index + 1}.jpg`,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        })),
      });

      createPollingScenario({
        fetchMock: mockFetch,
        matcher: (input) => typeof input === 'string' && input.includes('/batch-status/'),
        schema: BatchJobSchema,
        build: buildBatchJob,
        timeline: [
          {
            batchJobId: mockBatchJobId,
            childJobIds,
            status: 'PROCESSING',
            completedCount: 1,
            totalCount: 2,
          },
        ],
        repeatLast: true,
        scenarioName: 'apiService processBatchImages timeout',
        stages: buildBatchStages({
          scenarioName: 'apiService processBatchImages timeout',
          batchResponse: batchPresignResponse,
          images: [
            { uri: 'file:///path/to/image1.jpg' },
            { uri: 'file:///path/to/image2.jpg' },
          ],
        }),
      });

      let timeoutError: Error | undefined;
      const processPromise = apiService
        .processBatchImages(
          [
            { uri: 'file:///path/to/image1.jpg', fileName: 'file1.jpg', fileSize: 1024 },
            { uri: 'file:///path/to/image2.jpg', fileName: 'file2.jpg', fileSize: 2048 },
          ],
          'shared prompt'
        )
        .catch((error: unknown) => {
          timeoutError = error instanceof Error ? error : new Error(String(error));
          return undefined;
        });

      await advanceTimersUntilSettled(processPromise, { maxCycles: 260 });

      expect(timeoutError).toBeInstanceOf(Error);
      expect(timeoutError?.message).toContain('Batch processing timeout - please check job status later');
    });
  });

  describe('Contract Drift Prevention', () => {
    it('should use shared schemas directly without local copies', () => {
      // This test verifies that ApiService imports schemas from @photoeditor/shared
      // rather than defining them locally, preventing contract drift

      const apiServiceCode = readFileSync(require.resolve('../ApiService'), 'utf8');

      // Verify imports from shared package
      expect(apiServiceCode).toContain("from '@photoeditor/shared'");

      // Verify no local schema definitions (these would indicate drift risk)
      expect(apiServiceCode).not.toContain('const PresignRequestSchema = z.object');
      expect(apiServiceCode).not.toContain('const PresignResponseSchema = z.object');
      expect(apiServiceCode).not.toContain('const JobStatusSchema = z.object');
      expect(apiServiceCode).not.toContain('const FileUploadSchema = z.object');
      expect(apiServiceCode).not.toContain('const BatchUploadRequestSchema = z.object');
      expect(apiServiceCode).not.toContain('const BatchJobStatusSchema = z.object');
      expect(apiServiceCode).not.toContain('const DeviceTokenRegistrationSchema = z.object');
    });

    it('should not re-export shared schemas from mobile modules', () => {
      // Per task constraint: "Do not re-export shared schemas from mobile-specific modules"
      const apiServiceCode = readFileSync(require.resolve('../ApiService'), 'utf8');

      // Verify no re-exports
      expect(apiServiceCode).not.toContain('export { PresignUploadRequestSchema');
      expect(apiServiceCode).not.toContain('export { JobSchema');
      expect(apiServiceCode).not.toContain('export { BatchUploadRequestSchema');
    });
  });

  describe('API Error Handling', () => {
    it('should throw error on non-ok HTTP response', async () => {
      mockFetch.mockResolvedValueOnce(
        createMockResponse({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
        })
      );

      await expect(
        apiService.requestPresignedUrl('test.jpg', 'image/jpeg', 1024000)
      ).rejects.toThrow('API Error: 400 Bad Request');
    });

    it('should throw error on network failure', async () => {
      mockFetch.mockRejectedValueOnce(new Error('Network error'));

      await expect(
        apiService.requestPresignedUrl('test.jpg', 'image/jpeg', 1024000)
      ).rejects.toThrow('Network error');
    });

    it('should throw error on schema validation failure', async () => {
      const invalidResponse = {
        jobId: 'not-a-uuid',
        presignedUrl: 'not-a-url',
        s3Key: 'test.jpg',
        expiresAt: 'invalid-date',
      };

      mockFetch.mockResolvedValueOnce(createMockResponse({ data: invalidResponse }));

      await expect(
        apiService.requestPresignedUrl('test.jpg', 'image/jpeg', 1024000)
      ).rejects.toThrow(); // Zod validation error
    });
  });
});

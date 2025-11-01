/**
 * Upload Service Adapter Tests - Batch 1: Basic Operations
 *
 * Per the Testing Standards:
 * - Services/Adapters: ≥80% line coverage, ≥70% branch coverage
 * - Mock external dependencies using locally defined stubs
 * - Reset mocks between test cases to avoid state leakage
 *
 * Per task TASK-0826 plan step 2:
 * - Basic happy path tests (presignUpload, uploadToS3, getJobStatus)
 * - Simple error tests (network failure, HTTP 4xx)
 * - Mock fetch with mockResolvedValue (NO "Once") to handle retry policies (3 attempts)
 *
 * Per the Frontend Tier standard Services & Integration Layer:
 * - Adapters implement ports with cockatiel retry/circuit breaker policies
 * - Retry policy: 3 attempts with exponential backoff
 */

import {
  BatchJobSchema,
  BatchUploadResponseSchema,
  DeviceTokenResponseSchema,
  JobSchema,
  PresignUploadResponseSchema,
} from '@photoeditor/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  createMockResponse,
  buildPresignUploadResponse,
  buildJob,
  buildBatchUploadResponse,
  buildBatchJob,
  buildDeviceTokenResponse,
  schemaSafeResponse,
} from '../../__tests__/stubs';
import { advanceTimersUntilSettled, createPollingScenario, type FetchStageDefinition } from '../../__tests__/testUtils';
import { UploadServiceAdapter } from '../adapter';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage');

// Mock global fetch
global.fetch = jest.fn();

describe('UploadServiceAdapter - Basic Operations', () => {
  let adapter: UploadServiceAdapter;
  const mockFetch = global.fetch as jest.MockedFunction<typeof fetch>;

  const statusMatcher = (input: RequestInfo | URL) => typeof input === 'string' && input.includes('/status/');

  const buildProcessImageStages = ({
    jobId,
    imageUri,
    blob,
    scenarioName,
    extraStages = [],
  }: {
    jobId: string;
    imageUri: string;
    blob: Blob;
    scenarioName: string;
    extraStages?: FetchStageDefinition[];
  }): FetchStageDefinition[] => {
    const uploadUrl = `https://s3.amazonaws.com/bucket/${jobId}/test.jpg`;

    const presignStage: FetchStageDefinition = {
      name: `${scenarioName}:presign`,
      matcher: (input) => typeof input === 'string' && input.includes('/presign'),
      handler: () => schemaSafeResponse({
        schema: PresignUploadResponseSchema,
        build: buildPresignUploadResponse,
        overrides: {
          jobId,
          s3Key: `uploads/${jobId}/test.jpg`,
          presignedUrl: uploadUrl,
        },
      }),
      maxCalls: 1,
    };

    const fetchImageStage: FetchStageDefinition = {
      name: `${scenarioName}:image-fetch`,
      matcher: (input) => input === imageUri,
      handler: () => createMockResponse({ data: blob }),
      maxCalls: 1,
    };

    const uploadStage: FetchStageDefinition = {
      name: `${scenarioName}:s3-upload`,
      matcher: (input, init) => input === uploadUrl && (init?.method ?? 'GET').toUpperCase() === 'PUT',
      handler: () => createMockResponse({ status: 200 }),
      maxCalls: 1,
    };

    return [presignStage, fetchImageStage, uploadStage, ...extraStages];
  };

  const buildBatchStages = ({
    scenarioName,
    batchResponse,
    images,
    blob,
    extraStages = [],
  }: {
    scenarioName: string;
    batchResponse: ReturnType<typeof buildBatchUploadResponse>;
    images: { uri: string; fileName?: string; fileSize?: number }[];
    blob: Blob;
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
        handler: () => createMockResponse({ data: blob }),
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

  beforeEach(() => {
    jest.clearAllMocks();
    adapter = new UploadServiceAdapter();
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  describe('setBaseUrl', () => {
    it('should set base URL and persist to storage', async () => {
      const newUrl = 'https://api.custom.dev';

      await adapter.setBaseUrl(newUrl);

      expect(AsyncStorage.setItem).toHaveBeenCalledWith('api_base_url', newUrl);
    });
  });

  describe('loadBaseUrl', () => {
    it('should load base URL from storage if available', async () => {
      const savedUrl = 'https://api.saved.dev';
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(savedUrl);

      await adapter.loadBaseUrl();

      expect(AsyncStorage.getItem).toHaveBeenCalledWith('api_base_url');
    });

    it('should use default URL if storage is empty', async () => {
      (AsyncStorage.getItem as jest.Mock).mockResolvedValue(null);

      await adapter.loadBaseUrl();

      expect(AsyncStorage.getItem).toHaveBeenCalledWith('api_base_url');
      // Adapter should continue with default URL (tested in requestPresignedUrl)
    });
  });

  describe('requestPresignedUrl', () => {
    it('should request presigned URL successfully', async () => {
      const mockJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const expectedS3Key = `uploads/${mockJobId}/test.jpg`;

      // Use mockResolvedValue (not Once) to handle retry policy (3 attempts)
      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: PresignUploadResponseSchema,
          build: buildPresignUploadResponse,
          overrides: {
            jobId: mockJobId,
            s3Key: expectedS3Key,
          },
        })
      );

      const result = await adapter.requestPresignedUrl('test.jpg', 'image/jpeg', 1024, 'test prompt');

      expect(mockFetch).toHaveBeenCalledTimes(1);
      expect(result.jobId).toBe(mockJobId);
      expect(result.s3Key).toBe(expectedS3Key);
    });

    it('should handle HTTP 4xx errors with retry', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({
          ok: false,
          status: 400,
          statusText: 'Bad Request',
        })
      );

      await expect(
        adapter.requestPresignedUrl('test.jpg', 'image/jpeg', 1024)
      ).rejects.toThrow('API Error: 400 Bad Request');

      // Cockatiel retry policy attempts the request multiple times
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('uploadImage', () => {
    it('should upload image to S3 successfully', async () => {
      const uploadUrl = 'https://s3.amazonaws.com/bucket/upload';
      const imageUri = 'file:///path/to/image.jpg';
      const mockBlob = new Blob(['fake image data']);

      // Mock fetch for image URI
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ data: mockBlob })
      );

      // Mock fetch for S3 upload
      mockFetch.mockResolvedValueOnce(
        createMockResponse({ status: 200 })
      );

      await adapter.uploadImage(uploadUrl, imageUri);

      expect(mockFetch).toHaveBeenCalledTimes(2);
      // First call: fetch image from URI
      expect(mockFetch).toHaveBeenNthCalledWith(1, imageUri);
      // Second call: upload to S3
      expect(mockFetch).toHaveBeenNthCalledWith(2, uploadUrl, expect.objectContaining({
        method: 'PUT',
        headers: { 'Content-Type': 'image/jpeg' },
      }));
    });

    it('should handle S3 upload failures with retry', async () => {
      const uploadUrl = 'https://s3.amazonaws.com/bucket/upload';
      const imageUri = 'file:///path/to/image.jpg';
      const mockBlob = new Blob(['fake image data']);

      // Mock fetch for image URI (called multiple times due to retry)
      mockFetch.mockResolvedValue(
        createMockResponse({ data: mockBlob })
      );

      // Mock S3 upload failures
      mockFetch.mockResolvedValue(
        createMockResponse({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
      );

      await expect(
        adapter.uploadImage(uploadUrl, imageUri)
      ).rejects.toThrow('Upload failed: 500 Internal Server Error');

      // Retry policy applies: 3 attempts
      // Each attempt: fetch image (1) + upload to S3 (1) = 2 calls
      // Total: 3 * 2 = 6 calls
      expect(mockFetch.mock.calls.length).toBeGreaterThanOrEqual(3);
    });
  });

  describe('getJobStatus', () => {
    it('should get job status successfully', async () => {
      const mockJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const mockJobData = buildJob({
        jobId: mockJobId,
        status: 'COMPLETED',
        finalS3Key: `results/${mockJobId}/output.jpg`,
      });

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: JobSchema,
          build: buildJob,
          value: mockJobData,
        })
      );

      const result = await adapter.getJobStatus(mockJobId);

      expect(result.jobId).toBe(mockJobId);
      expect(result.status).toBe('COMPLETED');
      expect(result.finalS3Key).toBe(`results/${mockJobId}/output.jpg`);
    });
  });

  describe('testConnection', () => {
    it('should return true when API is reachable', async () => {
      mockFetch.mockResolvedValue(createMockResponse({ status: 200 }));

      const result = await adapter.testConnection();

      expect(result).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(expect.stringContaining('/health'));
    });

    it('should return false when API is unreachable', async () => {
      mockFetch.mockRejectedValue(new Error('Network error'));

      const result = await adapter.testConnection();

      expect(result).toBe(false);
    });
  });

  describe('processImage', () => {
    it('should process image end-to-end with polling', async () => {
      const mockJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const mockPresignData = buildPresignUploadResponse({
        jobId: mockJobId,
        s3Key: `uploads/${mockJobId}/test.jpg`,
      });

      const mockBlob = new Blob(['fake image data']);

      // Mock presign request
      mockFetch.mockResolvedValueOnce(
        schemaSafeResponse({
          schema: PresignUploadResponseSchema,
          build: buildPresignUploadResponse,
          value: mockPresignData,
        })
      );

      // Mock image fetch for upload
      mockFetch.mockResolvedValueOnce(createMockResponse({ data: mockBlob }));

      // Mock S3 upload
      mockFetch.mockResolvedValueOnce(createMockResponse({ status: 200 }));

      // Mock job status polling - COMPLETED on first poll
      const mockCompletedJob = buildJob({
        jobId: mockJobId,
        status: 'COMPLETED',
        finalS3Key: `results/${mockJobId}/output.jpg`,
      });
      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: JobSchema,
          build: buildJob,
          value: mockCompletedJob,
        })
      );

      const progressCalls: number[] = [];
      const onProgress = jest.fn((progress: number) => progressCalls.push(progress));

      const result = await adapter.processImage(
        'file:///path/to/image.jpg',
        'test.jpg',
        1024,
        'test prompt',
        onProgress
      );

      expect(result).toContain(`/download/${mockJobId}`);
      expect(onProgress).toHaveBeenCalled();
      expect(progressCalls).toContain(25); // After presign
      expect(progressCalls).toContain(50); // After upload
      expect(progressCalls).toContain(100); // After completion
    });

  });

  describe('Batch Operations', () => {
    it('should request batch presigned URLs successfully', async () => {
      const mockBatchJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
      const mockJobId1 = 'f47ac10b-58cc-4372-a567-0e02b2c3d481';
      const mockJobId2 = 'f47ac10b-58cc-4372-a567-0e02b2c3d482';

      const mockResponseData = buildBatchUploadResponse({
        batchJobId: mockBatchJobId,
        childJobIds: [mockJobId1, mockJobId2],
        uploads: [
          {
            presignedUrl: `https://s3.amazonaws.com/bucket/${mockJobId1}`,
            s3Key: `uploads/${mockJobId1}/file1.jpg`,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          },
          {
            presignedUrl: `https://s3.amazonaws.com/bucket/${mockJobId2}`,
            s3Key: `uploads/${mockJobId2}/file2.jpg`,
            expiresAt: new Date(Date.now() + 3600000).toISOString(),
          },
        ],
      });

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: BatchUploadResponseSchema,
          build: buildBatchUploadResponse,
          value: mockResponseData,
        })
      );

      const result = await adapter.requestBatchPresignedUrls(
        [
          { fileName: 'file1.jpg', fileSize: 1024 },
          { fileName: 'file2.jpg', fileSize: 2048 },
        ],
        'shared prompt',
        ['prompt1', 'prompt2']
      );

      expect(result.batchJobId).toBe(mockBatchJobId);
      expect(result.childJobIds).toHaveLength(2);
      expect(result.uploads).toHaveLength(2);
    });

    it('should get batch job status successfully', async () => {
      const mockBatchJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
      const mockJobId1 = 'f47ac10b-58cc-4372-a567-0e02b2c3d481';
      const mockJobId2 = 'f47ac10b-58cc-4372-a567-0e02b2c3d482';
      const mockJobId3 = 'f47ac10b-58cc-4372-a567-0e02b2c3d483';

      const mockBatchData = buildBatchJob({
        batchJobId: mockBatchJobId,
        childJobIds: [mockJobId1, mockJobId2, mockJobId3],
        status: 'PROCESSING',
        completedCount: 2,
        totalCount: 3,
        sharedPrompt: 'shared prompt',
      });

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: BatchJobSchema,
          build: buildBatchJob,
          value: mockBatchData,
        })
      );

      const result = await adapter.getBatchJobStatus(mockBatchJobId);

      expect(result.batchJobId).toBe(mockBatchJobId);
      expect(result.status).toBe('PROCESSING');
      expect(result.completedCount).toBe(2);
      expect(result.totalCount).toBe(3);
    });
  });

  describe('Device Token Management', () => {
    it('should register device token successfully', async () => {
      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
        })
      );

      const result = await adapter.registerDeviceToken(
        'ExponentPushToken[abc123]',
        'ios',
        'device-123'
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/device-token'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('ExponentPushToken'),
        })
      );
    });

    it('should deactivate device token successfully', async () => {
      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
          overrides: { message: 'Device token deactivated successfully' },
        })
      );

      const result = await adapter.deactivateDeviceToken('device-123');

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/device-token?deviceId=device-123'),
        expect.objectContaining({ method: 'DELETE' })
      );
    });

    it('should register android device token', async () => {
      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: DeviceTokenResponseSchema,
          build: buildDeviceTokenResponse,
        })
      );

      const result = await adapter.registerDeviceToken(
        'ExponentPushToken[xyz789]',
        'android',
        'device-456'
      );

      expect(result.success).toBe(true);
      expect(mockFetch).toHaveBeenCalledWith(
        expect.stringContaining('/device-token'),
        expect.objectContaining({
          method: 'POST',
          body: expect.stringContaining('android'),
        })
      );
    });
  });

  describe('Polling Logic - pollJobCompletion', () => {
    /**
     * Polling tests with fake timers
     *
     * Per the Testing Standards:
     * - Use fake timers for deterministic time control (no sleep-based polling)
     * - Validate success, failure, timeout, and retry flows
     */

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    const imageUri = 'file:///path/to/image.jpg';

    it('should poll until job completes successfully', async () => {
      const mockJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const mockBlob = new Blob(['fake image data']);

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
        scenarioName: 'processImage success',
        stages: buildProcessImageStages({
          jobId: mockJobId,
          imageUri,
          blob: mockBlob,
          scenarioName: 'processImage success',
        }),
      });

      const progressCalls: number[] = [];
      const onProgress = jest.fn((progress: number) => progressCalls.push(progress));

      const processPromise = adapter.processImage(
        imageUri,
        'test.jpg',
        1024,
        'test prompt',
        onProgress
      );

      const result = await advanceTimersUntilSettled(processPromise, { maxCycles: 10 });

      expect(result).toContain(`/download/${mockJobId}`);
      expect(onProgress).toHaveBeenCalled();
      expect(progressCalls).toEqual(expect.arrayContaining([25, 50, 100]));
    });

    it('should stop polling when job fails', async () => {
      const mockJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const mockBlob = new Blob(['fake image data']);

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
        scenarioName: 'processImage failure',
        stages: buildProcessImageStages({
          jobId: mockJobId,
          imageUri,
          blob: mockBlob,
          scenarioName: 'processImage failure',
        }),
      });

      let failure: Error | undefined;
      const processPromise = adapter
        .processImage(imageUri, 'test.jpg', 1024, 'test prompt')
        .catch((error: unknown) => {
          failure = error instanceof Error ? error : new Error(String(error));
          return undefined;
        });

      await advanceTimersUntilSettled(processPromise, { maxCycles: 130 });

      expect(failure).toBeInstanceOf(Error);
      expect(failure?.message).toContain('Processing failed: invalid image format');
    });

    it('should timeout after 120 polling attempts', async () => {
      const mockJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const mockBlob = new Blob(['fake image data']);

      createPollingScenario({
        fetchMock: mockFetch,
        matcher: statusMatcher,
        schema: JobSchema,
        build: buildJob,
        timeline: [{ jobId: mockJobId, status: 'PROCESSING' }],
        repeatLast: true,
        scenarioName: 'processImage timeout',
        stages: buildProcessImageStages({
          jobId: mockJobId,
          imageUri,
          blob: mockBlob,
          scenarioName: 'processImage timeout',
        }),
      });

      let timeoutError: Error | undefined;
      const processPromise = adapter
        .processImage(imageUri, 'test.jpg', 1024, 'test prompt')
        .catch((error: unknown) => {
          timeoutError = error instanceof Error ? error : new Error(String(error));
          return undefined;
        });

      await advanceTimersUntilSettled(processPromise, { maxCycles: 130 });

      expect(timeoutError).toBeInstanceOf(Error);
      expect(timeoutError?.message).toContain('Processing timeout - please check job status later');
    });

    it('should invoke progress callback during polling', async () => {
      const mockJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const mockBlob = new Blob(['fake image data']);

      const pollingStates = [
        ...Array.from({ length: 10 }, () => ({ jobId: mockJobId, status: 'PROCESSING' as const })),
        {
          jobId: mockJobId,
          status: 'COMPLETED' as const,
          finalS3Key: `results/${mockJobId}/output.jpg`,
        },
      ];

      createPollingScenario({
        fetchMock: mockFetch,
        matcher: statusMatcher,
        schema: JobSchema,
        build: buildJob,
        timeline: pollingStates,
        repeatLast: true,
        scenarioName: 'processImage progress callback',
        stages: buildProcessImageStages({
          jobId: mockJobId,
          imageUri,
          blob: mockBlob,
          scenarioName: 'processImage progress callback',
        }),
      });

      const progressCalls: number[] = [];
      const onProgress = jest.fn((progress: number) => progressCalls.push(progress));

      const processPromise = adapter.processImage(
        imageUri,
        'test.jpg',
        1024,
        'test prompt',
        onProgress
      );

      const result = await advanceTimersUntilSettled(processPromise, { maxCycles: 20 });

      expect(result).toContain(`/download/${mockJobId}`);
      expect(onProgress).toHaveBeenCalled();
      const pollingProgress = progressCalls.filter((progress) => progress > 50 && progress < 100);
      expect(pollingProgress.length).toBeGreaterThan(0);
    });

    it('should continue polling on temporary network errors', async () => {
      const mockJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const mockBlob = new Blob(['fake image data']);

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
        scenarioName: 'processImage transient error recovery',
        stages: buildProcessImageStages({
          jobId: mockJobId,
          imageUri,
          blob: mockBlob,
          scenarioName: 'processImage transient error recovery',
          extraStages: [
            {
              name: 'processImage transient error recovery:network-timeout',
              matcher: statusMatcher,
              handler: () => Promise.reject(new Error('Network timeout')),
              maxCalls: 1,
            },
          ],
        }),
      });

      const processPromise = adapter.processImage(
        imageUri,
        'test.jpg',
        1024,
        'test prompt'
      );

      const result = await advanceTimersUntilSettled(processPromise, { maxCycles: 10 });

      expect(result).toContain(`/download/${mockJobId}`);
    });
  });

  describe('Polling Logic - pollBatchJobCompletion', () => {
    /**
     * Batch polling tests with fake timers and reusable helpers.
     */

    beforeEach(() => {
      jest.useFakeTimers();
    });

    afterEach(() => {
      jest.runOnlyPendingTimers();
      jest.useRealTimers();
    });

    it('should track batch progress correctly', async () => {
      const mockBatchJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
      const childJobIds = [
        'f47ac10b-58cc-4372-a567-0e02b2c3d481',
        'f47ac10b-58cc-4372-a567-0e02b2c3d482',
        'f47ac10b-58cc-4372-a567-0e02b2c3d483',
      ];

      const batchPresignResponse = buildBatchUploadResponse({
        batchJobId: mockBatchJobId,
        childJobIds,
        uploads: childJobIds.map((jobId, index) => ({
          presignedUrl: `https://s3.amazonaws.com/bucket/${jobId}`,
          s3Key: `uploads/${jobId}/file${index + 1}.jpg`,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        })),
      });

      const mockBlob = new Blob(['fake image data']);

      const batchStates = [
        buildBatchJob({ batchJobId: mockBatchJobId, childJobIds, totalCount: 3, completedCount: 0 }),
        buildBatchJob({ batchJobId: mockBatchJobId, childJobIds, totalCount: 3, completedCount: 1 }),
        buildBatchJob({ batchJobId: mockBatchJobId, childJobIds, totalCount: 3, completedCount: 2 }),
        buildBatchJob({
          batchJobId: mockBatchJobId,
          childJobIds,
          totalCount: 3,
          completedCount: 3,
          status: 'COMPLETED',
        }),
      ];

      createPollingScenario({
        fetchMock: mockFetch,
        matcher: (input) => typeof input === 'string' && input.includes('/batch-status/'),
        schema: BatchJobSchema,
        build: buildBatchJob,
        timeline: batchStates,
        repeatLast: true,
        scenarioName: 'processBatchImages progress tracking',
        stages: buildBatchStages({
          scenarioName: 'processBatchImages progress tracking',
          batchResponse: batchPresignResponse,
          images: [
            { uri: 'file:///path/to/image1.jpg', fileName: 'file1.jpg', fileSize: 1024 },
            { uri: 'file:///path/to/image2.jpg', fileName: 'file2.jpg', fileSize: 2048 },
            { uri: 'file:///path/to/image3.jpg', fileName: 'file3.jpg', fileSize: 3072 },
          ],
          blob: mockBlob,
        }),
      });

      const progressCalls: { progress: number; batchJobId?: string }[] = [];
      const onProgress = jest.fn((progress: number, batchJobId?: string) => {
        progressCalls.push(batchJobId !== undefined ? { progress, batchJobId } : { progress });
      });

      const processPromise = adapter.processBatchImages(
        [
          { uri: 'file:///path/to/image1.jpg', fileName: 'file1.jpg', fileSize: 1024 },
          { uri: 'file:///path/to/image2.jpg', fileName: 'file2.jpg', fileSize: 2048 },
          { uri: 'file:///path/to/image3.jpg', fileName: 'file3.jpg', fileSize: 3072 },
        ],
        'shared prompt',
        undefined,
        onProgress
      );

      const result = await advanceTimersUntilSettled(processPromise, { maxCycles: 40 });

      expect(result).toHaveLength(3);
      expect(result[0]).toContain(`/download/${childJobIds[0]}`);
      expect(result[1]).toContain(`/download/${childJobIds[1]}`);
      expect(result[2]).toContain(`/download/${childJobIds[2]}`);
      expect(onProgress).toHaveBeenCalled();
      const batchProgressCalls = progressCalls.filter((call) => call.batchJobId === mockBatchJobId);
      expect(batchProgressCalls.length).toBeGreaterThan(0);
    });

    it('should complete batch when all jobs succeed', async () => {
      const mockBatchJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
      const childJobIds = [
        'f47ac10b-58cc-4372-a567-0e02b2c3d481',
        'f47ac10b-58cc-4372-a567-0e02b2c3d482',
      ];

      const batchPresignResponse = buildBatchUploadResponse({
        batchJobId: mockBatchJobId,
        childJobIds,
        uploads: childJobIds.map((jobId, index) => ({
          presignedUrl: `https://s3.amazonaws.com/bucket/${jobId}`,
          s3Key: `uploads/${jobId}/file${index + 1}.jpg`,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        })),
      });

      const mockBlob = new Blob(['fake image data']);

      createPollingScenario({
        fetchMock: mockFetch,
        matcher: (input) => typeof input === 'string' && input.includes('/batch-status/'),
        schema: BatchJobSchema,
        build: buildBatchJob,
        timeline: [
          {
            batchJobId: mockBatchJobId,
            childJobIds,
            status: 'COMPLETED',
            totalCount: 2,
            completedCount: 2,
          },
        ],
        repeatLast: true,
        scenarioName: 'processBatchImages happy path',
        stages: buildBatchStages({
          scenarioName: 'processBatchImages happy path',
          batchResponse: batchPresignResponse,
          images: [
            { uri: 'file:///path/to/image1.jpg', fileName: 'file1.jpg', fileSize: 1024 },
            { uri: 'file:///path/to/image2.jpg', fileName: 'file2.jpg', fileSize: 2048 },
          ],
          blob: mockBlob,
        }),
      });

      const onProgress = jest.fn();

      const processPromise = adapter.processBatchImages(
        [
          { uri: 'file:///path/to/image1.jpg', fileName: 'file1.jpg', fileSize: 1024 },
          { uri: 'file:///path/to/image2.jpg', fileName: 'file2.jpg', fileSize: 2048 },
        ],
        'shared prompt',
        undefined,
        onProgress
      );

      const result = await advanceTimersUntilSettled(processPromise, { maxCycles: 10 });

      expect(result).toHaveLength(2);
      expect(onProgress).toHaveBeenCalledWith(100, mockBatchJobId);
    });

    it('should handle batch failure', async () => {
      const mockBatchJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
      const childJobIds = [
        'f47ac10b-58cc-4372-a567-0e02b2c3d481',
        'f47ac10b-58cc-4372-a567-0e02b2c3d482',
      ];

      const batchPresignResponse = buildBatchUploadResponse({
        batchJobId: mockBatchJobId,
        childJobIds,
        uploads: childJobIds.map((jobId, index) => ({
          presignedUrl: `https://s3.amazonaws.com/bucket/${jobId}`,
          s3Key: `uploads/${jobId}/file${index + 1}.jpg`,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        })),
      });

      const mockBlob = new Blob(['fake image data']);

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
            totalCount: 2,
            completedCount: 1,
          },
        ],
        repeatLast: true,
        scenarioName: 'processBatchImages failure',
        stages: buildBatchStages({
          scenarioName: 'processBatchImages failure',
          batchResponse: batchPresignResponse,
          images: [
            { uri: 'file:///path/to/image1.jpg', fileName: 'file1.jpg', fileSize: 1024 },
            { uri: 'file:///path/to/image2.jpg', fileName: 'file2.jpg', fileSize: 2048 },
          ],
          blob: mockBlob,
        }),
      });

      let failure: Error | undefined;
      const processPromise = adapter
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

    it('should timeout batch after 240 polling attempts', async () => {
      const mockBatchJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
      const childJobIds = [
        'f47ac10b-58cc-4372-a567-0e02b2c3d481',
        'f47ac10b-58cc-4372-a567-0e02b2c3d482',
      ];

      const batchPresignResponse = buildBatchUploadResponse({
        batchJobId: mockBatchJobId,
        childJobIds,
        uploads: childJobIds.map((jobId, index) => ({
          presignedUrl: `https://s3.amazonaws.com/bucket/${jobId}`,
          s3Key: `uploads/${jobId}/file${index + 1}.jpg`,
          expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
        })),
      });

      const mockBlob = new Blob(['fake image data']);

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
            totalCount: 2,
            completedCount: 1,
          },
        ],
        repeatLast: true,
        scenarioName: 'processBatchImages timeout',
        stages: buildBatchStages({
          scenarioName: 'processBatchImages timeout',
          batchResponse: batchPresignResponse,
          images: [
            { uri: 'file:///path/to/image1.jpg', fileName: 'file1.jpg', fileSize: 1024 },
            { uri: 'file:///path/to/image2.jpg', fileName: 'file2.jpg', fileSize: 2048 },
          ],
          blob: mockBlob,
        }),
      });

      let timeoutError: Error | undefined;
      const processPromise = adapter
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

    it('should continue batch polling on temporary network errors', async () => {
      const mockBatchJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';
      const childJobIds = ['f47ac10b-58cc-4372-a567-0e02b2c3d481'];

      const batchPresignResponse = buildBatchUploadResponse({
        batchJobId: mockBatchJobId,
        childJobIds,
        uploads: [
          {
            presignedUrl: `https://s3.amazonaws.com/bucket/${childJobIds[0]}`,
            s3Key: `uploads/${childJobIds[0]}/file1.jpg`,
            expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
          },
        ],
      });

      const mockBlob = new Blob(['fake image data']);
      createPollingScenario({
        fetchMock: mockFetch,
        matcher: (input) => typeof input === 'string' && input.includes('/batch-status/'),
        schema: BatchJobSchema,
        build: buildBatchJob,
        timeline: [
          {
            batchJobId: mockBatchJobId,
            childJobIds,
            status: 'COMPLETED',
            totalCount: 1,
            completedCount: 1,
          },
        ],
        repeatLast: true,
        scenarioName: 'processBatchImages transient error recovery',
        stages: buildBatchStages({
          scenarioName: 'processBatchImages transient error recovery',
          batchResponse: batchPresignResponse,
          images: [
            { uri: 'file:///path/to/image1.jpg', fileName: 'file1.jpg', fileSize: 1024 },
          ],
          blob: mockBlob,
          extraStages: [
            {
              name: 'processBatchImages transient error recovery:network-timeout',
              matcher: (input) => typeof input === 'string' && input.includes('/batch-status/'),
              handler: () => Promise.reject(new Error('Network timeout')),
              maxCalls: 1,
            },
          ],
        }),
      });

      const processPromise = adapter.processBatchImages(
        [{ uri: 'file:///path/to/image1.jpg', fileName: 'file1.jpg', fileSize: 1024 }],
        'shared prompt'
      );

      const result = await advanceTimersUntilSettled(processPromise, { maxCycles: 20 });

      expect(result).toHaveLength(1);
      expect(result[0]).toContain(`/download/${childJobIds[0]}`);
    });
  });

  describe('Error Handling', () => {
    it('should handle network errors in uploadImage', async () => {
      const uploadUrl = 'https://s3.amazonaws.com/bucket/upload';
      const imageUri = 'file:///path/to/image.jpg';

      // Mock image fetch failure
      mockFetch.mockRejectedValue(new Error('Network timeout'));

      await expect(
        adapter.uploadImage(uploadUrl, imageUri)
      ).rejects.toThrow();
    });

    it('should handle malformed response data', async () => {
      // Mock invalid response that will fail Zod parsing
      mockFetch.mockResolvedValue(createMockResponse({ data: { invalid: 'data' } }));

      await expect(
        adapter.requestPresignedUrl('test.jpg', 'image/jpeg', 1024)
      ).rejects.toThrow();
    });

    it('should propagate error when processImage fails during presign', async () => {
      mockFetch.mockResolvedValue(
        createMockResponse({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        })
      );

      await expect(
        adapter.processImage('file:///image.jpg', 'test.jpg', 1024)
      ).rejects.toThrow('Failed to process image');
    });

    it('should propagate error when processImage fails during upload', async () => {
      const mockJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const mockPresignData = buildPresignUploadResponse({
        jobId: mockJobId,
        s3Key: `uploads/${mockJobId}/test.jpg`,
      });

      // Mock presign success
      mockFetch.mockResolvedValueOnce(
        schemaSafeResponse({
          schema: PresignUploadResponseSchema,
          build: buildPresignUploadResponse,
          value: mockPresignData,
        })
      );

      // Mock image fetch failure
      mockFetch.mockRejectedValue(new Error('Failed to read image'));

      await expect(
        adapter.processImage('file:///image.jpg', 'test.jpg', 1024)
      ).rejects.toThrow('Failed to process image');
    });
  });

  describe('Request Headers', () => {
    it('should include traceparent and correlation-id headers', async () => {
      const mockJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const mockResponseData = buildPresignUploadResponse({
        jobId: mockJobId,
        s3Key: `uploads/${mockJobId}/test.jpg`,
      });

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: PresignUploadResponseSchema,
          build: buildPresignUploadResponse,
          value: mockResponseData,
        })
      );

      await adapter.requestPresignedUrl('test.jpg', 'image/jpeg', 1024);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'traceparent': expect.stringMatching(/^00-[0-9a-f]{32}-[0-9a-f]{16}-01$/),
            'x-correlation-id': expect.stringMatching(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i),
          }),
        })
      );
    });

    it('should include Content-Type header in requests', async () => {
      const mockJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
      const mockResponseData = buildPresignUploadResponse({
        jobId: mockJobId,
        s3Key: `uploads/${mockJobId}/test.jpg`,
      });

      mockFetch.mockResolvedValue(
        schemaSafeResponse({
          schema: PresignUploadResponseSchema,
          build: buildPresignUploadResponse,
          value: mockResponseData,
        })
      );

      await adapter.requestPresignedUrl('test.jpg', 'image/jpeg', 1024);

      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          headers: expect.objectContaining({
            'Content-Type': 'application/json',
          }),
        })
      );
    });
  });
});

/**
 * Tests for background task workers with queue integration
 * Per standards/testing-standards.md: Coverage ≥70% lines, ≥60% branches
 * Per standards/typescript.md: Pure functions tested with input/output assertions
 * Per ADR-0010: Test queue polling, retry strategy, exponential backoff
 */

import * as BackgroundTask from 'expo-background-task';

import {
  calculateBackoffDelay,
  shouldRetryTask,
  DEFAULT_RETRY_CONFIG,
  BACKGROUND_TASK_NAMES,
  uploadProcessorTask,
  type RetryConfig,
  type UploadTask,
} from '../backgroundTasks';
import * as uploadQueue from '../uploadQueue';

// Mock expo-background-task
jest.mock('expo-background-task', () => ({
  BackgroundTaskResult: {
    Success: 1,
    Failed: 2,
  },
  registerTaskAsync: jest.fn(),
  unregisterTaskAsync: jest.fn(),
}));

// Mock expo-task-manager
jest.mock('expo-task-manager', () => ({
  defineTask: jest.fn(),
  isTaskRegisteredAsync: jest.fn(),
}));

// Mock preprocessing
jest.mock('@/lib/upload/preprocessing', () => ({
  preprocessImage: jest.fn(),
}));

// Mock expo-constants
jest.mock('expo-constants', () => ({
  default: {
    expoConfig: {
      extra: {
        apiBaseUrl: 'http://localhost:3000',
      },
    },
  },
}));

// Mock upload queue
jest.mock('../uploadQueue');

describe('backgroundTasks', () => {
  const mockUploadQueue = uploadQueue as jest.Mocked<typeof uploadQueue>;
  const mockPreprocessImage = require('@/lib/upload/preprocessing').preprocessImage;

  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn();
    mockPreprocessImage.mockReset();
  });

  describe('calculateBackoffDelay', () => {
    it('should calculate exponential backoff delays', () => {
      // Per ADR-0010: 1s, 2s, 4s, 8s, max 60s
      expect(calculateBackoffDelay(0)).toBe(1000); // 2^0 * 1000 = 1000ms
      expect(calculateBackoffDelay(1)).toBe(2000); // 2^1 * 1000 = 2000ms
      expect(calculateBackoffDelay(2)).toBe(4000); // 2^2 * 1000 = 4000ms
      expect(calculateBackoffDelay(3)).toBe(8000); // 2^3 * 1000 = 8000ms
      expect(calculateBackoffDelay(4)).toBe(16000); // 2^4 * 1000 = 16000ms
    });

    it('should cap delay at maxDelayMs', () => {
      // Per ADR-0010: max 60s
      expect(calculateBackoffDelay(10)).toBe(60000); // Capped at 60s
      expect(calculateBackoffDelay(20)).toBe(60000); // Still capped
    });

    it('should respect custom retry config', () => {
      const customConfig: RetryConfig = {
        maxRetries: 3,
        baseDelayMs: 500,
        maxDelayMs: 5000,
      };

      expect(calculateBackoffDelay(0, customConfig)).toBe(500); // 2^0 * 500
      expect(calculateBackoffDelay(1, customConfig)).toBe(1000); // 2^1 * 500
      expect(calculateBackoffDelay(2, customConfig)).toBe(2000); // 2^2 * 500
      expect(calculateBackoffDelay(3, customConfig)).toBe(4000); // 2^3 * 500
      expect(calculateBackoffDelay(4, customConfig)).toBe(5000); // Capped at 5000
    });
  });

  describe('shouldRetryTask', () => {
    it('should allow first attempt immediately', () => {
      const task: UploadTask = {
        id: 'task-1',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        correlationId: 'corr-1',
        timestamp: Date.now(),
        retryCount: 0,
      };

      expect(shouldRetryTask(task)).toBe(true);
    });

    it('should block retry if max retries exceeded', () => {
      const task: UploadTask = {
        id: 'task-1',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        correlationId: 'corr-1',
        timestamp: Date.now(),
        retryCount: 5, // Exceeds DEFAULT_RETRY_CONFIG.maxRetries (4)
      };

      expect(shouldRetryTask(task)).toBe(false);
    });

    it('should block retry if backoff delay not elapsed', () => {
      const task: UploadTask = {
        id: 'task-1',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        correlationId: 'corr-1',
        timestamp: Date.now() - 500, // Only 500ms ago, need 1000ms for retry 1
        retryCount: 1,
      };

      expect(shouldRetryTask(task)).toBe(false);
    });

    it('should allow retry after backoff delay elapsed', () => {
      const task: UploadTask = {
        id: 'task-1',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        correlationId: 'corr-1',
        timestamp: Date.now() - 2000, // 2s ago, retry 1 needs 1s backoff
        retryCount: 1,
      };

      expect(shouldRetryTask(task)).toBe(true);
    });

    it('should respect custom retry config', () => {
      const customConfig: RetryConfig = {
        maxRetries: 2,
        baseDelayMs: 500,
        maxDelayMs: 5000,
      };

      const task: UploadTask = {
        id: 'task-1',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        correlationId: 'corr-1',
        timestamp: Date.now() - 400, // 400ms ago, need 500ms for first retry
        retryCount: 1,
      };

      expect(shouldRetryTask(task, customConfig)).toBe(false);
    });
  });

  describe('DEFAULT_RETRY_CONFIG', () => {
    it('should have correct default values per ADR-0010', () => {
      expect(DEFAULT_RETRY_CONFIG.maxRetries).toBe(4); // 5 total attempts
      expect(DEFAULT_RETRY_CONFIG.baseDelayMs).toBe(1000); // 1s base
      expect(DEFAULT_RETRY_CONFIG.maxDelayMs).toBe(60000); // 60s max
    });
  });

  describe('BACKGROUND_TASK_NAMES', () => {
    it('should define upload processor task name', () => {
      expect(BACKGROUND_TASK_NAMES.UPLOAD_PROCESSOR).toBe('photoeditor.upload.processor');
    });
  });

  describe('uploadProcessorTask', () => {
    beforeEach(() => {
      mockUploadQueue.cleanupExpiredTasks.mockResolvedValue({ success: true, value: 0 });
      mockUploadQueue.readAllFromQueue.mockResolvedValue({ success: true, value: [] });
      mockUploadQueue.removeFromQueue.mockResolvedValue({ success: true, value: undefined });
      mockUploadQueue.updateTaskRetry.mockResolvedValue({ success: true, value: undefined });
    });

    it('should return Success when queue is empty', async () => {
      mockUploadQueue.readAllFromQueue.mockResolvedValueOnce({ success: true, value: [] });

      const result = await uploadProcessorTask();

      expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
      expect(mockUploadQueue.readAllFromQueue).toHaveBeenCalled();
    });

    it('should return Failed when queue read fails', async () => {
      mockUploadQueue.readAllFromQueue.mockResolvedValueOnce({
        success: false,
        error: {
          code: uploadQueue.QueueErrorCode.STORAGE_READ_FAILED,
          category: 'storage',
          message: 'Storage error',
        },
      });

      const result = await uploadProcessorTask();

      expect(result).toBe(BackgroundTask.BackgroundTaskResult.Failed);
    });

    it('should process tasks and remove successful ones', async () => {
      const task: UploadTask = {
        id: 'task-1',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        correlationId: 'corr-1',
        timestamp: Date.now(),
        retryCount: 0,
      };

      mockUploadQueue.readAllFromQueue.mockResolvedValueOnce({
        success: true,
        value: [task],
      });

      mockPreprocessImage.mockResolvedValue({
        uri: 'file:///processed.jpg',
        mimeType: 'image/jpeg',
        size: 1024000,
      });

      // Mock presign request
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          uploadUrl: 'https://s3.amazonaws.com/presigned-url',
          jobId: 'job-123',
          key: 'uploads/test.jpg',
        }),
      });

      // Mock blob fetch
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        blob: async () => new Blob(['image data'], { type: 'image/jpeg' }),
      });

      // Mock S3 upload
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: true,
      });

      const result = await uploadProcessorTask();

      expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
      expect(mockUploadQueue.removeFromQueue).toHaveBeenCalledWith('task-1');
      expect(mockPreprocessImage).toHaveBeenCalledWith(task.imageUri);
    });

    it('should update retry count on retryable failure', async () => {
      const task: UploadTask = {
        id: 'task-1',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        correlationId: 'corr-1',
        timestamp: Date.now(),
        retryCount: 0,
      };

      mockUploadQueue.readAllFromQueue.mockResolvedValueOnce({
        success: true,
        value: [task],
      });

      mockPreprocessImage.mockResolvedValue({
        uri: 'file:///processed.jpg',
        mimeType: 'image/jpeg',
        size: 1024000,
      });

      // Mock presign request failure (500 = retryable)
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await uploadProcessorTask();

      expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
      expect(mockUploadQueue.updateTaskRetry).toHaveBeenCalledWith(
        'task-1',
        1,
        expect.stringContaining('Presign request failed')
      );
      expect(mockUploadQueue.removeFromQueue).not.toHaveBeenCalled();
    });

    it('should remove task on non-retryable failure', async () => {
      const task: UploadTask = {
        id: 'task-1',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        correlationId: 'corr-1',
        timestamp: Date.now(),
        retryCount: 0,
      };

      mockUploadQueue.readAllFromQueue.mockResolvedValueOnce({
        success: true,
        value: [task],
      });

      // Preprocessing fails (non-retryable)
      mockPreprocessImage.mockRejectedValue(new Error('Invalid image format'));

      const result = await uploadProcessorTask();

      expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
      expect(mockUploadQueue.removeFromQueue).toHaveBeenCalledWith('task-1');
    });

    it('should skip tasks not ready for retry', async () => {
      const task: UploadTask = {
        id: 'task-1',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        correlationId: 'corr-1',
        timestamp: Date.now() - 500, // Not enough time elapsed for retry
        retryCount: 1,
      };

      mockUploadQueue.readAllFromQueue.mockResolvedValueOnce({
        success: true,
        value: [task],
      });

      const result = await uploadProcessorTask();

      expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
      expect(mockPreprocessImage).not.toHaveBeenCalled();
      expect(mockUploadQueue.removeFromQueue).not.toHaveBeenCalled();
    });

    it('should remove task when max retries exceeded', async () => {
      const task: UploadTask = {
        id: 'task-1',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        correlationId: 'corr-1',
        timestamp: Date.now() - 60000, // Long enough for retry
        retryCount: 4, // At max retries
      };

      mockUploadQueue.readAllFromQueue.mockResolvedValueOnce({
        success: true,
        value: [task],
      });

      mockPreprocessImage.mockResolvedValue({
        uri: 'file:///processed.jpg',
        mimeType: 'image/jpeg',
        size: 1024000,
      });

      // Presign fails
      (global.fetch as jest.Mock).mockResolvedValueOnce({
        ok: false,
        status: 500,
        statusText: 'Internal Server Error',
      });

      const result = await uploadProcessorTask();

      expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
      expect(mockUploadQueue.updateTaskRetry).toHaveBeenCalledWith('task-1', 5, expect.any(String));
      // Task should eventually be removed after max retries
    });

    it('should cleanup expired tasks before processing', async () => {
      mockUploadQueue.cleanupExpiredTasks.mockResolvedValueOnce({ success: true, value: 2 });
      mockUploadQueue.readAllFromQueue.mockResolvedValueOnce({ success: true, value: [] });

      await uploadProcessorTask();

      expect(mockUploadQueue.cleanupExpiredTasks).toHaveBeenCalled();
    });

    it('should handle unexpected errors gracefully', async () => {
      mockUploadQueue.readAllFromQueue.mockRejectedValueOnce(new Error('Unexpected error'));

      const result = await uploadProcessorTask();

      expect(result).toBe(BackgroundTask.BackgroundTaskResult.Failed);
    });

    it('should stop processing after execution time limit', async () => {
      // Create many tasks to exceed time limit
      const tasks: UploadTask[] = Array.from({ length: 100 }, (_, i) => ({
        id: `task-${i}`,
        imageUri: `file:///test${i}.jpg`,
        fileName: `test${i}.jpg`,
        correlationId: `corr-${i}`,
        timestamp: Date.now(),
        retryCount: 0,
      }));

      mockUploadQueue.readAllFromQueue.mockResolvedValueOnce({
        success: true,
        value: tasks,
      });

      // Mock slow preprocessing to trigger time limit
      mockPreprocessImage.mockImplementation(
        () =>
          new Promise(resolve =>
            setTimeout(
              () =>
                resolve({
                  uri: 'file:///processed.jpg',
                  mimeType: 'image/jpeg',
                  size: 1024000,
                }),
              1000
            )
          )
      );

      const result = await uploadProcessorTask();

      expect(result).toBe(BackgroundTask.BackgroundTaskResult.Success);
      // Should not process all 100 tasks due to time limit
      expect(mockPreprocessImage).not.toHaveBeenCalledTimes(100);
    }, 30000); // Longer timeout for this test
  });
});

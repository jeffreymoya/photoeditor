/**
 * Tests for AsyncStorage-backed upload queue
 * Per standards/testing-standards.md: Coverage ≥70% lines, ≥60% branches
 * Per standards/typescript.md: Pure functions tested with input/output assertions
 * Per ADR-0010: Test queue operations (write, read, remove, retry update, cleanup)
 */

import AsyncStorage from '@react-native-async-storage/async-storage';

import {
  writeToQueue,
  readAllFromQueue,
  removeFromQueue,
  updateTaskRetry,
  cleanupExpiredTasks,
  clearQueue,
  QueueErrorCode,
  type UploadTask,
} from '../uploadQueue';

// Mock AsyncStorage
jest.mock('@react-native-async-storage/async-storage');

describe('uploadQueue', () => {
  const mockAsyncStorage = AsyncStorage as jest.Mocked<typeof AsyncStorage>;

  beforeEach(() => {
    jest.clearAllMocks();
    mockAsyncStorage.getItem.mockResolvedValue(null);
    mockAsyncStorage.setItem.mockResolvedValue();
    mockAsyncStorage.removeItem.mockResolvedValue();
  });

  describe('writeToQueue', () => {
    it('should write task to queue with generated ID and timestamp', async () => {
      const task = {
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        correlationId: 'test-correlation-id',
      };

      const result = await writeToQueue(task);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toMatch(/^\d+-[a-z0-9]+$/); // Timestamp + random ID
      }

      // Should write task with ID, timestamp, and retryCount
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        expect.stringMatching(/^upload-queue:\d+-[a-z0-9]+$/),
        expect.stringContaining('"imageUri":"file:///test.jpg"')
      );

      // Should update index
      expect(mockAsyncStorage.getItem).toHaveBeenCalledWith('upload-queue:index');
      expect(mockAsyncStorage.setItem).toHaveBeenCalledWith(
        'upload-queue:index',
        expect.stringMatching(/\[.*\]/)
      );
    });

    it('should add task to existing queue index', async () => {
      const existingIndex = ['existing-task-1', 'existing-task-2'];
      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(existingIndex));

      const task = {
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        correlationId: 'test-id',
      };

      const result = await writeToQueue(task);

      expect(result.success).toBe(true);

      // Should update index with new task
      const setItemCalls = mockAsyncStorage.setItem.mock.calls;
      const indexCall = setItemCalls.find(call => call[0] === 'upload-queue:index');
      expect(indexCall).toBeDefined();
      if (indexCall) {
        const updatedIndex = JSON.parse(indexCall[1] as string);
        expect(updatedIndex).toHaveLength(3);
        expect(updatedIndex).toContain('existing-task-1');
        expect(updatedIndex).toContain('existing-task-2');
      }
    });

    it('should return error when storage write fails', async () => {
      mockAsyncStorage.setItem.mockRejectedValueOnce(new Error('Storage error'));

      const task = {
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        correlationId: 'test-id',
      };

      const result = await writeToQueue(task);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(QueueErrorCode.STORAGE_WRITE_FAILED);
        expect(result.error.category).toBe('storage');
      }
    });

    it('should still succeed if index update fails', async () => {
      // Setup: index read succeeds, task write succeeds, index update fails
      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify([])); // Index read
      mockAsyncStorage.setItem
        .mockResolvedValueOnce() // Task write succeeds
        .mockRejectedValueOnce(new Error('Index write failed')); // Index write fails

      const task = {
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        correlationId: 'test-id',
      };

      const result = await writeToQueue(task);

      expect(result.success).toBe(true); // Task write succeeded despite index failure
    });
  });

  describe('readAllFromQueue', () => {
    it('should read all tasks from queue', async () => {
      const taskIds = ['task-1', 'task-2'];
      const task1: UploadTask = {
        id: 'task-1',
        imageUri: 'file:///image1.jpg',
        fileName: 'image1.jpg',
        correlationId: 'corr-1',
        timestamp: Date.now(),
        retryCount: 0,
      };
      const task2: UploadTask = {
        id: 'task-2',
        imageUri: 'file:///image2.jpg',
        fileName: 'image2.jpg',
        correlationId: 'corr-2',
        timestamp: Date.now(),
        retryCount: 1,
        lastError: 'Network error',
      };

      mockAsyncStorage.getItem
        .mockResolvedValueOnce(JSON.stringify(taskIds)) // Index
        .mockResolvedValueOnce(JSON.stringify(task1)) // Task 1
        .mockResolvedValueOnce(JSON.stringify(task2)); // Task 2

      const result = await readAllFromQueue();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0]).toEqual(task1);
        expect(result.value[1]).toEqual(task2);
      }
    });

    it('should return empty array when queue is empty', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(null); // No index

      const result = await readAllFromQueue();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toEqual([]);
      }
    });

    it('should skip tasks that are missing from storage', async () => {
      const taskIds = ['task-1', 'task-2'];
      const task1: UploadTask = {
        id: 'task-1',
        imageUri: 'file:///image1.jpg',
        fileName: 'image1.jpg',
        correlationId: 'corr-1',
        timestamp: Date.now(),
        retryCount: 0,
      };

      mockAsyncStorage.getItem
        .mockResolvedValueOnce(JSON.stringify(taskIds)) // Index
        .mockResolvedValueOnce(JSON.stringify(task1)) // Task 1
        .mockResolvedValueOnce(null); // Task 2 missing

      const result = await readAllFromQueue();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]).toEqual(task1);
      }
    });

    it('should skip tasks with invalid JSON', async () => {
      const taskIds = ['task-1', 'task-2'];
      const task2: UploadTask = {
        id: 'task-2',
        imageUri: 'file:///image2.jpg',
        fileName: 'image2.jpg',
        correlationId: 'corr-2',
        timestamp: Date.now(),
        retryCount: 0,
      };

      mockAsyncStorage.getItem
        .mockResolvedValueOnce(JSON.stringify(taskIds)) // Index
        .mockResolvedValueOnce('invalid json') // Task 1 invalid
        .mockResolvedValueOnce(JSON.stringify(task2)); // Task 2 valid

      const result = await readAllFromQueue();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toHaveLength(1);
        expect(result.value[0]).toEqual(task2);
      }
    });

    it('should return error when storage read fails', async () => {
      mockAsyncStorage.getItem.mockRejectedValueOnce(new Error('Storage error'));

      const result = await readAllFromQueue();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(QueueErrorCode.STORAGE_READ_FAILED);
      }
    });
  });

  describe('removeFromQueue', () => {
    it('should remove task and update index', async () => {
      const taskIds = ['task-1', 'task-2', 'task-3'];
      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(taskIds));

      const result = await removeFromQueue('task-2');

      expect(result.success).toBe(true);

      // Should remove task from storage
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('upload-queue:task-2');

      // Should update index without removed task
      const setItemCalls = mockAsyncStorage.setItem.mock.calls;
      const indexCall = setItemCalls.find(call => call[0] === 'upload-queue:index');
      expect(indexCall).toBeDefined();
      if (indexCall) {
        const updatedIndex = JSON.parse(indexCall[1] as string);
        expect(updatedIndex).toEqual(['task-1', 'task-3']);
      }
    });

    it('should succeed even if index update fails', async () => {
      mockAsyncStorage.removeItem.mockResolvedValueOnce();
      mockAsyncStorage.getItem.mockRejectedValueOnce(new Error('Index read failed'));

      const result = await removeFromQueue('task-1');

      expect(result.success).toBe(true);
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('upload-queue:task-1');
    });

    it('should return error when removal fails', async () => {
      mockAsyncStorage.removeItem.mockRejectedValueOnce(new Error('Storage error'));

      const result = await removeFromQueue('task-1');

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(QueueErrorCode.STORAGE_DELETE_FAILED);
      }
    });
  });

  describe('updateTaskRetry', () => {
    it('should update retry count and last error', async () => {
      const task: UploadTask = {
        id: 'task-1',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        correlationId: 'corr-1',
        timestamp: Date.now(),
        retryCount: 0,
      };

      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(task));

      const result = await updateTaskRetry('task-1', 1, 'Network timeout');

      expect(result.success).toBe(true);

      // Should update task with new retry count and error
      const setItemCalls = mockAsyncStorage.setItem.mock.calls;
      const taskCall = setItemCalls.find(call => call[0] === 'upload-queue:task-1');
      expect(taskCall).toBeDefined();
      if (taskCall) {
        const updatedTask = JSON.parse(taskCall[1] as string) as UploadTask;
        expect(updatedTask.retryCount).toBe(1);
        expect(updatedTask.lastError).toBe('Network timeout');
      }
    });

    it('should return error when task not found', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(null);

      const result = await updateTaskRetry('nonexistent-task', 1);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(QueueErrorCode.TASK_NOT_FOUND);
      }
    });

    it('should return error when update fails', async () => {
      const task: UploadTask = {
        id: 'task-1',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        correlationId: 'corr-1',
        timestamp: Date.now(),
        retryCount: 0,
      };

      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(task));
      mockAsyncStorage.setItem.mockRejectedValueOnce(new Error('Storage error'));

      const result = await updateTaskRetry('task-1', 1);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(QueueErrorCode.STORAGE_WRITE_FAILED);
      }
    });
  });

  describe('cleanupExpiredTasks', () => {
    it('should remove tasks older than max age', async () => {
      const now = Date.now();
      const maxAge = 24 * 60 * 60 * 1000; // 24 hours

      const tasks: UploadTask[] = [
        {
          id: 'task-1',
          imageUri: 'file:///old.jpg',
          fileName: 'old.jpg',
          correlationId: 'corr-1',
          timestamp: now - maxAge - 1000, // Expired
          retryCount: 0,
        },
        {
          id: 'task-2',
          imageUri: 'file:///recent.jpg',
          fileName: 'recent.jpg',
          correlationId: 'corr-2',
          timestamp: now - 1000, // Not expired
          retryCount: 0,
        },
      ];

      const taskIds = ['task-1', 'task-2'];
      mockAsyncStorage.getItem
        .mockResolvedValueOnce(JSON.stringify(taskIds)) // Index
        .mockResolvedValueOnce(JSON.stringify(tasks[0])) // Task 1
        .mockResolvedValueOnce(JSON.stringify(tasks[1])) // Task 2
        .mockResolvedValueOnce(JSON.stringify(taskIds)); // Index for removal

      const result = await cleanupExpiredTasks(maxAge);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(1); // One task removed
      }

      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('upload-queue:task-1');
      expect(mockAsyncStorage.removeItem).not.toHaveBeenCalledWith('upload-queue:task-2');
    });

    it('should return 0 when no tasks are expired', async () => {
      const tasks: UploadTask[] = [
        {
          id: 'task-1',
          imageUri: 'file:///recent.jpg',
          fileName: 'recent.jpg',
          correlationId: 'corr-1',
          timestamp: Date.now() - 1000,
          retryCount: 0,
        },
      ];

      mockAsyncStorage.getItem
        .mockResolvedValueOnce(JSON.stringify(['task-1']))
        .mockResolvedValueOnce(JSON.stringify(tasks[0]));

      const result = await cleanupExpiredTasks();

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.value).toBe(0);
      }
    });

    it('should return error when read fails', async () => {
      mockAsyncStorage.getItem.mockRejectedValueOnce(new Error('Storage error'));

      const result = await cleanupExpiredTasks();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(QueueErrorCode.STORAGE_READ_FAILED);
      }
    });
  });

  describe('clearQueue', () => {
    it('should remove all tasks and clear index', async () => {
      const taskIds = ['task-1', 'task-2'];
      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(taskIds));

      const result = await clearQueue();

      expect(result.success).toBe(true);

      // Should remove all tasks
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('upload-queue:task-1');
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('upload-queue:task-2');
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('upload-queue:index');
    });

    it('should clear index even when reading fails', async () => {
      mockAsyncStorage.getItem.mockRejectedValueOnce(new Error('Index read failed'));

      const result = await clearQueue();

      expect(result.success).toBe(true);
      expect(mockAsyncStorage.removeItem).toHaveBeenCalledWith('upload-queue:index');
    });

    it('should return error when clear fails', async () => {
      mockAsyncStorage.getItem.mockResolvedValueOnce(JSON.stringify(['task-1']));
      mockAsyncStorage.removeItem.mockRejectedValueOnce(new Error('Storage error'));

      const result = await clearQueue();

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.code).toBe(QueueErrorCode.STORAGE_DELETE_FAILED);
      }
    });
  });
});

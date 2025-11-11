/**
 * Tests for job selectors
 * Per the Frontend Tier standard State & Logic Layer:
 * - Test selectors with state fixtures; no mocks, just input → output assertions
 * - Selectors are 100% pure (verified via fixtures)
 */

import {
  selectJobState,
  selectJobs,
  selectBatchJobs,
  selectActiveJobId,
  selectActiveBatchJobId,
  selectIsPolling,
  selectActiveJob,
  selectActiveBatchJob,
  selectJobsByStatus,
  selectCompletedJobs,
  selectFailedJobs,
  selectInProgressJobs,
  makeSelectJobById,
  makeSelectBatchJobById,
  makeSelectJobsByBatchId,
  selectBatchJobProgress,
  selectHasJobInProgress,
  selectHasBatchJobInProgress,
  selectJobStatusCounts,
  selectMostRecentJob,
  selectMostRecentBatchJob,
  selectActiveWork,
  selectActivityState,
} from '../jobSelectors';

import type { RootState } from '../../index';
import type { Job, BatchJob } from '../../slices/jobSlice';

/**
 * Mock state fixtures for testing
 * Per the TypeScript Standards: Pure functions tested with fixtures (no mocks)
 */

const mockJob1: Job = {
  id: 'job-1',
  status: 'COMPLETED',
  createdAt: '2025-11-01T10:00:00Z',
  updatedAt: '2025-11-01T10:05:00Z',
  finalS3Key: 'final/job-1.jpg',
  prompt: 'Test prompt 1',
};

const mockJob2: Job = {
  id: 'job-2',
  status: 'PROCESSING',
  createdAt: '2025-11-01T10:10:00Z',
  updatedAt: '2025-11-01T10:12:00Z',
  prompt: 'Test prompt 2',
};

const mockJob3: Job = {
  id: 'job-3',
  status: 'FAILED',
  createdAt: '2025-11-01T10:15:00Z',
  updatedAt: '2025-11-01T10:16:00Z',
  error: 'Upload failed',
  prompt: 'Test prompt 3',
};

const mockJob4: Job = {
  id: 'job-4',
  status: 'QUEUED',
  createdAt: '2025-11-01T10:20:00Z',
  updatedAt: '2025-11-01T10:20:00Z',
  batchJobId: 'batch-1',
  prompt: 'Test prompt 4',
};

const mockBatchJob1: BatchJob = {
  id: 'batch-1',
  status: 'PROCESSING',
  createdAt: '2025-11-01T10:00:00Z',
  updatedAt: '2025-11-01T10:05:00Z',
  sharedPrompt: 'Batch prompt 1',
  childJobIds: ['job-4', 'job-5'],
  completedCount: 1,
  totalCount: 2,
};

const mockBatchJob2: BatchJob = {
  id: 'batch-2',
  status: 'COMPLETED',
  createdAt: '2025-11-01T09:00:00Z',
  updatedAt: '2025-11-01T09:30:00Z',
  sharedPrompt: 'Batch prompt 2',
  childJobIds: ['job-6', 'job-7'],
  completedCount: 2,
  totalCount: 2,
};

const createMockState = (overrides?: Partial<RootState>): RootState => ({
  job: {
    jobs: [mockJob1, mockJob2, mockJob3, mockJob4],
    batchJobs: [mockBatchJob1, mockBatchJob2],
    activeJobId: 'job-2',
    activeBatchJobId: 'batch-1',
    isPolling: true,
  },
  image: {
    selectedImages: [],
    processedImages: [],
    isLoading: false,
    error: null,
  },
  settings: {
    theme: 'light' as const,
    notifications: {
      enabled: true,
      jobCompletion: true,
      dailyTips: false,
    },
    image: {
      quality: 'high' as const,
      autoSave: true,
      watermark: false,
    },
    privacy: {
      analytics: false,
      crashReports: true,
    },
    camera: {
      frameProcessorsEnabled: null,
    },
    apiEndpoint: 'http://localhost:3000',
  },
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  uploadApi: {} as any, // RTK Query state not needed for selector tests
  ...overrides,
});

describe('jobSelectors', () => {
  describe('Input Selectors', () => {
    it('selectJobState should extract job slice', () => {
      const state = createMockState();
      const result = selectJobState(state);

      expect(result).toEqual(state.job);
      expect(result.jobs).toHaveLength(4);
      expect(result.batchJobs).toHaveLength(2);
    });

    it('selectJobs should extract jobs array', () => {
      const state = createMockState();
      const result = selectJobs(state);

      expect(result).toHaveLength(4);
      expect(result[0]).toEqual(mockJob1);
    });

    it('selectBatchJobs should extract batch jobs array', () => {
      const state = createMockState();
      const result = selectBatchJobs(state);

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual(mockBatchJob1);
    });

    it('selectActiveJobId should extract active job ID', () => {
      const state = createMockState();
      const result = selectActiveJobId(state);

      expect(result).toBe('job-2');
    });

    it('selectActiveBatchJobId should extract active batch job ID', () => {
      const state = createMockState();
      const result = selectActiveBatchJobId(state);

      expect(result).toBe('batch-1');
    });

    it('selectIsPolling should extract polling state', () => {
      const state = createMockState();
      const result = selectIsPolling(state);

      expect(result).toBe(true);
    });
  });

  describe('Memoized Selectors', () => {
    describe('selectActiveJob', () => {
      it('should return active job when activeJobId is set', () => {
        const state = createMockState();
        const result = selectActiveJob(state);

        expect(result).toEqual(mockJob2);
        expect(result?.id).toBe('job-2');
      });

      it('should return undefined when activeJobId is null', () => {
        const state = createMockState({
          job: {
            ...createMockState().job,
            activeJobId: null,
          },
        });
        const result = selectActiveJob(state);

        expect(result).toBeUndefined();
      });

      it('should return undefined when job not found', () => {
        const state = createMockState({
          job: {
            ...createMockState().job,
            activeJobId: 'non-existent',
          },
        });
        const result = selectActiveJob(state);

        expect(result).toBeUndefined();
      });
    });

    describe('selectActiveBatchJob', () => {
      it('should return active batch job when activeBatchJobId is set', () => {
        const state = createMockState();
        const result = selectActiveBatchJob(state);

        expect(result).toEqual(mockBatchJob1);
        expect(result?.id).toBe('batch-1');
      });

      it('should return undefined when activeBatchJobId is null', () => {
        const state = createMockState({
          job: {
            ...createMockState().job,
            activeBatchJobId: null,
          },
        });
        const result = selectActiveBatchJob(state);

        expect(result).toBeUndefined();
      });
    });

    describe('selectJobsByStatus', () => {
      it('should filter jobs by COMPLETED status', () => {
        const state = createMockState();
        const selector = selectJobsByStatus('COMPLETED');
        const result = selector(state);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(mockJob1);
      });

      it('should filter jobs by PROCESSING status', () => {
        const state = createMockState();
        const selector = selectJobsByStatus('PROCESSING');
        const result = selector(state);

        expect(result).toHaveLength(1);
        expect(result[0]).toEqual(mockJob2);
      });

      it('should return empty array for status with no jobs', () => {
        const state = createMockState();
        const selector = selectJobsByStatus('EDITING');
        const result = selector(state);

        expect(result).toHaveLength(0);
      });
    });

    describe('selectCompletedJobs', () => {
      it('should return only completed jobs', () => {
        const state = createMockState();
        const result = selectCompletedJobs(state);

        expect(result).toHaveLength(1);
        expect(result[0].status).toBe('COMPLETED');
      });
    });

    describe('selectFailedJobs', () => {
      it('should return only failed jobs', () => {
        const state = createMockState();
        const result = selectFailedJobs(state);

        expect(result).toHaveLength(1);
        expect(result[0].status).toBe('FAILED');
        expect(result[0].error).toBe('Upload failed');
      });
    });

    describe('selectInProgressJobs', () => {
      it('should return jobs with QUEUED, PROCESSING, or EDITING status', () => {
        const state = createMockState();
        const result = selectInProgressJobs(state);

        expect(result).toHaveLength(2);
        expect(result.map(j => j.status)).toContain('PROCESSING');
        expect(result.map(j => j.status)).toContain('QUEUED');
      });
    });

    describe('makeSelectJobById', () => {
      it('should return job with matching ID', () => {
        const state = createMockState();
        const selector = makeSelectJobById('job-3');
        const result = selector(state);

        expect(result).toEqual(mockJob3);
      });

      it('should return undefined for non-existent ID', () => {
        const state = createMockState();
        const selector = makeSelectJobById('non-existent');
        const result = selector(state);

        expect(result).toBeUndefined();
      });
    });

    describe('makeSelectBatchJobById', () => {
      it('should return batch job with matching ID', () => {
        const state = createMockState();
        const selector = makeSelectBatchJobById('batch-2');
        const result = selector(state);

        expect(result).toEqual(mockBatchJob2);
      });

      it('should return undefined for non-existent ID', () => {
        const state = createMockState();
        const selector = makeSelectBatchJobById('non-existent');
        const result = selector(state);

        expect(result).toBeUndefined();
      });
    });

    describe('makeSelectJobsByBatchId', () => {
      it('should return jobs belonging to batch', () => {
        const state = createMockState();
        const selector = makeSelectJobsByBatchId('batch-1');
        const result = selector(state);

        expect(result).toHaveLength(1);
        expect(result[0].id).toBe('job-4');
      });

      it('should return empty array for batch with no jobs', () => {
        const state = createMockState();
        const selector = makeSelectJobsByBatchId('batch-999');
        const result = selector(state);

        expect(result).toHaveLength(0);
      });
    });

    describe('selectBatchJobProgress', () => {
      it('should calculate progress percentage', () => {
        const state = createMockState();
        const selector = selectBatchJobProgress('batch-1');
        const result = selector(state);

        expect(result).toBe(50); // 1/2 = 50%
      });

      it('should return 100% for completed batch', () => {
        const state = createMockState();
        const selector = selectBatchJobProgress('batch-2');
        const result = selector(state);

        expect(result).toBe(100); // 2/2 = 100%
      });

      it('should return 0 for non-existent batch', () => {
        const state = createMockState();
        const selector = selectBatchJobProgress('non-existent');
        const result = selector(state);

        expect(result).toBe(0);
      });
    });

    describe('selectHasJobInProgress', () => {
      it('should return true when jobs are in progress', () => {
        const state = createMockState();
        const result = selectHasJobInProgress(state);

        expect(result).toBe(true);
      });

      it('should return false when no jobs are in progress', () => {
        const state = createMockState({
          job: {
            ...createMockState().job,
            jobs: [mockJob1, mockJob3], // Only COMPLETED and FAILED
          },
        });
        const result = selectHasJobInProgress(state);

        expect(result).toBe(false);
      });
    });

    describe('selectHasBatchJobInProgress', () => {
      it('should return true when batch jobs are in progress', () => {
        const state = createMockState();
        const result = selectHasBatchJobInProgress(state);

        expect(result).toBe(true);
      });

      it('should return false when no batch jobs are in progress', () => {
        const state = createMockState({
          job: {
            ...createMockState().job,
            batchJobs: [mockBatchJob2], // Only COMPLETED
          },
        });
        const result = selectHasBatchJobInProgress(state);

        expect(result).toBe(false);
      });
    });

    describe('selectJobStatusCounts', () => {
      it('should count jobs by status', () => {
        const state = createMockState();
        const result = selectJobStatusCounts(state);

        expect(result).toEqual({
          COMPLETED: 1,
          PROCESSING: 1,
          FAILED: 1,
          QUEUED: 1,
        });
      });
    });

    describe('selectMostRecentJob', () => {
      it('should return job with latest createdAt timestamp', () => {
        const state = createMockState();
        const result = selectMostRecentJob(state);

        expect(result).toEqual(mockJob4); // Latest: 10:20
      });

      it('should return undefined for empty jobs array', () => {
        const state = createMockState({
          job: {
            ...createMockState().job,
            jobs: [],
          },
        });
        const result = selectMostRecentJob(state);

        expect(result).toBeUndefined();
      });
    });

    describe('selectMostRecentBatchJob', () => {
      it('should return batch job with latest createdAt timestamp', () => {
        const state = createMockState();
        const result = selectMostRecentBatchJob(state);

        expect(result).toEqual(mockBatchJob1); // Latest: 10:00 vs 09:00
      });

      it('should return undefined for empty batch jobs array', () => {
        const state = createMockState({
          job: {
            ...createMockState().job,
            batchJobs: [],
          },
        });
        const result = selectMostRecentBatchJob(state);

        expect(result).toBeUndefined();
      });
    });

    describe('selectActiveWork', () => {
      it('should return active job and batch job', () => {
        const state = createMockState();
        const result = selectActiveWork(state);

        expect(result.job).toEqual(mockJob2);
        expect(result.batchJob).toEqual(mockBatchJob1);
        expect(result.hasActiveWork).toBe(true);
      });

      it('should indicate no active work when both are null', () => {
        const state = createMockState({
          job: {
            ...createMockState().job,
            activeJobId: null,
            activeBatchJobId: null,
          },
        });
        const result = selectActiveWork(state);

        expect(result.job).toBeUndefined();
        expect(result.batchJob).toBeUndefined();
        expect(result.hasActiveWork).toBe(false);
      });
    });

    describe('selectActivityState', () => {
      it('should return overall activity state', () => {
        const state = createMockState();
        const result = selectActivityState(state);

        expect(result.hasJobInProgress).toBe(true);
        expect(result.hasBatchJobInProgress).toBe(true);
        expect(result.isPolling).toBe(true);
        expect(result.isActive).toBe(true);
      });

      it('should indicate inactive when nothing is in progress', () => {
        const state = createMockState({
          job: {
            ...createMockState().job,
            jobs: [mockJob1], // Only COMPLETED
            batchJobs: [mockBatchJob2], // Only COMPLETED
            isPolling: false,
          },
        });
        const result = selectActivityState(state);

        expect(result.hasJobInProgress).toBe(false);
        expect(result.hasBatchJobInProgress).toBe(false);
        expect(result.isPolling).toBe(false);
        expect(result.isActive).toBe(false);
      });
    });
  });

  describe('Purity Verification', () => {
    it('should produce same output for same input (referential transparency)', () => {
      const state = createMockState();

      const result1 = selectCompletedJobs(state);
      const result2 = selectCompletedJobs(state);

      expect(result1).toEqual(result2);
      expect(result1).toBe(result2); // Same reference due to memoization
    });

    it('should not mutate input state', () => {
      const state = createMockState();
      const originalJobs = [...state.job.jobs];

      selectInProgressJobs(state);

      expect(state.job.jobs).toEqual(originalJobs);
    });

    it('should memoize results (performance)', () => {
      const state = createMockState();

      const result1 = selectJobStatusCounts(state);
      const result2 = selectJobStatusCounts(state);

      // Memoization means same object reference
      expect(result1).toBe(result2);
    });
  });
});

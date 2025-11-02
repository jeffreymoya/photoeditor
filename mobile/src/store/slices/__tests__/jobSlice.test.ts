/**
 * jobSlice Reducer Tests
 *
 * Per the Testing Standards:
 * - Prefer pure unit tests with deterministic inputs/outputs
 * - Keep assertions focused on observable behaviour (inputs → outputs)
 *
 * Per the Frontend Tier standard:
 * - Redux Toolkit reducers: Write "mutating" syntax; immer makes it immutable
 * - Test reducers with: dispatch action → assert new state (no mocks)
 *
 * Coverage target: All reducer actions with edge cases
 */

import {
  jobSlice,
  addJob,
  updateJob,
  removeJob,
  setActiveJob,
  setPolling,
  clearJobs,
  addBatchJob,
  updateBatchJob,
  removeBatchJob,
  setActiveBatchJob,
  clearBatchJobs,
  clearAllJobs,
  type JobState,
  type Job,
  type BatchJob,
} from '../jobSlice';

describe('jobSlice reducer', () => {
  const initialState: JobState = {
    jobs: [],
    batchJobs: [],
    activeJobId: null,
    activeBatchJobId: null,
    isPolling: false,
  };

  const mockJob: Job = {
    id: 'job-1',
    status: 'PROCESSING',
    createdAt: '2025-11-01T10:00:00.000Z',
    updatedAt: '2025-11-01T10:00:00.000Z',
    prompt: 'Test prompt',
  };

  const mockBatchJob: BatchJob = {
    id: 'batch-1',
    status: 'PROCESSING',
    createdAt: '2025-11-01T10:00:00.000Z',
    updatedAt: '2025-11-01T10:00:00.000Z',
    sharedPrompt: 'Batch prompt',
    childJobIds: ['job-1', 'job-2'],
    completedCount: 0,
    totalCount: 2,
  };

  describe('addJob', () => {
    it('adds job to start of jobs array', () => {
      const state = jobSlice.reducer(initialState, addJob(mockJob));

      expect(state.jobs).toHaveLength(1);
      expect(state.jobs[0]).toEqual(mockJob);
    });

    it('sets activeJobId to new job id', () => {
      const state = jobSlice.reducer(initialState, addJob(mockJob));

      expect(state.activeJobId).toBe('job-1');
    });

    it('prepends new job when jobs already exist', () => {
      const existingJob: Job = {
        id: 'job-0',
        status: 'COMPLETED',
        createdAt: '2025-11-01T09:00:00.000Z',
        updatedAt: '2025-11-01T09:00:00.000Z',
      };

      const stateWithJob: JobState = {
        ...initialState,
        jobs: [existingJob],
      };

      const state = jobSlice.reducer(stateWithJob, addJob(mockJob));

      expect(state.jobs).toHaveLength(2);
      expect(state.jobs[0]).toEqual(mockJob);
      expect(state.jobs[1]).toEqual(existingJob);
    });
  });

  describe('updateJob', () => {
    it('updates existing job by id', () => {
      const stateWithJob: JobState = {
        ...initialState,
        jobs: [mockJob],
      };

      const state = jobSlice.reducer(
        stateWithJob,
        updateJob({ id: 'job-1', status: 'COMPLETED' })
      );

      expect(state.jobs[0].status).toBe('COMPLETED');
    });

    it('does not modify state when job id not found', () => {
      const stateWithJob: JobState = {
        ...initialState,
        jobs: [mockJob],
      };

      const state = jobSlice.reducer(
        stateWithJob,
        updateJob({ id: 'job-nonexistent', status: 'COMPLETED' })
      );

      expect(state.jobs).toEqual(stateWithJob.jobs);
    });

    it('merges partial updates with existing job', () => {
      const stateWithJob: JobState = {
        ...initialState,
        jobs: [mockJob],
      };

      const state = jobSlice.reducer(
        stateWithJob,
        updateJob({ id: 'job-1', finalS3Key: 's3://bucket/key', error: undefined })
      );

      expect(state.jobs[0]).toMatchObject({
        id: 'job-1',
        status: 'PROCESSING',
        prompt: 'Test prompt',
        finalS3Key: 's3://bucket/key',
      });
    });
  });

  describe('removeJob', () => {
    it('removes job from jobs array', () => {
      const stateWithJob: JobState = {
        ...initialState,
        jobs: [mockJob],
      };

      const state = jobSlice.reducer(stateWithJob, removeJob('job-1'));

      expect(state.jobs).toHaveLength(0);
    });

    it('clears activeJobId when removing active job', () => {
      const stateWithJob: JobState = {
        ...initialState,
        jobs: [mockJob],
        activeJobId: 'job-1',
      };

      const state = jobSlice.reducer(stateWithJob, removeJob('job-1'));

      expect(state.activeJobId).toBeNull();
    });

    it('does not clear activeJobId when removing different job', () => {
      const job2: Job = { ...mockJob, id: 'job-2' };
      const stateWithJobs: JobState = {
        ...initialState,
        jobs: [mockJob, job2],
        activeJobId: 'job-1',
      };

      const state = jobSlice.reducer(stateWithJobs, removeJob('job-2'));

      expect(state.activeJobId).toBe('job-1');
      expect(state.jobs).toHaveLength(1);
    });

    it('does nothing when job id not found', () => {
      const stateWithJob: JobState = {
        ...initialState,
        jobs: [mockJob],
        activeJobId: 'job-1',
      };

      const state = jobSlice.reducer(stateWithJob, removeJob('job-nonexistent'));

      expect(state.jobs).toEqual(stateWithJob.jobs);
      expect(state.activeJobId).toBe('job-1');
    });
  });

  describe('setActiveJob', () => {
    it('sets activeJobId to provided value', () => {
      const state = jobSlice.reducer(initialState, setActiveJob('job-123'));

      expect(state.activeJobId).toBe('job-123');
    });

    it('clears activeJobId when null is provided', () => {
      const stateWithActive: JobState = {
        ...initialState,
        activeJobId: 'job-1',
      };

      const state = jobSlice.reducer(stateWithActive, setActiveJob(null));

      expect(state.activeJobId).toBeNull();
    });
  });

  describe('setPolling', () => {
    it('sets isPolling to true', () => {
      const state = jobSlice.reducer(initialState, setPolling(true));

      expect(state.isPolling).toBe(true);
    });

    it('sets isPolling to false', () => {
      const statePolling: JobState = {
        ...initialState,
        isPolling: true,
      };

      const state = jobSlice.reducer(statePolling, setPolling(false));

      expect(state.isPolling).toBe(false);
    });
  });

  describe('clearJobs', () => {
    it('clears all jobs', () => {
      const stateWithJobs: JobState = {
        ...initialState,
        jobs: [mockJob],
        activeJobId: 'job-1',
        isPolling: true,
      };

      const state = jobSlice.reducer(stateWithJobs, clearJobs());

      expect(state.jobs).toHaveLength(0);
      expect(state.activeJobId).toBeNull();
      expect(state.isPolling).toBe(false);
    });

    it('does not affect batchJobs', () => {
      const stateWithBoth: JobState = {
        ...initialState,
        jobs: [mockJob],
        batchJobs: [mockBatchJob],
        activeJobId: 'job-1',
        activeBatchJobId: 'batch-1',
      };

      const state = jobSlice.reducer(stateWithBoth, clearJobs());

      expect(state.jobs).toHaveLength(0);
      expect(state.batchJobs).toHaveLength(1);
      expect(state.activeBatchJobId).toBe('batch-1');
    });
  });

  describe('addBatchJob', () => {
    it('adds batch job to start of batchJobs array', () => {
      const state = jobSlice.reducer(initialState, addBatchJob(mockBatchJob));

      expect(state.batchJobs).toHaveLength(1);
      expect(state.batchJobs[0]).toEqual(mockBatchJob);
    });

    it('sets activeBatchJobId to new batch job id', () => {
      const state = jobSlice.reducer(initialState, addBatchJob(mockBatchJob));

      expect(state.activeBatchJobId).toBe('batch-1');
    });
  });

  describe('updateBatchJob', () => {
    it('updates existing batch job by id', () => {
      const stateWithBatchJob: JobState = {
        ...initialState,
        batchJobs: [mockBatchJob],
      };

      const state = jobSlice.reducer(
        stateWithBatchJob,
        updateBatchJob({ id: 'batch-1', status: 'COMPLETED', completedCount: 2 })
      );

      expect(state.batchJobs[0].status).toBe('COMPLETED');
      expect(state.batchJobs[0].completedCount).toBe(2);
    });

    it('does not modify state when batch job id not found', () => {
      const stateWithBatchJob: JobState = {
        ...initialState,
        batchJobs: [mockBatchJob],
      };

      const state = jobSlice.reducer(
        stateWithBatchJob,
        updateBatchJob({ id: 'batch-nonexistent', status: 'COMPLETED' })
      );

      expect(state.batchJobs).toEqual(stateWithBatchJob.batchJobs);
    });
  });

  describe('removeBatchJob', () => {
    it('removes batch job from batchJobs array', () => {
      const stateWithBatchJob: JobState = {
        ...initialState,
        batchJobs: [mockBatchJob],
      };

      const state = jobSlice.reducer(stateWithBatchJob, removeBatchJob('batch-1'));

      expect(state.batchJobs).toHaveLength(0);
    });

    it('clears activeBatchJobId when removing active batch job', () => {
      const stateWithBatchJob: JobState = {
        ...initialState,
        batchJobs: [mockBatchJob],
        activeBatchJobId: 'batch-1',
      };

      const state = jobSlice.reducer(stateWithBatchJob, removeBatchJob('batch-1'));

      expect(state.activeBatchJobId).toBeNull();
    });
  });

  describe('setActiveBatchJob', () => {
    it('sets activeBatchJobId to provided value', () => {
      const state = jobSlice.reducer(initialState, setActiveBatchJob('batch-123'));

      expect(state.activeBatchJobId).toBe('batch-123');
    });

    it('clears activeBatchJobId when null is provided', () => {
      const stateWithActive: JobState = {
        ...initialState,
        activeBatchJobId: 'batch-1',
      };

      const state = jobSlice.reducer(stateWithActive, setActiveBatchJob(null));

      expect(state.activeBatchJobId).toBeNull();
    });
  });

  describe('clearBatchJobs', () => {
    it('clears all batch jobs', () => {
      const stateWithBatchJobs: JobState = {
        ...initialState,
        batchJobs: [mockBatchJob],
        activeBatchJobId: 'batch-1',
      };

      const state = jobSlice.reducer(stateWithBatchJobs, clearBatchJobs());

      expect(state.batchJobs).toHaveLength(0);
      expect(state.activeBatchJobId).toBeNull();
    });

    it('does not affect regular jobs', () => {
      const stateWithBoth: JobState = {
        ...initialState,
        jobs: [mockJob],
        batchJobs: [mockBatchJob],
        activeJobId: 'job-1',
        activeBatchJobId: 'batch-1',
      };

      const state = jobSlice.reducer(stateWithBoth, clearBatchJobs());

      expect(state.batchJobs).toHaveLength(0);
      expect(state.jobs).toHaveLength(1);
      expect(state.activeJobId).toBe('job-1');
    });
  });

  describe('clearAllJobs', () => {
    it('clears all jobs and batch jobs', () => {
      const stateWithAll: JobState = {
        ...initialState,
        jobs: [mockJob],
        batchJobs: [mockBatchJob],
        activeJobId: 'job-1',
        activeBatchJobId: 'batch-1',
        isPolling: true,
      };

      const state = jobSlice.reducer(stateWithAll, clearAllJobs());

      expect(state.jobs).toHaveLength(0);
      expect(state.batchJobs).toHaveLength(0);
      expect(state.activeJobId).toBeNull();
      expect(state.activeBatchJobId).toBeNull();
      expect(state.isPolling).toBe(false);
    });

    it('resets to initial state', () => {
      const stateWithAll: JobState = {
        jobs: [mockJob],
        batchJobs: [mockBatchJob],
        activeJobId: 'job-1',
        activeBatchJobId: 'batch-1',
        isPolling: true,
      };

      const state = jobSlice.reducer(stateWithAll, clearAllJobs());

      expect(state).toEqual(initialState);
    });
  });
});

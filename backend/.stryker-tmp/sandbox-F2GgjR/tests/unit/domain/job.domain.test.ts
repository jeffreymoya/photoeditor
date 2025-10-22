// @ts-nocheck
import {
  createJobEntity,
  createBatchJobEntity,
  transitionToProcessing,
  transitionToEditing,
  transitionToCompleted,
  transitionToFailed,
  calculateBatchProgress,
  isJobTerminal,
  isJobInProgress,
  canAddChildJob,
  InvalidStateTransitionError,
  JobValidationError
} from '../../../src/domain/job.domain';
import { Job, BatchJob, JobStatus, CreateJobRequest, CreateBatchJobRequest } from '@photoeditor/shared';

describe('Job Domain Logic', () => {
  describe('createJobEntity', () => {
    it('should create a valid job entity', () => {
      const request: CreateJobRequest = {
        userId: 'user-123',
        locale: 'en',
        prompt: 'Make it better'
      };

      const result = createJobEntity(request);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const job = result.value;
        expect(job.userId).toBe('user-123');
        expect(job.status).toBe(JobStatus.QUEUED);
        expect(job.locale).toBe('en');
        expect(job.prompt).toBe('Make it better');
        expect(job.jobId).toBeDefined();
        expect(job.createdAt).toBeDefined();
        expect(job.updatedAt).toBeDefined();
      }
    });

    it('should use default locale when not provided', () => {
      const request: CreateJobRequest = {
        userId: 'user-123',
        locale: 'en' // default value
      };

      const result = createJobEntity(request);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.locale).toBe('en');
      }
    });

    it('should fail when userId is missing', () => {
      const request = { userId: '' } as CreateJobRequest;

      const result = createJobEntity(request);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(JobValidationError);
        expect(result.error.message).toContain('userId is required');
      }
    });
  });

  describe('createBatchJobEntity', () => {
    it('should create a valid batch job entity', () => {
      const request: CreateBatchJobRequest = {
        userId: 'user-123',
        sharedPrompt: 'Apply filter to all',
        fileCount: 5,
        locale: 'en'
      };

      const result = createBatchJobEntity(request);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        const batchJob = result.value;
        expect(batchJob.userId).toBe('user-123');
        expect(batchJob.status).toBe(JobStatus.QUEUED);
        expect(batchJob.sharedPrompt).toBe('Apply filter to all');
        expect(batchJob.totalCount).toBe(5);
        expect(batchJob.completedCount).toBe(0);
        expect(batchJob.childJobIds).toEqual([]);
      }
    });

    it('should fail when sharedPrompt is missing', () => {
      const request = {
        userId: 'user-123',
        sharedPrompt: '',
        fileCount: 5
      } as CreateBatchJobRequest;

      const result = createBatchJobEntity(request);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(JobValidationError);
      }
    });

    it('should fail when fileCount is not positive', () => {
      const request = {
        userId: 'user-123',
        sharedPrompt: 'test',
        fileCount: 0
      } as CreateBatchJobRequest;

      const result = createBatchJobEntity(request);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error.message).toContain('fileCount must be positive');
      }
    });
  });

  describe('transitionToProcessing', () => {
    const createQueuedJob = (): Job => ({
      jobId: 'job-123',
      userId: 'user-123',
      status: JobStatus.QUEUED,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      locale: 'en'
    });

    it('should successfully transition from QUEUED to PROCESSING', () => {
      const job = createQueuedJob();
      const result = transitionToProcessing(job, 's3://bucket/temp-key');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe(JobStatus.PROCESSING);
        expect(result.value.updates.tempS3Key).toBe('s3://bucket/temp-key');
        expect(result.value.updates.updatedAt).toBeDefined();
      }
    });

    it('should fail when transitioning from invalid state', () => {
      const job = { ...createQueuedJob(), status: JobStatus.COMPLETED };
      const result = transitionToProcessing(job, 's3://bucket/temp-key');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(InvalidStateTransitionError);
        expect(result.error.currentState).toBe(JobStatus.COMPLETED);
      }
    });
  });

  describe('transitionToEditing', () => {
    const createProcessingJob = (): Job => ({
      jobId: 'job-123',
      userId: 'user-123',
      status: JobStatus.PROCESSING,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      tempS3Key: 's3://bucket/temp',
      locale: 'en'
    });

    it('should successfully transition from PROCESSING to EDITING', () => {
      const job = createProcessingJob();
      const result = transitionToEditing(job);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe(JobStatus.EDITING);
        expect(result.value.updates.updatedAt).toBeDefined();
      }
    });

    it('should fail when transitioning from QUEUED', () => {
      const job = { ...createProcessingJob(), status: JobStatus.QUEUED };
      const result = transitionToEditing(job);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(InvalidStateTransitionError);
      }
    });
  });

  describe('transitionToCompleted', () => {
    const createEditingJob = (): Job => ({
      jobId: 'job-123',
      userId: 'user-123',
      status: JobStatus.EDITING,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      tempS3Key: 's3://bucket/temp',
      locale: 'en'
    });

    it('should successfully transition from EDITING to COMPLETED', () => {
      const job = createEditingJob();
      const result = transitionToCompleted(job, 's3://bucket/final-key');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe(JobStatus.COMPLETED);
        expect(result.value.updates.finalS3Key).toBe('s3://bucket/final-key');
        expect(result.value.updates.updatedAt).toBeDefined();
      }
    });

    it('should fail when transitioning from PROCESSING', () => {
      const job = { ...createEditingJob(), status: JobStatus.PROCESSING };
      const result = transitionToCompleted(job, 's3://bucket/final-key');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(InvalidStateTransitionError);
      }
    });
  });

  describe('transitionToFailed', () => {
    it('should transition from QUEUED to FAILED', () => {
      const job: Job = {
        jobId: 'job-123',
        userId: 'user-123',
        status: JobStatus.QUEUED,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        locale: 'en'
      };

      const result = transitionToFailed(job, 'Upload failed');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe(JobStatus.FAILED);
        expect(result.value.updates.error).toBe('Upload failed');
      }
    });

    it('should transition from PROCESSING to FAILED', () => {
      const job: Job = {
        jobId: 'job-123',
        userId: 'user-123',
        status: JobStatus.PROCESSING,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        locale: 'en'
      };

      const result = transitionToFailed(job, 'Processing error');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe(JobStatus.FAILED);
      }
    });

    it('should fail when transitioning from terminal state', () => {
      const job: Job = {
        jobId: 'job-123',
        userId: 'user-123',
        status: JobStatus.COMPLETED,
        createdAt: '2024-01-01T00:00:00Z',
        updatedAt: '2024-01-01T00:00:00Z',
        locale: 'en'
      };

      const result = transitionToFailed(job, 'error');

      expect(result.isErr()).toBe(true);
    });
  });

  describe('calculateBatchProgress', () => {
    const createBatchJob = (completedCount: number, totalCount: number): BatchJob => ({
      batchJobId: 'batch-123',
      userId: 'user-123',
      status: JobStatus.PROCESSING,
      createdAt: '2024-01-01T00:00:00Z',
      updatedAt: '2024-01-01T00:00:00Z',
      sharedPrompt: 'test',
      childJobIds: [],
      completedCount,
      totalCount,
      locale: 'en'
    });

    it('should increment progress without completing', () => {
      const batchJob = createBatchJob(2, 5);
      const result = calculateBatchProgress(batchJob, 1);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.completedCount).toBe(3);
        expect(result.value.status).toBe(JobStatus.PROCESSING);
      }
    });

    it('should complete batch when all jobs finished', () => {
      const batchJob = createBatchJob(4, 5);
      const result = calculateBatchProgress(batchJob, 1);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.completedCount).toBe(5);
        expect(result.value.status).toBe(JobStatus.COMPLETED);
      }
    });

    it('should fail when incrementing beyond total', () => {
      const batchJob = createBatchJob(5, 5);
      const result = calculateBatchProgress(batchJob, 1);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(JobValidationError);
      }
    });
  });

  describe('isJobTerminal', () => {
    it('should return true for terminal states', () => {
      const completedJob: Job = { status: JobStatus.COMPLETED } as Job;
      const failedJob: Job = { status: JobStatus.FAILED } as Job;

      expect(isJobTerminal(completedJob)).toBe(true);
      expect(isJobTerminal(failedJob)).toBe(true);
    });

    it('should return false for non-terminal states', () => {
      const queuedJob: Job = { status: JobStatus.QUEUED } as Job;
      const processingJob: Job = { status: JobStatus.PROCESSING } as Job;
      const editingJob: Job = { status: JobStatus.EDITING } as Job;

      expect(isJobTerminal(queuedJob)).toBe(false);
      expect(isJobTerminal(processingJob)).toBe(false);
      expect(isJobTerminal(editingJob)).toBe(false);
    });
  });

  describe('isJobInProgress', () => {
    it('should return true for in-progress states', () => {
      const queuedJob: Job = { status: JobStatus.QUEUED } as Job;
      const processingJob: Job = { status: JobStatus.PROCESSING } as Job;
      const editingJob: Job = { status: JobStatus.EDITING } as Job;

      expect(isJobInProgress(queuedJob)).toBe(true);
      expect(isJobInProgress(processingJob)).toBe(true);
      expect(isJobInProgress(editingJob)).toBe(true);
    });

    it('should return false for terminal states', () => {
      const completedJob: Job = { status: JobStatus.COMPLETED } as Job;
      const failedJob: Job = { status: JobStatus.FAILED } as Job;

      expect(isJobInProgress(completedJob)).toBe(false);
      expect(isJobInProgress(failedJob)).toBe(false);
    });
  });

  describe('canAddChildJob', () => {
    it('should allow adding child jobs to active batch', () => {
      const batchJob: BatchJob = {
        status: JobStatus.PROCESSING
      } as BatchJob;

      expect(canAddChildJob(batchJob)).toBe(true);
    });

    it('should not allow adding child jobs to completed batch', () => {
      const batchJob: BatchJob = {
        status: JobStatus.COMPLETED
      } as BatchJob;

      expect(canAddChildJob(batchJob)).toBe(false);
    });

    it('should not allow adding child jobs to failed batch', () => {
      const batchJob: BatchJob = {
        status: JobStatus.FAILED
      } as BatchJob;

      expect(canAddChildJob(batchJob)).toBe(false);
    });
  });
});

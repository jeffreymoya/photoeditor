import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { ok, err } from 'neverthrow';
import { BatchJob, Job, JobStatus, JobStatusType } from '@photoeditor/shared';
import { JobService } from '../../../src/services/job.service';
import { JobNotFoundError, JobAlreadyExistsError, RepositoryError } from '../../../src/repositories/job.repository';
import { InvalidStateTransitionError, JobValidationError } from '../../../src/domain/job.domain';

const dynamoMock = mockClient(DynamoDBClient);

describe('JobService', () => {
  let jobService: JobService;

  beforeEach(() => {
    dynamoMock.reset();
    jobService = new JobService('test-jobs-table', 'us-east-1', 'test-batch-table');
  });

  describe('createJob', () => {
    it('should create job with required fields', async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const job = await jobService.createJob({
        userId: 'user-123',
        locale: 'en',
        prompt: 'Test prompt'
      });

      expect(job).toMatchObject({
        jobId: '00000000-0000-4000-8000-000000000000', // mocked UUID
        userId: 'user-123',
        status: JobStatus.QUEUED,
        prompt: 'Test prompt',
        locale: 'en'
      });

      expect(job).toHaveProperty('createdAt');
      expect(job).toHaveProperty('updatedAt');
      expect(job).toHaveProperty('expires_at');
    });

    it('should create job with optional batchJobId', async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const job = await jobService.createJob({
        userId: 'user-123',
        locale: 'en',
        batchJobId: 'batch-456'
      });

      expect(job.batchJobId).toBe('batch-456');
    });

    it('should set TTL to 90 days from now', async () => {
      // Use real timers for this test since it checks actual timestamp calculation
      jest.useRealTimers();

      dynamoMock.on(PutItemCommand).resolves({});

      const beforeTime = Math.floor(Date.now() / 1000);
      const job = await jobService.createJob({
        userId: 'user-123',
        locale: 'en'
      });
      const afterTime = Math.floor(Date.now() / 1000);

      const expectedExpirationMin = beforeTime + (90 * 24 * 60 * 60);
      const expectedExpirationMax = afterTime + (90 * 24 * 60 * 60);
      expect(job.expires_at).toBeGreaterThanOrEqual(expectedExpirationMin);
      expect(job.expires_at).toBeLessThanOrEqual(expectedExpirationMax);
    });
  });

  describe('getJob', () => {
    it('should return job when it exists', async () => {
      const mockJob = {
        jobId: 'job-123',
        userId: 'user-456',
        status: 'QUEUED',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall(mockJob)
      });

      const job = await jobService.getJob('job-123');

      expect(job).toMatchObject(mockJob);
    });

    it('should return null when job does not exist', async () => {
      dynamoMock.on(GetItemCommand).resolves({
        Item: undefined
      });

      const job = await jobService.getJob('non-existent');

      expect(job).toBeNull();
    });
  });

  describe('updateJobStatus', () => {
    it('should update status and updatedAt', async () => {
      const updatedJob = {
        jobId: 'job-123',
        status: 'PROCESSING',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedJob)
      });

      const job = await jobService.updateJobStatus('job-123', JobStatus.PROCESSING);

      expect(job).toMatchObject({
        jobId: 'job-123',
        status: 'PROCESSING'
      });
    });

    it('should update with tempS3Key', async () => {
      const updatedJob = {
        jobId: 'job-123',
        status: 'PROCESSING',
        tempS3Key: 'temp/user/job/file.jpg',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedJob)
      });

      const job = await jobService.updateJobStatus('job-123', JobStatus.PROCESSING, {
        tempS3Key: 'temp/user/job/file.jpg'
      });

      expect(job.tempS3Key).toBe('temp/user/job/file.jpg');
    });

    it('should update with finalS3Key', async () => {
      const updatedJob = {
        jobId: 'job-123',
        status: 'COMPLETED',
        finalS3Key: 'final/user/job/file.jpg',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedJob)
      });

      const job = await jobService.updateJobStatus('job-123', JobStatus.COMPLETED, {
        finalS3Key: 'final/user/job/file.jpg'
      });

      expect(job.finalS3Key).toBe('final/user/job/file.jpg');
    });

    it('should update with error', async () => {
      const updatedJob = {
        jobId: 'job-123',
        status: 'FAILED',
        error: 'Processing failed',
        updatedAt: '2024-01-01T00:00:00.000Z'
      };

      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedJob)
      });

      const job = await jobService.updateJobStatus('job-123', JobStatus.FAILED, {
        error: 'Processing failed'
      });

      expect(job.error).toBe('Processing failed');
    });

    it('should throw when job does not exist', async () => {
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: undefined
      });

      await expect(
        jobService.updateJobStatus('non-existent', JobStatus.PROCESSING)
      ).rejects.toThrow('Job non-existent not found');
    });
  });

  describe('terminal and in-progress status helpers', () => {
    it('isJobInProgress should return true for QUEUED, PROCESSING, EDITING', () => {
      expect(jobService.isJobInProgress(JobStatus.QUEUED)).toBe(true);
      expect(jobService.isJobInProgress(JobStatus.PROCESSING)).toBe(true);
      expect(jobService.isJobInProgress(JobStatus.EDITING)).toBe(true);
    });

    it('isJobInProgress should return false for COMPLETED, FAILED', () => {
      expect(jobService.isJobInProgress(JobStatus.COMPLETED)).toBe(false);
      expect(jobService.isJobInProgress(JobStatus.FAILED)).toBe(false);
    });

    it('isJobTerminal should return true for COMPLETED, FAILED', () => {
      expect(jobService.isJobTerminal(JobStatus.COMPLETED)).toBe(true);
      expect(jobService.isJobTerminal(JobStatus.FAILED)).toBe(true);
    });

    it('isJobTerminal should return false for QUEUED, PROCESSING, EDITING', () => {
      expect(jobService.isJobTerminal(JobStatus.QUEUED)).toBe(false);
      expect(jobService.isJobTerminal(JobStatus.PROCESSING)).toBe(false);
      expect(jobService.isJobTerminal(JobStatus.EDITING)).toBe(false);
    });
  });

  describe('batch job operations', () => {
    describe('createBatchJob', () => {
      it('should create batch job with required fields', async () => {
        dynamoMock.on(PutItemCommand).resolves({});

        const batchJob = await jobService.createBatchJob({
          userId: 'user-123',
          locale: 'en',
          fileCount: 3,
          sharedPrompt: 'Batch prompt'
        });

        expect(batchJob).toMatchObject({
          batchJobId: '00000000-0000-4000-8000-000000000000',
          userId: 'user-123',
          status: JobStatus.QUEUED,
          sharedPrompt: 'Batch prompt',
          completedCount: 0,
          totalCount: 3,
          childJobIds: []
        });
      });
    });

    describe('incrementBatchJobProgress', () => {
      it('should increment completedCount', async () => {
        const mockBatchJob = {
          batchJobId: 'batch-123',
          completedCount: 1,
          totalCount: 3,
          status: 'QUEUED'
        };

        dynamoMock.on(GetItemCommand).resolves({
          Item: marshall(mockBatchJob)
        });

        dynamoMock.on(UpdateItemCommand).resolves({
          Attributes: marshall({
            ...mockBatchJob,
            completedCount: 2
          })
        });

        const updatedBatch = await jobService.incrementBatchJobProgress('batch-123');

        expect(updatedBatch.completedCount).toBe(2);
      });

      it('should mark batch as COMPLETED when all jobs complete', async () => {
        const mockBatchJob = {
          batchJobId: 'batch-123',
          completedCount: 2,
          totalCount: 3,
          status: 'QUEUED'
        };

        dynamoMock.on(GetItemCommand).resolves({
          Item: marshall(mockBatchJob)
        });

        dynamoMock.on(UpdateItemCommand).resolves({
          Attributes: marshall({
            ...mockBatchJob,
            completedCount: 3,
            status: 'COMPLETED'
          })
        });

        const updatedBatch = await jobService.incrementBatchJobProgress('batch-123');

        expect(updatedBatch.completedCount).toBe(3);
        expect(updatedBatch.status).toBe('COMPLETED');
      });
    });

    describe('getJobsByBatchId', () => {
      it('should query jobs by batchJobId using GSI', async () => {
        const mockJobs = [
          { jobId: 'job-1', batchJobId: 'batch-123' },
          { jobId: 'job-2', batchJobId: 'batch-123' }
        ];

        dynamoMock.on(QueryCommand).resolves({
          Items: mockJobs.map(j => marshall(j))
        });

        const jobs = await jobService.getJobsByBatchId('batch-123');

        expect(jobs).toHaveLength(2);
        expect(jobs[0].jobId).toBe('job-1');
        expect(jobs[1].jobId).toBe('job-2');
      });

      it('should return empty array when no jobs found', async () => {
        dynamoMock.on(QueryCommand).resolves({
          Items: undefined
        });

        const jobs = await jobService.getJobsByBatchId('batch-123');

        expect(jobs).toEqual([]);
      });
    });
  });

  describe('result-based operations', () => {
    let jobServiceWithStubRepo: JobService;
    let repositoryStub: {
      create: jest.Mock;
      findById: jest.Mock;
      updateStatus: jest.Mock;
      createBatch: jest.Mock;
      findBatchById: jest.Mock;
      updateBatchStatus: jest.Mock;
      findByBatchId: jest.Mock;
    };

    const baseJob: Job = {
      jobId: 'job-123',
      userId: 'user-123',
      status: JobStatus.QUEUED,
      createdAt: '2025-10-29T00:00:00.000Z',
      updatedAt: '2025-10-29T00:00:00.000Z',
      locale: 'en',
      settings: {},
      prompt: 'Prompt',
      expires_at: Math.floor(Date.now() / 1000) + 1000
    };

    beforeEach(() => {
      jobServiceWithStubRepo = new JobService('stub-table', 'us-east-1', 'stub-batch');
      repositoryStub = {
        create: jest.fn(),
        findById: jest.fn(),
        updateStatus: jest.fn(),
        createBatch: jest.fn(),
        findBatchById: jest.fn(),
        updateBatchStatus: jest.fn(),
        findByBatchId: jest.fn()
      };

      // @ts-expect-error accessing private member for test seam
      jobServiceWithStubRepo.repository = repositoryStub;
    });

    it('createJobResult returns validation error without hitting repository', async () => {
      const result = await jobServiceWithStubRepo.createJobResult({
        userId: '',
        locale: 'en'
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(JobValidationError);
      }
      expect(repositoryStub.create).not.toHaveBeenCalled();
    });

    it('createJobResult surfaces repository errors', async () => {
      repositoryStub.create.mockImplementation(async (job: Job) =>
        err(new JobAlreadyExistsError(job.jobId))
      );

      const result = await jobServiceWithStubRepo.createJobResult({
        userId: 'user-123',
        locale: 'en',
        prompt: 'duplicate job test'
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(JobAlreadyExistsError);
      }
    });

    it('createJobResult returns created job on success', async () => {
      repositoryStub.create.mockImplementation(async (job: Job) => ok(job));

      const result = await jobServiceWithStubRepo.createJobResult({
        userId: 'user-123',
        locale: 'en',
        prompt: 'generate art'
      });

      expect(repositoryStub.create).toHaveBeenCalled();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.userId).toBe('user-123');
        expect(result.value.status).toBe(JobStatus.QUEUED);
      }
    });

    it('markJobProcessingResult returns repository error when job missing', async () => {
      repositoryStub.findById.mockResolvedValue(err(new JobNotFoundError('missing-job')));

      const result = await jobServiceWithStubRepo.markJobProcessingResult('missing-job', 'temp/key');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(JobNotFoundError);
      }
      expect(repositoryStub.updateStatus).not.toHaveBeenCalled();
    });

    it('markJobProcessingResult rejects invalid state transitions', async () => {
      repositoryStub.findById.mockResolvedValue(
        ok({
          ...baseJob,
          status: JobStatus.COMPLETED
        })
      );

      const result = await jobServiceWithStubRepo.markJobProcessingResult('job-123', 'temp/key');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(InvalidStateTransitionError);
      }
      expect(repositoryStub.updateStatus).not.toHaveBeenCalled();
    });

    it('markJobProcessingResult updates job when transition valid', async () => {
      repositoryStub.findById.mockResolvedValue(ok(baseJob));
      repositoryStub.updateStatus.mockImplementation(
        async (_jobId: string, status: JobStatusType, updates: Partial<Job>) =>
          ok({
            ...baseJob,
            status,
            tempS3Key: updates.tempS3Key,
            updatedAt: updates.updatedAt as string
          })
      );

      const result = await jobServiceWithStubRepo.markJobProcessingResult('job-123', 'temp/key.jpg');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe(JobStatus.PROCESSING);
        expect(result.value.tempS3Key).toBe('temp/key.jpg');
      }
      expect(repositoryStub.updateStatus).toHaveBeenCalledWith(
        'job-123',
        JobStatus.PROCESSING,
        expect.objectContaining({ tempS3Key: 'temp/key.jpg' })
      );
    });

    it('updateJobStatusResult returns updated job with metadata', async () => {
      repositoryStub.updateStatus.mockImplementation(
        async (_jobId: string, status: JobStatusType, updates: Partial<Job>) =>
          ok({
            ...baseJob,
            status,
            finalS3Key: updates.finalS3Key,
            error: updates.error,
            updatedAt: updates.updatedAt as string
          })
      );

      const result = await jobServiceWithStubRepo.updateJobStatusResult('job-123', JobStatus.PROCESSING, {
        finalS3Key: 'final/key.jpg',
        error: undefined
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe(JobStatus.PROCESSING);
        expect(result.value.finalS3Key).toBe('final/key.jpg');
      }
    });

    it('markJobFailedResult propagates repository failures', async () => {
      repositoryStub.findById.mockResolvedValue(ok({ ...baseJob, status: JobStatus.PROCESSING }));
      repositoryStub.updateStatus.mockResolvedValue(err(new RepositoryError('boom')));

      const result = await jobServiceWithStubRepo.markJobFailedResult('job-123', 'runtime error');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(RepositoryError);
      }
    });

    it('markJobFailedResult applies failure transition', async () => {
      repositoryStub.findById.mockResolvedValue(ok({ ...baseJob, status: JobStatus.PROCESSING }));
      repositoryStub.updateStatus.mockImplementation(
        async (_jobId: string, status: JobStatusType, updates: Partial<Job>) =>
          ok({
            ...baseJob,
            status,
            error: updates.error,
            updatedAt: updates.updatedAt as string
          })
      );

      const result = await jobServiceWithStubRepo.markJobFailedResult('job-123', 'boom');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe(JobStatus.FAILED);
        expect(result.value.error).toBe('boom');
      }
    });

    it('markJobEditingResult enforces valid transition', async () => {
      repositoryStub.findById.mockResolvedValue(ok({ ...baseJob, status: JobStatus.QUEUED }));

      const result = await jobServiceWithStubRepo.markJobEditingResult('job-123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(InvalidStateTransitionError);
      }
    });

    it('markJobEditingResult updates job when processing', async () => {
      repositoryStub.findById.mockResolvedValue(ok({ ...baseJob, status: JobStatus.PROCESSING }));
      repositoryStub.updateStatus.mockImplementation(
        async (_jobId: string, status: JobStatusType, updates: Partial<Job>) =>
          ok({
            ...baseJob,
            status,
            updatedAt: updates.updatedAt as string
          })
      );

      const result = await jobServiceWithStubRepo.markJobEditingResult('job-123');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe(JobStatus.EDITING);
      }
    });

    it('markJobCompletedResult requires job to be in editing', async () => {
      repositoryStub.findById.mockResolvedValue(ok({ ...baseJob, status: JobStatus.QUEUED }));

      const result = await jobServiceWithStubRepo.markJobCompletedResult('job-123', 'final/key');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(InvalidStateTransitionError);
      }
      expect(repositoryStub.updateStatus).not.toHaveBeenCalled();
    });

    it('markJobCompletedResult updates job with final key when valid', async () => {
      repositoryStub.findById.mockResolvedValue(ok({ ...baseJob, status: JobStatus.EDITING }));
      repositoryStub.updateStatus.mockImplementation(
        async (_jobId: string, status: JobStatusType, updates: Partial<Job>) =>
          ok({
            ...baseJob,
            status,
            finalS3Key: updates.finalS3Key,
            updatedAt: updates.updatedAt as string
          })
      );

      const result = await jobServiceWithStubRepo.markJobCompletedResult('job-123', 'final/key');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe(JobStatus.COMPLETED);
        expect(result.value.finalS3Key).toBe('final/key');
      }
    });

    it('incrementBatchJobProgressResult returns domain validation error when increment exceeds total', async () => {
      const batchJob = {
        batchJobId: 'batch-1',
        userId: 'user-123',
        status: JobStatus.QUEUED,
        createdAt: '2025-10-29T00:00:00.000Z',
        updatedAt: '2025-10-29T00:00:00.000Z',
        sharedPrompt: 'Prompt',
        individualPrompts: [],
        childJobIds: [],
        completedCount: 3,
        totalCount: 3,
        locale: 'en',
        settings: {},
        expires_at: Math.floor(Date.now() / 1000) + 1000
      };

      repositoryStub.findBatchById.mockResolvedValue(ok(batchJob));

      const result = await jobServiceWithStubRepo.incrementBatchJobProgressResult('batch-1');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(JobValidationError);
      }
      expect(repositoryStub.updateBatchStatus).not.toHaveBeenCalled();
    });

    it('incrementBatchJobProgressResult updates batch job when within bounds', async () => {
      const batchJob = {
        batchJobId: 'batch-1',
        userId: 'user-123',
        status: JobStatus.QUEUED,
        createdAt: '2025-10-29T00:00:00.000Z',
        updatedAt: '2025-10-29T00:00:00.000Z',
        sharedPrompt: 'Prompt',
        individualPrompts: [],
        childJobIds: [],
        completedCount: 1,
        totalCount: 3,
        locale: 'en',
        settings: {},
        expires_at: Math.floor(Date.now() / 1000) + 1000
      };

      repositoryStub.findBatchById.mockResolvedValue(ok(batchJob));
      repositoryStub.updateBatchStatus.mockImplementation(
        async (_batchJobId: string, status: JobStatusType, updates: Partial<typeof batchJob>) =>
          ok({
            ...batchJob,
            status,
            completedCount: updates.completedCount ?? batchJob.completedCount,
            updatedAt: updates.updatedAt as string
          })
      );

      const result = await jobServiceWithStubRepo.incrementBatchJobProgressResult('batch-1');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.completedCount).toBe(2);
      }
      expect(repositoryStub.updateBatchStatus).toHaveBeenCalledWith(
        'batch-1',
        JobStatus.QUEUED,
        expect.objectContaining({ completedCount: 2 })
      );
    });

    it('createBatchJobResult surfaces validation errors', async () => {
      const result = await jobServiceWithStubRepo.createBatchJobResult({
        userId: '',
        sharedPrompt: 'shared prompt',
        fileCount: 2,
        locale: 'en',
        settings: {}
      });

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(JobValidationError);
      }
      expect(repositoryStub.createBatch).not.toHaveBeenCalled();
    });

    it('createBatchJobResult returns batch job on success', async () => {
      repositoryStub.createBatch.mockImplementation(async batchJob => ok(batchJob));

      const result = await jobServiceWithStubRepo.createBatchJobResult({
        userId: 'user-123',
        sharedPrompt: 'make art',
        fileCount: 2,
        locale: 'en',
        settings: {},
        individualPrompts: ['one', 'two']
      });

      expect(repositoryStub.createBatch).toHaveBeenCalled();
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.userId).toBe('user-123');
        expect(result.value.totalCount).toBe(2);
      }
    });

    it('getJobResult propagates repository response', async () => {
      repositoryStub.findById.mockResolvedValue(ok({ ...baseJob, jobId: 'job-abc' }));

      const okResult = await jobServiceWithStubRepo.getJobResult('job-abc');
      expect(okResult.isOk()).toBe(true);
      if (okResult.isOk()) {
        expect(okResult.value.jobId).toBe('job-abc');
      }

      repositoryStub.findById.mockResolvedValue(err(new JobNotFoundError('missing')));
      const errResult = await jobServiceWithStubRepo.getJobResult('missing');
      expect(errResult.isErr()).toBe(true);
      if (errResult.isErr()) {
        expect(errResult.error).toBeInstanceOf(JobNotFoundError);
      }
    });

    it('getBatchJobResult returns failures and successes', async () => {
      repositoryStub.findBatchById.mockResolvedValue(ok({
        batchJobId: 'batch-1',
        userId: 'user-123',
        status: JobStatus.QUEUED,
        createdAt: '2025-10-29T00:00:00.000Z',
        updatedAt: '2025-10-29T00:00:00.000Z',
        sharedPrompt: 'shared',
        individualPrompts: [],
        childJobIds: [],
        completedCount: 0,
        totalCount: 2,
        locale: 'en',
        settings: {},
        expires_at: Math.floor(Date.now() / 1000) + 1000
      }));

      const success = await jobServiceWithStubRepo.getBatchJobResult('batch-1');
      expect(success.isOk()).toBe(true);

      repositoryStub.findBatchById.mockResolvedValue(err(new JobNotFoundError('missing-batch')));
      const failure = await jobServiceWithStubRepo.getBatchJobResult('missing-batch');
      expect(failure.isErr()).toBe(true);
    });

    it('updateBatchJobStatusResult updates metadata', async () => {
      repositoryStub.updateBatchStatus.mockImplementation(
        async (_batchJobId: string, status: JobStatusType, updates: Partial<BatchJob>) =>
          ok({
            batchJobId: 'batch-1',
            userId: 'user-123',
            status,
            createdAt: '2025-10-29T00:00:00.000Z',
            updatedAt: updates.updatedAt as string,
            sharedPrompt: 'shared',
            individualPrompts: [],
            childJobIds: updates.childJobIds ?? [],
            completedCount: updates.completedCount ?? 0,
            totalCount: 2,
            locale: 'en',
            settings: {},
            expires_at: Math.floor(Date.now() / 1000) + 1000
          })
      );

      const result = await jobServiceWithStubRepo.updateBatchJobStatusResult('batch-1', JobStatus.PROCESSING, {
        childJobIds: ['job-1', 'job-2']
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.childJobIds).toEqual(['job-1', 'job-2']);
      }
    });

    it('getJobsByBatchIdResult returns repository data', async () => {
      repositoryStub.findByBatchId.mockResolvedValue(ok([baseJob]));

      const result = await jobServiceWithStubRepo.getJobsByBatchIdResult('batch-1');
      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(1);
      }
    });

    describe('legacy adapters', () => {
      it('createJob throws when underlying result fails', async () => {
        await expect(
          jobServiceWithStubRepo.createJob({ userId: '', locale: 'en' })
        ).rejects.toBeInstanceOf(JobValidationError);
        expect(repositoryStub.create).not.toHaveBeenCalled();
      });

      it('updateJobStatus throws on repository error', async () => {
        repositoryStub.updateStatus.mockResolvedValue(err(new JobNotFoundError('job-123')));

        await expect(
          jobServiceWithStubRepo.updateJobStatus('job-123', JobStatus.QUEUED)
        ).rejects.toBeInstanceOf(JobNotFoundError);
      });

      it('markJobFailed throws when result is error', async () => {
        repositoryStub.findById.mockResolvedValue(err(new JobNotFoundError('job-123')));

        await expect(
          jobServiceWithStubRepo.markJobFailed('job-123', 'boom')
        ).rejects.toBeInstanceOf(JobNotFoundError);
      });

      it('markJobProcessing throws when transition invalid', async () => {
        repositoryStub.findById.mockResolvedValue(
          ok({
            ...baseJob,
            status: JobStatus.COMPLETED
          })
        );

        await expect(
          jobServiceWithStubRepo.markJobProcessing('job-123', 'temp/key')
        ).rejects.toBeInstanceOf(InvalidStateTransitionError);
      });

      it('markJobEditing throws when transition invalid', async () => {
        repositoryStub.findById.mockResolvedValue(ok({ ...baseJob, status: JobStatus.QUEUED }));

        await expect(jobServiceWithStubRepo.markJobEditing('job-123')).rejects.toBeInstanceOf(
          InvalidStateTransitionError
        );
      });

      it('markJobCompleted throws when transition invalid', async () => {
        repositoryStub.findById.mockResolvedValue(ok({ ...baseJob, status: JobStatus.PROCESSING }));

        await expect(
          jobServiceWithStubRepo.markJobCompleted('job-123', 'final/key')
        ).rejects.toBeInstanceOf(InvalidStateTransitionError);
      });

      it('createBatchJob throws on validation error', async () => {
        await expect(
          jobServiceWithStubRepo.createBatchJob({
            userId: '',
            sharedPrompt: 'shared',
            fileCount: 2,
            locale: 'en',
            settings: {}
          })
        ).rejects.toBeInstanceOf(JobValidationError);
        expect(repositoryStub.createBatch).not.toHaveBeenCalled();
      });

      it('updateBatchJobStatus throws on repository error', async () => {
        repositoryStub.updateBatchStatus.mockResolvedValue(err(new JobNotFoundError('batch-1')));

        await expect(
          jobServiceWithStubRepo.updateBatchJobStatus('batch-1', JobStatus.PROCESSING)
        ).rejects.toBeInstanceOf(JobNotFoundError);
      });

      it('incrementBatchJobProgress throws when result is error', async () => {
        repositoryStub.findBatchById.mockResolvedValue(err(new JobNotFoundError('batch-1')));

        await expect(
          jobServiceWithStubRepo.incrementBatchJobProgress('batch-1')
        ).rejects.toBeInstanceOf(JobNotFoundError);
      });

      it('getJobsByBatchId throws when repository err', async () => {
        repositoryStub.findByBatchId.mockResolvedValue(err(new RepositoryError('dynamo failed')));

        await expect(
          jobServiceWithStubRepo.getJobsByBatchId('batch-1')
        ).rejects.toBeInstanceOf(RepositoryError);
      });
    });
  });
});

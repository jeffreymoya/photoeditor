import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import { JobService } from '../../../src/services/job.service';
import { JobStatus } from '@photoeditor/shared';

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
});

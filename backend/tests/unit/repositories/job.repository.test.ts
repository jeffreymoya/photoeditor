/**
 * Unit tests for JobRepository
 * Tests DynamoDB CRUD operations with Result types
 */

import { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { mockClient } from 'aws-sdk-client-mock';
import { marshall } from '@aws-sdk/util-dynamodb';
import {
  JobRepository,
  JobNotFoundError,
  JobAlreadyExistsError,
  RepositoryError
} from '../../../src/repositories/job.repository';
import { Job, BatchJob, JobStatus } from '@photoeditor/shared';

const dynamoMock = mockClient(DynamoDBClient);

describe('JobRepository', () => {
  let repository: JobRepository;
  let mockClient: DynamoDBClient;

  const mockJob: Job = {
    jobId: 'job-123',
    userId: 'user-456',
    status: JobStatus.QUEUED,
    locale: 'en-US',
    tempS3Key: 'temp/job-123.jpg',
    prompt: 'Test prompt',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  };

  const mockBatchJob: BatchJob = {
    batchJobId: 'batch-123',
    userId: 'user-456',
    status: JobStatus.QUEUED,
    locale: 'en-US',
    totalCount: 3,
    completedCount: 0,
    sharedPrompt: 'Batch prompt',
    childJobIds: [],
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt: '2024-01-01T00:00:00.000Z'
  };

  beforeEach(() => {
    dynamoMock.reset();
    mockClient = new DynamoDBClient({ region: 'us-east-1' });
    repository = new JobRepository(mockClient, 'jobs-table', 'batch-jobs-table');
  });

  describe('create', () => {
    it('should successfully create a job', async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const result = await repository.create(mockJob);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(mockJob);
      }
    });

    it('should return JobAlreadyExistsError when job exists', async () => {
      dynamoMock.on(PutItemCommand).rejects({
        name: 'ConditionalCheckFailedException',
        message: 'Item already exists'
      });

      const result = await repository.create(mockJob);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(JobAlreadyExistsError);
        expect(result.error.message).toContain('job-123');
      }
    });

    it('should return RepositoryError for other DynamoDB errors', async () => {
      dynamoMock.on(PutItemCommand).rejects(new Error('DynamoDB service error'));

      const result = await repository.create(mockJob);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(RepositoryError);
        expect(result.error.message).toBe('Failed to create job');
      }
    });

    it('should use correct table name and condition expression', async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      await repository.create(mockJob);

      const call = dynamoMock.commandCalls(PutItemCommand)[0];
      expect(call.args[0].input.TableName).toBe('jobs-table');
      expect(call.args[0].input.ConditionExpression).toBe('attribute_not_exists(jobId)');
    });
  });

  describe('findById', () => {
    it('should successfully retrieve a job', async () => {
      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall(mockJob)
      });

      const result = await repository.findById('job-123');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.jobId).toBe('job-123');
      }
    });

    it('should return JobNotFoundError when job does not exist', async () => {
      dynamoMock.on(GetItemCommand).resolves({
        Item: undefined
      });

      const result = await repository.findById('job-999');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(JobNotFoundError);
        expect(result.error.message).toContain('job-999');
      }
    });

    it('should return RepositoryError for DynamoDB errors', async () => {
      dynamoMock.on(GetItemCommand).rejects(new Error('DynamoDB error'));

      const result = await repository.findById('job-123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(RepositoryError);
        expect(result.error.message).toBe('Failed to retrieve job');
      }
    });

    it('should use consistent read', async () => {
      dynamoMock.on(GetItemCommand).resolves({ Item: marshall(mockJob) });

      await repository.findById('job-123');

      const call = dynamoMock.commandCalls(GetItemCommand)[0];
      expect(call.args[0].input.ConsistentRead).toBe(true);
    });
  });

  describe('updateStatus', () => {
    it('should update job status only', async () => {
      const updatedJob = { ...mockJob, status: JobStatus.PROCESSING };
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedJob)
      });

      const result = await repository.updateStatus('job-123', JobStatus.PROCESSING, {
        updatedAt: '2024-01-01T01:00:00.000Z'
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe(JobStatus.PROCESSING);
      }
    });

    it('should update status with tempS3Key', async () => {
      const updatedJob = { ...mockJob, status: JobStatus.PROCESSING, tempS3Key: 'temp/new.jpg' };
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedJob)
      });

      const result = await repository.updateStatus('job-123', JobStatus.PROCESSING, {
        tempS3Key: 'temp/new.jpg',
        updatedAt: '2024-01-01T01:00:00.000Z'
      });

      expect(result.isOk()).toBe(true);
      const call = dynamoMock.commandCalls(UpdateItemCommand)[0];
      expect(call.args[0].input.UpdateExpression).toContain('#tempS3Key');
    });

    it('should update status with finalS3Key', async () => {
      const updatedJob = { ...mockJob, status: JobStatus.COMPLETED, finalS3Key: 'final/result.jpg' };
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedJob)
      });

      const result = await repository.updateStatus('job-123', JobStatus.COMPLETED, {
        finalS3Key: 'final/result.jpg',
        updatedAt: '2024-01-01T02:00:00.000Z'
      });

      expect(result.isOk()).toBe(true);
      const call = dynamoMock.commandCalls(UpdateItemCommand)[0];
      expect(call.args[0].input.UpdateExpression).toContain('#finalS3Key');
    });

    it('should update status with error', async () => {
      const updatedJob = { ...mockJob, status: JobStatus.FAILED, error: 'Processing failed' };
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedJob)
      });

      const result = await repository.updateStatus('job-123', JobStatus.FAILED, {
        error: 'Processing failed',
        updatedAt: '2024-01-01T03:00:00.000Z'
      });

      expect(result.isOk()).toBe(true);
      const call = dynamoMock.commandCalls(UpdateItemCommand)[0];
      expect(call.args[0].input.UpdateExpression).toContain('#error');
    });

    it('should update status with all optional fields', async () => {
      const updatedJob = {
        ...mockJob,
        status: JobStatus.COMPLETED,
        tempS3Key: 'temp/new.jpg',
        finalS3Key: 'final/result.jpg',
        error: 'Some warning'
      };
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedJob)
      });

      const result = await repository.updateStatus('job-123', JobStatus.COMPLETED, {
        tempS3Key: 'temp/new.jpg',
        finalS3Key: 'final/result.jpg',
        error: 'Some warning',
        updatedAt: '2024-01-01T04:00:00.000Z'
      });

      expect(result.isOk()).toBe(true);
      const call = dynamoMock.commandCalls(UpdateItemCommand)[0];
      expect(call.args[0].input.UpdateExpression).toContain('#tempS3Key');
      expect(call.args[0].input.UpdateExpression).toContain('#finalS3Key');
      expect(call.args[0].input.UpdateExpression).toContain('#error');
    });

    it('should return JobNotFoundError when response has no attributes', async () => {
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: undefined
      });

      const result = await repository.updateStatus('job-999', JobStatus.PROCESSING, {});

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(JobNotFoundError);
      }
    });

    it('should return JobNotFoundError for ConditionalCheckFailedException', async () => {
      dynamoMock.on(UpdateItemCommand).rejects({
        name: 'ConditionalCheckFailedException',
        message: 'Job does not exist'
      });

      const result = await repository.updateStatus('job-999', JobStatus.PROCESSING, {});

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(JobNotFoundError);
      }
    });

    it('should return RepositoryError for other errors', async () => {
      dynamoMock.on(UpdateItemCommand).rejects(new Error('DynamoDB error'));

      const result = await repository.updateStatus('job-123', JobStatus.PROCESSING, {});

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(RepositoryError);
        expect(result.error.message).toBe('Failed to update job status');
      }
    });

    it('should use default updatedAt when not provided', async () => {
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(mockJob)
      });

      await repository.updateStatus('job-123', JobStatus.PROCESSING, {});

      const call = dynamoMock.commandCalls(UpdateItemCommand)[0];
      const values = call.args[0].input.ExpressionAttributeValues;
      expect(values).toBeDefined();
    });
  });

  describe('createBatch', () => {
    it('should successfully create a batch job', async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      const result = await repository.createBatch(mockBatchJob);

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual(mockBatchJob);
      }
    });

    it('should return JobAlreadyExistsError when batch job exists', async () => {
      dynamoMock.on(PutItemCommand).rejects({
        name: 'ConditionalCheckFailedException',
        message: 'Batch job already exists'
      });

      const result = await repository.createBatch(mockBatchJob);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(JobAlreadyExistsError);
        expect(result.error.message).toContain('batch-123');
      }
    });

    it('should return RepositoryError for other DynamoDB errors', async () => {
      dynamoMock.on(PutItemCommand).rejects(new Error('DynamoDB error'));

      const result = await repository.createBatch(mockBatchJob);

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(RepositoryError);
        expect(result.error.message).toBe('Failed to create batch job');
      }
    });

    it('should use correct batch table name', async () => {
      dynamoMock.on(PutItemCommand).resolves({});

      await repository.createBatch(mockBatchJob);

      const call = dynamoMock.commandCalls(PutItemCommand)[0];
      expect(call.args[0].input.TableName).toBe('batch-jobs-table');
    });
  });

  describe('findBatchById', () => {
    it('should successfully retrieve a batch job', async () => {
      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall(mockBatchJob)
      });

      const result = await repository.findBatchById('batch-123');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.batchJobId).toBe('batch-123');
      }
    });

    it('should return JobNotFoundError when batch job does not exist', async () => {
      dynamoMock.on(GetItemCommand).resolves({
        Item: undefined
      });

      const result = await repository.findBatchById('batch-999');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(JobNotFoundError);
        expect(result.error.message).toContain('batch-999');
      }
    });

    it('should return RepositoryError for DynamoDB errors', async () => {
      dynamoMock.on(GetItemCommand).rejects(new Error('DynamoDB error'));

      const result = await repository.findBatchById('batch-123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(RepositoryError);
        expect(result.error.message).toBe('Failed to retrieve batch job');
      }
    });
  });

  describe('updateBatchStatus', () => {
    it('should update batch job status only', async () => {
      const updatedBatch = { ...mockBatchJob, status: JobStatus.PROCESSING };
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedBatch)
      });

      const result = await repository.updateBatchStatus('batch-123', JobStatus.PROCESSING, {
        updatedAt: '2024-01-01T01:00:00.000Z'
      });

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value.status).toBe(JobStatus.PROCESSING);
      }
    });

    it('should update status with completedCount', async () => {
      const updatedBatch = { ...mockBatchJob, completedCount: 2 };
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedBatch)
      });

      const result = await repository.updateBatchStatus('batch-123', JobStatus.PROCESSING, {
        completedCount: 2,
        updatedAt: '2024-01-01T01:00:00.000Z'
      });

      expect(result.isOk()).toBe(true);
      const call = dynamoMock.commandCalls(UpdateItemCommand)[0];
      expect(call.args[0].input.UpdateExpression).toContain('#completedCount');
    });

    it('should update status with completedCount of zero', async () => {
      const updatedBatch = { ...mockBatchJob, completedCount: 0 };
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedBatch)
      });

      const result = await repository.updateBatchStatus('batch-123', JobStatus.QUEUED, {
        completedCount: 0,
        updatedAt: '2024-01-01T01:00:00.000Z'
      });

      expect(result.isOk()).toBe(true);
      const call = dynamoMock.commandCalls(UpdateItemCommand)[0];
      expect(call.args[0].input.UpdateExpression).toContain('#completedCount');
    });

    it('should update status with childJobIds', async () => {
      const childIds = ['job-1', 'job-2', 'job-3'];
      const updatedBatch = { ...mockBatchJob, childJobIds: childIds };
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedBatch)
      });

      const result = await repository.updateBatchStatus('batch-123', JobStatus.PROCESSING, {
        childJobIds: childIds,
        updatedAt: '2024-01-01T01:00:00.000Z'
      });

      expect(result.isOk()).toBe(true);
      const call = dynamoMock.commandCalls(UpdateItemCommand)[0];
      expect(call.args[0].input.UpdateExpression).toContain('#childJobIds');
    });

    it('should update status with error', async () => {
      const updatedBatch = { ...mockBatchJob, status: JobStatus.FAILED, error: 'Batch failed' };
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedBatch)
      });

      const result = await repository.updateBatchStatus('batch-123', JobStatus.FAILED, {
        error: 'Batch failed',
        updatedAt: '2024-01-01T02:00:00.000Z'
      });

      expect(result.isOk()).toBe(true);
      const call = dynamoMock.commandCalls(UpdateItemCommand)[0];
      expect(call.args[0].input.UpdateExpression).toContain('#error');
    });

    it('should update status with all optional fields', async () => {
      const childIds = ['job-1', 'job-2'];
      const updatedBatch = {
        ...mockBatchJob,
        completedCount: 2,
        childJobIds: childIds,
        error: 'Warning'
      };
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall(updatedBatch)
      });

      const result = await repository.updateBatchStatus('batch-123', JobStatus.PROCESSING, {
        completedCount: 2,
        childJobIds: childIds,
        error: 'Warning',
        updatedAt: '2024-01-01T03:00:00.000Z'
      });

      expect(result.isOk()).toBe(true);
      const call = dynamoMock.commandCalls(UpdateItemCommand)[0];
      expect(call.args[0].input.UpdateExpression).toContain('#completedCount');
      expect(call.args[0].input.UpdateExpression).toContain('#childJobIds');
      expect(call.args[0].input.UpdateExpression).toContain('#error');
    });

    it('should return JobNotFoundError when response has no attributes', async () => {
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: undefined
      });

      const result = await repository.updateBatchStatus('batch-999', JobStatus.PROCESSING, {});

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(JobNotFoundError);
      }
    });

    it('should return JobNotFoundError for ConditionalCheckFailedException', async () => {
      dynamoMock.on(UpdateItemCommand).rejects({
        name: 'ConditionalCheckFailedException',
        message: 'Batch job does not exist'
      });

      const result = await repository.updateBatchStatus('batch-999', JobStatus.PROCESSING, {});

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(JobNotFoundError);
      }
    });

    it('should return RepositoryError for other errors', async () => {
      dynamoMock.on(UpdateItemCommand).rejects(new Error('DynamoDB error'));

      const result = await repository.updateBatchStatus('batch-123', JobStatus.PROCESSING, {});

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(RepositoryError);
        expect(result.error.message).toBe('Failed to update batch job status');
      }
    });
  });

  describe('findByBatchId', () => {
    it('should successfully retrieve jobs by batch ID', async () => {
      const job1 = { ...mockJob, jobId: 'job-1', batchJobId: 'batch-123' };
      const job2 = { ...mockJob, jobId: 'job-2', batchJobId: 'batch-123' };

      dynamoMock.on(QueryCommand).resolves({
        Items: [marshall(job1), marshall(job2)]
      });

      const result = await repository.findByBatchId('batch-123');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toHaveLength(2);
        expect(result.value[0].jobId).toBe('job-1');
        expect(result.value[1].jobId).toBe('job-2');
      }
    });

    it('should return empty array when no jobs found', async () => {
      dynamoMock.on(QueryCommand).resolves({
        Items: undefined
      });

      const result = await repository.findByBatchId('batch-999');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('should return empty array when Items is empty', async () => {
      dynamoMock.on(QueryCommand).resolves({
        Items: []
      });

      const result = await repository.findByBatchId('batch-empty');

      expect(result.isOk()).toBe(true);
      if (result.isOk()) {
        expect(result.value).toEqual([]);
      }
    });

    it('should return RepositoryError for DynamoDB errors', async () => {
      dynamoMock.on(QueryCommand).rejects(new Error('Query error'));

      const result = await repository.findByBatchId('batch-123');

      expect(result.isErr()).toBe(true);
      if (result.isErr()) {
        expect(result.error).toBeInstanceOf(RepositoryError);
        expect(result.error.message).toBe('Failed to query jobs by batch ID');
      }
    });

    it('should use correct index name', async () => {
      dynamoMock.on(QueryCommand).resolves({ Items: [] });

      await repository.findByBatchId('batch-123');

      const call = dynamoMock.commandCalls(QueryCommand)[0];
      expect(call.args[0].input.IndexName).toBe('BatchJobIdIndex');
    });
  });
});

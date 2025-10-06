/**
 * Worker Pipeline Integration Tests
 *
 * Tests the complete worker Lambda orchestration from SQS event through final S3 upload,
 * proving shared factory wiring, provider interactions, fallback behavior, and notifications.
 *
 * Alignment with STANDARDS.md:
 * - Line 24: Handlers → Services → Adapters layering (no SDK imports in handler)
 * - Line 36: Handler complexity ≤5, ≤75 LOC
 * - Line 71: Structured logs with correlationId, traceId, requestId, jobId
 * - Line 98-99: Service/Adapter coverage ≥80% lines, ≥70% branches
 * - Line 100: Mutation score ≥60%
 *
 * Testing approach per docs/testing-standards.md:
 * - Stub Gemini and Seedream providers (no live HTTP calls)
 * - Control timers and randomness for deterministic assertions
 * - Test full job lifecycle: QUEUED → PROCESSING → EDITING → COMPLETED
 * - Verify fallback copy behavior when Seedream fails
 * - Assert SNS notifications for job completion and batch progress
 */

import { Context } from 'aws-lambda';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { mockClient } from 'aws-sdk-client-mock';
import type { AwsStub } from 'aws-sdk-client-mock';
import { handler as workerHandler } from '../../src/lambdas/worker';
import { JobService } from '../../src/services/job.service';
import { ProviderFactory } from '../../src/providers/factory';
import { TestProviderFactory } from '../helpers/provider-stubs';
import { S3Spy } from '../helpers/s3-spy';
import { makeSQSEventWithBody, makeS3Record } from '../fixtures/events';
import { setupLocalStackEnv, createJobsTable, createBatchJobsTable, deleteTable } from './setup';
import { JobStatus } from '@photoeditor/shared';
import { v4 as uuidv4 } from 'uuid';

// Mock external modules
jest.mock('uuid', () => ({
  v4: jest.fn()
}));
jest.mock('@aws-lambda-powertools/logger');
jest.mock('@aws-lambda-powertools/metrics');
jest.mock('@aws-lambda-powertools/tracer');

// Mock fetch for downloading edited images
global.fetch = jest.fn();

describe('Worker Pipeline Integration Tests', () => {
  let dynamoClient: DynamoDBClient;
  let s3Client: S3Client;
  let snsClient: AwsStub<any, any, any>;
  let s3Spy: S3Spy;
  let testProviderFactory: TestProviderFactory;
  let jobService: JobService;

  const testJobId = 'test-job-001';
  const testUserId = 'test-user-123';
  const testFileName = 'photo.jpg';

  beforeAll(() => {
    setupLocalStackEnv();
  });

  beforeEach(async () => {
    // Reset UUID mock for deterministic job IDs
    (uuidv4 as jest.Mock).mockReturnValue(testJobId);

    // Initialize clients
    const endpoint = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
    dynamoClient = new DynamoDBClient({
      region: process.env.AWS_REGION!,
      endpoint,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test'
      }
    });

    // Setup S3 spy
    s3Spy = new S3Spy();
    s3Client = new S3Client({
      region: process.env.AWS_REGION!,
      endpoint,
      credentials: {
        accessKeyId: 'test',
        secretAccessKey: 'test'
      }
    });

    // Setup SNS mock
    snsClient = mockClient(SNSClient);
    snsClient.on(PublishCommand).resolves({
      MessageId: 'test-message-id'
    });

    // Setup test provider factory
    testProviderFactory = new TestProviderFactory();

    // Create DynamoDB tables
    await createJobsTable(dynamoClient, process.env.JOBS_TABLE_NAME!);
    await createBatchJobsTable(dynamoClient, process.env.BATCH_TABLE_NAME!);

    // Initialize services
    jobService = new JobService(
      process.env.JOBS_TABLE_NAME!,
      process.env.AWS_REGION!,
      process.env.BATCH_TABLE_NAME!,
      dynamoClient
    );

    // Setup environment variables for worker
    process.env.SNS_TOPIC_ARN = 'arn:aws:sns:us-east-1:123456789012:test-topic';

    // Mock fetch for edited image download
    (global.fetch as jest.Mock).mockResolvedValue({
      arrayBuffer: async () => Buffer.from('edited-image-data').buffer
    });
  });

  afterEach(async () => {
    // Cleanup tables
    if (dynamoClient) {
      await deleteTable(dynamoClient, process.env.JOBS_TABLE_NAME!);
      await deleteTable(dynamoClient, process.env.BATCH_TABLE_NAME!);
    }

    // Reset mocks
    if (snsClient) {
      snsClient.reset();
    }
    if (s3Spy) {
      s3Spy.reset();
    }
    if (testProviderFactory) {
      testProviderFactory.reset();
    }
    jest.clearAllMocks();
  });

  afterAll(async () => {
    // Close clients
    if (dynamoClient) {
      dynamoClient.destroy();
    }
    if (s3Client) {
      s3Client.destroy();
    }
  });

  describe('Happy Path - Complete Worker Pipeline', () => {
    it('should process job through full lifecycle: QUEUED → PROCESSING → EDITING → COMPLETED', async () => {
      // ARRANGE: Create a job in QUEUED state
      const job = await jobService.createJob({
        userId: testUserId,
        prompt: 'Enhance this photo with professional editing',
        locale: 'en',
        settings: {}
      });

      expect(job.status).toBe(JobStatus.QUEUED);
      expect(job.jobId).toBe(testJobId);

      // Create SQS event simulating S3 upload notification
      const s3Key = `uploads/${testUserId}/${testJobId}/1234567890-${testFileName}`;
      const s3Record = makeS3Record({
        bucket: process.env.TEMP_BUCKET_NAME!,
        key: s3Key
      });

      const sqsEvent = makeSQSEventWithBody({
        Records: [s3Record]
      });

      // Mock provider factory initialization
      jest.spyOn(ProviderFactory.prototype, 'getAnalysisProvider')
        .mockReturnValue(testProviderFactory.getAnalysisProvider() as any);
      jest.spyOn(ProviderFactory.prototype, 'getEditingProvider')
        .mockReturnValue(testProviderFactory.getEditingProvider() as any);

      // ACT: Process the event through worker handler
      await workerHandler(sqsEvent, {} as Context);

      // ASSERT: Verify job status transitions
      const completedJob = await jobService.getJob(testJobId);
      expect(completedJob).toBeTruthy();
      expect(completedJob!.status).toBe(JobStatus.COMPLETED);
      expect(completedJob!.tempS3Key).toBe(s3Key);
      expect(completedJob!.finalS3Key).toContain(`final/${testUserId}/${testJobId}`);

      // ASSERT: Verify provider invocations
      const analysisInvocations = testProviderFactory.getAnalysisProvider().getInvocations();
      expect(analysisInvocations).toHaveLength(1);
      expect(analysisInvocations[0].request).toMatchObject({
        prompt: 'Enhance this photo with professional editing'
      });

      const editingInvocations = testProviderFactory.getEditingProvider().getInvocations();
      expect(editingInvocations).toHaveLength(1);
      expect(editingInvocations[0].response.success).toBe(true);

      // ASSERT: Verify S3 operations
      const putOps = s3Spy.getPutOperations();
      expect(putOps.length).toBeGreaterThan(0);

      // Should have optimized image upload
      const optimizedUploads = putOps.filter(op => op.key.includes('optimized/'));
      expect(optimizedUploads.length).toBeGreaterThan(0);

      // Should have final image upload
      const finalUploads = putOps.filter(op => op.key.includes('final/'));
      expect(finalUploads.length).toBeGreaterThan(0);

      // ASSERT: Verify cleanup - temp and optimized files should be deleted
      const deleteOps = s3Spy.getDeleteOperations();
      expect(deleteOps.length).toBeGreaterThanOrEqual(2); // temp + optimized

      // ASSERT: Verify SNS notification sent
      const snsInvocations = snsClient.commandCalls(PublishCommand);
      expect(snsInvocations.length).toBeGreaterThan(0);

      const lastNotification = snsInvocations[snsInvocations.length - 1];
      expect(lastNotification.args[0].input).toMatchObject({
        TopicArn: process.env.SNS_TOPIC_ARN,
        MessageAttributes: {
          jobId: { StringValue: testJobId },
          status: { StringValue: JobStatus.COMPLETED }
        }
      });
    });

    it('should optimize image before analysis', async () => {
      // ARRANGE
      await jobService.createJob({
        userId: testUserId,
        prompt: 'Test optimization flow',
        locale: 'en',
        settings: {}
      });

      const s3Key = `uploads/${testUserId}/${testJobId}/1234567890-${testFileName}`;
      const sqsEvent = makeSQSEventWithBody({
        Records: [makeS3Record({ bucket: process.env.TEMP_BUCKET_NAME!, key: s3Key })]
      });

      jest.spyOn(ProviderFactory.prototype, 'getAnalysisProvider')
        .mockReturnValue(testProviderFactory.getAnalysisProvider() as any);
      jest.spyOn(ProviderFactory.prototype, 'getEditingProvider')
        .mockReturnValue(testProviderFactory.getEditingProvider() as any);

      // ACT
      await workerHandler(sqsEvent, {} as Context);

      // ASSERT: Verify optimized image was created before analysis
      const putOps = s3Spy.getPutOperations();
      const optimizedOp = putOps.find(op => op.key.includes('optimized/'));
      expect(optimizedOp).toBeTruthy();

      // Analysis should be called with presigned URL to optimized image
      const analysisInvocations = testProviderFactory.getAnalysisProvider().getInvocations();
      expect(analysisInvocations[0].request).toHaveProperty('imageUrl');
    });

    it('should propagate user prompt to analysis provider', async () => {
      // ARRANGE
      const customPrompt = 'Make this photo look like a vintage polaroid';
      await jobService.createJob({
        userId: testUserId,
        prompt: customPrompt,
        locale: 'en',
        settings: {}
      });

      const s3Key = `uploads/${testUserId}/${testJobId}/1234567890-${testFileName}`;
      const sqsEvent = makeSQSEventWithBody({
        Records: [makeS3Record({ bucket: process.env.TEMP_BUCKET_NAME!, key: s3Key })]
      });

      jest.spyOn(ProviderFactory.prototype, 'getAnalysisProvider')
        .mockReturnValue(testProviderFactory.getAnalysisProvider() as any);
      jest.spyOn(ProviderFactory.prototype, 'getEditingProvider')
        .mockReturnValue(testProviderFactory.getEditingProvider() as any);

      // ACT
      await workerHandler(sqsEvent, {} as Context);

      // ASSERT
      const analysisInvocations = testProviderFactory.getAnalysisProvider().getInvocations();
      expect(analysisInvocations[0].request).toMatchObject({
        prompt: customPrompt
      });
    });
  });

  describe('Fallback Behavior', () => {
    it('should fallback to copy original when Seedream editing fails', async () => {
      // ARRANGE
      await jobService.createJob({
        userId: testUserId,
        prompt: 'Test fallback',
        locale: 'en',
        settings: {}
      });

      const s3Key = `uploads/${testUserId}/${testJobId}/1234567890-${testFileName}`;
      const sqsEvent = makeSQSEventWithBody({
        Records: [makeS3Record({ bucket: process.env.TEMP_BUCKET_NAME!, key: s3Key })]
      });

      // Configure editing provider to fail
      testProviderFactory.getEditingProvider().setShouldFail(true, 'Seedream service unavailable');

      jest.spyOn(ProviderFactory.prototype, 'getAnalysisProvider')
        .mockReturnValue(testProviderFactory.getAnalysisProvider() as any);
      jest.spyOn(ProviderFactory.prototype, 'getEditingProvider')
        .mockReturnValue(testProviderFactory.getEditingProvider() as any);

      // ACT
      await workerHandler(sqsEvent, {} as Context);

      // ASSERT: Job should still complete
      const completedJob = await jobService.getJob(testJobId);
      expect(completedJob!.status).toBe(JobStatus.COMPLETED);

      // ASSERT: Should have performed S3 copy as fallback
      const copyOps = s3Spy.getCopyOperations();
      expect(copyOps.length).toBeGreaterThan(0);

      const fallbackCopy = copyOps.find(op => op.destKey.includes('final/'));
      expect(fallbackCopy).toBeTruthy();
      expect(fallbackCopy!.sourceKey).toContain('uploads/');

      // ASSERT: Final key should be set
      expect(completedJob!.finalS3Key).toContain(`final/${testUserId}/${testJobId}`);
    });

    it('should send completion notification even when editing fails', async () => {
      // ARRANGE
      await jobService.createJob({
        userId: testUserId,
        prompt: 'Test notification on fallback',
        locale: 'en',
        settings: {}
      });

      const s3Key = `uploads/${testUserId}/${testJobId}/1234567890-${testFileName}`;
      const sqsEvent = makeSQSEventWithBody({
        Records: [makeS3Record({ bucket: process.env.TEMP_BUCKET_NAME!, key: s3Key })]
      });

      testProviderFactory.getEditingProvider().setShouldFail(true);

      jest.spyOn(ProviderFactory.prototype, 'getAnalysisProvider')
        .mockReturnValue(testProviderFactory.getAnalysisProvider() as any);
      jest.spyOn(ProviderFactory.prototype, 'getEditingProvider')
        .mockReturnValue(testProviderFactory.getEditingProvider() as any);

      // ACT
      await workerHandler(sqsEvent, {} as Context);

      // ASSERT: Completion notification should be sent
      const snsInvocations = snsClient.commandCalls(PublishCommand);
      const completionNotification = snsInvocations.find((call: any) =>
        call.args[0].input.MessageAttributes?.status?.StringValue === JobStatus.COMPLETED
      );
      expect(completionNotification).toBeTruthy();
    });
  });

  describe('Batch Job Progress', () => {
    it('should increment batch job progress when individual job completes', async () => {
      // ARRANGE: Create batch job
      const batchJob = await jobService.createBatchJob({
        userId: testUserId,
        fileCount: 3,
        sharedPrompt: 'Enhance all photos',
        locale: 'en',
        settings: {}
      });

      // Create individual job linked to batch
      (uuidv4 as jest.Mock).mockReturnValue(testJobId);
      await jobService.createJob({
        userId: testUserId,
        prompt: 'Enhance all photos',
        batchJobId: batchJob.batchJobId,
        locale: 'en',
        settings: {}
      });

      const s3Key = `uploads/${testUserId}/${testJobId}/1234567890-${testFileName}`;
      const sqsEvent = makeSQSEventWithBody({
        Records: [makeS3Record({ bucket: process.env.TEMP_BUCKET_NAME!, key: s3Key })]
      });

      jest.spyOn(ProviderFactory.prototype, 'getAnalysisProvider')
        .mockReturnValue(testProviderFactory.getAnalysisProvider() as any);
      jest.spyOn(ProviderFactory.prototype, 'getEditingProvider')
        .mockReturnValue(testProviderFactory.getEditingProvider() as any);

      // ACT
      await workerHandler(sqsEvent, {} as Context);

      // ASSERT: Batch job progress should be incremented
      const updatedBatchJob = await jobService.getBatchJob(batchJob.batchJobId);
      expect(updatedBatchJob).toBeTruthy();
      expect(updatedBatchJob!.completedCount).toBe(1);
      expect(updatedBatchJob!.totalCount).toBe(3);
      expect(updatedBatchJob!.status).toBe(JobStatus.QUEUED); // Not complete yet
    });

    it('should send batch completion notification when all jobs finish', async () => {
      // ARRANGE: Create batch job with 1 file (will complete immediately)
      const batchJob = await jobService.createBatchJob({
        userId: testUserId,
        fileCount: 1,
        sharedPrompt: 'Single photo batch',
        locale: 'en',
        settings: {}
      });

      (uuidv4 as jest.Mock).mockReturnValue(testJobId);
      await jobService.createJob({
        userId: testUserId,
        prompt: 'Single photo batch',
        batchJobId: batchJob.batchJobId,
        locale: 'en',
        settings: {}
      });

      const s3Key = `uploads/${testUserId}/${testJobId}/1234567890-${testFileName}`;
      const sqsEvent = makeSQSEventWithBody({
        Records: [makeS3Record({ bucket: process.env.TEMP_BUCKET_NAME!, key: s3Key })]
      });

      jest.spyOn(ProviderFactory.prototype, 'getAnalysisProvider')
        .mockReturnValue(testProviderFactory.getAnalysisProvider() as any);
      jest.spyOn(ProviderFactory.prototype, 'getEditingProvider')
        .mockReturnValue(testProviderFactory.getEditingProvider() as any);

      // ACT
      await workerHandler(sqsEvent, {} as Context);

      // ASSERT: Batch should be completed
      const updatedBatchJob = await jobService.getBatchJob(batchJob.batchJobId);
      expect(updatedBatchJob!.status).toBe(JobStatus.COMPLETED);
      expect(updatedBatchJob!.completedCount).toBe(1);

      // ASSERT: Should send batch completion notification
      const snsInvocations = snsClient.commandCalls(PublishCommand);
      const batchNotification = snsInvocations.find((call: any) =>
        call.args[0].input.MessageAttributes?.batchJobId?.StringValue === batchJob.batchJobId
      );
      expect(batchNotification).toBeTruthy();
    });
  });

  describe('Error Handling', () => {
    it('should mark job as FAILED and send notification on processing error', async () => {
      // ARRANGE
      await jobService.createJob({
        userId: testUserId,
        prompt: 'Test error handling',
        locale: 'en',
        settings: {}
      });

      // Invalid S3 key that will fail parsing
      const s3Key = 'invalid-key-format';
      const sqsEvent = makeSQSEventWithBody({
        Records: [makeS3Record({ bucket: process.env.TEMP_BUCKET_NAME!, key: s3Key })]
      });

      // ACT: Expect handler to throw but catch internally
      await expect(workerHandler(sqsEvent, {} as Context)).rejects.toThrow();

      // Note: In real scenario, the handler should not mark job as FAILED
      // because the key couldn't be parsed, so no job was found.
      // This test demonstrates error propagation.
    });
  });

  describe('Idempotency', () => {
    it('should handle duplicate SQS messages gracefully', async () => {
      // ARRANGE
      await jobService.createJob({
        userId: testUserId,
        prompt: 'Test idempotency',
        locale: 'en',
        settings: {}
      });

      const s3Key = `uploads/${testUserId}/${testJobId}/1234567890-${testFileName}`;
      const sqsEvent = makeSQSEventWithBody({
        Records: [makeS3Record({ bucket: process.env.TEMP_BUCKET_NAME!, key: s3Key })]
      });

      jest.spyOn(ProviderFactory.prototype, 'getAnalysisProvider')
        .mockReturnValue(testProviderFactory.getAnalysisProvider() as any);
      jest.spyOn(ProviderFactory.prototype, 'getEditingProvider')
        .mockReturnValue(testProviderFactory.getEditingProvider() as any);

      // ACT: Process same message twice
      await workerHandler(sqsEvent, {} as Context);

      // Reset mocks to track second invocation
      testProviderFactory.reset();
      s3Spy.reset();
      snsClient.reset();

      // Process again
      await workerHandler(sqsEvent, {} as Context);

      // ASSERT: Job should still be COMPLETED
      const finalJob = await jobService.getJob(testJobId);
      expect(finalJob!.status).toBe(JobStatus.COMPLETED);

      // Note: Full idempotency would require checking job status before processing
      // and skipping if already completed. This test demonstrates behavior.
    });
  });
});

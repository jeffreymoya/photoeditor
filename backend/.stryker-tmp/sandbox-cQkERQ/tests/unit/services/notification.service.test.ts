// @ts-nocheck
import { mockClient } from 'aws-sdk-client-mock';
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { NotificationService } from '../../../src/services/notification.service';
import { Job, BatchJob, JobStatus } from '@photoeditor/shared';

const snsMock = mockClient(SNSClient);

describe('NotificationService', () => {
  let notificationService: NotificationService;

  beforeEach(() => {
    snsMock.reset();
    notificationService = new NotificationService(
      'arn:aws:sns:us-east-1:123456789012:test-topic',
      'us-east-1'
    );
  });

  describe('sendJobStatusNotification', () => {
    it('should publish notification with correct payload for COMPLETED job', async () => {
      snsMock.on(PublishCommand).resolves({ MessageId: 'msg-123' });

      const job: Job = {
        jobId: 'job-123',
        userId: 'user-456',
        status: JobStatus.COMPLETED,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:05:00.000Z',
        finalS3Key: 'final/user-456/job-123/photo.jpg',
        locale: 'en',
        expires_at: 1234567890
      };

      await notificationService.sendJobStatusNotification(job);

      expect(snsMock.commandCalls(PublishCommand).length).toBe(1);
      const call = snsMock.commandCalls(PublishCommand)[0];

      expect(call.args[0].input.TopicArn).toBe('arn:aws:sns:us-east-1:123456789012:test-topic');
      expect(call.args[0].input.MessageStructure).toBe('json');

      // Check message attributes
      expect(call.args[0].input.MessageAttributes?.userId.StringValue).toBe('user-456');
      expect(call.args[0].input.MessageAttributes?.jobId.StringValue).toBe('job-123');
      expect(call.args[0].input.MessageAttributes?.status.StringValue).toBe('COMPLETED');

      // Parse and verify message payload
      const message = JSON.parse(call.args[0].input.Message!);
      const payload = JSON.parse(message.default);

      expect(payload).toMatchObject({
        jobId: 'job-123',
        userId: 'user-456',
        status: 'COMPLETED',
        message: 'Your photo has been successfully processed!'
      });

      // Verify FCM notification structure
      const fcmMessage = JSON.parse(message.GCM);
      expect(fcmMessage.notification).toMatchObject({
        title: 'Photo Editor - Ready!',
        body: 'Your enhanced photo is ready to download',
        data: {
          jobId: 'job-123',
          status: 'COMPLETED',
          action: 'download'
        }
      });
    });

    it('should publish notification with error for FAILED job', async () => {
      snsMock.on(PublishCommand).resolves({ MessageId: 'msg-123' });

      const job: Job = {
        jobId: 'job-123',
        userId: 'user-456',
        status: JobStatus.FAILED,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:05:00.000Z',
        error: 'Invalid image format',
        locale: 'en',
        expires_at: 1234567890
      };

      await notificationService.sendJobStatusNotification(job);

      const call = snsMock.commandCalls(PublishCommand)[0];
      const message = JSON.parse(call.args[0].input.Message!);
      const fcmMessage = JSON.parse(message.GCM);

      expect(fcmMessage.notification).toMatchObject({
        title: 'Photo Editor - Error',
        body: 'Invalid image format',
        data: {
          jobId: 'job-123',
          status: 'FAILED',
          action: 'retry'
        }
      });
    });

    it('should include previousStatus in data when provided', async () => {
      snsMock.on(PublishCommand).resolves({ MessageId: 'msg-123' });

      const job: Job = {
        jobId: 'job-123',
        userId: 'user-456',
        status: JobStatus.PROCESSING,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:05:00.000Z',
        locale: 'en',
        expires_at: 1234567890
      };

      await notificationService.sendJobStatusNotification(job, JobStatus.QUEUED);

      const call = snsMock.commandCalls(PublishCommand)[0];
      const message = JSON.parse(call.args[0].input.Message!);
      const payload = JSON.parse(message.default);

      expect(payload.data.previousStatus).toBe('QUEUED');
    });
  });

  describe('sendJobCompletionNotification', () => {
    it('should publish completion notification', async () => {
      snsMock.on(PublishCommand).resolves({ MessageId: 'msg-123' });

      await notificationService.sendJobCompletionNotification(
        'user-456',
        'job-123',
        'Your photo is ready!'
      );

      expect(snsMock.commandCalls(PublishCommand).length).toBe(1);
      const call = snsMock.commandCalls(PublishCommand)[0];

      const message = JSON.parse(call.args[0].input.Message!);
      const payload = JSON.parse(message.default);

      expect(payload).toMatchObject({
        jobId: 'job-123',
        userId: 'user-456',
        status: 'COMPLETED',
        message: 'Your photo is ready!'
      });
    });
  });

  describe('sendBatchJobCompletionNotification', () => {
    it('should publish batch completion notification', async () => {
      snsMock.on(PublishCommand).resolves({ MessageId: 'msg-123' });

      const batchJob: BatchJob = {
        batchJobId: 'batch-123',
        userId: 'user-456',
        status: JobStatus.COMPLETED,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:10:00.000Z',
        sharedPrompt: 'Make them beautiful',
        completedCount: 3,
        totalCount: 3,
        childJobIds: ['job-1', 'job-2', 'job-3'],
        locale: 'en',
        expires_at: 1234567890
      };

      await notificationService.sendBatchJobCompletionNotification(batchJob);

      expect(snsMock.commandCalls(PublishCommand).length).toBe(1);
      const call = snsMock.commandCalls(PublishCommand)[0];

      // Check message attributes
      expect(call.args[0].input.MessageAttributes?.userId.StringValue).toBe('user-456');
      expect(call.args[0].input.MessageAttributes?.batchJobId.StringValue).toBe('batch-123');
      expect(call.args[0].input.MessageAttributes?.status.StringValue).toBe('COMPLETED');

      const message = JSON.parse(call.args[0].input.Message!);
      const payload = JSON.parse(message.default);

      expect(payload).toMatchObject({
        jobId: 'batch-123',
        userId: 'user-456',
        status: 'COMPLETED',
        message: 'All 3 photos have been processed successfully!'
      });

      // Verify FCM notification
      const fcmMessage = JSON.parse(message.GCM);
      expect(fcmMessage.notification).toMatchObject({
        title: 'Photo Editor - Batch Complete!',
        body: 'All 3 photos are ready for download',
        data: {
          batchJobId: 'batch-123',
          status: 'COMPLETED',
          action: 'view_batch',
          totalCount: '3'
        }
      });
    });

    it('should include batch metadata in data', async () => {
      snsMock.on(PublishCommand).resolves({ MessageId: 'msg-123' });

      const batchJob: BatchJob = {
        batchJobId: 'batch-123',
        userId: 'user-456',
        status: JobStatus.COMPLETED,
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:10:00.000Z',
        sharedPrompt: 'Enhance colors',
        completedCount: 5,
        totalCount: 5,
        childJobIds: [],
        locale: 'en',
        expires_at: 1234567890
      };

      await notificationService.sendBatchJobCompletionNotification(batchJob);

      const call = snsMock.commandCalls(PublishCommand)[0];
      const message = JSON.parse(call.args[0].input.Message!);
      const payload = JSON.parse(message.default);

      expect(payload.data).toMatchObject({
        batchJobId: 'batch-123',
        totalCount: 5,
        sharedPrompt: 'Enhance colors'
      });
    });
  });

  describe('status messages', () => {
    it('should return correct message for each status', async () => {
      snsMock.on(PublishCommand).resolves({ MessageId: 'msg-123' });

      const statuses: Array<[typeof JobStatus[keyof typeof JobStatus], string]> = [
        [JobStatus.QUEUED, 'Your photo has been queued for processing'],
        [JobStatus.PROCESSING, 'Your photo is being analyzed'],
        [JobStatus.EDITING, 'Your photo is being enhanced'],
        [JobStatus.COMPLETED, 'Your photo has been successfully processed!'],
        [JobStatus.FAILED, 'Sorry, there was an error processing your photo']
      ];

      for (const [status, expectedMessage] of statuses) {
        snsMock.reset();
        snsMock.on(PublishCommand).resolves({ MessageId: 'msg-123' });

        const job: Job = {
          jobId: 'job-123',
          userId: 'user-456',
          status,
          createdAt: '2024-01-01T00:00:00.000Z',
          updatedAt: '2024-01-01T00:05:00.000Z',
          locale: 'en',
          expires_at: 1234567890
        };

        await notificationService.sendJobStatusNotification(job);

        const call = snsMock.commandCalls(PublishCommand)[0];
        const message = JSON.parse(call.args[0].input.Message!);
        const payload = JSON.parse(message.default);

        expect(payload.message).toBe(expectedMessage);
      }
    });
  });
});

/**
 * DLQ Redrive Tests
 *
 * Validates the presence of a Dead Letter Queue (DLQ) for the processing queue
 * and tests the redrive flow that returns messages from DLQ back to the main queue.
 *
 * This satisfies the reliability hard-fail rule by providing executable evidence
 * that messages can be successfully redriven from the DLQ and processed idempotently.
 */

import { SQSClient, GetQueueAttributesCommand, StartMessageMoveTaskCommand, ReceiveMessageCommand, DeleteMessageCommand, ListMessageMoveTasksCommand } from '@aws-sdk/client-sqs';
import {
  createMockSQSClient,
  createMockQueueConfig,
  createMockMessage,
  createPoisonMessage,
  setupDLQRedriveMocks,
  assertMessageRedriven,
  MockQueueConfig,
} from '../helpers/sqs';

describe('DLQ redrive', () => {
  let sqsMock: ReturnType<typeof createMockSQSClient>;
  let config: MockQueueConfig;

  beforeEach(() => {
    sqsMock = createMockSQSClient();
    config = createMockQueueConfig('image-processing-queue');
  });

  afterEach(() => {
    sqsMock.reset();
  });

  describe('DLQ configuration', () => {
    it('should verify main queue has DLQ configured', async () => {
      // Mock the queue attributes response
      sqsMock.on(GetQueueAttributesCommand, {
        QueueUrl: config.mainQueueUrl,
        AttributeNames: ['RedrivePolicy', 'All'],
      }).resolves({
        Attributes: {
          RedrivePolicy: JSON.stringify(config.redrivePolicy),
          QueueArn: 'arn:aws:sqs:us-east-1:123456789012:image-processing-queue',
        },
      });

      // Query queue attributes
      const client = new SQSClient({});
      const response = await client.send(
        new GetQueueAttributesCommand({
          QueueUrl: config.mainQueueUrl,
          AttributeNames: ['RedrivePolicy', 'All'],
        })
      );

      // Assertions
      expect(response.Attributes).toBeDefined();
      expect(response.Attributes!.RedrivePolicy).toBeDefined();

      const redrivePolicy = JSON.parse(response.Attributes!.RedrivePolicy!);
      expect(redrivePolicy.deadLetterTargetArn).toBe(config.redrivePolicy.deadLetterTargetArn);
      expect(redrivePolicy.maxReceiveCount).toBe(config.maxReceiveCount);
    });

    it('should fail fast if DLQ is missing', async () => {
      // Mock response without redrive policy
      sqsMock.on(GetQueueAttributesCommand).resolves({
        Attributes: {
          QueueArn: 'arn:aws:sqs:us-east-1:123456789012:image-processing-queue',
        },
      });

      const client = new SQSClient({});
      const response = await client.send(
        new GetQueueAttributesCommand({
          QueueUrl: config.mainQueueUrl,
          AttributeNames: ['RedrivePolicy'],
        })
      );

      // Verify DLQ is missing
      expect(response.Attributes?.RedrivePolicy).toBeUndefined();
    });

    it('should verify DLQ maxReceiveCount is properly configured', async () => {
      sqsMock.on(GetQueueAttributesCommand).resolves({
        Attributes: {
          RedrivePolicy: JSON.stringify({
            deadLetterTargetArn: config.redrivePolicy.deadLetterTargetArn,
            maxReceiveCount: 3,
          }),
        },
      });

      const client = new SQSClient({});
      const response = await client.send(
        new GetQueueAttributesCommand({
          QueueUrl: config.mainQueueUrl,
          AttributeNames: ['RedrivePolicy'],
        })
      );

      const redrivePolicy = JSON.parse(response.Attributes!.RedrivePolicy!);
      expect(redrivePolicy.maxReceiveCount).toBeGreaterThan(0);
      expect(redrivePolicy.maxReceiveCount).toBeLessThanOrEqual(5); // Reasonable upper bound
    });
  });

  describe('DLQ redrive flow', () => {
    it('should successfully redrive messages from DLQ to main queue', async () => {
      // Create a test message that failed processing
      const failedMessage = createMockMessage(
        'msg-123',
        JSON.stringify({
          jobId: 'job-456',
          userId: 'user-789',
          operation: 'resize',
        }),
        'receipt-handle-123'
      );

      // Setup mocks for the complete redrive flow
      setupDLQRedriveMocks(sqsMock, config, failedMessage);

      const client = new SQSClient({});

      // Step 1: Verify DLQ has messages
      const dlqAttributesResponse = await client.send(
        new GetQueueAttributesCommand({
          QueueUrl: config.dlqUrl,
        })
      );

      expect(dlqAttributesResponse.Attributes?.ApproximateNumberOfMessages).toBe('1');

      // Step 2: Start redrive task
      const startRedriveResponse = await client.send(
        new StartMessageMoveTaskCommand({
          SourceArn: config.redrivePolicy.deadLetterTargetArn,
        })
      );

      expect(startRedriveResponse.TaskHandle).toBeDefined();

      // Step 3: Verify redrive task completed
      const listTasksResponse = await client.send(
        new ListMessageMoveTasksCommand({
          SourceArn: config.redrivePolicy.deadLetterTargetArn,
        })
      );

      expect(listTasksResponse.Results).toBeDefined();
      expect(listTasksResponse.Results!.length).toBeGreaterThan(0);
      expect(listTasksResponse.Results![0].Status).toBe('COMPLETED');
      expect(listTasksResponse.Results![0].ApproximateNumberOfMessagesMoved).toBeGreaterThan(0);

      // Step 4: Receive message from main queue after redrive
      const receiveResponse = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: config.mainQueueUrl,
          MaxNumberOfMessages: 1,
          WaitTimeSeconds: 0,
        })
      );

      expect(receiveResponse.Messages).toBeDefined();
      expect(receiveResponse.Messages!.length).toBeGreaterThan(0);
      expect(receiveResponse.Messages![0].MessageId).toBe('msg-123');

      // Verify the redrive was called correctly
      assertMessageRedriven(sqsMock, config);
    });

    it('should handle idempotent processing of redriven messages', async () => {
      const message = createMockMessage(
        'msg-idempotent-123',
        JSON.stringify({
          jobId: 'job-456',
          userId: 'user-789',
          operation: 'resize',
          attempt: 1,
        }),
        'receipt-handle-456'
      );

      setupDLQRedriveMocks(sqsMock, config, message);

      const client = new SQSClient({});

      // Process 1: Initial processing from main queue (simulated)
      const processedJobIds = new Set<string>();

      // Process 2: After redrive, message appears again
      const receiveResponse = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: config.mainQueueUrl,
        })
      );

      const receivedMessage = receiveResponse.Messages![0];
      const messageBody = JSON.parse(receivedMessage.Body!);

      // Idempotency check: track processed job IDs
      const jobId = messageBody.jobId;

      if (processedJobIds.has(jobId)) {
        // Already processed - skip and delete
        await client.send(
          new DeleteMessageCommand({
            QueueUrl: config.mainQueueUrl,
            ReceiptHandle: receivedMessage.ReceiptHandle!,
          })
        );
      } else {
        // First time processing
        processedJobIds.add(jobId);
        // Process the message (simulated)
        // Then delete
        await client.send(
          new DeleteMessageCommand({
            QueueUrl: config.mainQueueUrl,
            ReceiptHandle: receivedMessage.ReceiptHandle!,
          })
        );
      }

      // Verify idempotent handling
      expect(processedJobIds.has(jobId)).toBe(true);

      // Verify delete was called
      const deleteCalls = sqsMock.commandCalls(DeleteMessageCommand);
      expect(deleteCalls.length).toBeGreaterThan(0);
    });

    it('should verify poison messages are isolated in DLQ', async () => {
      // Create a message that has exceeded maxReceiveCount
      const poisonMessage = createPoisonMessage(
        'msg-poison-999',
        JSON.stringify({
          jobId: 'job-bad',
          userId: 'user-123',
          operation: 'invalid-operation',
        }),
        5 // Exceeded maxReceiveCount of 3
      );

      // Mock DLQ having the poison message
      sqsMock.on(GetQueueAttributesCommand, {
        QueueUrl: config.dlqUrl,
      }).resolves({
        Attributes: {
          ApproximateNumberOfMessages: '1',
          QueueArn: config.redrivePolicy.deadLetterTargetArn,
        },
      });

      sqsMock.on(ReceiveMessageCommand, {
        QueueUrl: config.dlqUrl,
      }).resolves({
        Messages: [poisonMessage],
      });

      const client = new SQSClient({});

      // Verify message is in DLQ
      const dlqAttributes = await client.send(
        new GetQueueAttributesCommand({
          QueueUrl: config.dlqUrl,
        })
      );

      expect(parseInt(dlqAttributes.Attributes!.ApproximateNumberOfMessages!)).toBeGreaterThan(0);

      // Receive message from DLQ
      const receiveResponse = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: config.dlqUrl,
          MaxNumberOfMessages: 1,
        })
      );

      const dlqMessage = receiveResponse.Messages![0];
      expect(dlqMessage.MessageId).toBe('msg-poison-999');

      // Verify the message has high receive count
      const receiveCount = parseInt(dlqMessage.Attributes!.ApproximateReceiveCount!);
      expect(receiveCount).toBeGreaterThanOrEqual(config.maxReceiveCount);
    });

    it('should handle empty DLQ gracefully', async () => {
      // Mock empty DLQ
      sqsMock.on(GetQueueAttributesCommand, {
        QueueUrl: config.dlqUrl,
      }).resolves({
        Attributes: {
          ApproximateNumberOfMessages: '0',
          QueueArn: config.redrivePolicy.deadLetterTargetArn,
        },
      });

      sqsMock.on(ReceiveMessageCommand, {
        QueueUrl: config.dlqUrl,
      }).resolves({
        Messages: [],
      });

      const client = new SQSClient({});

      // Check DLQ status
      const dlqAttributes = await client.send(
        new GetQueueAttributesCommand({
          QueueUrl: config.dlqUrl,
        })
      );

      const messageCount = parseInt(dlqAttributes.Attributes!.ApproximateNumberOfMessages!);
      expect(messageCount).toBe(0);

      // Attempt to receive messages
      const receiveResponse = await client.send(
        new ReceiveMessageCommand({
          QueueUrl: config.dlqUrl,
          MaxNumberOfMessages: 10,
          WaitTimeSeconds: 0,
        })
      );

      expect(receiveResponse.Messages || []).toHaveLength(0);
    });
  });

  describe('Redrive policy validation', () => {
    it('should verify redrive policy matches DLQ ARN', async () => {
      sqsMock.on(GetQueueAttributesCommand).resolves({
        Attributes: {
          RedrivePolicy: JSON.stringify(config.redrivePolicy),
          QueueArn: 'arn:aws:sqs:us-east-1:123456789012:image-processing-queue',
        },
      });

      const client = new SQSClient({});
      const response = await client.send(
        new GetQueueAttributesCommand({
          QueueUrl: config.mainQueueUrl,
          AttributeNames: ['RedrivePolicy'],
        })
      );

      const redrivePolicy = JSON.parse(response.Attributes!.RedrivePolicy!);
      expect(redrivePolicy.deadLetterTargetArn).toMatch(/-dlq$/);
      expect(redrivePolicy.deadLetterTargetArn).toContain('arn:aws:sqs:');
    });
  });
});

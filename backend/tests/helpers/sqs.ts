/**
 * SQS Test Helpers
 *
 * Utilities for testing SQS queue operations, including DLQ redrive scenarios.
 */

import { mockClient } from 'aws-sdk-client-mock';
import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  GetQueueAttributesCommand,
  StartMessageMoveTaskCommand,
  ListMessageMoveTasksCommand,
  Message
} from '@aws-sdk/client-sqs';

/**
 * Create a mock SQS client for testing
 */
export function createMockSQSClient() {
  return mockClient(SQSClient);
}

/**
 * Mock message structure for testing
 */
export interface MockMessage {
  messageId: string;
  body: string;
  receiptHandle: string;
  attributes?: Record<string, string>;
  messageAttributes?: Record<string, any>;
}

/**
 * Helper to create a mock SQS message
 */
export function createMockMessage(
  messageId: string,
  body: string,
  receiptHandle?: string,
  attributes?: Record<string, string>
): Message {
  return {
    MessageId: messageId,
    Body: body,
    ReceiptHandle: receiptHandle || `receipt-${messageId}`,
    Attributes: attributes,
  };
}

/**
 * Helper to simulate a message that should go to DLQ
 * (by exceeding max receive count)
 */
export function createPoisonMessage(
  messageId: string,
  body: string,
  receiveCount: number = 5
): Message {
  return createMockMessage(messageId, body, undefined, {
    ApproximateReceiveCount: String(receiveCount),
  });
}

/**
 * Mock queue configuration for testing
 */
export interface MockQueueConfig {
  mainQueueUrl: string;
  dlqUrl: string;
  maxReceiveCount: number;
  redrivePolicy: {
    deadLetterTargetArn: string;
    maxReceiveCount: number;
  };
}

/**
 * Create a mock queue configuration
 */
export function createMockQueueConfig(
  queueName: string = 'test-queue'
): MockQueueConfig {
  return {
    mainQueueUrl: `https://sqs.us-east-1.amazonaws.com/123456789012/${queueName}`,
    dlqUrl: `https://sqs.us-east-1.amazonaws.com/123456789012/${queueName}-dlq`,
    maxReceiveCount: 3,
    redrivePolicy: {
      deadLetterTargetArn: `arn:aws:sqs:us-east-1:123456789012:${queueName}-dlq`,
      maxReceiveCount: 3,
    },
  };
}

/**
 * Setup mock responses for a typical DLQ redrive flow
 */
export function setupDLQRedriveMocks(
  sqsMock: ReturnType<typeof mockClient>,
  config: MockQueueConfig,
  dlqMessage: Message
) {
  // Mock GetQueueAttributes to return redrive policy
  sqsMock.on(GetQueueAttributesCommand, {
    QueueUrl: config.mainQueueUrl,
    AttributeNames: ['RedrivePolicy', 'All'],
  }).resolves({
    Attributes: {
      RedrivePolicy: JSON.stringify(config.redrivePolicy),
      QueueArn: `arn:aws:sqs:us-east-1:123456789012:${config.mainQueueUrl.split('/').pop()}`,
    },
  });

  // Mock GetQueueAttributes for DLQ
  sqsMock.on(GetQueueAttributesCommand, {
    QueueUrl: config.dlqUrl,
  }).resolves({
    Attributes: {
      ApproximateNumberOfMessages: '1',
      QueueArn: config.redrivePolicy.deadLetterTargetArn,
    },
  });

  // Mock ReceiveMessage from DLQ
  sqsMock.on(ReceiveMessageCommand, {
    QueueUrl: config.dlqUrl,
  }).resolves({
    Messages: [dlqMessage],
  });

  // Mock StartMessageMoveTask for redrive
  sqsMock.on(StartMessageMoveTaskCommand).resolves({
    TaskHandle: 'mock-task-handle-123',
  });

  // Mock ListMessageMoveTasks to show completion
  sqsMock.on(ListMessageMoveTasksCommand).resolves({
    Results: [
      {
        TaskHandle: 'mock-task-handle-123',
        Status: 'COMPLETED',
        SourceArn: config.redrivePolicy.deadLetterTargetArn,
        DestinationArn: `arn:aws:sqs:us-east-1:123456789012:${config.mainQueueUrl.split('/').pop()}`,
        ApproximateNumberOfMessagesMoved: 1,
      },
    ],
  });

  // Mock ReceiveMessage from main queue after redrive
  sqsMock.on(ReceiveMessageCommand, {
    QueueUrl: config.mainQueueUrl,
  }).resolves({
    Messages: [dlqMessage],
  });

  // Mock DeleteMessage
  sqsMock.on(DeleteMessageCommand).resolves({});
}

/**
 * Helper to assert a message was successfully redriven from DLQ to main queue
 */
export function assertMessageRedriven(
  sqsMock: ReturnType<typeof mockClient>,
  config: MockQueueConfig
) {
  const startMoveCalls = sqsMock.commandCalls(StartMessageMoveTaskCommand);
  expect(startMoveCalls.length).toBeGreaterThan(0);

  const lastCall = startMoveCalls[startMoveCalls.length - 1];
  expect(lastCall.args[0].input).toMatchObject({
    SourceArn: config.redrivePolicy.deadLetterTargetArn,
  });
}

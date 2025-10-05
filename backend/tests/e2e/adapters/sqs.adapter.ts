/**
 * SQS E2E Test Adapter
 *
 * Provides SQS operations for E2E tests following handlers→services→adapters pattern.
 * Complexity: ≤5, LOC: ≤75 per STANDARDS.md line 36
 */

import { SQSClient, GetQueueAttributesCommand, ReceiveMessageCommand } from '@aws-sdk/client-sqs';
import { createSQSClient } from '../../../src/libs/aws-clients';

export interface QueueAttributes {
  approximateMessageCount: number;
  approximateDelayedMessageCount: number;
}

export class SQSTestAdapter {
  private client: SQSClient;

  constructor() {
    this.client = createSQSClient();
  }

  /**
   * Get queue attributes (CC=1)
   */
  async getQueueAttributes(queueUrl: string): Promise<QueueAttributes> {
    const response = await this.client.send(new GetQueueAttributesCommand({
      QueueUrl: queueUrl,
      AttributeNames: ['ApproximateNumberOfMessages', 'ApproximateNumberOfMessagesDelayed']
    }));

    return {
      approximateMessageCount: parseInt(response.Attributes?.ApproximateNumberOfMessages || '0', 10),
      approximateDelayedMessageCount: parseInt(response.Attributes?.ApproximateNumberOfMessagesDelayed || '0', 10)
    };
  }

  /**
   * Receive messages from queue (CC=1)
   */
  async receiveMessages(queueUrl: string, maxMessages: number = 1): Promise<any[]> {
    const response = await this.client.send(new ReceiveMessageCommand({
      QueueUrl: queueUrl,
      MaxNumberOfMessages: maxMessages,
      WaitTimeSeconds: 5
    }));

    return response.Messages || [];
  }

  /**
   * Check if DLQ is empty (CC=1)
   */
  async isDLQEmpty(dlqUrl: string): Promise<boolean> {
    const attributes = await this.getQueueAttributes(dlqUrl);
    return attributes.approximateMessageCount === 0;
  }
}

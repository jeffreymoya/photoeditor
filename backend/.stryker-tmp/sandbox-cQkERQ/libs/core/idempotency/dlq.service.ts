/**
 * Dead Letter Queue Service
 *
 * Provides utilities for handling DLQ operations including message inspection,
 * replay, and monitoring.
 *
 * This service ensures:
 * - Visibility into failed message processing (STANDARDS.md line 121)
 * - Support for manual message replay after fixing issues
 * - Structured logging for DLQ events (STANDARDS.md line 71)
 *
 * @module core/idempotency
 */

import {
  SQSClient,
  ReceiveMessageCommand,
  DeleteMessageCommand,
  SendMessageCommand,
  GetQueueAttributesCommand
} from '@aws-sdk/client-sqs';
import { Logger } from '@aws-lambda-powertools/logger';

/**
 * DLQ message metadata
 */
export interface DLQMessage {
  messageId: string;
  body: string;
  receiptHandle: string;
  attributes?: Record<string, string> | undefined;
  messageAttributes?: Record<string, unknown> | undefined;
  approximateReceiveCount?: number | undefined;
}

/**
 * Service for managing Dead Letter Queue operations
 *
 * Provides utilities for inspecting, replaying, and monitoring messages
 * that failed processing and were sent to the DLQ.
 */
export class DLQService {
  private sqsClient: SQSClient;
  private dlqUrl: string;
  private logger: Logger;

  /**
   * Creates a new DLQService instance
   *
   * @param sqsClient - Configured SQS client
   * @param dlqUrl - DLQ URL
   * @param logger - Powertools logger for structured logging
   */
  constructor(sqsClient: SQSClient, dlqUrl: string, logger: Logger) {
    this.sqsClient = sqsClient;
    this.dlqUrl = dlqUrl;
    this.logger = logger;
  }

  /**
   * Retrieves messages from the DLQ for inspection
   *
   * @param maxMessages - Maximum number of messages to retrieve (1-10)
   * @param visibilityTimeout - Visibility timeout in seconds
   * @returns Array of DLQ messages
   */
  async receiveMessages(
    maxMessages = 10,
    visibilityTimeout = 300
  ): Promise<DLQMessage[]> {
    try {
      const command = new ReceiveMessageCommand({
        QueueUrl: this.dlqUrl,
        MaxNumberOfMessages: Math.min(maxMessages, 10),
        VisibilityTimeout: visibilityTimeout,
        AttributeNames: ['All'],
        MessageAttributeNames: ['All']
      });

      const response = await this.sqsClient.send(command);
      const messages = response.Messages || [];

      return messages.map(msg => ({
        messageId: msg.MessageId || '',
        body: msg.Body || '',
        receiptHandle: msg.ReceiptHandle || '',
        attributes: msg.Attributes,
        messageAttributes: msg.MessageAttributes,
        approximateReceiveCount: msg.Attributes?.ApproximateReceiveCount
          ? parseInt(msg.Attributes.ApproximateReceiveCount, 10)
          : undefined
      }));
    } catch (error) {
      this.logger.error('Failed to receive DLQ messages', {
        error: error as Error,
        dlqUrl: this.dlqUrl
      });
      throw error;
    }
  }

  /**
   * Deletes a message from the DLQ after successful processing
   *
   * @param receiptHandle - Message receipt handle
   */
  async deleteMessage(receiptHandle: string): Promise<void> {
    try {
      const command = new DeleteMessageCommand({
        QueueUrl: this.dlqUrl,
        ReceiptHandle: receiptHandle
      });

      await this.sqsClient.send(command);

      this.logger.info('Deleted DLQ message', {
        receiptHandle
      });
    } catch (error) {
      this.logger.error('Failed to delete DLQ message', {
        error: error as Error,
        receiptHandle
      });
      throw error;
    }
  }

  /**
   * Replays a message from DLQ to the source queue
   *
   * @param message - DLQ message to replay
   * @param sourceQueueUrl - Source queue URL to replay the message to
   */
  async replayMessage(message: DLQMessage, sourceQueueUrl: string): Promise<void> {
    try {
      // Send the message back to the source queue
      const sendCommand = new SendMessageCommand({
        QueueUrl: sourceQueueUrl,
        MessageBody: message.body,
        MessageAttributes: message.messageAttributes as any
      });

      await this.sqsClient.send(sendCommand);

      // Delete the message from DLQ after successful replay
      await this.deleteMessage(message.receiptHandle);

      this.logger.info('Replayed DLQ message', {
        messageId: message.messageId,
        sourceQueueUrl
      });
    } catch (error) {
      this.logger.error('Failed to replay DLQ message', {
        error: error as Error,
        messageId: message.messageId,
        sourceQueueUrl
      });
      throw error;
    }
  }

  /**
   * Gets the approximate number of messages in the DLQ
   *
   * @returns Approximate message count
   */
  async getApproximateMessageCount(): Promise<number> {
    try {
      const command = new GetQueueAttributesCommand({
        QueueUrl: this.dlqUrl,
        AttributeNames: ['ApproximateNumberOfMessages']
      });

      const response = await this.sqsClient.send(command);
      const count = response.Attributes?.ApproximateNumberOfMessages;

      return count ? parseInt(count, 10) : 0;
    } catch (error) {
      this.logger.error('Failed to get DLQ message count', {
        error: error as Error,
        dlqUrl: this.dlqUrl
      });
      throw error;
    }
  }

  /**
   * Purges all messages from the DLQ (use with caution)
   *
   * Note: This operation is irreversible and should only be used
   * in development/testing or after manual inspection.
   */
  async purgeQueue(): Promise<void> {
    this.logger.warn('Purging DLQ - this operation is irreversible', {
      dlqUrl: this.dlqUrl
    });

    // Note: AWS SQS PurgeQueueCommand is rate-limited (once per 60 seconds)
    // For now, we'll receive and delete messages in batches
    let hasMoreMessages = true;

    while (hasMoreMessages) {
      const messages = await this.receiveMessages(10, 30);

      if (messages.length === 0) {
        hasMoreMessages = false;
        break;
      }

      await Promise.all(
        messages.map(msg => this.deleteMessage(msg.receiptHandle))
      );

      this.logger.info('Deleted batch from DLQ', {
        count: messages.length
      });
    }

    this.logger.info('DLQ purge completed', {
      dlqUrl: this.dlqUrl
    });
  }
}

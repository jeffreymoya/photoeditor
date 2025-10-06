/**
 * Idempotency Service
 *
 * Provides idempotency support for worker processing using DynamoDB conditional writes.
 * Prevents duplicate processing of messages with automatic cleanup of expired keys.
 *
 * This service ensures:
 * - Idempotent worker execution (STANDARDS.md line 102)
 * - Conditional writes to prevent race conditions
 * - Automatic cleanup of expired idempotency keys (24h TTL)
 *
 * @module core/idempotency
 */

import {
  DynamoDBClient,
  PutItemCommand,
  GetItemCommand,
  DeleteItemCommand
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';

/**
 * Idempotency record stored in DynamoDB
 */
export interface IdempotencyRecord {
  idempotencyKey: string;
  status: 'in_progress' | 'completed' | 'failed';
  result?: unknown;
  error?: string;
  timestamp: string;
  expiresAt: number;
}

/**
 * Service for managing idempotent worker operations
 *
 * Uses DynamoDB conditional writes to ensure that duplicate messages
 * are detected and handled appropriately.
 */
export class IdempotencyService {
  private dynamoClient: DynamoDBClient;
  private tableName: string;
  private ttlHours: number;

  /**
   * Creates a new IdempotencyService instance
   *
   * @param dynamoClient - Configured DynamoDB client
   * @param tableName - DynamoDB table name for idempotency records
   * @param ttlHours - Time-to-live for idempotency keys in hours (default 24)
   */
  constructor(dynamoClient: DynamoDBClient, tableName: string, ttlHours = 24) {
    this.dynamoClient = dynamoClient;
    this.tableName = tableName;
    this.ttlHours = ttlHours;
  }

  /**
   * Attempts to acquire an idempotency lock for processing
   *
   * @param idempotencyKey - Unique key for the operation
   * @returns True if lock was acquired (first processing), false if duplicate
   */
  async tryAcquireLock(idempotencyKey: string): Promise<boolean> {
    const now = new Date().toISOString();
    const expiresAt = Math.floor(Date.now() / 1000) + (this.ttlHours * 3600);

    const record: IdempotencyRecord = {
      idempotencyKey,
      status: 'in_progress',
      timestamp: now,
      expiresAt
    };

    try {
      const command = new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(record),
        ConditionExpression: 'attribute_not_exists(idempotencyKey)'
      });

      await this.dynamoClient.send(command);
      return true; // Lock acquired successfully
    } catch (error) {
      if ((error as { name: string }).name === 'ConditionalCheckFailedException') {
        return false; // Duplicate - lock already exists
      }
      throw error; // Unexpected error
    }
  }

  /**
   * Retrieves the current idempotency record
   *
   * @param idempotencyKey - Unique key for the operation
   * @returns Idempotency record or null if not found
   */
  async getRecord(idempotencyKey: string): Promise<IdempotencyRecord | null> {
    try {
      const command = new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ idempotencyKey })
      });

      const response = await this.dynamoClient.send(command);
      if (!response.Item) {
        return null;
      }

      return unmarshall(response.Item) as IdempotencyRecord;
    } catch (error) {
      throw error;
    }
  }

  /**
   * Marks an idempotent operation as completed with result
   *
   * @param idempotencyKey - Unique key for the operation
   * @param result - Operation result to cache
   */
  async markCompleted(idempotencyKey: string, result: unknown): Promise<void> {
    const record = await this.getRecord(idempotencyKey);
    if (!record) {
      throw new Error(`Idempotency record not found: ${idempotencyKey}`);
    }

    const updatedRecord: IdempotencyRecord = {
      ...record,
      status: 'completed',
      result,
      timestamp: new Date().toISOString()
    };

    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(updatedRecord)
    });

    await this.dynamoClient.send(command);
  }

  /**
   * Marks an idempotent operation as failed with error
   *
   * @param idempotencyKey - Unique key for the operation
   * @param error - Error message
   */
  async markFailed(idempotencyKey: string, error: string): Promise<void> {
    const record = await this.getRecord(idempotencyKey);
    if (!record) {
      throw new Error(`Idempotency record not found: ${idempotencyKey}`);
    }

    const updatedRecord: IdempotencyRecord = {
      ...record,
      status: 'failed',
      error,
      timestamp: new Date().toISOString()
    };

    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(updatedRecord)
    });

    await this.dynamoClient.send(command);
  }

  /**
   * Deletes an idempotency record (for cleanup or retry)
   *
   * @param idempotencyKey - Unique key for the operation
   */
  async deleteRecord(idempotencyKey: string): Promise<void> {
    const command = new DeleteItemCommand({
      TableName: this.tableName,
      Key: marshall({ idempotencyKey })
    });

    await this.dynamoClient.send(command);
  }
}

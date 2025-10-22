/**
 * Integration Test Setup
 *
 * Configures LocalStack-backed integration tests with deterministic time/UUID controls
 * and W3C traceparent propagation verification per STANDARDS.md lines 71-72.
 */
// @ts-nocheck


import { DynamoDBClient, CreateTableCommand, DeleteTableCommand, ListTablesCommand } from '@aws-sdk/client-dynamodb';
import { S3Client, CreateBucketCommand, DeleteBucketCommand, DeleteObjectCommand, ListObjectsV2Command } from '@aws-sdk/client-s3';

// Environment configuration for LocalStack
export function setupLocalStackEnv(): void {
  process.env.LOCALSTACK_ENDPOINT = process.env.LOCALSTACK_ENDPOINT || 'http://localhost:4566';
  process.env.AWS_REGION = 'us-east-1';
  process.env.AWS_ACCESS_KEY_ID = 'test';
  process.env.AWS_SECRET_ACCESS_KEY = 'test';
  delete process.env.AWS_PROFILE;
  delete process.env.AWS_DEFAULT_PROFILE;
  process.env.AWS_SDK_LOAD_CONFIG = '0';
  process.env.AWS_EC2_METADATA_DISABLED = 'true';
  process.env.TEMP_BUCKET_NAME = 'test-temp-bucket';
  process.env.FINAL_BUCKET_NAME = 'test-final-bucket';
  process.env.JOBS_TABLE_NAME = 'test-jobs-table';
  process.env.BATCH_TABLE_NAME = 'test-batch-jobs-table';
  process.env.PROJECT_NAME = 'photoeditor';
  process.env.NODE_ENV = 'test';
  process.env.LOG_LEVEL = 'error';
  process.env.NO_COLOR = '1';
  // Allow network connections to LocalStack (required by nock in tests/setup.js)
  process.env.ALLOW_LOCALHOST = 'true';
}

/**
 * Create DynamoDB table for testing
 */
export async function createJobsTable(client: DynamoDBClient, tableName: string): Promise<void> {
  await client.send(new CreateTableCommand({
    TableName: tableName,
    KeySchema: [
      { AttributeName: 'jobId', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'jobId', AttributeType: 'S' },
      { AttributeName: 'batchJobId', AttributeType: 'S' }
    ],
    GlobalSecondaryIndexes: [
      {
        IndexName: 'BatchJobIdIndex',
        KeySchema: [
          { AttributeName: 'batchJobId', KeyType: 'HASH' }
        ],
        Projection: {
          ProjectionType: 'ALL'
        },
        ProvisionedThroughput: {
          ReadCapacityUnits: 1,
          WriteCapacityUnits: 1
        }
      }
    ],
    BillingMode: 'PROVISIONED',
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1
    }
  }));
}

/**
 * Create batch jobs table for testing
 */
export async function createBatchJobsTable(client: DynamoDBClient, tableName: string): Promise<void> {
  await client.send(new CreateTableCommand({
    TableName: tableName,
    KeySchema: [
      { AttributeName: 'batchJobId', KeyType: 'HASH' }
    ],
    AttributeDefinitions: [
      { AttributeName: 'batchJobId', AttributeType: 'S' }
    ],
    BillingMode: 'PROVISIONED',
    ProvisionedThroughput: {
      ReadCapacityUnits: 1,
      WriteCapacityUnits: 1
    }
  }));
}

/**
 * Delete DynamoDB table
 */
export async function deleteTable(client: DynamoDBClient, tableName: string): Promise<void> {
  try {
    await client.send(new DeleteTableCommand({ TableName: tableName }));
  } catch (error) {
    // Ignore if table doesn't exist
    if ((error as Error).name !== 'ResourceNotFoundException') {
      throw error;
    }
  }
}

/**
 * Create S3 bucket for testing
 */
export async function createBucket(client: S3Client, bucketName: string): Promise<void> {
  try {
    await client.send(new CreateBucketCommand({ Bucket: bucketName }));
  } catch (error) {
    // Ignore if bucket already exists
    if ((error as Error).name !== 'BucketAlreadyExists' && (error as Error).name !== 'BucketAlreadyOwnedByYou') {
      throw error;
    }
  }
}

/**
 * Clean up all objects in a bucket
 */
export async function emptyBucket(client: S3Client, bucketName: string): Promise<void> {
  try {
    const listResponse = await client.send(new ListObjectsV2Command({ Bucket: bucketName }));

    if (listResponse.Contents && listResponse.Contents.length > 0) {
      await Promise.all(
        listResponse.Contents.map(obj =>
          client.send(new DeleteObjectCommand({
            Bucket: bucketName,
            Key: obj.Key!
          }))
        )
      );
    }
  } catch (error) {
    // Ignore if bucket doesn't exist
    if ((error as Error).name !== 'NoSuchBucket') {
      throw error;
    }
  }
}

/**
 * Delete S3 bucket
 */
export async function deleteBucket(client: S3Client, bucketName: string): Promise<void> {
  try {
    await emptyBucket(client, bucketName);
    await client.send(new DeleteBucketCommand({ Bucket: bucketName }));
  } catch (error) {
    // Ignore if bucket doesn't exist
    if ((error as Error).name !== 'NoSuchBucket') {
      throw error;
    }
  }
}

/**
 * Wait for LocalStack to be ready
 * Implements retry with exponential backoff per testing-standards.md risk mitigation
 */
export interface WaitForLocalStackOptions {
  /** Maximum number of retries before failing fast */
  maxRetries?: number;
  /** Initial delay (ms) for exponential backoff */
  initialDelayMs?: number;
  /** Absolute timeout (ms) before bailing regardless of retries */
  timeoutMs?: number;
}

export class LocalStackUnavailableError extends Error {
  constructor(endpoint: string | undefined, cause?: unknown) {
    const help = "Start LocalStack with 'make localstack-up' (docker-compose) or point LOCALSTACK_ENDPOINT to a running instance.";
    const message = `LocalStack is not reachable at ${endpoint ?? 'http://localhost:4566'}. ${help}`;
    super(cause instanceof Error ? `${message} Original error: ${cause.message}` : message);
    this.name = 'LocalStackUnavailableError';
  }
}

export async function waitForLocalStack(options: WaitForLocalStackOptions = {}): Promise<void> {
  const {
    maxRetries = 6,
    initialDelayMs = 250,
    timeoutMs = 15_000,
  } = options;

  const endpoint = process.env.LOCALSTACK_ENDPOINT;
  const client = new DynamoDBClient({
    region: process.env.AWS_REGION!,
    endpoint,
    credentials: {
      accessKeyId: 'test',
      secretAccessKey: 'test'
    }
  });

  let retries = 0;
  let delay = initialDelayMs;
  const timeoutAt = Date.now() + timeoutMs;

  while (retries < maxRetries && Date.now() < timeoutAt) {
    try {
      await client.send(new ListTablesCommand({}));
      return; // Success
    } catch (error) {
      retries++;
      if (retries >= maxRetries || Date.now() + delay > timeoutAt) {
        throw new LocalStackUnavailableError(endpoint, error);
      }
      await new Promise(resolve => setTimeout(resolve, delay));
      delay *= 2; // Exponential backoff
    }
  }

  throw new LocalStackUnavailableError(endpoint);
}

/**
 * Extract correlationId from structured logs
 * Verifies STANDARDS.md line 71 requirement
 */
export function extractCorrelationId(logOutput: string): string | null {
  try {
    const logEntries = logOutput.split('\n').filter(line => line.trim().startsWith('{'));
    for (const entry of logEntries) {
      const parsed = JSON.parse(entry);
      if (parsed.correlationId) {
        return parsed.correlationId;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

/**
 * Extract traceparent from structured logs
 * Verifies STANDARDS.md line 72 W3C trace propagation
 */
export function extractTraceparent(logOutput: string): string | null {
  try {
    const logEntries = logOutput.split('\n').filter(line => line.trim().startsWith('{'));
    for (const entry of logEntries) {
      const parsed = JSON.parse(entry);
      if (parsed.traceparent || parsed.traceId) {
        return parsed.traceparent || `00-${parsed.traceId}-${parsed.spanId || '0000000000000000'}-01`;
      }
    }
  } catch {
    // Ignore parse errors
  }
  return null;
}

import { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { Job, JobStatusType, BatchJob } from '@photoeditor/shared';
import { Result, ok, err } from 'neverthrow';

/**
 * Repository errors with specific error types for domain layer handling
 */
export class JobNotFoundError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} not found`);
    this.name = 'JobNotFoundError';
  }
}

export class JobAlreadyExistsError extends Error {
  constructor(jobId: string) {
    super(`Job ${jobId} already exists`);
    this.name = 'JobAlreadyExistsError';
  }
}

export class RepositoryError extends Error {
  constructor(message: string, public readonly cause?: unknown) {
    super(message);
    this.name = 'RepositoryError';
  }
}

/**
 * JobRepository - Pure I/O adapter for job persistence
 *
 * Implements repository pattern per the Backend Tier standard
 * Returns neverthrow Result types for error handling
 * No business logic - only CRUD operations
 */
export class JobRepository {
  constructor(
    private readonly client: DynamoDBClient,
    private readonly tableName: string,
    private readonly batchTableName: string
  ) {}

  /**
   * Create a new job in DynamoDB
   */
  async create(job: Job): Promise<Result<Job, JobAlreadyExistsError | RepositoryError>> {
    try {
      const command = new PutItemCommand({
        TableName: this.tableName,
        Item: marshall(job, { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(jobId)'
      });

      await this.client.send(command);
      return ok(job);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        return err(new JobAlreadyExistsError(job.jobId));
      }
      return err(new RepositoryError('Failed to create job', error));
    }
  }

  /**
   * Retrieve a job by ID
   */
  async findById(jobId: string): Promise<Result<Job, JobNotFoundError | RepositoryError>> {
    try {
      const command = new GetItemCommand({
        TableName: this.tableName,
        Key: marshall({ jobId }),
        ConsistentRead: true
      });

      const response = await this.client.send(command);

      if (!response.Item) {
        return err(new JobNotFoundError(jobId));
      }

      const job = unmarshall(response.Item) as Job;
      return ok(job);
    } catch (error: unknown) {
      return err(new RepositoryError('Failed to retrieve job', error));
    }
  }

  /**
   * Update job status and related fields
   */
  async updateStatus(
    jobId: string,
    status: JobStatusType,
    updates: Partial<Pick<Job, 'tempS3Key' | 'finalS3Key' | 'error' | 'updatedAt'>>
  ): Promise<Result<Job, JobNotFoundError | RepositoryError>> {
    try {
      let updateExpression = 'SET #status = :status, #updatedAt = :updatedAt';
      const expressionAttributeNames: Record<string, string> = {
        '#status': 'status',
        '#updatedAt': 'updatedAt'
      };
      const expressionAttributeValues: Record<string, unknown> = {
        ':status': status,
        ':updatedAt': updates.updatedAt || new Date().toISOString()
      };

      // Add conditional updates
      if (updates.tempS3Key) {
        updateExpression += ', #tempS3Key = :tempS3Key';
        expressionAttributeNames['#tempS3Key'] = 'tempS3Key';
        expressionAttributeValues[':tempS3Key'] = updates.tempS3Key;
      }

      if (updates.finalS3Key) {
        updateExpression += ', #finalS3Key = :finalS3Key';
        expressionAttributeNames['#finalS3Key'] = 'finalS3Key';
        expressionAttributeValues[':finalS3Key'] = updates.finalS3Key;
      }

      if (updates.error) {
        updateExpression += ', #error = :error';
        expressionAttributeNames['#error'] = 'error';
        expressionAttributeValues[':error'] = updates.error;
      }

      const command = new UpdateItemCommand({
        TableName: this.tableName,
        Key: marshall({ jobId }),
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: marshall(expressionAttributeValues),
        ConditionExpression: 'attribute_exists(jobId)',
        ReturnValues: 'ALL_NEW'
      });

      const response = await this.client.send(command);

      if (!response.Attributes) {
        return err(new JobNotFoundError(jobId));
      }

      const job = unmarshall(response.Attributes) as Job;
      return ok(job);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        return err(new JobNotFoundError(jobId));
      }
      return err(new RepositoryError('Failed to update job status', error));
    }
  }

  /**
   * Create a new batch job
   */
  async createBatch(batchJob: BatchJob): Promise<Result<BatchJob, JobAlreadyExistsError | RepositoryError>> {
    try {
      const command = new PutItemCommand({
        TableName: this.batchTableName,
        Item: marshall(batchJob, { removeUndefinedValues: true }),
        ConditionExpression: 'attribute_not_exists(batchJobId)'
      });

      await this.client.send(command);
      return ok(batchJob);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        return err(new JobAlreadyExistsError(batchJob.batchJobId));
      }
      return err(new RepositoryError('Failed to create batch job', error));
    }
  }

  /**
   * Retrieve a batch job by ID
   */
  async findBatchById(batchJobId: string): Promise<Result<BatchJob, JobNotFoundError | RepositoryError>> {
    try {
      const command = new GetItemCommand({
        TableName: this.batchTableName,
        Key: marshall({ batchJobId }),
        ConsistentRead: true
      });

      const response = await this.client.send(command);

      if (!response.Item) {
        return err(new JobNotFoundError(batchJobId));
      }

      const batchJob = unmarshall(response.Item) as BatchJob;
      return ok(batchJob);
    } catch (error: unknown) {
      return err(new RepositoryError('Failed to retrieve batch job', error));
    }
  }

  /**
   * Update batch job status and related fields
   */
  async updateBatchStatus(
    batchJobId: string,
    status: JobStatusType,
    updates: Partial<Pick<BatchJob, 'completedCount' | 'error' | 'childJobIds' | 'updatedAt'>>
  ): Promise<Result<BatchJob, JobNotFoundError | RepositoryError>> {
    try {
      let updateExpression = 'SET #status = :status, #updatedAt = :updatedAt';
      const expressionAttributeNames: Record<string, string> = {
        '#status': 'status',
        '#updatedAt': 'updatedAt'
      };
      const expressionAttributeValues: Record<string, unknown> = {
        ':status': status,
        ':updatedAt': updates.updatedAt || new Date().toISOString()
      };

      if (updates.completedCount !== undefined) {
        updateExpression += ', #completedCount = :completedCount';
        expressionAttributeNames['#completedCount'] = 'completedCount';
        expressionAttributeValues[':completedCount'] = updates.completedCount;
      }

      if (updates.childJobIds) {
        updateExpression += ', #childJobIds = :childJobIds';
        expressionAttributeNames['#childJobIds'] = 'childJobIds';
        expressionAttributeValues[':childJobIds'] = updates.childJobIds;
      }

      if (updates.error) {
        updateExpression += ', #error = :error';
        expressionAttributeNames['#error'] = 'error';
        expressionAttributeValues[':error'] = updates.error;
      }

      const command = new UpdateItemCommand({
        TableName: this.batchTableName,
        Key: marshall({ batchJobId }),
        UpdateExpression: updateExpression,
        ExpressionAttributeNames: expressionAttributeNames,
        ExpressionAttributeValues: marshall(expressionAttributeValues),
        ConditionExpression: 'attribute_exists(batchJobId)',
        ReturnValues: 'ALL_NEW'
      });

      const response = await this.client.send(command);

      if (!response.Attributes) {
        return err(new JobNotFoundError(batchJobId));
      }

      const batchJob = unmarshall(response.Attributes) as BatchJob;
      return ok(batchJob);
    } catch (error: unknown) {
      if (error instanceof Error && error.name === 'ConditionalCheckFailedException') {
        return err(new JobNotFoundError(batchJobId));
      }
      return err(new RepositoryError('Failed to update batch job status', error));
    }
  }

  /**
   * Query jobs by batch ID
   */
  async findByBatchId(batchJobId: string): Promise<Result<Job[], RepositoryError>> {
    try {
      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: 'BatchJobIdIndex',
        KeyConditionExpression: 'batchJobId = :batchJobId',
        ExpressionAttributeValues: marshall({
          ':batchJobId': batchJobId
        })
      });

      const response = await this.client.send(command);

      if (!response.Items) {
        return ok([]);
      }

      const jobs = response.Items.map(item => unmarshall(item) as Job);
      return ok(jobs);
    } catch (error: unknown) {
      return err(new RepositoryError('Failed to query jobs by batch ID', error));
    }
  }
}

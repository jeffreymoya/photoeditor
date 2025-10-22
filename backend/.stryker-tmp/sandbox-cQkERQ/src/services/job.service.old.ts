// @ts-nocheck
import { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand, QueryCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { Job, JobStatus, JobStatusType, CreateJobRequest, APP_CONFIG, BatchJob, CreateBatchJobRequest } from '@photoeditor/shared';
import { v4 as uuidv4 } from 'uuid';
import { createDynamoDBClient } from '@backend/core';

export class JobService {
  private client: DynamoDBClient;
  private tableName: string;
  private batchTableName: string;

  constructor(tableName: string, region: string, batchTableName?: string, client?: DynamoDBClient) {
    this.tableName = tableName;
    this.batchTableName = batchTableName || `${tableName}-batches`;
    // Use provided client or create one via factory (STANDARDS.md line 26)
    this.client = client || createDynamoDBClient(region);
  }

  async createJob(request: CreateJobRequest): Promise<Job> {
    const now = new Date().toISOString();
    const expires_at = Math.floor(Date.now() / 1000) + (APP_CONFIG.JOB_TTL_DAYS * 24 * 60 * 60);

    const job: Job = {
      jobId: uuidv4(),
      userId: request.userId,
      status: JobStatus.QUEUED,
      createdAt: now,
      updatedAt: now,
      locale: request.locale || 'en',
      settings: request.settings,
      prompt: request.prompt,
      batchJobId: request.batchJobId,
      expires_at
    };

    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(job, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(jobId)'
    });

    await this.client.send(command);
    return job;
  }

  async getJob(jobId: string): Promise<Job | null> {
    const command = new GetItemCommand({
      TableName: this.tableName,
      Key: marshall({ jobId }),
      ConsistentRead: true
    });

    const response = await this.client.send(command);

    if (!response.Item) {
      return null;
    }

    return unmarshall(response.Item) as Job;
  }

  async updateJobStatus(
    jobId: string,
    status: JobStatusType,
    updates: Partial<Pick<Job, 'tempS3Key' | 'finalS3Key' | 'error'>> = {}
  ): Promise<Job> {
    const now = new Date().toISOString();

    let updateExpression = 'SET #status = :status, #updatedAt = :updatedAt';
    const expressionAttributeNames: Record<string, string> = {
      '#status': 'status',
      '#updatedAt': 'updatedAt'
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ':status': status,
      ':updatedAt': now
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
      throw new Error(`Job ${jobId} not found`);
    }

    return unmarshall(response.Attributes) as Job;
  }

  async markJobFailed(jobId: string, error: string): Promise<Job> {
    return this.updateJobStatus(jobId, JobStatus.FAILED, { error });
  }

  async markJobProcessing(jobId: string, tempS3Key: string): Promise<Job> {
    return this.updateJobStatus(jobId, JobStatus.PROCESSING, { tempS3Key });
  }

  async markJobEditing(jobId: string): Promise<Job> {
    return this.updateJobStatus(jobId, JobStatus.EDITING);
  }

  async markJobCompleted(jobId: string, finalS3Key: string): Promise<Job> {
    return this.updateJobStatus(jobId, JobStatus.COMPLETED, { finalS3Key });
  }

  isJobInProgress(status: JobStatusType): boolean {
    return status === JobStatus.QUEUED ||
           status === JobStatus.PROCESSING ||
           status === JobStatus.EDITING;
  }

  isJobTerminal(status: JobStatusType): boolean {
    return status === JobStatus.COMPLETED || status === JobStatus.FAILED;
  }

  // Batch Job Methods
  async createBatchJob(request: CreateBatchJobRequest): Promise<BatchJob> {
    const now = new Date().toISOString();
    const expires_at = Math.floor(Date.now() / 1000) + (APP_CONFIG.JOB_TTL_DAYS * 24 * 60 * 60);

    const batchJob: BatchJob = {
      batchJobId: uuidv4(),
      userId: request.userId,
      status: JobStatus.QUEUED,
      createdAt: now,
      updatedAt: now,
      sharedPrompt: request.sharedPrompt,
      individualPrompts: request.individualPrompts,
      childJobIds: [], // Will be populated when child jobs are created
      completedCount: 0,
      totalCount: request.fileCount,
      locale: request.locale || 'en',
      settings: request.settings,
      expires_at
    };

    const command = new PutItemCommand({
      TableName: this.batchTableName,
      Item: marshall(batchJob, { removeUndefinedValues: true }),
      ConditionExpression: 'attribute_not_exists(batchJobId)'
    });

    await this.client.send(command);
    return batchJob;
  }

  async getBatchJob(batchJobId: string): Promise<BatchJob | null> {
    const command = new GetItemCommand({
      TableName: this.batchTableName,
      Key: marshall({ batchJobId }),
      ConsistentRead: true
    });

    const response = await this.client.send(command);

    if (!response.Item) {
      return null;
    }

    return unmarshall(response.Item) as BatchJob;
  }

  async updateBatchJobStatus(
    batchJobId: string,
    status: JobStatusType,
    updates: Partial<Pick<BatchJob, 'completedCount' | 'error' | 'childJobIds'>> = {}
  ): Promise<BatchJob> {
    const now = new Date().toISOString();

    let updateExpression = 'SET #status = :status, #updatedAt = :updatedAt';
    const expressionAttributeNames: Record<string, string> = {
      '#status': 'status',
      '#updatedAt': 'updatedAt'
    };
    const expressionAttributeValues: Record<string, unknown> = {
      ':status': status,
      ':updatedAt': now
    };

    // Add conditional updates
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
      throw new Error(`Batch job ${batchJobId} not found`);
    }

    return unmarshall(response.Attributes) as BatchJob;
  }

  async incrementBatchJobProgress(batchJobId: string): Promise<BatchJob> {
    const batchJob = await this.getBatchJob(batchJobId);
    if (!batchJob) {
      throw new Error(`Batch job ${batchJobId} not found`);
    }

    const newCompletedCount = batchJob.completedCount + 1;
    const newStatus = newCompletedCount >= batchJob.totalCount ? JobStatus.COMPLETED : batchJob.status;

    return this.updateBatchJobStatus(batchJobId, newStatus, { completedCount: newCompletedCount });
  }

  async getJobsByBatchId(batchJobId: string): Promise<Job[]> {
    // Note: This requires a GSI on batchJobId in the jobs table
    const command = new QueryCommand({
      TableName: this.tableName,
      IndexName: 'BatchJobIdIndex', // GSI name
      KeyConditionExpression: 'batchJobId = :batchJobId',
      ExpressionAttributeValues: marshall({
        ':batchJobId': batchJobId
      })
    });

    const response = await this.client.send(command);

    if (!response.Items) {
      return [];
    }

    return response.Items.map(item => unmarshall(item) as Job);
  }
}

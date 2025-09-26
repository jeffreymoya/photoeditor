import { DynamoDBClient, PutItemCommand, GetItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import { Job, JobStatus, JobStatusType, CreateJobRequest, APP_CONFIG } from '@photoeditor/shared';
import { v4 as uuidv4 } from 'uuid';

export class JobService {
  private client: DynamoDBClient;
  private tableName: string;

  constructor(tableName: string, region: string) {
    this.tableName = tableName;
    this.client = new DynamoDBClient({ region });
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
    let expressionAttributeNames: Record<string, string> = {
      '#status': 'status',
      '#updatedAt': 'updatedAt'
    };
    let expressionAttributeValues: Record<string, any> = {
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
}
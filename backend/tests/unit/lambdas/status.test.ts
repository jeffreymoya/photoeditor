import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

// Mock PowerTools
jest.mock('@aws-lambda-powertools/logger');
jest.mock('@aws-lambda-powertools/metrics');
jest.mock('@aws-lambda-powertools/tracer');

// Set required env vars before importing handler
process.env.AWS_REGION = 'us-east-1';
process.env.PROJECT_NAME = 'photoeditor';
process.env.NODE_ENV = 'test';
process.env.JOBS_TABLE_NAME = 'test-jobs-table';
process.env.BATCH_TABLE_NAME = 'test-batch-table';

const dynamoMock = mockClient(DynamoDBClient);

// Import handler after mocks are set up
import { handler } from '../../../src/lambdas/status';

describe('status lambda', () => {
  beforeEach(() => {
    dynamoMock.reset();
  });

  const createEvent = (jobId?: string): APIGatewayProxyEventV2 => {
    const event: APIGatewayProxyEventV2 = {
      version: '2.0',
      routeKey: 'GET /status/{jobId}',
      rawPath: `/status/${jobId || 'test-job-id'}`,
      rawQueryString: '',
      headers: {},
      requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: `/status/${jobId || 'test-job-id'}`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'test-request-id',
      routeKey: 'GET /status/{jobId}',
      stage: '$default',
      time: '01/Jan/2024:00:00:00 +0000',
      timeEpoch: 1704067200000
    } as any,
    isBase64Encoded: false
  };

  if (jobId) {
    event.pathParameters = { jobId };
  }

  return event;
};

  describe('parameter validation', () => {
    it('should return 400 when jobId is missing', async () => {
      const event = createEvent();
      delete event.pathParameters;

      const result = await handler(event, {} as any);

      expect(typeof result).toBe('object');
      if (typeof result === 'object') {
        expect(result.statusCode).toBe(400);
        expect(result.headers?.['Content-Type']).toBe('application/json');
        expect(result.headers?.['x-request-id']).toBe('test-request-id');

        const response = JSON.parse(result.body as string);
        expect(response).toHaveProperty('code', 'MISSING_JOB_ID');
        expect(response).toHaveProperty('title', 'Validation Error');
        expect(response).toHaveProperty('detail', 'Job ID is required');
        expect(response).toHaveProperty('instance', 'test-request-id');
        expect(response).toHaveProperty('type', 'VALIDATION');
        expect(response).toHaveProperty('timestamp');
      }
    });
  });

  describe('successful status retrieval', () => {
    it('should return 200 with job details when job exists', async () => {
      const mockJob = {
        jobId: 'test-job-123',
        userId: 'user-456',
        status: 'COMPLETED',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:05:00.000Z',
        tempS3Key: 'temp/user-456/test-job-123/file.jpg',
        finalS3Key: 'final/user-456/test-job-123/file.jpg'
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall(mockJob)
      });

      const event = createEvent('test-job-123');
      const result = await handler(event, {} as any);

      expect(typeof result).toBe('object');
      if (typeof result === 'object') {
        expect(result.statusCode).toBe(200);
        const response = JSON.parse(result.body as string);

        // Verify response contains required fields
        expect(response).toHaveProperty('jobId', 'test-job-123');
        expect(response).toHaveProperty('status', 'COMPLETED');
        expect(response).toHaveProperty('createdAt', '2024-01-01T00:00:00.000Z');
        expect(response).toHaveProperty('updatedAt', '2024-01-01T00:05:00.000Z');
        expect(response).toHaveProperty('tempS3Key', 'temp/user-456/test-job-123/file.jpg');
        expect(response).toHaveProperty('finalS3Key', 'final/user-456/test-job-123/file.jpg');
      }
    });

    it('should include error field when job has error', async () => {
      const mockJob = {
        jobId: 'test-job-123',
        userId: 'user-456',
        status: 'FAILED',
        createdAt: '2024-01-01T00:00:00.000Z',
        updatedAt: '2024-01-01T00:05:00.000Z',
        error: 'Processing failed: Invalid image format'
      };

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall(mockJob)
      });

      const event = createEvent('test-job-123');
      const result = await handler(event, {} as any);

      expect(typeof result).toBe('object');
      if (typeof result === 'object') {
        expect(result.statusCode).toBe(200);
        const response = JSON.parse(result.body as string);

        expect(response.status).toBe('FAILED');
        expect(response.error).toBe('Processing failed: Invalid image format');
      }
    });
  });

  describe('not found handling', () => {
    it('should return 404 when job does not exist', async () => {
      dynamoMock.on(GetItemCommand).resolves({
        Item: undefined
      });

      const event = createEvent('non-existent-job');
      const result = await handler(event, {} as any);

      expect(typeof result).toBe('object');
      if (typeof result === 'object') {
        expect(result.statusCode).toBe(404);
        expect(result.headers?.['Content-Type']).toBe('application/json');
        expect(result.headers?.['x-request-id']).toBe('test-request-id');

        const response = JSON.parse(result.body as string);
        expect(response).toHaveProperty('code', 'JOB_NOT_FOUND');
        expect(response).toHaveProperty('title', 'Resource Not Found');
        expect(response).toHaveProperty('detail');
        expect(response.detail).toContain('non-existent-job');
        expect(response).toHaveProperty('instance', 'test-request-id');
        expect(response).toHaveProperty('type', 'NOT_FOUND');
        expect(response).toHaveProperty('timestamp');
      }
    });
  });

  describe('error handling', () => {
    it('should return 500 on DynamoDB errors', async () => {
      dynamoMock.on(GetItemCommand).rejects(new Error('DynamoDB service error'));

      const event = createEvent('test-job-123');
      const result = await handler(event, {} as any);

      expect(typeof result).toBe('object');
      if (typeof result === 'object') {
        expect(result.statusCode).toBe(500);
        expect(result.headers?.['Content-Type']).toBe('application/json');
        expect(result.headers?.['x-request-id']).toBe('test-request-id');

        const response = JSON.parse(result.body as string);
        expect(response).toHaveProperty('code', 'UNEXPECTED_ERROR');
        expect(response).toHaveProperty('title', 'Internal Server Error');
        expect(response).toHaveProperty('detail');
        expect(response.detail).toContain('unexpected error');
        expect(response).toHaveProperty('instance', 'test-request-id');
        expect(response).toHaveProperty('type', 'INTERNAL_ERROR');
        expect(response).toHaveProperty('timestamp');
      }
    });
  });
});

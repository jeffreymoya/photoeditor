/**
 * Contract Tests for Status Handler
 *
 * Validates that status handler responses match shared schema contracts
 * per standards/testing-standards.md and standards/shared-contracts-tier.md.
 *
 * Tests:
 * - Single job status request/response validation
 * - Batch job status request/response validation
 * - Error response format compliance
 * - Schema boundary validation (Zod-at-boundaries)
 */

import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import {
  JobResponseSchema,
  BatchJobStatusResponseSchema,
  ApiErrorSchema
} from '@photoeditor/shared';

// Mock PowerTools
const mockLogger = {
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn()
};
jest.mock('@aws-lambda-powertools/logger', () => ({
  Logger: jest.fn(() => mockLogger)
}));
jest.mock('@aws-lambda-powertools/metrics');
jest.mock('@aws-lambda-powertools/tracer');

// Set required env vars before importing handler
process.env.AWS_REGION = 'us-east-1';
process.env.PROJECT_NAME = 'photoeditor';
process.env.NODE_ENV = 'test';
process.env.JOBS_TABLE_NAME = 'test-jobs-table';
process.env.BATCH_TABLE_NAME = 'test-batch-table';

const dynamoMock = mockClient(DynamoDBClient);
const mockDynamoInstance = new DynamoDBClient({});

jest.mock('@backend/core', () => ({
  createDynamoDBClient: jest.fn().mockReturnValue(mockDynamoInstance),
  ConfigService: jest.fn().mockImplementation(() => ({})),
  serviceInjection: jest.fn().mockReturnValue({
    before: jest.fn(),
    after: jest.fn()
  })
}), { virtual: true });

// Import handler after mocks are set up
import { handler } from '../../src/lambdas/status';

// Type guard for API Gateway response
type APIGatewayResponse = Exclude<Awaited<ReturnType<typeof handler>>, string>;

describe('Status Handler Contract Tests', () => {
  beforeEach(() => {
    dynamoMock.reset();
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    jest.useRealTimers();
  });

  const createJobEvent = (jobId: string): APIGatewayProxyEventV2 => ({
    version: '2.0',
    routeKey: 'GET /v1/jobs/{id}',
    rawPath: `/v1/jobs/${jobId}`,
    rawQueryString: '',
    headers: {},
    pathParameters: { id: jobId },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: `/v1/jobs/${jobId}`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'test-request-id',
      routeKey: 'GET /v1/jobs/{id}',
      stage: '$default',
      time: '01/Jan/2024:00:00:00 +0000',
      timeEpoch: 1704067200000,
      authorizer: {
        jwt: {
          claims: {
            sub: 'test-user-123'
          },
          scopes: []
        }
      }
    } as any,
    isBase64Encoded: false
  });

  const createBatchEvent = (batchJobId: string): APIGatewayProxyEventV2 => ({
    version: '2.0',
    routeKey: 'GET /v1/batch-status/{batchJobId}',
    rawPath: `/v1/batch-status/${batchJobId}`,
    rawQueryString: '',
    headers: {},
    pathParameters: { batchJobId },
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'GET',
        path: `/v1/batch-status/${batchJobId}`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'test-request-id',
      routeKey: 'GET /v1/batch-status/{batchJobId}',
      stage: '$default',
      time: '01/Jan/2024:00:00:00 +0000',
      timeEpoch: 1704067200000,
      authorizer: {
        jwt: {
          claims: {
            sub: 'test-user-123'
          },
          scopes: []
        }
      }
    } as any,
    isBase64Encoded: false
  });

  describe('GET /v1/jobs/{id} - Single Job Status', () => {
    it('should return response matching JobResponseSchema for existing job', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';
      const now = new Date().toISOString();

      // Mock DynamoDB response
      dynamoMock.on(GetItemCommand).resolves({
        Item: {
          PK: { S: `JOB#${jobId}` },
          SK: { S: `JOB#${jobId}` },
          jobId: { S: jobId },
          userId: { S: 'test-user-123' },
          status: { S: 'COMPLETED' },
          createdAt: { S: now },
          updatedAt: { S: now },
          tempS3Key: { S: 'temp/test.jpg' },
          finalS3Key: { S: 'final/test.jpg' }
        }
      });

      const event = createJobEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(200);
      expect(result.body).toBeDefined();

      // Parse and validate response against schema
      const responseBody = JSON.parse(result.body as string);
      const responseValidation = JobResponseSchema.safeParse(responseBody);

      if (!responseValidation.success) {
        console.error('Schema validation errors:', responseValidation.error.errors);
      }

      expect(responseValidation.success).toBe(true);

      // Validate specific fields
      const validatedResponse = responseValidation.data!;
      expect(validatedResponse.jobId).toBe(jobId);
      expect(validatedResponse.status).toBe('COMPLETED');
      expect(validatedResponse.createdAt).toBe(now);
      expect(validatedResponse.updatedAt).toBe(now);
    });

    it('should return ApiError response for non-existent job', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';

      // Mock DynamoDB returning no item
      dynamoMock.on(GetItemCommand).resolves({});

      const event = createJobEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(404);
      const responseBody = JSON.parse(result.body as string);

      // Validate error response matches ApiErrorSchema
      const errorValidation = ApiErrorSchema.safeParse(responseBody);
      expect(errorValidation.success).toBe(true);

      if (errorValidation.success) {
        expect(errorValidation.data.error.code).toBe('JOB_NOT_FOUND');
        expect(errorValidation.data.requestId).toBeDefined();
      }
    });

    it('should return ApiError response for missing jobId parameter', async () => {
      const event = createJobEvent('');
      event.pathParameters = {};

      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string);

      const errorValidation = ApiErrorSchema.safeParse(responseBody);
      expect(errorValidation.success).toBe(true);

      if (errorValidation.success) {
        expect(errorValidation.data.error.code).toBe('MISSING_JOB_ID');
      }
    });
  });

  describe('GET /v1/batch-status/{batchJobId} - Batch Job Status', () => {
    it('should return response matching BatchJobStatusResponseSchema for existing batch job', async () => {
      const batchJobId = '123e4567-e89b-12d3-a456-426614174001';
      const childJobId1 = '123e4567-e89b-12d3-a456-426614174002';
      const childJobId2 = '123e4567-e89b-12d3-a456-426614174003';
      const now = new Date().toISOString();

      // Mock DynamoDB response for batch job
      dynamoMock.on(GetItemCommand).resolves({
        Item: {
          PK: { S: `BATCH#${batchJobId}` },
          SK: { S: `BATCH#${batchJobId}` },
          batchJobId: { S: batchJobId },
          userId: { S: 'test-user-123' },
          status: { S: 'PROCESSING' },
          createdAt: { S: now },
          updatedAt: { S: now },
          sharedPrompt: { S: 'enhance all photos' },
          completedCount: { N: '1' },
          totalCount: { N: '2' },
          childJobIds: { L: [{ S: childJobId1 }, { S: childJobId2 }] }
        }
      });

      const event = createBatchEvent(batchJobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(200);
      expect(result.body).toBeDefined();

      // Parse and validate response against schema
      const responseBody = JSON.parse(result.body as string);
      const responseValidation = BatchJobStatusResponseSchema.safeParse(responseBody);

      if (!responseValidation.success) {
        console.error('Schema validation errors:', responseValidation.error.errors);
      }

      expect(responseValidation.success).toBe(true);

      // Validate specific fields
      const validatedResponse = responseValidation.data!;
      expect(validatedResponse.batchJobId).toBe(batchJobId);
      expect(validatedResponse.userId).toBe('test-user-123');
      expect(validatedResponse.status).toBe('PROCESSING');
      expect(validatedResponse.sharedPrompt).toBe('enhance all photos');
      expect(validatedResponse.completedCount).toBe(1);
      expect(validatedResponse.totalCount).toBe(2);
      expect(validatedResponse.childJobIds).toHaveLength(2);
      expect(validatedResponse.childJobIds).toContain(childJobId1);
      expect(validatedResponse.childJobIds).toContain(childJobId2);
    });

    it('should return ApiError response for non-existent batch job', async () => {
      const batchJobId = '123e4567-e89b-12d3-a456-426614174001';

      // Mock DynamoDB returning no item
      dynamoMock.on(GetItemCommand).resolves({});

      const event = createBatchEvent(batchJobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(404);
      const responseBody = JSON.parse(result.body as string);

      const errorValidation = ApiErrorSchema.safeParse(responseBody);
      expect(errorValidation.success).toBe(true);

      if (errorValidation.success) {
        expect(errorValidation.data.error.code).toBe('BATCH_JOB_NOT_FOUND');
      }
    });

    it('should return ApiError response for missing batchJobId parameter', async () => {
      const event = createBatchEvent('');
      event.pathParameters = {};

      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string);

      const errorValidation = ApiErrorSchema.safeParse(responseBody);
      expect(errorValidation.success).toBe(true);

      if (errorValidation.success) {
        expect(errorValidation.data.error.code).toBe('MISSING_BATCH_JOB_ID');
      }
    });
  });

  describe('Request/Response Correlation', () => {
    it('should include x-request-id header in response', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';
      const now = new Date().toISOString();

      dynamoMock.on(GetItemCommand).resolves({
        Item: {
          PK: { S: `JOB#${jobId}` },
          SK: { S: `JOB#${jobId}` },
          jobId: { S: jobId },
          userId: { S: 'test-user-123' },
          status: { S: 'COMPLETED' },
          createdAt: { S: now },
          updatedAt: { S: now }
        }
      });

      const event = createJobEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.headers).toBeDefined();
      expect(result.headers?.['x-request-id']).toBe('test-request-id');
    });

    it('should include Content-Type header in response', async () => {
      const jobId = '123e4567-e89b-12d3-a456-426614174000';
      const now = new Date().toISOString();

      dynamoMock.on(GetItemCommand).resolves({
        Item: {
          PK: { S: `JOB#${jobId}` },
          SK: { S: `JOB#${jobId}` },
          jobId: { S: jobId },
          userId: { S: 'test-user-123' },
          status: { S: 'COMPLETED' },
          createdAt: { S: now },
          updatedAt: { S: now }
        }
      });

      const event = createJobEvent(jobId);
      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.headers).toBeDefined();
      expect(result.headers?.['Content-Type']).toBe('application/json');
    });
  });
});

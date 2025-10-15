/**
 * Contract tests for GET /v1/jobs/{jobId} endpoint
 * These tests validate that the response conforms to the OpenAPI specification
 */

import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, GetItemCommand } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';

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

// Set required env vars
process.env.AWS_REGION = 'us-east-1';
process.env.JOBS_TABLE_NAME = 'test-jobs-table';

const dynamoMock = mockClient(DynamoDBClient);

// Import handler after mocks
import { handler } from '../../src/lambdas/status';

// Type guard for API Gateway response
type APIGatewayResponse = Exclude<Awaited<ReturnType<typeof handler>>, string>;

describe('GET /v1/jobs/{jobId} - Contract Tests', () => {
  beforeEach(() => {
    dynamoMock.reset();
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    jest.useRealTimers();
  });

  const createEvent = (jobId?: string): APIGatewayProxyEventV2 => ({
    version: '2.0',
    routeKey: 'GET /v1/jobs/{jobId}',
    rawPath: `/v1/jobs/${jobId || 'test-job-id'}`,
    rawQueryString: '',
    headers: { 'Content-Type': 'application/json' },
    pathParameters: jobId ? { jobId } : undefined,
    requestContext: {
      accountId: '123456789012',
      apiId: 'contract-test-api',
      domainName: 'api.photoeditor.test',
      domainPrefix: 'api',
      http: {
        method: 'GET',
        path: `/v1/jobs/${jobId || 'test-job-id'}`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'contract-test'
      },
      requestId: 'contract-test-request-id',
      routeKey: 'GET /v1/jobs/{jobId}',
      stage: 'v1',
      time: '04/Oct/2025:00:00:00 +0000',
      timeEpoch: Date.now(),
      authorizer: {
        jwt: {
          claims: {
            sub: 'contract-test-user-123'
          },
          scopes: []
        }
      }
    } as any,
    isBase64Encoded: false
  });

  describe('Successful Job Status Response Contract', () => {
    it('should return 200 with valid job status response schema for COMPLETED job', async () => {
      const jobId = '550e8400-e29b-41d4-a716-446655440000';
      const event = createEvent(jobId);

      // Mock DynamoDB to return a completed job
      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall({
          jobId,
          userId: 'contract-test-user-123',
          status: 'COMPLETED',
          createdAt: '2025-10-04T10:00:00Z',
          updatedAt: '2025-10-04T10:05:00Z',
          tempS3Key: `uploads/${jobId}/test-image.jpg`,
          finalS3Key: `final/${jobId}/test-image-edited.jpg`
        })
      });

      const result = await handler(event, {} as any) as APIGatewayResponse;

      // Verify HTTP status code per OpenAPI spec
      expect(result.statusCode).toBe(200);

      // Verify Content-Type header
      expect(result.headers).toBeDefined();
      expect(result.headers?.['Content-Type']).toBe('application/json');

      // Parse response and validate structure
      const response = JSON.parse(result.body as string);

      // Verify all required fields per OpenAPI spec
      expect(response).toHaveProperty('jobId');
      expect(response).toHaveProperty('status');
      expect(response).toHaveProperty('createdAt');
      expect(response).toHaveProperty('updatedAt');

      // Verify field types and formats
      expect(response.jobId).toBe(jobId);
      expect(response.jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

      // Status must be one of the allowed enum values
      expect(['QUEUED', 'PROCESSING', 'EDITING', 'COMPLETED', 'FAILED']).toContain(response.status);
      expect(response.status).toBe('COMPLETED');

      // Verify datetime format (ISO 8601)
      expect(typeof response.createdAt).toBe('string');
      expect(() => new Date(response.createdAt)).not.toThrow();
      expect(typeof response.updatedAt).toBe('string');
      expect(() => new Date(response.updatedAt)).not.toThrow();

      // Verify optional fields are present for completed job
      expect(response).toHaveProperty('tempS3Key');
      expect(typeof response.tempS3Key).toBe('string');
      expect(response).toHaveProperty('finalS3Key');
      expect(typeof response.finalS3Key).toBe('string');

      // Error should not be present for successful job
      expect(response.error).toBeUndefined();
    });

    it('should return 200 with valid schema for QUEUED job', async () => {
      const jobId = '550e8400-e29b-41d4-a716-446655440001';
      const event = createEvent(jobId);

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall({
          jobId,
          userId: 'contract-test-user-123',
          status: 'QUEUED',
          createdAt: '2025-10-04T10:00:00Z',
          updatedAt: '2025-10-04T10:00:00Z',
          tempS3Key: `uploads/${jobId}/test-image.jpg`
        })
      });

      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(200);

      const response = JSON.parse(result.body as string);
      expect(response.jobId).toBe(jobId);
      expect(response.status).toBe('QUEUED');
      expect(response).toHaveProperty('createdAt');
      expect(response).toHaveProperty('updatedAt');
      expect(response).toHaveProperty('tempS3Key');

      // finalS3Key may not be present for queued jobs
      // error should not be present for non-failed jobs
      expect(response.error).toBeUndefined();
    });

    it('should return 200 with valid schema for FAILED job with error message', async () => {
      const jobId = '550e8400-e29b-41d4-a716-446655440002';
      const event = createEvent(jobId);

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall({
          jobId,
          userId: 'contract-test-user-123',
          status: 'FAILED',
          createdAt: '2025-10-04T10:00:00Z',
          updatedAt: '2025-10-04T10:05:00Z',
          tempS3Key: `uploads/${jobId}/test-image.jpg`,
          error: 'Processing failed: insufficient memory'
        })
      });

      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(200);

      const response = JSON.parse(result.body as string);
      expect(response.jobId).toBe(jobId);
      expect(response.status).toBe('FAILED');

      // Error field should be present for failed jobs
      expect(response).toHaveProperty('error');
      expect(typeof response.error).toBe('string');
      expect(response.error).toBe('Processing failed: insufficient memory');
    });

    it('should include all valid status enum values', async () => {
      const validStatuses = ['QUEUED', 'PROCESSING', 'EDITING', 'COMPLETED', 'FAILED'];

      for (const status of validStatuses) {
        const jobId = `550e8400-e29b-41d4-a716-${status.toLowerCase().padStart(12, '0')}`;
        const event = createEvent(jobId);

        dynamoMock.on(GetItemCommand).resolves({
          Item: marshall({
            jobId,
            userId: 'contract-test-user-123',
            status,
            createdAt: '2025-10-04T10:00:00Z',
            updatedAt: '2025-10-04T10:00:00Z',
            tempS3Key: `uploads/${jobId}/test-image.jpg`
          })
        });

        const result = await handler(event, {} as any) as APIGatewayResponse;
        const response = JSON.parse(result.body as string);

        expect(result.statusCode).toBe(200);
        expect(response.status).toBe(status);
        expect(validStatuses).toContain(response.status);
      }
    });
  });

  describe('Error Response Contract', () => {
    it('should return 400 with error schema for missing jobId', async () => {
      const event = createEvent();
      event.pathParameters = undefined;

      const result = await handler(event, {} as any) as APIGatewayResponse;

      // Verify HTTP status code per OpenAPI spec
      expect(result.statusCode).toBe(400);

      // Verify correlation headers
      expect(result.headers).toBeDefined();
      expect(result.headers?.['Content-Type']).toBe('application/json');
      expect(result.headers?.['x-request-id']).toBe('contract-test-request-id');

      // Verify standardized error response structure (RFC 7807 format)
      const response = JSON.parse(result.body as string);
      expect(response).toHaveProperty('code');
      expect(response).toHaveProperty('title');
      expect(response).toHaveProperty('detail');
      expect(response).toHaveProperty('instance');
      expect(response).toHaveProperty('timestamp');

      // Verify field values
      expect(response.code).toBe('MISSING_JOB_ID');
      expect(response.title).toBe('Validation Error');
      expect(response.detail).toBe('Job ID is required');
      expect(response.instance).toBe('contract-test-request-id');
    });

    it('should return 404 with error schema when job not found', async () => {
      const jobId = '550e8400-e29b-41d4-a716-446655440404';
      const event = createEvent(jobId);

      // Mock DynamoDB to return no item
      dynamoMock.on(GetItemCommand).resolves({});

      const result = await handler(event, {} as any) as APIGatewayResponse;

      // Verify HTTP status code per OpenAPI spec
      expect(result.statusCode).toBe(404);

      // Verify correlation headers
      expect(result.headers).toBeDefined();
      expect(result.headers?.['Content-Type']).toBe('application/json');
      expect(result.headers?.['x-request-id']).toBe('contract-test-request-id');

      // Verify standardized error response structure (RFC 7807 format)
      const response = JSON.parse(result.body as string);
      expect(response).toHaveProperty('code');
      expect(response).toHaveProperty('title');
      expect(response).toHaveProperty('detail');
      expect(response).toHaveProperty('instance');
      expect(response).toHaveProperty('timestamp');

      // Verify field values
      expect(response.code).toBe('JOB_NOT_FOUND');
      expect(response.title).toBe('Resource Not Found');
      expect(response.detail).toContain(jobId);
      expect(response.instance).toBe('contract-test-request-id');
    });

    it('should return 500 with error schema for internal errors', async () => {
      const jobId = '550e8400-e29b-41d4-a716-446655440500';
      const event = createEvent(jobId);

      // Simulate DynamoDB error
      dynamoMock.on(GetItemCommand).rejects(new Error('Simulated DynamoDB failure'));

      const result = await handler(event, {} as any) as APIGatewayResponse;

      // Verify HTTP status code
      expect(result.statusCode).toBe(500);

      // Verify correlation headers
      expect(result.headers).toBeDefined();
      expect(result.headers?.['Content-Type']).toBe('application/json');
      expect(result.headers?.['x-request-id']).toBe('contract-test-request-id');

      // Verify standardized error response structure (RFC 7807 format)
      const response = JSON.parse(result.body as string);
      expect(response).toHaveProperty('code');
      expect(response).toHaveProperty('title');
      expect(response).toHaveProperty('detail');
      expect(response).toHaveProperty('instance');
      expect(response).toHaveProperty('timestamp');

      // Verify field values
      expect(response.code).toBe('UNEXPECTED_ERROR');
      expect(response.title).toBe('Internal Server Error');
      expect(response.detail).toContain('unexpected error');
      expect(response.instance).toBe('contract-test-request-id');
    });

    it('should include traceparent header when present in request', async () => {
      const jobId = '550e8400-e29b-41d4-a716-446655440404';
      const event = createEvent(jobId);
      event.headers['traceparent'] = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

      dynamoMock.on(GetItemCommand).resolves({});

      const result = await handler(event, {} as any) as APIGatewayResponse;

      // Verify traceparent header is propagated
      expect(result.headers?.['traceparent']).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    });
  });

  describe('Response Format Validation', () => {
    it('should always return JSON content type', async () => {
      const jobId = '550e8400-e29b-41d4-a716-446655440000';
      const event = createEvent(jobId);

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall({
          jobId,
          status: 'COMPLETED',
          createdAt: '2025-10-04T10:00:00Z',
          updatedAt: '2025-10-04T10:00:00Z',
          userId: 'test-user'
        })
      });

      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.headers?.['Content-Type']).toBe('application/json');
    });

    it('should return valid JSON in response body', async () => {
      const jobId = '550e8400-e29b-41d4-a716-446655440000';
      const event = createEvent(jobId);

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall({
          jobId,
          status: 'COMPLETED',
          createdAt: '2025-10-04T10:00:00Z',
          updatedAt: '2025-10-04T10:00:00Z',
          userId: 'test-user'
        })
      });

      const result = await handler(event, {} as any) as APIGatewayResponse;

      // Should not throw when parsing JSON
      expect(() => JSON.parse(result.body as string)).not.toThrow();
    });
  });
});

/**
 * Contract tests for GET /v1/batch-status/{batchJobId} endpoint
 * These tests validate that the response conforms to the OpenAPI specification
 */
// @ts-nocheck


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

describe('GET /v1/batch-status/{batchJobId} - Contract Tests', () => {
  beforeEach(() => {
    dynamoMock.reset();
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    jest.useRealTimers();
  });

  const createEvent = (batchJobId?: string): APIGatewayProxyEventV2 => ({
    version: '2.0',
    routeKey: 'GET /v1/batch-status/{batchJobId}',
    rawPath: `/v1/batch-status/${batchJobId || 'test-batch-job-id'}`,
    rawQueryString: '',
    headers: { 'Content-Type': 'application/json' },
    pathParameters: batchJobId ? { batchJobId } : undefined,
    requestContext: {
      accountId: '123456789012',
      apiId: 'contract-test-api',
      domainName: 'api.photoeditor.test',
      domainPrefix: 'api',
      http: {
        method: 'GET',
        path: `/v1/batch-status/${batchJobId || 'test-batch-job-id'}`,
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'contract-test'
      },
      requestId: 'contract-test-request-id',
      routeKey: 'GET /v1/batch-status/{batchJobId}',
      stage: 'v1',
      time: '15/Oct/2025:00:00:00 +0000',
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

  describe('Successful Batch Job Status Response Contract', () => {
    it('should return 200 with valid batch job status response schema for COMPLETED batch', async () => {
      const batchJobId = '660e8400-e29b-41d4-a716-446655440000';
      const childJobId1 = '770e8400-e29b-41d4-a716-446655440001';
      const childJobId2 = '770e8400-e29b-41d4-a716-446655440002';
      const event = createEvent(batchJobId);

      // Mock DynamoDB to return a completed batch job
      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall({
          batchJobId,
          userId: 'contract-test-user-123',
          status: 'COMPLETED',
          createdAt: '2025-10-15T10:00:00Z',
          updatedAt: '2025-10-15T10:10:00Z',
          sharedPrompt: 'Make it artistic and vibrant',
          completedCount: 2,
          totalCount: 2,
          childJobIds: [childJobId1, childJobId2]
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
      expect(response).toHaveProperty('batchJobId');
      expect(response).toHaveProperty('userId');
      expect(response).toHaveProperty('status');
      expect(response).toHaveProperty('createdAt');
      expect(response).toHaveProperty('updatedAt');
      expect(response).toHaveProperty('sharedPrompt');
      expect(response).toHaveProperty('completedCount');
      expect(response).toHaveProperty('totalCount');
      expect(response).toHaveProperty('childJobIds');

      // Verify field types and formats
      expect(response.batchJobId).toBe(batchJobId);
      expect(response.batchJobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);

      // Status must be one of the allowed enum values
      expect(['QUEUED', 'PROCESSING', 'EDITING', 'COMPLETED', 'FAILED']).toContain(response.status);
      expect(response.status).toBe('COMPLETED');

      // Verify datetime format (ISO 8601)
      expect(typeof response.createdAt).toBe('string');
      expect(() => new Date(response.createdAt)).not.toThrow();
      expect(typeof response.updatedAt).toBe('string');
      expect(() => new Date(response.updatedAt)).not.toThrow();

      // Verify numeric fields
      expect(typeof response.completedCount).toBe('number');
      expect(response.completedCount).toBe(2);
      expect(typeof response.totalCount).toBe('number');
      expect(response.totalCount).toBe(2);

      // Verify childJobIds is an array of UUIDs
      expect(Array.isArray(response.childJobIds)).toBe(true);
      expect(response.childJobIds).toHaveLength(2);
      response.childJobIds.forEach((id: string) => {
        expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i);
      });

      // Error should not be present for successful batch
      expect(response.error).toBeUndefined();
    });

    it('should return 200 with valid schema for IN_PROGRESS batch', async () => {
      const batchJobId = '660e8400-e29b-41d4-a716-446655440001';
      const event = createEvent(batchJobId);

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall({
          batchJobId,
          userId: 'contract-test-user-123',
          status: 'PROCESSING',
          createdAt: '2025-10-15T10:00:00Z',
          updatedAt: '2025-10-15T10:05:00Z',
          sharedPrompt: 'Apply vintage filter',
          completedCount: 1,
          totalCount: 3,
          childJobIds: ['770e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440002', '770e8400-e29b-41d4-a716-446655440003']
        })
      });

      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(200);

      const response = JSON.parse(result.body as string);
      expect(response.batchJobId).toBe(batchJobId);
      expect(response.status).toBe('PROCESSING');
      expect(response.completedCount).toBe(1);
      expect(response.totalCount).toBe(3);
      expect(response.childJobIds).toHaveLength(3);
      expect(response.sharedPrompt).toBe('Apply vintage filter');

      // Error should not be present for non-failed batch
      expect(response.error).toBeUndefined();
    });

    it('should return 200 with valid schema for FAILED batch with error message', async () => {
      const batchJobId = '660e8400-e29b-41d4-a716-446655440002';
      const event = createEvent(batchJobId);

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall({
          batchJobId,
          userId: 'contract-test-user-123',
          status: 'FAILED',
          createdAt: '2025-10-15T10:00:00Z',
          updatedAt: '2025-10-15T10:08:00Z',
          sharedPrompt: 'Enhance colors',
          completedCount: 0,
          totalCount: 2,
          childJobIds: ['770e8400-e29b-41d4-a716-446655440004', '770e8400-e29b-41d4-a716-446655440005'],
          error: 'Batch processing failed: provider timeout'
        })
      });

      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(200);

      const response = JSON.parse(result.body as string);
      expect(response.batchJobId).toBe(batchJobId);
      expect(response.status).toBe('FAILED');

      // Error field should be present for failed batch
      expect(response).toHaveProperty('error');
      expect(typeof response.error).toBe('string');
      expect(response.error).toBe('Batch processing failed: provider timeout');
    });

    it('should include all valid status enum values', async () => {
      const validStatuses = ['QUEUED', 'PROCESSING', 'EDITING', 'COMPLETED', 'FAILED'];

      for (const status of validStatuses) {
        const batchJobId = `660e8400-e29b-41d4-a716-${status.toLowerCase().padStart(12, '0')}`;
        const event = createEvent(batchJobId);

        dynamoMock.on(GetItemCommand).resolves({
          Item: marshall({
            batchJobId,
            userId: 'contract-test-user-123',
            status,
            createdAt: '2025-10-15T10:00:00Z',
            updatedAt: '2025-10-15T10:00:00Z',
            sharedPrompt: 'Test prompt',
            completedCount: 0,
            totalCount: 5,
            childJobIds: ['770e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440002']
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
    it('should return 400 with error schema for missing batchJobId', async () => {
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
      expect(response.code).toBe('MISSING_BATCH_JOB_ID');
      expect(response.title).toBe('Validation Error');
      expect(response.detail).toBe('Batch Job ID is required');
      expect(response.instance).toBe('contract-test-request-id');
    });

    it('should return 404 with error schema when batch job not found', async () => {
      const batchJobId = '660e8400-e29b-41d4-a716-446655440404';
      const event = createEvent(batchJobId);

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
      expect(response.code).toBe('BATCH_JOB_NOT_FOUND');
      expect(response.title).toBe('Resource Not Found');
      expect(response.detail).toContain(batchJobId);
      expect(response.instance).toBe('contract-test-request-id');
    });

    it('should return 500 with error schema for internal errors', async () => {
      const batchJobId = '660e8400-e29b-41d4-a716-446655440500';
      const event = createEvent(batchJobId);

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
      const batchJobId = '660e8400-e29b-41d4-a716-446655440404';
      const event = createEvent(batchJobId);
      event.headers['traceparent'] = '00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01';

      dynamoMock.on(GetItemCommand).resolves({});

      const result = await handler(event, {} as any) as APIGatewayResponse;

      // Verify traceparent header is propagated
      expect(result.headers?.['traceparent']).toBe('00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01');
    });
  });

  describe('Response Format Validation', () => {
    it('should always return JSON content type', async () => {
      const batchJobId = '660e8400-e29b-41d4-a716-446655440000';
      const event = createEvent(batchJobId);

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall({
          batchJobId,
          userId: 'contract-test-user-123',
          status: 'COMPLETED',
          createdAt: '2025-10-15T10:00:00Z',
          updatedAt: '2025-10-15T10:00:00Z',
          sharedPrompt: 'Test prompt',
          completedCount: 2,
          totalCount: 2,
          childJobIds: ['770e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440002']
        })
      });

      const result = await handler(event, {} as any) as APIGatewayResponse;

      expect(result.headers?.['Content-Type']).toBe('application/json');
    });

    it('should return valid JSON in response body', async () => {
      const batchJobId = '660e8400-e29b-41d4-a716-446655440000';
      const event = createEvent(batchJobId);

      dynamoMock.on(GetItemCommand).resolves({
        Item: marshall({
          batchJobId,
          userId: 'contract-test-user-123',
          status: 'COMPLETED',
          createdAt: '2025-10-15T10:00:00Z',
          updatedAt: '2025-10-15T10:00:00Z',
          sharedPrompt: 'Test prompt',
          completedCount: 2,
          totalCount: 2,
          childJobIds: ['770e8400-e29b-41d4-a716-446655440001', '770e8400-e29b-41d4-a716-446655440002']
        })
      });

      const result = await handler(event, {} as any) as APIGatewayResponse;

      // Should not throw when parsing JSON
      expect(() => JSON.parse(result.body as string)).not.toThrow();
    });
  });
});

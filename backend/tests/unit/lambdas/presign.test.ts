import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, PutItemCommand, UpdateItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import { marshall } from '@aws-sdk/util-dynamodb';

// Mock presigner to avoid real credential usage in unit tests
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-presigned-url')
}));

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

// Mock services to avoid initialization issues
jest.mock('../../../src/services/bootstrap.service', () => ({
  BootstrapService: jest.fn().mockImplementation(() => ({
    initializeProviders: jest.fn().mockResolvedValue(undefined)
  }))
}));

// Set required env vars before importing handler
process.env.AWS_REGION = 'us-east-1';
process.env.PROJECT_NAME = 'photoeditor';
process.env.NODE_ENV = 'test';
process.env.TEMP_BUCKET_NAME = 'test-temp-bucket';
process.env.FINAL_BUCKET_NAME = 'test-final-bucket';
process.env.JOBS_TABLE_NAME = 'test-jobs-table';
process.env.BATCH_TABLE_NAME = 'test-batch-table';

const dynamoMock = mockClient(DynamoDBClient);
const s3Mock = mockClient(S3Client);

// Create instances that will be used by the services
const mockDynamoInstance = new DynamoDBClient({});
const mockS3Instance = new S3Client({});

// Update the @backend/core mock to return the actual mocked clients
jest.mock('@backend/core', () => {
  return {
    createSSMClient: jest.fn().mockReturnValue({}),
    createDynamoDBClient: jest.fn().mockReturnValue(mockDynamoInstance),
    createS3Client: jest.fn().mockReturnValue(mockS3Instance),
    createSNSClient: jest.fn().mockReturnValue({}),
    ConfigService: jest.fn().mockImplementation(() => ({})),
    BootstrapService: jest.fn().mockImplementation(() => ({
      initializeProviders: jest.fn().mockResolvedValue(undefined)
    })),
    StandardProviderCreator: jest.fn().mockImplementation(() => ({}))
  };
}, { virtual: true });

// Import handler after mocks are set up
import { handler } from '../../../src/lambdas/presign';

describe('presign lambda', () => {
  beforeEach(() => {
    dynamoMock.reset();
    s3Mock.reset();
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    // Use real timers for this suite since we make actual async calls
    jest.useRealTimers();
  });

  const createEvent = (body: any): APIGatewayProxyEventV2 => ({
    version: '2.0',
    routeKey: 'POST /presign',
    rawPath: '/presign',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/presign',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'test-request-id',
      routeKey: 'POST /presign',
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
    body: JSON.stringify(body),
    isBase64Encoded: false
  });

  describe('single upload request', () => {
    it('should reject missing request body', async () => {
      const event = createEvent(null);
      event.body = undefined;

      const result = await handler(event, {} as any);

      if (typeof result === "object") {
        expect(result.statusCode).toBe(400);
        expect(result.headers?.['Content-Type']).toBe('application/json');
        expect(result.headers?.['x-request-id']).toBe('test-request-id');

        const response = JSON.parse(result.body as string);
        expect(response).toHaveProperty('code', 'MISSING_REQUEST_BODY');
        expect(response).toHaveProperty('title', 'Validation Error');
        expect(response).toHaveProperty('detail', 'Request body is required');
        expect(response).toHaveProperty('instance', 'test-request-id');
        expect(response).toHaveProperty('type', 'VALIDATION');
        expect(response).toHaveProperty('timestamp');
      }
    });

    it('should reject unsupported content type (image/gif)', async () => {
      const event = createEvent({
        fileName: 'test.gif',
        contentType: 'image/gif',
        fileSize: 1024
      });

      // Mock DynamoDB to allow job creation
      dynamoMock.resolves({});
      s3Mock.resolves({});

      const result = await handler(event, {} as any);

      if (typeof result === "object") {
        expect(result.statusCode).toBe(400);
        expect(result.headers?.['x-request-id']).toBe('test-request-id');

        const response = JSON.parse(result.body as string);
        expect(response).toHaveProperty('code', 'INVALID_REQUEST');
        expect(response).toHaveProperty('title', 'Validation Error');
        expect(response).toHaveProperty('type', 'VALIDATION');
        expect(response).toHaveProperty('instance', 'test-request-id');
      }
    });

    it('should reject file size > 50MB', async () => {
      const event = createEvent({
        fileName: 'large.jpg',
        contentType: 'image/jpeg',
        fileSize: 51 * 1024 * 1024 // 51MB
      });

      dynamoMock.resolves({});
      s3Mock.resolves({});

      const result = await handler(event, {} as any);

      if (typeof result === "object") {
        expect(result.statusCode).toBe(400);
        expect(result.headers?.['x-request-id']).toBe('test-request-id');

        const response = JSON.parse(result.body as string);
        expect(response).toHaveProperty('code', 'INVALID_REQUEST');
        expect(response).toHaveProperty('title', 'Validation Error');
        expect(response).toHaveProperty('type', 'VALIDATION');
        expect(response).toHaveProperty('instance', 'test-request-id');
      }
    });

    it('should return valid presigned URL response for valid single upload', async () => {
      const event = createEvent({
        fileName: 'test.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024 * 1024, // 1MB
        prompt: 'Test prompt'
      });

      // Mock successful DynamoDB put
      dynamoMock.resolves({});
      s3Mock.resolves({});

      const result = await handler(event, {} as any);

      if (typeof result === "object") expect(result.statusCode).toBe(200);
      const response = typeof result === "object" && JSON.parse(result.body as string);

      // Check response shape
      expect(response).toHaveProperty('jobId');
      expect(response).toHaveProperty('presignedUrl');
      expect(response).toHaveProperty('s3Key');
      expect(response).toHaveProperty('expiresAt');

      // Validate jobId is UUID
      expect(response.jobId).toBe('00000000-0000-4000-8000-000000000000'); // mocked UUID

      // Validate s3Key format (changed from temp/ to uploads/ per new S3 key structure)
      expect(response.s3Key).toMatch(/^uploads\/test-user-123\/00000000-0000-4000-8000-000000000000\/\d+-test\.jpg$/);
    });
  });

  describe('batch upload request', () => {
    it('should handle batch upload with multiple files', async () => {
      const event = createEvent({
        files: [
          {
            fileName: 'photo1.jpg',
            contentType: 'image/jpeg',
            fileSize: 1024 * 1024
          },
          {
            fileName: 'photo2.png',
            contentType: 'image/png',
            fileSize: 2 * 1024 * 1024
          }
        ],
        sharedPrompt: 'Batch prompt'
      });

      // Mock DynamoDB responses
      dynamoMock.on(PutItemCommand).resolves({});
      dynamoMock.on(UpdateItemCommand).resolves({
        Attributes: marshall({
          batchJobId: '00000000-0000-4000-8000-000000000000',
          status: 'QUEUED',
          childJobIds: ['00000000-0000-4000-8000-000000000000', '00000000-0000-4000-8000-000000000000']
        })
      });
      s3Mock.resolves({});

      const result = await handler(event, {} as any);

      if (typeof result === "object") expect(result.statusCode).toBe(200);
      const response = typeof result === "object" && JSON.parse(result.body as string);

      expect(response).toHaveProperty('batchJobId');
      expect(response).toHaveProperty('uploads');
      expect(response).toHaveProperty('childJobIds');
      expect(response.uploads).toHaveLength(2);
      expect(response.childJobIds).toHaveLength(2);

      // Check each upload has required fields (no jobId per upload, that's in childJobIds)
      response.uploads.forEach((upload: any) => {
        expect(upload).toHaveProperty('presignedUrl');
        expect(upload).toHaveProperty('s3Key');
        expect(upload).toHaveProperty('expiresAt');
      });
    });

    it('should reject batch with unsupported content type in any file', async () => {
      const event = createEvent({
        files: [
          {
            fileName: 'photo1.jpg',
            contentType: 'image/jpeg',
            fileSize: 1024 * 1024
          },
          {
            fileName: 'animated.gif',
            contentType: 'image/gif', // unsupported
            fileSize: 1024 * 1024
          }
        ],
        sharedPrompt: 'Batch prompt'
      });

      dynamoMock.resolves({});
      s3Mock.resolves({});

      const result = await handler(event, {} as any);

      if (typeof result === "object") {
        expect(result.statusCode).toBe(400);
        expect(result.headers?.['x-request-id']).toBe('test-request-id');

        const response = JSON.parse(result.body as string);
        expect(response).toHaveProperty('code', 'INVALID_REQUEST');
        expect(response).toHaveProperty('title', 'Validation Error');
        expect(response).toHaveProperty('type', 'VALIDATION');
        expect(response).toHaveProperty('instance', 'test-request-id');
      }
    });
  });

  describe('error handling', () => {
    it('should handle DynamoDB errors gracefully', async () => {
      const event = createEvent({
        fileName: 'test.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024
      });

      // Mock DynamoDB error
      dynamoMock.rejects(new Error('DynamoDB error'));

      const result = await handler(event, {} as any);

      if (typeof result === "object") {
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

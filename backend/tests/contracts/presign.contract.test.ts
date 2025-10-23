/**
 * Contract Tests for Presign Handler
 *
 * Validates that presign handler responses match shared schema contracts
 * per standards/testing-standards.md and standards/shared-contracts-tier.md.
 *
 * Tests:
 * - Single upload request/response validation
 * - Batch upload request/response validation
 * - Error response format compliance (RFC 7807)
 * - Schema boundary validation (Zod-at-boundaries)
 */

import { APIGatewayProxyEventV2 } from 'aws-lambda';
import { mockClient } from 'aws-sdk-client-mock';
import { DynamoDBClient, PutItemCommand } from '@aws-sdk/client-dynamodb';
import { S3Client } from '@aws-sdk/client-s3';
import {
  PresignUploadRequestSchema,
  PresignUploadResponseSchema,
  BatchUploadRequestSchema,
  BatchUploadResponseSchema,
  ApiErrorSchema
} from '@photoeditor/shared';

// Mock presigner to avoid real credential usage in unit tests
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-presigned-url.s3.amazonaws.com/test-key')
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
jest.mock('../../src/services/bootstrap.service', () => ({
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
    StandardProviderCreator: jest.fn().mockImplementation(() => ({})),
    serviceInjection: jest.fn().mockReturnValue({
      before: jest.fn(),
      after: jest.fn()
    })
  };
}, { virtual: true });

// Import handler after mocks are set up
import { handler } from '../../src/lambdas/presign';

// Type guard for API Gateway response
type APIGatewayResponse = Exclude<Awaited<ReturnType<typeof handler>>, string>;

describe('Presign Handler Contract Tests', () => {
  // Create mock services needed by the handler
  const mockPresignService = {
    generatePresignedUpload: jest.fn(),
    generateBatchPresignedUpload: jest.fn()
  };

  const mockJobService = {};

  const mockTracer = {
    getSegment: jest.fn().mockReturnValue({
      addNewSubsegment: jest.fn().mockReturnValue(undefined)
    }),
    setSegment: jest.fn()
  };

  const mockMetrics = {
    addMetric: jest.fn()
  };

  beforeEach(() => {
    dynamoMock.reset();
    s3Mock.reset();
    mockLogger.error.mockClear();
    mockLogger.info.mockClear();
    mockLogger.warn.mockClear();
    jest.useRealTimers();

    // Reset mock service methods
    mockPresignService.generatePresignedUpload.mockClear();
    mockPresignService.generateBatchPresignedUpload.mockClear();
    mockMetrics.addMetric.mockClear();

    // Mock successful DynamoDB PutItem for all tests
    dynamoMock.on(PutItemCommand).resolves({});

    // Set up default presign service responses
    mockPresignService.generatePresignedUpload.mockResolvedValue({
      jobId: '00000000-0000-4000-8000-000000000000',
      presignedUrl: 'https://mock-presigned-url.s3.amazonaws.com/test-key',
      s3Key: 'temp/00000000-0000-4000-8000-000000000000',
      expiresAt: new Date(Date.now() + 3600000).toISOString()
    });

    mockPresignService.generateBatchPresignedUpload.mockResolvedValue({
      batchJobId: '00000000-0000-4000-8000-000000000000',
      uploads: [
        {
          presignedUrl: 'https://mock-presigned-url.s3.amazonaws.com/test-key-1',
          s3Key: 'temp/00000000-0000-4000-8000-000000000001',
          expiresAt: new Date(Date.now() + 3600000).toISOString()
        }
      ],
      childJobIds: ['00000000-0000-4000-8000-000000000001']
    });
  });

  const createMockContext = () => ({
    container: {
      logger: mockLogger,
      metrics: mockMetrics,
      tracer: mockTracer,
      jobService: mockJobService,
      presignService: mockPresignService
    }
  });

  const createEvent = (body: any): APIGatewayProxyEventV2 => ({
    version: '2.0',
    routeKey: 'POST /v1/upload/presign',
    rawPath: '/v1/upload/presign',
    rawQueryString: '',
    headers: {},
    requestContext: {
      accountId: '123456789012',
      apiId: 'test-api',
      domainName: 'test.execute-api.us-east-1.amazonaws.com',
      domainPrefix: 'test',
      http: {
        method: 'POST',
        path: '/v1/upload/presign',
        protocol: 'HTTP/1.1',
        sourceIp: '127.0.0.1',
        userAgent: 'test'
      },
      requestId: 'test-request-id',
      routeKey: 'POST /v1/upload/presign',
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

  describe('POST /v1/upload/presign - Single Upload', () => {
    it('should return response matching PresignUploadResponseSchema for valid request', async () => {
      const requestBody = {
        fileName: 'test-photo.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024000,
        prompt: 'enhance photo'
      };

      // Validate request matches schema
      const requestValidation = PresignUploadRequestSchema.safeParse(requestBody);
      expect(requestValidation.success).toBe(true);

      const event = createEvent(requestBody);
      const result = await handler(event, createMockContext() as any) as APIGatewayResponse;

      // Validate response structure
      expect(result).toBeDefined();
      expect(result.statusCode).toBe(200);
      expect(result.body).toBeDefined();

      // Parse and validate response against schema
      const responseBody = JSON.parse(result.body as string);
      const responseValidation = PresignUploadResponseSchema.safeParse(responseBody);

      if (!responseValidation.success) {
        console.error('Schema validation errors:', responseValidation.error.errors);
      }

      expect(responseValidation.success).toBe(true);

      // Validate specific fields
      const validatedResponse = responseValidation.data!;
      expect(validatedResponse.jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(validatedResponse.presignedUrl).toContain('https://');
      expect(validatedResponse.s3Key).toBeDefined();
      expect(new Date(validatedResponse.expiresAt).getTime()).toBeGreaterThan(Date.now());
    });

    it('should return ApiError response for invalid request', async () => {
      const invalidBody = {
        fileName: '', // Invalid: empty string
        contentType: 'image/jpeg',
        fileSize: 1024000
      };

      const event = createEvent(invalidBody);
      const result = await handler(event, createMockContext() as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string);

      // Validate error response matches ApiErrorSchema
      const errorValidation = ApiErrorSchema.safeParse(responseBody);
      expect(errorValidation.success).toBe(true);

      if (errorValidation.success) {
        expect(errorValidation.data.error.code).toBeDefined();
        expect(errorValidation.data.error.message).toBeDefined();
        expect(errorValidation.data.requestId).toBeDefined();
        expect(errorValidation.data.timestamp).toBeDefined();
      }
    });

    it('should reject unsupported content types', async () => {
      const invalidBody = {
        fileName: 'test.pdf',
        contentType: 'application/pdf', // Invalid: not an image
        fileSize: 1024000
      };

      const event = createEvent(invalidBody);
      const result = await handler(event, createMockContext() as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string);
      const errorValidation = ApiErrorSchema.safeParse(responseBody);
      expect(errorValidation.success).toBe(true);
    });

    it('should reject files exceeding size limit', async () => {
      const invalidBody = {
        fileName: 'huge-photo.jpg',
        contentType: 'image/jpeg',
        fileSize: 60 * 1024 * 1024 // 60MB - exceeds 50MB limit
      };

      const event = createEvent(invalidBody);
      const result = await handler(event, createMockContext() as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string);
      const errorValidation = ApiErrorSchema.safeParse(responseBody);
      expect(errorValidation.success).toBe(true);
    });
  });

  describe('POST /v1/upload/presign - Batch Upload', () => {
    it('should return response matching BatchUploadResponseSchema for valid batch request', async () => {
      const requestBody = {
        files: [
          {
            fileName: 'photo1.jpg',
            contentType: 'image/jpeg',
            fileSize: 1024000
          },
          {
            fileName: 'photo2.png',
            contentType: 'image/png',
            fileSize: 2048000
          }
        ],
        sharedPrompt: 'enhance all photos'
      };

      // Validate request matches schema
      const requestValidation = BatchUploadRequestSchema.safeParse(requestBody);
      expect(requestValidation.success).toBe(true);

      const event = createEvent(requestBody);
      const result = await handler(event, createMockContext() as any) as APIGatewayResponse;

      // Validate response structure
      expect(result).toBeDefined();
      expect(result.statusCode).toBe(200);
      expect(result.body).toBeDefined();

      // Parse and validate response against schema
      const responseBody = JSON.parse(result.body as string);
      const responseValidation = BatchUploadResponseSchema.safeParse(responseBody);

      if (!responseValidation.success) {
        console.error('Schema validation errors:', responseValidation.error.errors);
      }

      expect(responseValidation.success).toBe(true);

      // Validate specific fields
      const validatedResponse = responseValidation.data!;
      expect(validatedResponse.batchJobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(validatedResponse.uploads).toHaveLength(2);
      expect(validatedResponse.childJobIds).toHaveLength(2);

      // Validate each upload object
      validatedResponse.uploads.forEach(upload => {
        expect(upload.presignedUrl).toContain('https://');
        expect(upload.s3Key).toBeDefined();
        expect(new Date(upload.expiresAt).getTime()).toBeGreaterThan(Date.now());
      });

      // Validate each child job ID is a valid UUID
      validatedResponse.childJobIds.forEach(jobId => {
        expect(jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      });
    });

    it('should reject batch with empty files array', async () => {
      const invalidBody = {
        files: [], // Invalid: empty array
        sharedPrompt: 'enhance all photos'
      };

      const event = createEvent(invalidBody);
      const result = await handler(event, createMockContext() as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string);
      const errorValidation = ApiErrorSchema.safeParse(responseBody);
      expect(errorValidation.success).toBe(true);
    });

    it('should reject batch with more than 10 files', async () => {
      const files = Array.from({ length: 11 }, (_, i) => ({
        fileName: `photo${i}.jpg`,
        contentType: 'image/jpeg',
        fileSize: 1024000
      }));

      const invalidBody = {
        files,
        sharedPrompt: 'enhance all photos'
      };

      const event = createEvent(invalidBody);
      const result = await handler(event, createMockContext() as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string);
      const errorValidation = ApiErrorSchema.safeParse(responseBody);
      expect(errorValidation.success).toBe(true);
    });

    it('should reject batch with missing sharedPrompt', async () => {
      const invalidBody = {
        files: [
          {
            fileName: 'photo1.jpg',
            contentType: 'image/jpeg',
            fileSize: 1024000
          }
        ]
        // Missing sharedPrompt
      };

      const event = createEvent(invalidBody);
      const result = await handler(event, createMockContext() as any) as APIGatewayResponse;

      expect(result.statusCode).toBe(400);
      const responseBody = JSON.parse(result.body as string);
      const errorValidation = ApiErrorSchema.safeParse(responseBody);
      expect(errorValidation.success).toBe(true);
    });
  });

  describe('Request/Response Correlation', () => {
    it('should include x-request-id header in response', async () => {
      const requestBody = {
        fileName: 'test-photo.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024000
      };

      const event = createEvent(requestBody);
      const result = await handler(event, createMockContext() as any) as APIGatewayResponse;

      expect(result.headers).toBeDefined();
      expect(result.headers?.['x-request-id']).toBe('test-request-id');
    });

    it('should include Content-Type header in response', async () => {
      const requestBody = {
        fileName: 'test-photo.jpg',
        contentType: 'image/jpeg',
        fileSize: 1024000
      };

      const event = createEvent(requestBody);
      const result = await handler(event, createMockContext() as any) as APIGatewayResponse;

      expect(result.headers).toBeDefined();
      expect(result.headers?.['Content-Type']).toBe('application/json');
    });
  });
});

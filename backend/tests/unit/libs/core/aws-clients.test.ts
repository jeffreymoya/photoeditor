/**
 * Unit tests for AWS Client Factory
 * Tests environment detection and client creation
 */

import {
  getAWSEnvironment,
  createS3Client,
  createDynamoDBClient,
  createSQSClient,
  createSNSClient,
  createSSMClient
} from '../../../../libs/core/aws';

describe('AWS Client Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('getAWSEnvironment', () => {
    it('should detect LocalStack endpoint', () => {
      process.env.LOCALSTACK_ENDPOINT = 'http://localhost:4566';

      const env = getAWSEnvironment();

      expect(env.isLocalStack).toBe(true);
      expect(env.endpoint).toBe('http://localhost:4566');
    });

    it('should detect AWS endpoint URL', () => {
      process.env.AWS_ENDPOINT_URL = 'https://custom.aws.endpoint';

      const env = getAWSEnvironment();

      expect(env.isLocalStack).toBe(false);
      expect(env.endpoint).toBe('https://custom.aws.endpoint');
    });

    it('should return default when no endpoints configured', () => {
      delete process.env.LOCALSTACK_ENDPOINT;
      delete process.env.AWS_ENDPOINT_URL;

      const env = getAWSEnvironment();

      expect(env.isLocalStack).toBe(false);
      expect(env.endpoint).toBeUndefined();
    });
  });

  describe('createS3Client', () => {
    it('should create S3 client with default region', () => {
      process.env.AWS_REGION = 'us-east-1';

      const client = createS3Client();

      expect(client).toBeDefined();
      expect(client.config.region).toBeDefined();
    });

    it('should create S3 client with forcePathStyle for LocalStack', () => {
      process.env.LOCALSTACK_ENDPOINT = 'http://localhost:4566';

      const client = createS3Client('us-east-1');

      expect(client).toBeDefined();
      expect(client.config.forcePathStyle).toBe(true);
    });

    it('should accept custom region', () => {
      const client = createS3Client('eu-west-1');

      expect(client).toBeDefined();
    });
  });

  describe('createDynamoDBClient', () => {
    it('should create DynamoDB client', () => {
      const client = createDynamoDBClient('us-east-1');

      expect(client).toBeDefined();
    });
  });

  describe('createSQSClient', () => {
    it('should create SQS client', () => {
      const client = createSQSClient('us-east-1');

      expect(client).toBeDefined();
    });
  });

  describe('createSNSClient', () => {
    it('should create SNS client', () => {
      const client = createSNSClient('us-east-1');

      expect(client).toBeDefined();
    });
  });

  describe('createSSMClient', () => {
    it('should create SSM client', () => {
      const client = createSSMClient('us-east-1');

      expect(client).toBeDefined();
    });
  });
});

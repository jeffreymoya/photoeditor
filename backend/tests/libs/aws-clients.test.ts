/**
 * AWS Client Factory Tests
 *
 * Tests endpoint selection logic for production and LocalStack environments
 */

import {
  createS3Client,
  createDynamoDBClient,
  createSQSClient,
  createSNSClient,
  getAWSEnvironment,
} from '../../libs/aws-clients';

describe('AWS Client Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    // Reset environment before each test
    process.env = { ...originalEnv };
    delete process.env.LOCALSTACK_ENDPOINT;
    delete process.env.AWS_ENDPOINT_URL;
    delete process.env.AWS_REGION;
  });

  afterAll(() => {
    // Restore original environment
    process.env = originalEnv;
  });

  describe('getAWSEnvironment', () => {
    it('should detect LocalStack environment', () => {
      process.env.LOCALSTACK_ENDPOINT = 'http://localhost:4566';
      const result = getAWSEnvironment();
      expect(result).toEqual({
        isLocalStack: true,
        endpoint: 'http://localhost:4566',
      });
    });

    it('should detect custom AWS endpoint', () => {
      process.env.AWS_ENDPOINT_URL = 'https://custom-endpoint.aws.com';
      const result = getAWSEnvironment();
      expect(result).toEqual({
        isLocalStack: false,
        endpoint: 'https://custom-endpoint.aws.com',
      });
    });

    it('should default to production AWS when no custom endpoint is set', () => {
      const result = getAWSEnvironment();
      expect(result).toEqual({
        isLocalStack: false,
      });
    });

    it('should prioritize LOCALSTACK_ENDPOINT over AWS_ENDPOINT_URL', () => {
      process.env.LOCALSTACK_ENDPOINT = 'http://localhost:4566';
      process.env.AWS_ENDPOINT_URL = 'https://custom-endpoint.aws.com';
      const result = getAWSEnvironment();
      expect(result).toEqual({
        isLocalStack: true,
        endpoint: 'http://localhost:4566',
      });
    });
  });

  describe('createS3Client', () => {
    it('should create S3 client with default region', async () => {
      const client = createS3Client();
      expect(client).toBeDefined();
      const region = await client.config.region();
      expect(region).toBe('us-east-1');
    });

    it('should create S3 client with custom region', async () => {
      const client = createS3Client('eu-west-1');
      const region = await client.config.region();
      expect(region).toBe('eu-west-1');
    });

    it('should use AWS_REGION environment variable', async () => {
      process.env.AWS_REGION = 'ap-southeast-1';
      const client = createS3Client();
      const region = await client.config.region();
      expect(region).toBe('ap-southeast-1');
    });

    it('should configure LocalStack endpoint with forcePathStyle', () => {
      process.env.LOCALSTACK_ENDPOINT = 'http://localhost:4566';
      const client = createS3Client();
      expect(client.config.endpoint).toBeDefined();
      expect(client.config.forcePathStyle).toBe(true);
    });

    it('should configure custom endpoint', () => {
      process.env.AWS_ENDPOINT_URL = 'https://custom-endpoint.aws.com';
      const client = createS3Client();
      expect(client.config.endpoint).toBeDefined();
    });

    it('should accept custom configuration overrides', async () => {
      const client = createS3Client('us-west-2', {
        maxAttempts: 5,
      });
      const region = await client.config.region();
      expect(region).toBe('us-west-2');
      const maxAttempts = await client.config.maxAttempts();
      expect(maxAttempts).toBe(5);
    });
  });

  describe('createDynamoDBClient', () => {
    it('should create DynamoDB client with default region', async () => {
      const client = createDynamoDBClient();
      expect(client).toBeDefined();
      const region = await client.config.region();
      expect(region).toBe('us-east-1');
    });

    it('should create DynamoDB client with custom region', async () => {
      const client = createDynamoDBClient('eu-west-1');
      const region = await client.config.region();
      expect(region).toBe('eu-west-1');
    });

    it('should configure LocalStack endpoint', () => {
      process.env.LOCALSTACK_ENDPOINT = 'http://localhost:4566';
      const client = createDynamoDBClient();
      expect(client.config.endpoint).toBeDefined();
    });

    it('should accept custom configuration overrides', async () => {
      const client = createDynamoDBClient('us-west-2', {
        maxAttempts: 3,
      });
      const region = await client.config.region();
      expect(region).toBe('us-west-2');
      const maxAttempts = await client.config.maxAttempts();
      expect(maxAttempts).toBe(3);
    });
  });

  describe('createSQSClient', () => {
    it('should create SQS client with default region', async () => {
      const client = createSQSClient();
      expect(client).toBeDefined();
      const region = await client.config.region();
      expect(region).toBe('us-east-1');
    });

    it('should create SQS client with custom region', async () => {
      const client = createSQSClient('eu-west-1');
      const region = await client.config.region();
      expect(region).toBe('eu-west-1');
    });

    it('should configure LocalStack endpoint', () => {
      process.env.LOCALSTACK_ENDPOINT = 'http://localhost:4566';
      const client = createSQSClient();
      expect(client.config.endpoint).toBeDefined();
    });

    it('should accept custom configuration overrides', async () => {
      const client = createSQSClient('us-west-2', {
        maxAttempts: 4,
      });
      const region = await client.config.region();
      expect(region).toBe('us-west-2');
      const maxAttempts = await client.config.maxAttempts();
      expect(maxAttempts).toBe(4);
    });
  });

  describe('createSNSClient', () => {
    it('should create SNS client with default region', async () => {
      const client = createSNSClient();
      expect(client).toBeDefined();
      const region = await client.config.region();
      expect(region).toBe('us-east-1');
    });

    it('should create SNS client with custom region', async () => {
      const client = createSNSClient('eu-west-1');
      const region = await client.config.region();
      expect(region).toBe('eu-west-1');
    });

    it('should configure LocalStack endpoint', () => {
      process.env.LOCALSTACK_ENDPOINT = 'http://localhost:4566';
      const client = createSNSClient();
      expect(client.config.endpoint).toBeDefined();
    });

    it('should accept custom configuration overrides', async () => {
      const client = createSNSClient('us-west-2', {
        maxAttempts: 2,
      });
      const region = await client.config.region();
      expect(region).toBe('us-west-2');
      const maxAttempts = await client.config.maxAttempts();
      expect(maxAttempts).toBe(2);
    });
  });

  describe('Multi-environment scenarios', () => {
    it('should handle transition from production to LocalStack', () => {
      // Production first
      let client = createS3Client('us-east-1');
      expect(client.config.endpoint).toBeUndefined();

      // Switch to LocalStack
      process.env.LOCALSTACK_ENDPOINT = 'http://localhost:4566';
      client = createS3Client('us-east-1');
      expect(client.config.endpoint).toBeDefined();
      expect(client.config.forcePathStyle).toBe(true);
    });

    it('should create clients for all services with consistent configuration', async () => {
      process.env.LOCALSTACK_ENDPOINT = 'http://localhost:4566';
      process.env.AWS_REGION = 'us-west-2';

      const s3 = createS3Client();
      const dynamodb = createDynamoDBClient();
      const sqs = createSQSClient();
      const sns = createSNSClient();

      // All should have same region
      expect(await s3.config.region()).toBe('us-west-2');
      expect(await dynamodb.config.region()).toBe('us-west-2');
      expect(await sqs.config.region()).toBe('us-west-2');
      expect(await sns.config.region()).toBe('us-west-2');

      // All should have LocalStack endpoint
      expect(s3.config.endpoint).toBeDefined();
      expect(dynamodb.config.endpoint).toBeDefined();
      expect(sqs.config.endpoint).toBeDefined();
      expect(sns.config.endpoint).toBeDefined();
    });
  });
});

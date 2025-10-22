/**
 * AWS Client Factory Tests
 *
 * Ensures runtime helpers create AWS SDK clients with the expected defaults
 * and honour region overrides without relying on LocalStack endpoints.
 */

import {
  createS3Client,
  createDynamoDBClient,
  createSQSClient,
  createSNSClient,
} from '../../src/libs/aws-clients';

const resolveRegion = async (regionValue: unknown): Promise<string | undefined> => {
  if (typeof regionValue === 'function') {
    return regionValue();
  }
  return regionValue as string | undefined;
};

describe('AWS Client Factory (runtime)', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv };
    delete process.env.AWS_REGION;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('createS3Client', () => {
    it('falls back to the default region', async () => {
      const client = createS3Client();
      await expect(resolveRegion(client.config.region)).resolves.toBe('us-east-1');
      expect(client.config.forcePathStyle).toBeUndefined();
    });

    it('accepts region and configuration overrides', async () => {
      process.env.AWS_REGION = 'ap-southeast-1';
      const client = createS3Client('eu-north-1', { maxAttempts: 5 });
      await expect(resolveRegion(client.config.region)).resolves.toBe('eu-north-1');
      const maxAttempts = await client.config.maxAttempts();
      expect(maxAttempts).toBe(5);
    });
  });

  describe('createDynamoDBClient', () => {
    it('uses the default region when none provided', async () => {
      const client = createDynamoDBClient();
      await expect(resolveRegion(client.config.region)).resolves.toBe('us-east-1');
    });

    it('honours custom regions', async () => {
      const client = createDynamoDBClient('eu-west-2');
      await expect(resolveRegion(client.config.region)).resolves.toBe('eu-west-2');
    });
  });

  describe('createSQSClient', () => {
    it('uses the default region when none provided', async () => {
      const client = createSQSClient();
      await expect(resolveRegion(client.config.region)).resolves.toBe('us-east-1');
    });

    it('honours custom regions', async () => {
      const client = createSQSClient('us-west-1');
      await expect(resolveRegion(client.config.region)).resolves.toBe('us-west-1');
    });
  });

  describe('createSNSClient', () => {
    it('uses the default region when none provided', async () => {
      const client = createSNSClient();
      await expect(resolveRegion(client.config.region)).resolves.toBe('us-east-1');
    });

    it('honours custom regions', async () => {
      const client = createSNSClient('ca-central-1');
      await expect(resolveRegion(client.config.region)).resolves.toBe('ca-central-1');
    });
  });
});

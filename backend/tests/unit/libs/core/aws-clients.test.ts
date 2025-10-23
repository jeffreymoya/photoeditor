/**
 * Unit tests for AWS Client Factory
 * Ensures client builders honor regional defaults and overrides.
 */

import {
  createS3Client,
  createDynamoDBClient,
  createSQSClient,
  createSNSClient,
  createSSMClient
} from '../../../../libs/core/aws';

const resolveRegion = async (regionValue: unknown): Promise<string | undefined> => {
  if (typeof regionValue === 'function') {
    return regionValue();
  }
  return regionValue as string | undefined;
};

describe('AWS Client Factory', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    jest.resetModules();
    process.env = { ...originalEnv };
    delete process.env.AWS_REGION;
  });

  afterAll(() => {
    process.env = originalEnv;
  });

  describe('createS3Client', () => {
    it('uses default region when none provided', async () => {
      const client = createS3Client();
      await expect(resolveRegion(client.config.region)).resolves.toBe('us-east-1');
      expect(client.config.forcePathStyle).toBe(false);
    });

    it('applies custom region and config overrides', async () => {
      const client = createS3Client('eu-west-1', { forcePathStyle: true });
      await expect(resolveRegion(client.config.region)).resolves.toBe('eu-west-1');
      expect(client.config.forcePathStyle).toBe(true);
    });
  });

  describe('createDynamoDBClient', () => {
    it('uses default region when none provided', async () => {
      const client = createDynamoDBClient();
      await expect(resolveRegion(client.config.region)).resolves.toBe('us-east-1');
    });

    it('allows overriding the region', async () => {
      const client = createDynamoDBClient('ap-southeast-2');
      await expect(resolveRegion(client.config.region)).resolves.toBe('ap-southeast-2');
    });
  });

  describe('createSQSClient', () => {
    it('uses default region when none provided', async () => {
      const client = createSQSClient();
      await expect(resolveRegion(client.config.region)).resolves.toBe('us-east-1');
    });

    it('allows overriding the region', async () => {
      const client = createSQSClient('us-west-2');
      await expect(resolveRegion(client.config.region)).resolves.toBe('us-west-2');
    });
  });

  describe('createSNSClient', () => {
    it('uses default region when none provided', async () => {
      const client = createSNSClient();
      await expect(resolveRegion(client.config.region)).resolves.toBe('us-east-1');
    });

    it('allows overriding the region', async () => {
      const client = createSNSClient('ca-central-1');
      await expect(resolveRegion(client.config.region)).resolves.toBe('ca-central-1');
    });
  });

  describe('createSSMClient', () => {
    it('uses default region when none provided', async () => {
      const client = createSSMClient();
      await expect(resolveRegion(client.config.region)).resolves.toBe('us-east-1');
    });

    it('allows overriding the region', async () => {
      const client = createSSMClient('eu-central-1');
      await expect(resolveRegion(client.config.region)).resolves.toBe('eu-central-1');
    });
  });
});

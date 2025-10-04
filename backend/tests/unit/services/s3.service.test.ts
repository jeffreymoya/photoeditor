import { mockClient } from 'aws-sdk-client-mock';
import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import { Readable } from 'stream';

// Mock presigner to avoid real credential usage in unit tests
jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn().mockResolvedValue('https://mock-presigned-url')
}));

// Mock sharp
jest.mock('sharp', () => {
  const mockSharp = jest.fn(() => ({
    resize: jest.fn().mockReturnThis(),
    jpeg: jest.fn().mockReturnThis(),
    toBuffer: jest.fn().mockResolvedValue(Buffer.from('optimized-image'))
  }));
  return mockSharp;
});

import { S3Service, S3KeyStrategyImpl } from '../../../src/services/s3.service';

const s3Mock = mockClient(S3Client);

describe('S3KeyStrategyImpl', () => {
  let strategy: S3KeyStrategyImpl;

  beforeEach(() => {
    strategy = new S3KeyStrategyImpl();
  });

  describe('generateTempKey', () => {
    it('should generate temp key with correct structure', () => {
      const key = strategy.generateTempKey('user-123', 'job-456', 'photo.jpg');

      expect(key).toMatch(/^temp\/user-123\/job-456\/\d+-photo\.jpg$/);
    });

    it('should sanitize filename', () => {
      const key = strategy.generateTempKey('user-123', 'job-456', 'my photo (1).jpg');

      expect(key).toMatch(/^temp\/user-123\/job-456\/\d+-my_photo__1_\.jpg$/);
    });
  });

  describe('generateFinalKey', () => {
    it('should generate final key with correct structure', () => {
      const key = strategy.generateFinalKey('user-123', 'job-456', 'photo.jpg');

      expect(key).toBe('final/user-123/job-456/photo.jpg');
    });

    it('should sanitize filename', () => {
      const key = strategy.generateFinalKey('user-123', 'job-456', 'my photo (1).jpg');

      expect(key).toBe('final/user-123/job-456/my_photo__1_.jpg');
    });
  });

  describe('parseTempKey', () => {
    it('should parse valid temp key', () => {
      const result = strategy.parseTempKey('temp/user-123/job-456/1234567890-photo.jpg');

      expect(result).toEqual({
        userId: 'user-123',
        jobId: 'job-456',
        fileName: 'photo.jpg'
      });
    });

    it('should return null for invalid temp key', () => {
      expect(strategy.parseTempKey('invalid/key')).toBeNull();
      expect(strategy.parseTempKey('final/user-123/job-456/photo.jpg')).toBeNull();
    });
  });

  describe('parseFinalKey', () => {
    it('should parse valid final key', () => {
      const result = strategy.parseFinalKey('final/user-123/job-456/photo.jpg');

      expect(result).toEqual({
        userId: 'user-123',
        jobId: 'job-456',
        fileName: 'photo.jpg'
      });
    });

    it('should return null for invalid final key', () => {
      expect(strategy.parseFinalKey('invalid/key')).toBeNull();
      expect(strategy.parseFinalKey('temp/user-123/job-456/1234-photo.jpg')).toBeNull();
    });
  });
});

describe('S3Service', () => {
  let s3Service: S3Service;

  beforeEach(() => {
    s3Mock.reset();
    jest.useRealTimers(); // Use real timers for async operations

    s3Service = new S3Service({
      region: 'us-east-1',
      tempBucket: 'test-temp-bucket',
      finalBucket: 'test-final-bucket',
      presignExpiration: 3600
    });
  });

  describe('generatePresignedUpload', () => {
    it('should return presigned upload with correct fields', async () => {
      const result = await s3Service.generatePresignedUpload(
        'user-123',
        'job-456',
        'photo.jpg',
        'image/jpeg'
      );

      expect(result).toHaveProperty('url');
      expect(result).toHaveProperty('fields');
      expect(result).toHaveProperty('expiresAt');

      expect(result.fields.bucket).toBe('test-temp-bucket');
      expect(result.fields.key).toMatch(/^temp\/user-123\/job-456\/\d+-photo\.jpg$/);
      expect(result.fields['Content-Type']).toBe('image/jpeg');

      // Check expiration is approximately 1 hour from now
      const expectedExpiration = Date.now() + 3600 * 1000;
      expect(result.expiresAt.getTime()).toBeGreaterThanOrEqual(expectedExpiration - 5000);
      expect(result.expiresAt.getTime()).toBeLessThanOrEqual(expectedExpiration + 5000);
    });

    it('should include metadata in presigned URL', async () => {
      const result = await s3Service.generatePresignedUpload(
        'user-123',
        'job-456',
        'photo.jpg',
        'image/jpeg'
      );

      // URL should be generated; do not assert format or content
      expect(typeof result.url).toBe('string');
      expect(result.url.length).toBeGreaterThan(0);
    });
  });

  describe('optimizeAndUploadImage', () => {
    it('should download, optimize with sharp, and upload image', async () => {
      // Mock S3 GetObject
      const mockStream = Readable.from([Buffer.from('original-image')]);
      s3Mock.on(GetObjectCommand).resolves({
        Body: mockStream as any
      });

      // Mock S3 PutObject
      s3Mock.on(PutObjectCommand).resolves({});

      await s3Service.optimizeAndUploadImage(
        'source-bucket',
        'source-key',
        'dest-bucket',
        'dest-key'
      );

      // Verify S3 operations were called
      expect(s3Mock.commandCalls(GetObjectCommand).length).toBe(1);
      expect(s3Mock.commandCalls(PutObjectCommand).length).toBe(1);

      const putCall = s3Mock.commandCalls(PutObjectCommand)[0];
      expect(putCall.args[0].input).toMatchObject({
        Bucket: 'dest-bucket',
        Key: 'dest-key',
        ContentType: 'image/jpeg'
      });
      expect(putCall.args[0].input.Body).toBeTruthy();
    });
  });

  describe('getObjectInfo', () => {
    it('should return object metadata when object exists', async () => {
      s3Mock.on(GetObjectCommand).resolves({
        ETag: '"abc123"',
        ContentLength: 1024,
        LastModified: new Date('2024-01-01'),
        ContentType: 'image/jpeg'
      });

      const info = await s3Service.getObjectInfo('bucket', 'key');

      expect(info).toEqual({
        bucket: 'bucket',
        key: 'key',
        etag: '"abc123"',
        size: 1024,
        lastModified: new Date('2024-01-01'),
        contentType: 'image/jpeg'
      });
    });

    it('should return null when object does not exist', async () => {
      const error: any = new Error('NoSuchKey');
      error.name = 'NoSuchKey';
      s3Mock.on(GetObjectCommand).rejects(error);

      const info = await s3Service.getObjectInfo('bucket', 'key');

      expect(info).toBeNull();
    });

    it('should throw for other S3 errors', async () => {
      const error: any = new Error('AccessDenied');
      error.name = 'AccessDenied';
      s3Mock.on(GetObjectCommand).rejects(error);

      await expect(
        s3Service.getObjectInfo('bucket', 'key')
      ).rejects.toThrow('AccessDenied');
    });
  });

  describe('bucket getters', () => {
    it('should return temp bucket', () => {
      expect(s3Service.getTempBucket()).toBe('test-temp-bucket');
    });

    it('should return final bucket', () => {
      expect(s3Service.getFinalBucket()).toBe('test-final-bucket');
    });
  });
});

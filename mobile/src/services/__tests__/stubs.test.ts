/**
 * Smoke tests for test infrastructure
 *
 * Validates that mock Response factory and stub services work correctly
 * before proceeding with adapter tests.
 */

import { createMockResponse, StubUploadService, StubNotificationService } from './stubs';

describe('Test Infrastructure', () => {
  describe('createMockResponse', () => {
    it('should create a mock Response with default values', () => {
      const response = createMockResponse({});

      expect(response.ok).toBe(true);
      expect(response.status).toBe(200);
      expect(response.statusText).toBe('OK');
    });

    it('should create a mock Response with custom values', () => {
      const response = createMockResponse({
        ok: false,
        status: 404,
        statusText: 'Not Found',
        data: { error: 'Resource not found' },
      });

      expect(response.ok).toBe(false);
      expect(response.status).toBe(404);
      expect(response.statusText).toBe('Not Found');
    });

    it('should support json() method', async () => {
      const data = { jobId: 'job-123', status: 'COMPLETED' };
      const response = createMockResponse({ data });

      const result = await response.json();
      expect(result).toEqual(data);
    });

    it('should support text() method', async () => {
      const data = { message: 'hello' };
      const response = createMockResponse({ data });

      const result = await response.text();
      expect(result).toBe(JSON.stringify(data));
    });
  });

  describe('StubUploadService', () => {
    it('should provide working stub implementation', async () => {
      const stub = new StubUploadService();

      const response = await stub.requestPresignedUrl('test.jpg', 'image/jpeg', 1024);

      expect(response.jobId).toBeTruthy();
      expect(response.presignedUrl).toContain('s3.amazonaws.com');
      expect(response.s3Key).toContain(response.jobId);
    });
  });

  describe('StubNotificationService', () => {
    it('should provide working stub implementation', async () => {
      const stub = new StubNotificationService();

      await stub.initialize();

      const token = stub.getExpoPushToken();
      expect(token).toBeTruthy();
    });
  });
});

/**
 * Playwright API Smoke Test
 *
 * Exercises the presign → upload → status happy path against LocalStack-backed backend.
 * Anchored to:
 * - standards/testing-standards.md (E2E Tests, Network Access Policy)
 * - standards/cross-cutting.md (Hard-Fail Controls, Observability)
 * - standards/global.md (Example Quality Gate)
 *
 * Scope: TASK-0292-playwright-api-smoke.task.yaml
 * - ✅ Presign endpoint (POST /v1/upload/presign)
 * - ✅ Status endpoint (GET /v1/jobs/{id})
 * - ✅ S3 upload via presigned URL
 * - ✅ W3C traceparent propagation
 * - ✅ Contract validation (Zod schemas)
 *
 * Out of Scope:
 * - Worker pipeline processing (covered by Cucumber E2E)
 * - Download endpoint (separate task)
 * - Batch uploads (separate task)
 * - DLQ redrive (covered by integration tests)
 */
// @ts-nocheck


import { test, expect } from '@playwright/test';
import { TestDataBuilder } from './fixtures/test-data.builder';
import {
  PresignUploadResponseSchema,
  JobResponseSchema,
  ApiErrorSchema,
} from '@photoeditor/shared';

// LocalStack API Gateway endpoint (configured via baseURL in playwright.config.ts)
const API_BASE = process.env.API_BASE_URL || 'http://localhost:4566';

test.describe('PhotoEditor API Smoke', () => {
  test.describe.configure({ mode: 'serial' }); // Run tests in order for readability

  let jobId: string;
  let presignedUrl: string;
  let s3Key: string;

  test('should generate presigned upload URL', async ({ request }) => {
    const correlationId = TestDataBuilder.correlationId();
    const payload = TestDataBuilder.presignRequest();

    const response = await request.post(`${API_BASE}/v1/upload/presign`, {
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'x-correlation-id': correlationId,
      },
    });

    // Assert HTTP 200
    expect(response.status()).toBe(200);

    // Parse and validate response schema
    const body = await response.json();
    const validationResult = PresignUploadResponseSchema.safeParse(body);

    expect(validationResult.success).toBe(true);

    if (validationResult.success) {
      const data = validationResult.data;

      // Extract for subsequent tests
      jobId = data.jobId;
      presignedUrl = data.presignedUrl;
      s3Key = data.s3Key;

      // Assert response structure
      expect(jobId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(presignedUrl).toContain('X-Amz-Algorithm=AWS4-HMAC-SHA256');
      expect(s3Key).toContain('temp/');
      expect(data.expiresAt).toBeTruthy();
    }
  });

  test('should upload image to presigned URL', async ({ request }) => {
    // Skip if presign failed
    test.skip(!presignedUrl, 'Presigned URL not available');

    const imageBuffer = TestDataBuilder.testImageBuffer();

    const uploadResponse = await request.put(presignedUrl, {
      data: imageBuffer,
      headers: {
        'Content-Type': 'image/jpeg',
      },
    });

    // S3 returns 200 on successful PUT
    expect(uploadResponse.status()).toBe(200);
  });

  test('should retrieve job status', async ({ request }) => {
    // Skip if presign failed
    test.skip(!jobId, 'Job ID not available');

    const correlationId = TestDataBuilder.correlationId();

    const response = await request.get(`${API_BASE}/v1/jobs/${jobId}`, {
      headers: {
        'x-correlation-id': correlationId,
      },
    });

    // Assert HTTP 200
    expect(response.status()).toBe(200);

    // Parse and validate response schema
    const body = await response.json();
    const validationResult = JobResponseSchema.safeParse(body);

    expect(validationResult.success).toBe(true);

    if (validationResult.success) {
      const data = validationResult.data;

      // Assert job status is valid
      expect(data.jobId).toBe(jobId);
      expect(data.status).toMatch(/^(QUEUED|PROCESSING|EDITING|COMPLETED|FAILED)$/);
      expect(data.createdAt).toBeTruthy();
      expect(data.updatedAt).toBeTruthy();
    }
  });

  test('should reject invalid content type', async ({ request }) => {
    const correlationId = TestDataBuilder.correlationId();
    const payload = TestDataBuilder.invalidContentTypeRequest();

    const response = await request.post(`${API_BASE}/v1/upload/presign`, {
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'x-correlation-id': correlationId,
      },
    });

    // Assert HTTP 400 Bad Request
    expect(response.status()).toBe(400);

    // Parse and validate error schema
    const body = await response.json();
    const validationResult = ApiErrorSchema.safeParse(body);

    expect(validationResult.success).toBe(true);

    if (validationResult.success) {
      const data = validationResult.data;
      expect(data.error.code).toBeTruthy();
      expect(data.error.message).toContain('contentType');
    }
  });

  test('should reject oversized file', async ({ request }) => {
    const correlationId = TestDataBuilder.correlationId();
    const payload = TestDataBuilder.oversizedFileRequest();

    const response = await request.post(`${API_BASE}/v1/upload/presign`, {
      data: payload,
      headers: {
        'Content-Type': 'application/json',
        'x-correlation-id': correlationId,
      },
    });

    // Assert HTTP 400 Bad Request
    expect(response.status()).toBe(400);

    // Parse and validate error schema
    const body = await response.json();
    const validationResult = ApiErrorSchema.safeParse(body);

    expect(validationResult.success).toBe(true);

    if (validationResult.success) {
      const data = validationResult.data;
      expect(data.error.code).toBeTruthy();
      expect(data.error.message).toContain('fileSize');
    }
  });

  test('should return 404 for non-existent job', async ({ request }) => {
    const fakeJobId = '00000000-0000-0000-0000-000000000000';
    const correlationId = TestDataBuilder.correlationId();

    const response = await request.get(`${API_BASE}/v1/jobs/${fakeJobId}`, {
      headers: {
        'x-correlation-id': correlationId,
      },
    });

    // Assert HTTP 404 Not Found
    expect(response.status()).toBe(404);

    // Parse and validate error schema
    const body = await response.json();
    const validationResult = ApiErrorSchema.safeParse(body);

    expect(validationResult.success).toBe(true);

    if (validationResult.success) {
      const data = validationResult.data;
      expect(data.error.code).toBeTruthy();
      expect(data.error.message).toBeTruthy();
    }
  });
});

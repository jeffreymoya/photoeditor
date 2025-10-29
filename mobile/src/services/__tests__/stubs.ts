/**
 * Test Infrastructure - Mock Response Factory and Stub Services
 *
 * Per standards/testing-standards.md:
 * - Mock external dependencies using locally defined stubs
 * - Keep assertions focused on observable behavior
 *
 * Per task TASK-0826 plan step 1:
 * - createMockResponse() factory returns complete Response objects
 * - StubUploadService and StubNotificationService for component tests
 */

import { z, type ZodTypeAny } from 'zod';

import type { INotificationService } from '../notification/port';
import type {
  IUploadService,
  PresignUploadResponse,
  BatchUploadResponse,
  Job,
  BatchJob,
  DeviceTokenResponse,
} from '../upload/port';

const DEFAULT_JOB_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
const DEFAULT_BATCH_JOB_ID = 'f47ac10b-58cc-4372-a567-0e02b2c3d480';

/**
 * Deterministic helper for ISO timestamps in tests
 */
function isoNow(): string {
  return new Date().toISOString();
}

/**
 * Factory for schema-complete presign upload responses
 */
export function buildPresignUploadResponse(
  overrides: Partial<PresignUploadResponse> = {}
): PresignUploadResponse {
  const jobId = overrides.jobId ?? DEFAULT_JOB_ID;
  return {
    jobId,
    presignedUrl:
      overrides.presignedUrl ?? `https://s3.amazonaws.com/bucket/${jobId}`,
    s3Key: overrides.s3Key ?? `uploads/${jobId}/image.jpg`,
    expiresAt:
      overrides.expiresAt ?? new Date(Date.now() + 3_600_000).toISOString(),
  };
}

/**
 * Factory for schema-complete job responses
 */
export function buildJob(overrides: Partial<Job> = {}): Job {
  const now = isoNow();
  return {
    jobId: overrides.jobId ?? DEFAULT_JOB_ID,
    userId: overrides.userId ?? 'user-123',
    status: overrides.status ?? 'PROCESSING',
    createdAt: overrides.createdAt ?? now,
    updatedAt: overrides.updatedAt ?? now,
    locale: overrides.locale ?? 'en',
    ...overrides,
  };
}

/**
 * Factory for schema-complete batch upload responses
 */
export function buildBatchUploadResponse(
  overrides: Partial<BatchUploadResponse> = {}
): BatchUploadResponse {
  const batchJobId = overrides.batchJobId ?? DEFAULT_BATCH_JOB_ID;
  const childJobIds =
    overrides.childJobIds ?? [
      'f47ac10b-58cc-4372-a567-0e02b2c3d481',
      'f47ac10b-58cc-4372-a567-0e02b2c3d482',
    ];

  const uploads =
    overrides.uploads ??
    childJobIds.map((jobId, index) => ({
      presignedUrl: `https://s3.amazonaws.com/bucket/${jobId}`,
      s3Key: `uploads/${jobId}/file${index + 1}.jpg`,
      expiresAt: new Date(Date.now() + 3_600_000).toISOString(),
    }));

  return {
    batchJobId,
    childJobIds,
    uploads,
    ...overrides,
  };
}

/**
 * Factory for schema-complete batch job status responses
 */
export function buildBatchJob(overrides: Partial<BatchJob> = {}): BatchJob {
  const now = isoNow();
  const defaultChildJobIds = [
    'f47ac10b-58cc-4372-a567-0e02b2c3d481',
    'f47ac10b-58cc-4372-a567-0e02b2c3d482',
  ];
  const childJobIds = overrides.childJobIds ?? defaultChildJobIds;
  const totalCount = overrides.totalCount ?? childJobIds.length;

  const defaults = {
    batchJobId: DEFAULT_BATCH_JOB_ID,
    userId: 'user-123',
    status: 'PROCESSING' as const,
    createdAt: now,
    updatedAt: now,
    sharedPrompt: 'shared prompt',
    childJobIds,
    completedCount: 0,
    totalCount,
    locale: 'en' as const,
  };

  return { ...defaults, ...overrides };
}

/**
 * Factory for device token registration responses
 */
export function buildDeviceTokenResponse(
  overrides: Partial<DeviceTokenResponse> = {}
): DeviceTokenResponse {
  return {
    success: true,
    message: 'Device token registered successfully',
    ...overrides,
  };
}

/**
 * Create a mock Response object with all required methods
 *
 * Used by adapter tests to simulate fetch responses without network calls.
 * Implements full Response interface per Fetch API specification.
 *
 * @param options - Response configuration
 * @returns Complete Response object
 */
export function createMockResponse(options: {
  ok?: boolean;
  status?: number;
  statusText?: string;
  data?: unknown;
  headers?: Record<string, string>;
}): Response {
  const {
    ok = true,
    status = 200,
    statusText = 'OK',
    data = {},
    headers = {},
  } = options;

  const body = JSON.stringify(data);
  const mockHeaders = new Headers(headers);

  return {
    ok,
    status,
    statusText,
    headers: mockHeaders,
    redirected: false,
    type: 'basic',
    url: 'https://api.photoeditor.dev/mock',
    body: null,
    bodyUsed: false,

    // JSON parsing
    json: jest.fn().mockResolvedValue(data),

    // Text parsing
    text: jest.fn().mockResolvedValue(body),

    // Blob parsing
    blob: jest.fn().mockResolvedValue(new Blob([body])),

    // ArrayBuffer parsing
    arrayBuffer: jest.fn().mockResolvedValue(new ArrayBuffer(0)),

    // FormData parsing
    formData: jest.fn().mockResolvedValue(new FormData()),

    // Clone method
    clone: jest.fn().mockReturnThis(),
  } as unknown as Response;
}

type SchemaInfer<TSchema extends ZodTypeAny> = z.infer<TSchema>;

interface SchemaSafeResponseOptions<TSchema extends ZodTypeAny> {
  schema: TSchema;
  /**
   * Factory that produces schema-complete objects; typically a builder from this module.
   */
  build: (overrides?: Partial<SchemaInfer<TSchema>>) => SchemaInfer<TSchema>;
  /**
   * Optional overrides merged onto the builder output before validation.
   */
  overrides?: Partial<SchemaInfer<TSchema>>;
  /**
   * Provide an explicit value instead of composing via the builder.
   */
  value?: SchemaInfer<TSchema>;
  /**
   * Additional response configuration (status, headers, etc.).
   */
  responseInit?: {
    ok?: boolean;
    status?: number;
    statusText?: string;
    headers?: Record<string, string>;
  };
}

/**
 * Wraps createMockResponse with schema validation so test doubles cannot drift
 * from the DTO contract. Uses builders to supply defaults, then validates via Zod.
 */
export function schemaSafeResponse<TSchema extends ZodTypeAny>(
  options: SchemaSafeResponseOptions<TSchema>
): Response {
  const { schema, build, overrides = {}, value, responseInit } = options;

  if (value !== undefined && Object.keys(overrides).length > 0) {
    throw new Error('schemaSafeResponse received both `value` and `overrides`; choose one.');
  }

  const candidate = value ?? build(overrides);
  const parsed = schema.parse(candidate);

  return createMockResponse({
    ...responseInit,
    data: parsed,
  });
}

/**
 * Stub Upload Service for component/integration tests
 *
 * Provides in-memory implementation of IUploadService without network calls.
 * Feature layer tests can use this to isolate component behavior.
 */
export class StubUploadService implements IUploadService {
  private jobStatuses = new Map<string, Job>();

  async setBaseUrl(_url: string): Promise<void> {
    // No-op in stub
  }

  async loadBaseUrl(): Promise<void> {
    // No-op in stub
  }

  async requestPresignedUrl(
    fileName: string,
    _contentType: string,
    _fileSize: number,
    _prompt?: string
  ): Promise<PresignUploadResponse> {
    const jobId = `job-${Date.now()}`;
    return {
      jobId,
      presignedUrl: `https://s3.amazonaws.com/bucket/${jobId}`,
      s3Key: `uploads/${jobId}/${fileName}`,
      expiresAt: new Date(Date.now() + 3600000).toISOString(),
    };
  }

  async uploadImage(_uploadUrl: string, _imageUri: string): Promise<void> {
    // Simulate upload delay
    await new Promise((resolve) => setTimeout(resolve, 100));
  }

  async getJobStatus(jobId: string): Promise<Job> {
    return this.jobStatuses.get(jobId) || {
      jobId,
      userId: 'test-user-id',
      status: 'PROCESSING',
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      locale: 'en',
    };
  }

  async processImage(
    _imageUri: string,
    _fileName: string,
    _fileSize: number,
    _prompt?: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    onProgress?.(25);
    await new Promise((resolve) => setTimeout(resolve, 100));
    onProgress?.(50);
    await new Promise((resolve) => setTimeout(resolve, 100));
    onProgress?.(100);
    return `https://api.photoeditor.dev/download/job-${Date.now()}`;
  }

  async requestBatchPresignedUrls(
    files: { fileName: string; fileSize: number }[],
    _sharedPrompt: string,
    _individualPrompts?: string[]
  ): Promise<BatchUploadResponse> {
    const batchJobId = `batch-${Date.now()}`;
    const childJobIds = files.map((_, i) => `job-${Date.now()}-${i}`);
    return {
      batchJobId,
      childJobIds,
      uploads: files.map((file, i) => ({
        jobId: childJobIds[i],
        presignedUrl: `https://s3.amazonaws.com/bucket/${childJobIds[i]}`,
        s3Key: `uploads/${childJobIds[i]}/${file.fileName}`,
        expiresAt: new Date(Date.now() + 3600000).toISOString(),
      })),
    };
  }

  async getBatchJobStatus(batchJobId: string): Promise<BatchJob> {
    return {
      batchJobId,
      userId: 'test-user-id',
      status: 'COMPLETED',
      totalCount: 3,
      completedCount: 3,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      locale: 'en',
      sharedPrompt: 'test prompt',
      childJobIds: ['job-1', 'job-2', 'job-3'],
    };
  }

  async processBatchImages(
    images: { uri: string; fileName?: string; fileSize?: number }[],
    _sharedPrompt: string,
    _individualPrompts?: string[],
    onProgress?: (progress: number, batchJobId?: string) => void
  ): Promise<string[]> {
    const batchJobId = `batch-${Date.now()}`;
    onProgress?.(10, batchJobId);
    await new Promise((resolve) => setTimeout(resolve, 100));
    onProgress?.(50, batchJobId);
    await new Promise((resolve) => setTimeout(resolve, 100));
    onProgress?.(100, batchJobId);
    return images.map((_, i) => `https://api.photoeditor.dev/download/job-${i}`);
  }

  async registerDeviceToken(
    _expoPushToken: string,
    _platform: 'ios' | 'android',
    _deviceId: string
  ): Promise<DeviceTokenResponse> {
    return {
      success: true,
      message: 'Device token registered successfully',
    };
  }

  async deactivateDeviceToken(_deviceId: string): Promise<DeviceTokenResponse> {
    return {
      success: true,
      message: 'Device token deactivated successfully',
    };
  }

  async testConnection(): Promise<boolean> {
    return true;
  }
}

/**
 * Stub Notification Service for component/integration tests
 *
 * Provides in-memory implementation of INotificationService without platform APIs.
 * Feature layer tests can use this to isolate component behavior.
 */
export class StubNotificationService implements INotificationService {
  private expoPushToken: string | undefined = 'ExponentPushToken[stub-token]';
  private initialized = false;

  async initialize(): Promise<void> {
    this.initialized = true;
  }

  async scheduleJobCompletionNotification(_jobId: string, _prompt: string): Promise<void> {
    // No-op in stub
  }

  async scheduleLocalNotification(
    _title: string,
    _body: string,
    _data?: Record<string, unknown>
  ): Promise<void> {
    // No-op in stub
  }

  async cancelAllNotifications(): Promise<void> {
    // No-op in stub
  }

  async unregisterFromBackend(): Promise<void> {
    this.expoPushToken = undefined;
  }

  getExpoPushToken(): string | undefined {
    return this.expoPushToken;
  }

  isInitialized(): boolean {
    return this.initialized;
  }
}

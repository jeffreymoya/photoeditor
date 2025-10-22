/**
 * Photo Editor API Client
 * Generated from OpenAPI specification
 * DO NOT EDIT MANUALLY - regenerate with pnpm turbo run contracts:generate --filter=@photoeditor/shared
 */

import type * as Types from './types';

export interface ApiClientConfig {
  baseUrl: string;
  headers?: Record<string, string>;
  fetch?: typeof fetch;
}

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, unknown>;
  timestamp: string;
  requestId?: string;
}

export class ApiClient {
  private baseUrl: string;
  private headers: Record<string, string>;
  private fetchFn: typeof fetch;

  constructor(config: ApiClientConfig) {
    this.baseUrl = config.baseUrl.replace(/\/$/, "");
    this.headers = {
      'Content-Type': 'application/json',
      ...config.headers,
    };
    this.fetchFn = config.fetch || fetch;
  }

  private async request<T>(
    method: string,
    path: string,
    options?: {
      body?: unknown;
      query?: Record<string, string>;
      headers?: Record<string, string>;
    }
  ): Promise<T> {
    const url = new URL(`${this.baseUrl}${path}`);
    if (options?.query) {
      Object.entries(options.query).forEach(([key, value]) => {
        url.searchParams.append(key, value);
      });
    }

    const response = await this.fetchFn(url.toString(), {
      method,
      headers: { ...this.headers, ...options?.headers },
      body: options?.body ? JSON.stringify(options.body) : undefined,
    });

    if (!response.ok) {
      const error: ApiError = await response.json();
      throw new Error(error.message || `HTTP ${response.status}`);
    }

    return response.json();
  }

  /**
   * Generate presigned upload URL
   * Creates a presigned S3 upload URL and job record for single or batch photo uploads. Supports both single file and batch uploads based on request body structure.
   */
  async presignUpload(body: any): Promise<any> {
    return this.request('POST', `/v1/upload/presign`, { body });
  }

  /**
   * Get job status
   * Retrieves the current processing status and metadata for a job by its ID.
   */
  async getJobStatus(params: { id: string }): Promise<any> {
    return this.request('GET', `/v1/jobs/${params.id}`);
  }

  /**
   * Get batch job status
   * Retrieves aggregate status and progress for a batch job, including completion count and child job IDs.
   */
  async getBatchJobStatus(params: { batchJobId: string }): Promise<any> {
    return this.request('GET', `/v1/batch-status/${params.batchJobId}`);
  }

  /**
   * Get download URL for completed job
   * Generates a presigned S3 download URL for a completed job's edited photo. Returns 400 if job is not completed.
   */
  async downloadJobResult(params: { id: string }): Promise<any> {
    return this.request('GET', `/v1/jobs/${params.id}/download`);
  }

  /**
   * Register device token
   * Registers an Expo push notification token for a user's device to enable push notifications for job completion.
   */
  async registerDeviceToken(body: any): Promise<any> {
    return this.request('POST', `/v1/device-tokens`, { body });
  }

  /**
   * Deactivate device token
   * Deactivates a previously registered push notification token, stopping notifications for the specified device.
   */
  async deactivateDeviceToken(query: { deviceId: string }): Promise<any> {
    return this.request('DELETE', `/v1/device-tokens`, { query });
  }

}

export function createApiClient(config: ApiClientConfig): ApiClient {
  return new ApiClient(config);
}

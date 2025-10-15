/**
 * API E2E Test Adapter
 *
 * Provides HTTP operations for E2E API testing following adapters pattern.
 * Complexity: ≤5, LOC: ≤75 per STANDARDS.md line 36
 */

import axios, { AxiosInstance, AxiosResponse } from 'axios';

export interface PresignRequest {
  fileName: string;
  contentType: string;
  fileSize: number;
  prompt: string;
}

export interface BatchPresignRequest {
  files: Array<{
    fileName: string;
    contentType: string;
    fileSize: number;
  }>;
  sharedPrompt?: string;
  individualPrompts?: string[];
}

export class APITestAdapter {
  private client: AxiosInstance;

  constructor(baseURL: string) {
    this.client = axios.create({
      baseURL,
      validateStatus: () => true, // Don't throw on any status
      headers: {
        'Content-Type': 'application/json'
      }
    });
  }

  /**
   * Request presigned URL for single upload (CC=1)
   */
  async requestPresign(request: PresignRequest): Promise<AxiosResponse> {
    return await this.client.post('/v1/upload/presign', request);
  }

  /**
   * Request batch presigned URLs (CC=1)
   */
  async requestBatchPresign(request: BatchPresignRequest): Promise<AxiosResponse> {
    return await this.client.post('/v1/upload/presign', request);
  }

  /**
   * Get job status (CC=1)
   */
  async getJobStatus(jobId: string): Promise<AxiosResponse> {
    return await this.client.get(`/v1/jobs/${jobId}`);
  }

  /**
   * Upload file to presigned URL (CC=1)
   */
  async uploadToPresignedUrl(url: string, fileContent: Buffer, contentType: string): Promise<AxiosResponse> {
    return await axios.put(url, fileContent, {
      headers: {
        'Content-Type': contentType
      },
      validateStatus: () => true
    });
  }

  /**
   * Add W3C traceparent header for trace propagation (CC=1)
   */
  addTraceparent(traceparent: string): void {
    this.client.defaults.headers.common['traceparent'] = traceparent;
  }
}

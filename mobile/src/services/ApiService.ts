/**
 * @deprecated This file is deprecated. Use the port/adapter pattern instead:
 * - Port interface: mobile/src/services/upload/port.ts
 * - Adapter implementation: mobile/src/services/upload/adapter.ts
 *
 * Migration path:
 * 1. Import IUploadService from '../services/upload/port'
 * 2. Use uploadService from '../services/upload/adapter'
 * 3. Or inject via ServiceContext for better testability
 *
 * This file is kept temporarily for backward compatibility during migration (TASK-0820).
 * Will be removed after all references are updated.
 */

import {
  PresignUploadRequestSchema,
  PresignUploadResponseSchema,
  BatchUploadRequestSchema,
  BatchUploadResponseSchema,
  DeviceTokenRegistrationSchema,
  DeviceTokenResponseSchema,
  JobSchema,
  BatchJobSchema,
} from '@photoeditor/shared';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import shared contract schemas (SSOT)

class ApiService {
  private baseUrl: string;

  constructor() {
    // Default to development endpoint; allow override via Expo public env var
    this.baseUrl = process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.photoeditor.dev';
  }

  async setBaseUrl(url: string) {
    this.baseUrl = url;
    await AsyncStorage.setItem('api_base_url', url);
  }

  async loadBaseUrl() {
    const savedUrl = await AsyncStorage.getItem('api_base_url');
    if (savedUrl) {
      this.baseUrl = savedUrl;
    }
  }

  private generateTraceId(): string {
    // Generate a W3C traceparent header: version-trace_id-parent_id-trace_flags
    // version: 00 (fixed)
    // trace_id: 32 hex characters (16 bytes)
    // parent_id: 16 hex characters (8 bytes)
    // trace_flags: 01 (sampled)
    const traceId = Array.from({ length: 32 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    const parentId = Array.from({ length: 16 }, () =>
      Math.floor(Math.random() * 16).toString(16)
    ).join('');
    return `00-${traceId}-${parentId}-01`;
  }

  private generateCorrelationId(): string {
    // Generate a correlation ID (UUID v4-like)
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }

  private async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;

    const defaultHeaders = {
      'Content-Type': 'application/json',
      'traceparent': this.generateTraceId(),
      'x-correlation-id': this.generateCorrelationId(),
    };

    const response = await fetch(url, {
      ...options,
      headers: {
        ...defaultHeaders,
        ...options.headers,
      },
    });

    if (!response.ok) {
      throw new Error(`API Error: ${response.status} ${response.statusText}`);
    }

    return response;
  }

  async requestPresignedUrl(
    fileName: string,
    contentType: string,
    fileSize: number,
    prompt?: string
  ): Promise<{ jobId: string; presignedUrl: string; s3Key: string; expiresAt: string }> {
    const requestBody = PresignUploadRequestSchema.parse({ fileName, contentType, fileSize, prompt });

    const response = await this.makeRequest('/presign', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    return PresignUploadResponseSchema.parse(data);
  }

  async uploadImage(uploadUrl: string, imageUri: string): Promise<void> {
    // Get the image as a blob/file
    const response = await fetch(imageUri);
    const blob = await response.blob();

    await fetch(uploadUrl, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': 'image/jpeg',
      },
    });
  }

  async getJobStatus(jobId: string) {
    const response = await this.makeRequest(`/status/${jobId}`);
    const data = await response.json();
    return JobSchema.parse(data);
  }

  async processImage(
    imageUri: string,
    fileName: string,
    fileSize: number,
    prompt?: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    try {
      // Step 1: Request presigned URL
      const { jobId, presignedUrl } = await this.requestPresignedUrl(
        fileName,
        'image/jpeg',
        fileSize,
        prompt
      );

      onProgress?.(25);

      // Step 2: Upload image
      await this.uploadImage(presignedUrl, imageUri);
      onProgress?.(50);

      // Step 3: Poll for completion
      return await this.pollJobCompletion(jobId, onProgress);
    } catch (error) {
      throw new Error(
        `Failed to process image: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async pollJobCompletion(
    jobId: string,
    onProgress?: (progress: number) => void
  ): Promise<string> {
    const maxAttempts = 120; // 10 minutes at 5-second intervals
    const pollInterval = 5000; // 5 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const job = await this.getJobStatus(jobId);

        const progress = Math.min(50 + (attempt / maxAttempts) * 45, 95);
        onProgress?.(progress);

        if (job.status === 'COMPLETED' && job.finalS3Key) {
          onProgress?.(100);
          // Convert S3 key to presigned URL for download
          const downloadUrl = `${this.baseUrl}/download/${job.jobId}`;
          return downloadUrl;
        }

        if (job.status === 'FAILED') {
          throw new Error(job.error || 'Processing failed');
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error) {
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        // Continue polling on temporary errors
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error('Processing timeout - please check job status later');
  }

  // Batch processing methods
  async requestBatchPresignedUrls(
    files: { fileName: string; fileSize: number }[],
    sharedPrompt: string,
    individualPrompts?: string[]
  ) {
    const requestBody = BatchUploadRequestSchema.parse({
      files: files.map(file => ({
        fileName: file.fileName,
        contentType: 'image/jpeg',
        fileSize: file.fileSize,
      })),
      sharedPrompt,
      individualPrompts,
    });

    const response = await this.makeRequest('/presign', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    return BatchUploadResponseSchema.parse(data);
  }

  async getBatchJobStatus(batchJobId: string) {
    const response = await this.makeRequest(`/batch-status/${batchJobId}`);
    const data = await response.json();
    return BatchJobSchema.parse(data);
  }

  async processBatchImages(
    images: { uri: string; fileName?: string; fileSize?: number }[],
    sharedPrompt: string,
    individualPrompts?: string[],
    onProgress?: (progress: number, batchJobId?: string) => void
  ): Promise<string[]> {
    try {
      // Prepare file info
      const files = images.map((image, index) => ({
        fileName: image.fileName || `image_${Date.now()}_${index}.jpg`,
        fileSize: image.fileSize || 1024 * 1024, // 1MB default
      }));

      // Step 1: Request batch presigned URLs
      const batchResponse = await this.requestBatchPresignedUrls(
        files,
        sharedPrompt,
        individualPrompts
      );

      onProgress?.(10, batchResponse.batchJobId);

      // Step 2: Upload all images in parallel
      await Promise.all(
        images.map((image, index) =>
          this.uploadImage(batchResponse.uploads[index].presignedUrl, image.uri)
        )
      );

      onProgress?.(30, batchResponse.batchJobId);

      // Step 3: Poll for batch completion
      return await this.pollBatchJobCompletion(
        batchResponse.batchJobId,
        batchResponse.childJobIds,
        onProgress
      );
    } catch (error) {
      throw new Error(
        `Failed to process batch: ${error instanceof Error ? error.message : 'Unknown error'}`
      );
    }
  }

  private async pollBatchJobCompletion(
    batchJobId: string,
    childJobIds: string[],
    onProgress?: (progress: number, batchJobId?: string) => void
  ): Promise<string[]> {
    const maxAttempts = 240; // 20 minutes at 5-second intervals
    const pollInterval = 5000; // 5 seconds

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      try {
        const batchJob = await this.getBatchJobStatus(batchJobId);

        // Calculate progress based on completed jobs
        const baseProgress = 30; // Already uploaded
        const processingProgress = (batchJob.completedCount / batchJob.totalCount) * 65;
        const totalProgress = Math.min(baseProgress + processingProgress, 95);

        onProgress?.(totalProgress, batchJobId);

        if (batchJob.status === 'COMPLETED') {
          onProgress?.(100, batchJobId);

          // Get download URLs for all completed jobs
          const downloadUrls = await Promise.all(
            childJobIds.map(jobId => `${this.baseUrl}/download/${jobId}`)
          );

          return downloadUrls;
        }

        if (batchJob.status === 'FAILED') {
          throw new Error(batchJob.error || 'Batch processing failed');
        }

        // Wait before next poll
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      } catch (error) {
        if (attempt === maxAttempts - 1) {
          throw error;
        }
        // Continue polling on temporary errors
        await new Promise((resolve) => setTimeout(resolve, pollInterval));
      }
    }

    throw new Error('Batch processing timeout - please check job status later');
  }

  // Device token registration
  async registerDeviceToken(
    expoPushToken: string,
    platform: 'ios' | 'android',
    deviceId: string
  ): Promise<{ success: boolean; message: string }> {
    const requestBody = DeviceTokenRegistrationSchema.parse({
      expoPushToken,
      platform,
      deviceId,
    });

    const response = await this.makeRequest('/device-token', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    return DeviceTokenResponseSchema.parse(data);
  }

  async deactivateDeviceToken(deviceId: string): Promise<{ success: boolean; message: string }> {
    const response = await this.makeRequest(`/device-token?deviceId=${encodeURIComponent(deviceId)}`, {
      method: 'DELETE',
    });

    const data = await response.json();
    return DeviceTokenResponseSchema.parse(data);
  }

  // Utility method for testing API connectivity
  async testConnection(): Promise<boolean> {
    try {
      const response = await fetch(`${this.baseUrl}/health`);
      return response.ok;
    } catch {
      return false;
    }
  }
}

export const apiService = new ApiService();

// Initialize with saved URL on app start
apiService.loadBaseUrl();

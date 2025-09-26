import { z } from 'zod';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Import shared schemas if available
// import { PresignRequestSchema, JobStatusSchema } from '@photoeditor/shared';

// Define schemas locally for now - aligned with backend
const PresignRequestSchema = z.object({
  fileName: z.string(),
  contentType: z.string(),
  fileSize: z.number(),
  prompt: z.string().optional(),
});

const PresignResponseSchema = z.object({
  jobId: z.string(),
  presignedUrl: z.string(),
  s3Key: z.string(),
  expiresAt: z.string(),
});

const JobStatusSchema = z.object({
  jobId: z.string(),
  status: z.enum(['QUEUED', 'PROCESSING', 'EDITING', 'COMPLETED', 'FAILED']),
  createdAt: z.string(),
  updatedAt: z.string(),
  error: z.string().optional(),
  finalS3Key: z.string().optional(),
});

class ApiService {
  private baseUrl: string;

  constructor() {
    // Default to development endpoint, can be changed in settings
    this.baseUrl = 'https://api.photoeditor.dev';
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

  private async makeRequest(
    endpoint: string,
    options: RequestInit = {}
  ): Promise<Response> {
    const url = `${this.baseUrl}${endpoint}`;

    const defaultHeaders = {
      'Content-Type': 'application/json',
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
    const requestBody = PresignRequestSchema.parse({ fileName, contentType, fileSize, prompt });

    const response = await this.makeRequest('/presign', {
      method: 'POST',
      body: JSON.stringify(requestBody),
    });

    const data = await response.json();
    return PresignResponseSchema.parse(data);
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
    return JobStatusSchema.parse(data);
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
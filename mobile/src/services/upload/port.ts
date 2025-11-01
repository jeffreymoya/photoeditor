/**
 * Upload Service Port Interface
 *
 * Defines the contract for upload operations per the Frontend Tier standard:
 * - 100% of external calls behind interface in services port files
 * - Enables testability via stub implementations
 * - Isolates platform APIs from feature and component layers
 */

import type {
  PresignUploadResponseSchema,
  BatchUploadResponseSchema,
  JobSchema,
  BatchJobSchema,
  DeviceTokenResponseSchema,
} from '@photoeditor/shared';
import type { z } from 'zod';

/**
 * Presigned URL response from backend
 */
export type PresignUploadResponse = z.infer<typeof PresignUploadResponseSchema>;

/**
 * Batch upload response from backend
 */
export type BatchUploadResponse = z.infer<typeof BatchUploadResponseSchema>;

/**
 * Job status response
 */
export type Job = z.infer<typeof JobSchema>;

/**
 * Batch job status response
 */
export type BatchJob = z.infer<typeof BatchJobSchema>;

/**
 * Device token registration response
 */
export type DeviceTokenResponse = z.infer<typeof DeviceTokenResponseSchema>;

/**
 * Upload Service Port - Contract for all upload operations
 *
 * Per the Frontend Tier standard Services & Integration Layer:
 * - Ports & Adapters (Hexagonal) for API/Notifications/Platform
 * - 100% of external calls behind interface in services port files
 * - Adapters implement ports with cockatiel retry/circuit breaker policies
 */
export interface IUploadService {
  /**
   * Set the API base URL
   */
  setBaseUrl(url: string): Promise<void>;

  /**
   * Load base URL from storage
   */
  loadBaseUrl(): Promise<void>;

  /**
   * Request a presigned URL for upload
   *
   * @param fileName - Name of the file to upload
   * @param contentType - MIME type of the file
   * @param fileSize - Size of the file in bytes
   * @param prompt - Optional AI processing prompt
   * @returns Presigned URL response with jobId, presignedUrl, s3Key, expiresAt
   */
  requestPresignedUrl(
    fileName: string,
    contentType: string,
    fileSize: number,
    prompt?: string
  ): Promise<PresignUploadResponse>;

  /**
   * Upload an image to S3 using presigned URL
   *
   * @param uploadUrl - Presigned S3 URL
   * @param imageUri - Local URI of the image to upload
   */
  uploadImage(uploadUrl: string, imageUri: string): Promise<void>;

  /**
   * Get job status
   *
   * @param jobId - ID of the job to query
   * @returns Job status with completion state
   */
  getJobStatus(jobId: string): Promise<Job>;

  /**
   * Process an image end-to-end: presign, upload, poll for completion
   *
   * @param imageUri - Local URI of the image
   * @param fileName - Name of the file
   * @param fileSize - Size in bytes
   * @param prompt - Optional AI processing prompt
   * @param onProgress - Optional progress callback (0-100)
   * @returns Download URL for the processed image
   */
  processImage(
    imageUri: string,
    fileName: string,
    fileSize: number,
    prompt?: string,
    onProgress?: (progress: number) => void
  ): Promise<string>;

  /**
   * Request batch presigned URLs for multiple uploads
   *
   * @param files - Array of file metadata
   * @param sharedPrompt - Prompt shared across all images
   * @param individualPrompts - Optional per-image prompts
   * @returns Batch upload response with presigned URLs and job IDs
   */
  requestBatchPresignedUrls(
    files: { fileName: string; fileSize: number }[],
    sharedPrompt: string,
    individualPrompts?: string[]
  ): Promise<BatchUploadResponse>;

  /**
   * Get batch job status
   *
   * @param batchJobId - ID of the batch job
   * @returns Batch job status with completion counts
   */
  getBatchJobStatus(batchJobId: string): Promise<BatchJob>;

  /**
   * Process multiple images in batch
   *
   * @param images - Array of image URIs and metadata
   * @param sharedPrompt - Prompt shared across all images
   * @param individualPrompts - Optional per-image prompts
   * @param onProgress - Optional progress callback (0-100, batchJobId)
   * @returns Array of download URLs for processed images
   */
  processBatchImages(
    images: { uri: string; fileName?: string; fileSize?: number }[],
    sharedPrompt: string,
    individualPrompts?: string[],
    onProgress?: (progress: number, batchJobId?: string) => void
  ): Promise<string[]>;

  /**
   * Register device token with backend
   *
   * @param expoPushToken - Expo push notification token
   * @param platform - Platform (ios or android)
   * @param deviceId - Unique device identifier
   * @returns Registration response
   */
  registerDeviceToken(
    expoPushToken: string,
    platform: 'ios' | 'android',
    deviceId: string
  ): Promise<DeviceTokenResponse>;

  /**
   * Deactivate device token on backend
   *
   * @param deviceId - Unique device identifier
   * @returns Deactivation response
   */
  deactivateDeviceToken(deviceId: string): Promise<DeviceTokenResponse>;

  /**
   * Test API connectivity
   *
   * @returns True if API is reachable
   */
  testConnection(): Promise<boolean>;
}

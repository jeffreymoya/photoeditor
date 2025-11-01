/**
 * RTK Query API slice for upload operations
 * Per the Frontend Tier standard: RTK Query mandated for network calls
 * Per the TypeScript Standards: Zod-at-boundaries, named exports, neverthrow Results
 */

import { createApi, fetchBaseQuery } from '@reduxjs/toolkit/query/react';

import type {
  PresignUploadRequest,
  PresignUploadResponse,
  Job,
  BatchUploadRequest,
  BatchUploadResponse,
  BatchJobStatusResponse,
} from '@photoeditor/shared';

/**
 * Generate W3C traceparent header for request tracing
 * Per the Cross-Cutting standard: traceparent propagation
 */
function generateTraceId(): string {
  const traceId = Array.from({ length: 32 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  const parentId = Array.from({ length: 16 }, () =>
    Math.floor(Math.random() * 16).toString(16)
  ).join('');
  return `00-${traceId}-${parentId}-01`;
}

/**
 * Generate correlation ID for request tracking
 */
function generateCorrelationId(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = Math.random() * 16 | 0;
    const v = c === 'x' ? r : (r & 0x3 | 0x8);
    return v.toString(16);
  });
}

/**
 * Upload API slice - handles presign, upload orchestration, and job status polling
 * Per the Frontend Tier standard State & Logic Layer:
 * - RTK Query for network calls
 * - Optimistic updates with sync queue
 * - Deterministic query keys for offline support
 */
export const uploadApi = createApi({
  reducerPath: 'uploadApi',
  baseQuery: fetchBaseQuery({
    baseUrl: process.env.EXPO_PUBLIC_API_BASE_URL || 'https://api.photoeditor.dev',
    prepareHeaders: (headers) => {
      // Add tracing headers per the Cross-Cutting standard
      headers.set('traceparent', generateTraceId());
      headers.set('x-correlation-id', generateCorrelationId());
      headers.set('Content-Type', 'application/json');
      return headers;
    },
  }),
  tagTypes: ['Job', 'BatchJob'],
  endpoints: (builder) => ({
    /**
     * Request presigned URL for single image upload
     * Endpoint: POST /presign
     */
    requestPresignUrl: builder.mutation<PresignUploadResponse, PresignUploadRequest>({
      query: (request) => ({
        url: '/presign',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: ['Job'],
    }),

    /**
     * Request presigned URLs for batch upload
     * Endpoint: POST /presign (batch)
     */
    requestBatchPresignUrls: builder.mutation<BatchUploadResponse, BatchUploadRequest>({
      query: (request) => ({
        url: '/presign',
        method: 'POST',
        body: request,
      }),
      invalidatesTags: ['BatchJob'],
    }),

    /**
     * Get job status by ID
     * Endpoint: GET /status/:jobId
     * Supports polling with refetchOnMountOrArgChange
     */
    getJobStatus: builder.query<Job, string>({
      query: (jobId) => `/status/${jobId}`,
      providesTags: (result, _error, jobId) =>
        result ? [{ type: 'Job', id: jobId }] : [],
    }),

    /**
     * Get batch job status
     * Endpoint: GET /batch-status/:batchJobId
     */
    getBatchJobStatus: builder.query<BatchJobStatusResponse, string>({
      query: (batchJobId) => `/batch-status/${batchJobId}`,
      providesTags: (result, _error, batchJobId) =>
        result ? [{ type: 'BatchJob', id: batchJobId }] : [],
    }),

    /**
     * Health check endpoint
     * Endpoint: GET /health
     */
    healthCheck: builder.query<{ status: string; version: string; timestamp: string }, void>({
      query: () => '/health',
    }),
  }),
});

/**
 * Export hooks for components per the Frontend Tier standard:
 * - Named exports only (TypeScript Standards)
 * - Feature modules export /public surface
 */
export const {
  useRequestPresignUrlMutation,
  useRequestBatchPresignUrlsMutation,
  useGetJobStatusQuery,
  useGetBatchJobStatusQuery,
  useHealthCheckQuery,
  useLazyGetJobStatusQuery,
  useLazyGetBatchJobStatusQuery,
} = uploadApi;

/**
 * Error type for S3 upload failures
 * Per the TypeScript Standards: Typed errors for analyzability
 */
export interface S3UploadError {
  code: 'FETCH_FAILED' | 'UPLOAD_FAILED';
  message: string;
  statusCode?: number;
  cause?: unknown;
}

/**
 * Helper to upload image to S3 presigned URL
 * Per the TypeScript Standards: No exceptions for control flow, return typed results
 *
 * @param presignedUrl - S3 presigned URL from requestPresignUrl
 * @param imageUri - Local image URI to upload
 * @param contentType - MIME type of the image
 * @returns Promise with success (void) or error object
 */
export async function uploadToS3(
  presignedUrl: string,
  imageUri: string,
  contentType: string
): Promise<{ success: true } | { success: false; error: S3UploadError }> {
  try {
    const response = await fetch(imageUri);
    if (!response.ok) {
      return {
        success: false,
        error: {
          code: 'FETCH_FAILED',
          message: `Failed to fetch image: ${response.statusText}`,
          statusCode: response.status,
        },
      };
    }
    const blob = await response.blob();

    const uploadResponse = await fetch(presignedUrl, {
      method: 'PUT',
      body: blob,
      headers: {
        'Content-Type': contentType,
      },
    });

    if (!uploadResponse.ok) {
      return {
        success: false,
        error: {
          code: 'UPLOAD_FAILED',
          message: `S3 upload failed: ${uploadResponse.statusText}`,
          statusCode: uploadResponse.status,
        },
      };
    }

    return { success: true };
  } catch (error) {
    // Catch only truly unexpected errors (network failures, etc.)
    return {
      success: false,
      error: {
        code: 'UPLOAD_FAILED',
        message: error instanceof Error ? error.message : 'Unknown upload error',
        cause: error,
      },
    };
  }
}

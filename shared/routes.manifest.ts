/**
 * API Routes Manifest
 *
 * This file defines all external API routes for the PhotoEditor application.
 * It serves as the authoritative source for OpenAPI path generation.
 *
 * Per ADR-0003 and the Shared Contracts Tier standard:
 * - Routes reference Zod schemas from shared/schemas for request/response
 * - Contract generator uses this manifest to populate OpenAPI `paths`
 * - RTK Query client generation derives from the generated OpenAPI spec
 * - CI enforces alignment between this manifest and deployed routes
 *
 * Usage:
 * - tooling/contracts/generate.js reads this file to generate OpenAPI paths
 * - scripts/ci/check-route-alignment.js validates Terraform configs match this manifest
 */

import { z } from 'zod';

import {
  PresignUploadRequestSchema,
  PresignUploadResponseSchema,
  BatchUploadRequestSchema,
  BatchUploadResponseSchema,
  JobResponseSchema,
  BatchJobStatusResponseSchema,
  DeviceTokenRegistrationSchema,
  DeviceTokenResponseSchema,
  ApiErrorSchema
} from './schemas';

/**
 * Route definition structure
 */
export interface RouteDefinition {
  /** HTTP method */
  method: 'GET' | 'POST' | 'PUT' | 'DELETE' | 'PATCH';
  /** Path template (e.g., /v1/jobs/{id}) */
  path: string;
  /** Lambda handler name */
  handler: string;
  /** OpenAPI operation ID */
  operationId: string;
  /** Human-readable summary */
  summary: string;
  /** Detailed description */
  description: string;
  /** Request body schema (for POST/PUT/PATCH) */
  requestSchema?: z.ZodTypeAny;
  /** Response schema (200 OK) */
  responseSchema: z.ZodTypeAny;
  /** Path parameters */
  pathParameters?: Array<{
    name: string;
    description: string;
    schema: z.ZodTypeAny;
  }>;
  /** Query parameters */
  queryParameters?: Array<{
    name: string;
    description: string;
    required: boolean;
    schema: z.ZodTypeAny;
  }>;
  /** Tags for grouping in OpenAPI */
  tags: string[];
  /** Whether this route is deprecated */
  deprecated?: boolean;
  /** Deprecation sunset date (ISO 8601) */
  deprecationDate?: string;
  /** Replacement route (for deprecated routes) */
  replacedBy?: string;
}

/**
 * All active API routes
 *
 * Organized by API version and functional area.
 */
export const API_ROUTES: RouteDefinition[] = [
  // ============================================
  // V1 API Routes (Current)
  // ============================================
  {
    method: 'POST',
    path: '/v1/upload/presign',
    handler: 'presign',
    operationId: 'presignUpload',
    summary: 'Generate presigned upload URL',
    description: 'Creates a presigned S3 upload URL and job record for single or batch photo uploads. Supports both single file and batch uploads based on request body structure.',
    requestSchema: z.union([PresignUploadRequestSchema, BatchUploadRequestSchema]),
    responseSchema: z.union([PresignUploadResponseSchema, BatchUploadResponseSchema]),
    tags: ['Upload'],
  },
  {
    method: 'GET',
    path: '/v1/jobs/{id}',
    handler: 'status',
    operationId: 'getJobStatus',
    summary: 'Get job status',
    description: 'Retrieves the current processing status and metadata for a job by its ID.',
    pathParameters: [
      {
        name: 'id',
        description: 'Job UUID',
        schema: z.string().uuid(),
      },
    ],
    responseSchema: JobResponseSchema,
    tags: ['Jobs'],
  },
  {
    method: 'GET',
    path: '/v1/batch-status/{batchJobId}',
    handler: 'status',
    operationId: 'getBatchJobStatus',
    summary: 'Get batch job status',
    description: 'Retrieves aggregate status and progress for a batch job, including completion count and child job IDs.',
    pathParameters: [
      {
        name: 'batchJobId',
        description: 'Batch Job UUID',
        schema: z.string().uuid(),
      },
    ],
    responseSchema: BatchJobStatusResponseSchema,
    tags: ['Jobs', 'Batch'],
  },
  {
    method: 'GET',
    path: '/v1/jobs/{id}/download',
    handler: 'download',
    operationId: 'downloadJobResult',
    summary: 'Get download URL for completed job',
    description: 'Generates a presigned S3 download URL for a completed job\'s edited photo. Returns 400 if job is not completed.',
    pathParameters: [
      {
        name: 'id',
        description: 'Job UUID',
        schema: z.string().uuid(),
      },
    ],
    responseSchema: z.object({
      downloadUrl: z.string().url(),
      expiresAt: z.string().datetime(),
      jobId: z.string().uuid(),
      status: z.string(),
    }),
    tags: ['Jobs', 'Download'],
  },
  {
    method: 'POST',
    path: '/v1/device-tokens',
    handler: 'deviceToken',
    operationId: 'registerDeviceToken',
    summary: 'Register device token',
    description: 'Registers an Expo push notification token for a user\'s device to enable push notifications for job completion.',
    requestSchema: DeviceTokenRegistrationSchema,
    responseSchema: DeviceTokenResponseSchema,
    tags: ['Notifications'],
  },
  {
    method: 'DELETE',
    path: '/v1/device-tokens',
    handler: 'deviceToken',
    operationId: 'deactivateDeviceToken',
    summary: 'Deactivate device token',
    description: 'Deactivates a previously registered push notification token, stopping notifications for the specified device.',
    queryParameters: [
      {
        name: 'deviceId',
        description: 'Device identifier to deactivate',
        required: true,
        schema: z.string(),
      },
    ],
    responseSchema: DeviceTokenResponseSchema,
    tags: ['Notifications'],
  },
];

/**
 * Global error responses applicable to all routes
 */
export const GLOBAL_ERROR_RESPONSES = {
  400: {
    description: 'Bad Request - Invalid input or validation error',
    schema: ApiErrorSchema,
  },
  404: {
    description: 'Not Found - Resource does not exist',
    schema: ApiErrorSchema,
  },
  500: {
    description: 'Internal Server Error - Unexpected server error',
    schema: ApiErrorSchema,
  },
};

/**
 * Get all routes grouped by tag
 */
export function getRoutesByTag(): Record<string, RouteDefinition[]> {
  const grouped: Record<string, RouteDefinition[]> = {};
  for (const route of API_ROUTES) {
    for (const tag of route.tags) {
      if (!grouped[tag]) {
        grouped[tag] = [];
      }
      grouped[tag].push(route);
    }
  }
  return grouped;
}

/**
 * Get all active (non-deprecated) routes
 */
export function getActiveRoutes(): RouteDefinition[] {
  return API_ROUTES.filter(route => !route.deprecated);
}

/**
 * Get all deprecated routes
 */
export function getDeprecatedRoutes(): RouteDefinition[] {
  return API_ROUTES.filter(route => route.deprecated);
}

/**
 * Find route by operation ID
 */
export function findRouteByOperationId(operationId: string): RouteDefinition | undefined {
  return API_ROUTES.find(route => route.operationId === operationId);
}

/**
 * Find route by path and method
 */
export function findRoute(method: string, path: string): RouteDefinition | undefined {
  return API_ROUTES.find(route => route.method === method && route.path === path);
}

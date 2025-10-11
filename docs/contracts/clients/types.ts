/**
 * Generated TypeScript types from Zod schemas
 * DO NOT EDIT MANUALLY - regenerate with npm run contracts:generate
 * Source: @photoeditor/shared/schemas
 */

// ============================================
// API Request/Response Types
// ============================================

export type FileUpload = {
    fileName: string;
    contentType: string;
    fileSize: number;
};

export type PresignUploadRequest = {
    fileName: string;
    contentType: string;
    fileSize: number;
    prompt?: string | undefined;
};

export type PresignUploadResponse = {
    jobId: string;
    presignedUrl: string;
    s3Key: string;
    expiresAt: string;
};

export type BatchUploadRequest = {
    files: {
        fileName: string;
        contentType: string;
        fileSize: number;
    }[];
    sharedPrompt: string;
    individualPrompts?: (string | undefined)[] | undefined;
};

export type BatchUploadResponse = {
    batchJobId: string;
    uploads: {
        presignedUrl: string;
        s3Key: string;
        expiresAt: string;
    }[];
    childJobIds: string[];
};

export type JobStatusResponse = {
    jobId: string;
    status: "QUEUED" | "PROCESSING" | "EDITING" | "COMPLETED" | "FAILED";
    createdAt: string;
    updatedAt: string;
    error?: string | undefined;
};

export type DeviceTokenRegistration = {
    expoPushToken: string;
    platform: "ios" | "android";
    deviceId: string;
};

export type DeviceTokenResponse = {
    success: boolean;
    message: string;
};

export type HealthCheckResponse = {
    status: "healthy";
    version: string;
    timestamp: string;
};

export type ApiError = {
    error: {
        code: string;
        message: string;
        details?: {
            [x: string]: unknown;
        } | undefined;
    };
    timestamp: string;
    requestId: string;
};

// ============================================
// Job Types
// ============================================

export type Job = {
    jobId: string;
    userId: string;
    status: "QUEUED" | "PROCESSING" | "EDITING" | "COMPLETED" | "FAILED";
    createdAt: string;
    updatedAt: string;
    tempS3Key?: string | undefined;
    finalS3Key?: string | undefined;
    error?: string | undefined;
    locale?: string;
    settings?: {
        [x: string]: unknown;
    } | undefined;
    expires_at?: number | undefined;
    prompt?: string | undefined;
    batchJobId?: string | undefined;
};

export type JobStatus = "QUEUED" | "PROCESSING" | "EDITING" | "COMPLETED" | "FAILED";

export type CreateJobRequest = {
    userId: string;
    locale?: string;
    settings?: {
        [x: string]: unknown;
    } | undefined;
    prompt?: string | undefined;
    batchJobId?: string | undefined;
};

export type BatchJob = {
    batchJobId: string;
    userId: string;
    status: "QUEUED" | "PROCESSING" | "EDITING" | "COMPLETED" | "FAILED";
    createdAt: string;
    updatedAt: string;
    sharedPrompt: string;
    individualPrompts?: (string | undefined)[] | undefined;
    childJobIds: string[];
    completedCount?: number;
    totalCount: number;
    error?: string | undefined;
    locale?: string;
    settings?: {
        [x: string]: unknown;
    } | undefined;
    expires_at?: number | undefined;
};

export type CreateBatchJobRequest = {
    userId: string;
    sharedPrompt: string;
    individualPrompts?: (string | undefined)[] | undefined;
    fileCount: number;
    locale?: string;
    settings?: {
        [x: string]: unknown;
    } | undefined;
};

export type JobStatusUpdate = {
    jobId: string;
    batchJobId?: string | undefined;
    status: "QUEUED" | "PROCESSING" | "EDITING" | "COMPLETED" | "FAILED";
    progress?: number | undefined;
    message?: string | undefined;
    error?: string | undefined;
    finalS3Key?: string | undefined;
    timestamp: string;
};

// ============================================
// Provider Types
// ============================================

export type GeminiAnalysisRequest = {
    imageUrl: string;
    prompt?: string;
};

export type GeminiAnalysisResponse = {
    analysis: string;
    confidence?: number | undefined;
    metadata?: {
        [x: string]: unknown;
    } | undefined;
};

export type SeedreamEditingRequest = {
    imageUrl: string;
    analysis: string;
    editingInstructions?: string | undefined;
};

export type SeedreamEditingResponse = {
    editedImageUrl: string;
    processingTime?: number | undefined;
    metadata?: {
        [x: string]: unknown;
    } | undefined;
};

export type ProviderConfig = {
    name: string;
    apiKey: string;
    baseUrl: string;
    timeout?: number;
    retries?: number;
    enabled?: boolean;
};

export type ProviderResponse = {
    success: boolean;
    data?: unknown;
    error?: string | undefined;
    duration: number;
    provider: string;
    timestamp: string;
};

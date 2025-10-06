/**
 * Generated TypeScript types from Zod schemas
 * DO NOT EDIT MANUALLY - regenerate with npm run contracts:generate
 * Source: @photoeditor/shared/schemas
 */

// API Request/Response Types
export {
    fileName: string;
    contentType: string;
    fileSize: number;
}
export {
    fileName: string;
    contentType: string;
    fileSize: number;
    prompt?: string | undefined;
}
export {
    jobId: string;
    presignedUrl: string;
    s3Key: string;
    expiresAt: string;
}
export {
    files: {
        fileName: string;
        contentType: string;
        fileSize: number;
    }[];
    sharedPrompt: string;
    individualPrompts?: (string | undefined)[] | undefined;
}
export {
    batchJobId: string;
    uploads: {
        presignedUrl: string;
        s3Key: string;
        expiresAt: string;
    }[];
    childJobIds: string[];
}

// Job Types
export {
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
}
export {
    userId: string;
    locale?: string;
    settings?: {
        [x: string]: unknown;
    } | undefined;
    prompt?: string | undefined;
    batchJobId?: string | undefined;
}
export {
    jobId: string;
    status: "QUEUED" | "PROCESSING" | "EDITING" | "COMPLETED" | "FAILED";
    createdAt: string;
    updatedAt: string;
    error?: string | undefined;
}
export {
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
}

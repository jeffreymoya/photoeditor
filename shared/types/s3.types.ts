// S3 Key Strategy and Types
export interface S3KeyStrategy {
  generateTempKey(userId: string, jobId: string, fileName: string): string;
  generateFinalKey(userId: string, jobId: string, fileName: string): string;
  parseTempKey(key: string): { userId: string; jobId: string; fileName: string } | null;
  parseFinalKey(key: string): { userId: string; jobId: string; fileName: string } | null;
}

export interface S3Config {
  tempBucket: string;
  finalBucket: string;
  region: string;
  presignExpiration: number; // seconds
}

export interface S3Object {
  bucket: string;
  key: string;
  etag?: string;
  size?: number;
  lastModified?: Date;
  contentType?: string;
}

export interface PresignedUpload {
  url: string;
  fields: Record<string, string>;
  expiresAt: Date;
}

// S3 Lifecycle Configuration
export const S3_LIFECYCLE_CONFIG = {
  TEMP_EXPIRY_HOURS: 48,
  FINAL_TRANSITION_DAYS: 30,
  ABORT_MULTIPART_DAYS: 7,
  RETENTION_DAYS: 365
} as const;
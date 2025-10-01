// Application Constants
export const APP_CONFIG = {
  MAX_FILE_SIZE: 50 * 1024 * 1024, // 50MB
  MAX_IMAGE_DIMENSION: 4096,
  SUPPORTED_IMAGE_TYPES: ['image/jpeg', 'image/png', 'image/heic', 'image/webp'],
  JPEG_QUALITY: 0.8,
  PRESIGN_EXPIRATION_MINUTES: 15,
  JOB_TTL_DAYS: 90,
  LOG_RETENTION_DAYS: 90
} as const;

export const AWS_CONFIG = {
  REGIONS: {
    PRIMARY: 'us-east-1',
    SECONDARY: 'us-west-2'
  },
  S3: {
    TEMP_BUCKET_PREFIX: 'photo-temp',
    FINAL_BUCKET_PREFIX: 'photo-final',
    LIFECYCLE: {
      TEMP_EXPIRY_HOURS: 48,
      FINAL_TRANSITION_DAYS: 30,
      ABORT_MULTIPART_DAYS: 7
    }
  },
  LAMBDA: {
    TIMEOUT_SECONDS: 300,
    MEMORY_MB: 1024,
    RESERVED_CONCURRENCY: 100
  },
  SQS: {
    VISIBILITY_TIMEOUT_SECONDS: 900,
    MESSAGE_RETENTION_DAYS: 14,
    DEAD_LETTER_MAX_RECEIVE_COUNT: 3
  }
} as const;

export const PROVIDER_CONFIG = {
  GEMINI: {
    MODEL: 'gemini-1.5-flash-8b',
    DEFAULT_PROMPT: 'Analyze this image and provide a detailed description for photo editing purposes.',
    TIMEOUT_MS: 30000,
    MAX_RETRIES: 3
  },
  SEEDREAM: {
    VERSION: '4.0',
    TIMEOUT_MS: 60000,
    MAX_RETRIES: 2
  }
} as const;

export const MOBILE_CONFIG = {
  MIN_ANDROID_API: 24,
  MIN_IOS_VERSION: '14.0',
  UPLOAD_RETRY_ATTEMPTS: 3,
  UPLOAD_RETRY_DELAY_MS: 1000,
  POLLING_INTERVAL_MS: 2000,
  BACKGROUND_UPLOAD_TIMEOUT_MS: 300000 // 5 minutes
} as const;
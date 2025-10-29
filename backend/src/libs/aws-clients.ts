/**
 * AWS SDK Client Factory (Deprecated)
 *
 * DEPRECATED: Prefer the consolidated factory exported from `@backend/core`
 * (see `backend/libs/core/aws/clients.ts`). This legacy module remains to
 * preserve compatibility but should not be referenced in new code.
 *
 * Guarantees:
 * - No direct AWS SDK client construction in services/handlers (standards hard fail)
 * - Consistent regional configuration across AWS services
 * - Testability through dependency injection
 */

import {
  DynamoDBClient,
  DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
  S3Client,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import {
  SNSClient,
  SNSClientConfig,
} from '@aws-sdk/client-sns';
import {
  SQSClient,
  SQSClientConfig,
} from '@aws-sdk/client-sqs';

/**
 * Creates an S3 client with regional configuration
 *
 * @param region - AWS region (defaults to AWS_REGION env var or 'us-east-1')
 * @param customConfig - Optional custom configuration to override defaults
 * @returns Configured S3Client instance
 */
/** @deprecated Use `@backend/core`'s createS3Client */
export function createS3Client(
  region?: string,
  customConfig?: Partial<S3ClientConfig>
): S3Client {
  const awsRegion = region || process.env.AWS_REGION || 'us-east-1';
  const config: S3ClientConfig = {
    region: awsRegion,
    ...customConfig,
  };

  return new S3Client(config);
}

/**
 * Creates a DynamoDB client with regional configuration
 *
 * @param region - AWS region (defaults to AWS_REGION env var or 'us-east-1')
 * @param customConfig - Optional custom configuration to override defaults
 * @returns Configured DynamoDBClient instance
 */
/** @deprecated Use `@backend/core`'s createDynamoDBClient */
export function createDynamoDBClient(
  region?: string,
  customConfig?: Partial<DynamoDBClientConfig>
): DynamoDBClient {
  const awsRegion = region || process.env.AWS_REGION || 'us-east-1';

  const config: DynamoDBClientConfig = {
    region: awsRegion,
    ...customConfig,
  };

  return new DynamoDBClient(config);
}

/**
 * Creates an SQS client with regional configuration
 *
 * @param region - AWS region (defaults to AWS_REGION env var or 'us-east-1')
 * @param customConfig - Optional custom configuration to override defaults
 * @returns Configured SQSClient instance
 */
/** @deprecated Use `@backend/core`'s createSQSClient */
export function createSQSClient(
  region?: string,
  customConfig?: Partial<SQSClientConfig>
): SQSClient {
  const awsRegion = region || process.env.AWS_REGION || 'us-east-1';

  const config: SQSClientConfig = {
    region: awsRegion,
    ...customConfig,
  };

  return new SQSClient(config);
}

/**
 * Creates an SNS client with regional configuration
 *
 * @param region - AWS region (defaults to AWS_REGION env var or 'us-east-1')
 * @param customConfig - Optional custom configuration to override defaults
 * @returns Configured SNSClient instance
 */
/** @deprecated Use `@backend/core`'s createSNSClient */
export function createSNSClient(
  region?: string,
  customConfig?: Partial<SNSClientConfig>
): SNSClient {
  const awsRegion = region || process.env.AWS_REGION || 'us-east-1';

  const config: SNSClientConfig = {
    region: awsRegion,
    ...customConfig,
  };

  return new SNSClient(config);
}

/**
 * Unified AWS clients factory
 * Provides all AWS clients with consistent configuration
 */
export const AWSClients = {
  createS3Client,
  createDynamoDBClient,
  createSQSClient,
  createSNSClient,
};

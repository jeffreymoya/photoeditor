/**
 * AWS SDK Client Factory
 *
 * Central factory for creating AWS SDK clients with consistent regional configuration.
 * This adapter layer ensures:
 * - No direct AWS SDK client construction in services/handlers (STANDARDS.md line 32, hard fail)
 * - Consistent regional configuration across all AWS services
 * - Testability through dependency injection
 *
 * @module core/aws
 */

import {
  S3Client,
  S3ClientConfig,
} from '@aws-sdk/client-s3';
import {
  DynamoDBClient,
  DynamoDBClientConfig,
} from '@aws-sdk/client-dynamodb';
import {
  SQSClient,
  SQSClientConfig,
} from '@aws-sdk/client-sqs';
import {
  SNSClient,
  SNSClientConfig,
} from '@aws-sdk/client-sns';
import {
  SSMClient,
  SSMClientConfig,
} from '@aws-sdk/client-ssm';

/**
 * Creates an S3 client with regional configuration
 *
 * @param region - AWS region (defaults to AWS_REGION env var or 'us-east-1')
 * @param customConfig - Optional custom configuration to override defaults
 * @returns Configured S3Client instance
 */
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
 * Creates an SSM client with regional configuration
 *
 * @param region - AWS region (defaults to AWS_REGION env var or 'us-east-1')
 * @param customConfig - Optional custom configuration to override defaults
 * @returns Configured SSMClient instance
 */
export function createSSMClient(
  region?: string,
  customConfig?: Partial<SSMClientConfig>
): SSMClient {
  const awsRegion = region || process.env.AWS_REGION || 'us-east-1';

  const config: SSMClientConfig = {
    region: awsRegion,
    ...customConfig,
  };

  return new SSMClient(config);
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
  createSSMClient,
};

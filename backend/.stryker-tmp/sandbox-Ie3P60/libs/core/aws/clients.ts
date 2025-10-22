/**
 * AWS SDK Client Factory
 *
 * Central factory for creating AWS SDK clients with environment-aware endpoint configuration.
 * Supports both production AWS endpoints and LocalStack endpoints for local development.
 *
 * This adapter layer ensures:
 * - No direct AWS SDK client construction in services/handlers (STANDARDS.md line 32, hard fail)
 * - Consistent endpoint configuration across all AWS services
 * - Testability through dependency injection
 * - Support for LocalStack in dev/test environments
 *
 * @module core/aws
 */
// @ts-nocheck


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
 * Configuration for AWS client factory
 */
export interface AWSClientConfig {
  region: string;
  endpoint?: string;
  forcePathStyle?: boolean; // Required for LocalStack S3
}

/**
 * Environment detection for endpoint configuration
 *
 * @returns Environment configuration with LocalStack detection
 */
export function getAWSEnvironment(): { isLocalStack: boolean; endpoint?: string } {
  const localstackEndpoint = process.env.LOCALSTACK_ENDPOINT;
  const awsEndpoint = process.env.AWS_ENDPOINT_URL;

  if (localstackEndpoint) {
    return { isLocalStack: true, endpoint: localstackEndpoint };
  }

  if (awsEndpoint) {
    return { isLocalStack: false, endpoint: awsEndpoint };
  }

  return { isLocalStack: false };
}

/**
 * Creates an S3 client with environment-aware endpoint configuration
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
  const { isLocalStack, endpoint } = getAWSEnvironment();

  const config: S3ClientConfig = {
    region: awsRegion,
    ...customConfig,
  };

  if (endpoint) {
    config.endpoint = endpoint;
  }

  // LocalStack requires forcePathStyle for S3
  if (isLocalStack) {
    config.forcePathStyle = true;
  }

  return new S3Client(config);
}

/**
 * Creates a DynamoDB client with environment-aware endpoint configuration
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
  const { endpoint } = getAWSEnvironment();

  const config: DynamoDBClientConfig = {
    region: awsRegion,
    ...customConfig,
  };

  if (endpoint) {
    config.endpoint = endpoint;
  }

  return new DynamoDBClient(config);
}

/**
 * Creates an SQS client with environment-aware endpoint configuration
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
  const { endpoint } = getAWSEnvironment();

  const config: SQSClientConfig = {
    region: awsRegion,
    ...customConfig,
  };

  if (endpoint) {
    config.endpoint = endpoint;
  }

  return new SQSClient(config);
}

/**
 * Creates an SNS client with environment-aware endpoint configuration
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
  const { endpoint } = getAWSEnvironment();

  const config: SNSClientConfig = {
    region: awsRegion,
    ...customConfig,
  };

  if (endpoint) {
    config.endpoint = endpoint;
  }

  return new SNSClient(config);
}

/**
 * Creates an SSM client with environment-aware endpoint configuration
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
  const { endpoint } = getAWSEnvironment();

  const config: SSMClientConfig = {
    region: awsRegion,
    ...customConfig,
  };

  if (endpoint) {
    config.endpoint = endpoint;
  }

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
  getAWSEnvironment,
};

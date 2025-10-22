/**
 * AWS Client Factory Module
 *
 * Exports AWS SDK client factory functions for consistent client creation
 * across BFF and workers.
 *
 * @module core/aws
 */

export {
  createS3Client,
  createDynamoDBClient,
  createSQSClient,
  createSNSClient,
  createSSMClient,
  AWSClients
} from './clients';

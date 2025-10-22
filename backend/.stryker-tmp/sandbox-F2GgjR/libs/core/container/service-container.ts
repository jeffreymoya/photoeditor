/**
 * Service Container
 *
 * Centralized dependency injection container for Lambda handlers.
 * Ensures handlers consume services via injection rather than direct instantiation.
 *
 * This container ensures:
 * - No in-handler `new Service()` calls (standards/backend-tier.md, line 68)
 * - Controller → UseCase(Service) → Port layering (standards/backend-tier.md, line 13)
 * - Powertools integration for observability (standards/backend-tier.md, line 28)
 *
 * @module core/container
 */

import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import type { JobService, PresignService, S3Service, NotificationService } from '../../../src/services';
import { S3Config } from '@photoeditor/shared';
import { ProviderFactory } from '../providers/factory';
import { BootstrapService } from '../providers/bootstrap.service';
import { ConfigService } from '../config/config.service';
import { StandardProviderCreator } from '../providers/creator.adapter';
import { createSSMClient } from '../aws/clients';

/**
 * Service container interface defining all injectable services
 */
export interface ServiceContainer {
  logger: Logger;
  metrics: Metrics;
  tracer: Tracer;
  jobService: JobService;
  s3Service?: S3Service;
  presignService?: PresignService;
  notificationService?: NotificationService;
  providerFactory?: ProviderFactory;
}

/**
 * Configuration for initializing the service container
 */
export interface ServiceContainerConfig {
  includeS3Service?: boolean;
  includePresignService?: boolean;
  includeNotificationService?: boolean;
  includeProviderFactory?: boolean;
}

/**
 * Creates and initializes the service container
 *
 * @param config - Configuration options for service initialization
 * @returns Initialized service container with all required services
 */
export async function createServiceContainer(
  config: ServiceContainerConfig = {}
): Promise<ServiceContainer> {
  // Initialize Powertools (these are stateless/safe to instantiate)
  const logger = new Logger();
  const metrics = new Metrics();
  const tracer = new Tracer();

  // Extract environment variables
  const region = process.env.AWS_REGION!;
  const projectName = process.env.PROJECT_NAME!;
  const environment = process.env.NODE_ENV!;
  const tempBucketName = process.env.TEMP_BUCKET_NAME!;
  const finalBucketName = process.env.FINAL_BUCKET_NAME!;
  const jobsTableName = process.env.JOBS_TABLE_NAME!;
  const batchTableName = process.env.BATCH_TABLE_NAME;

  // Dynamically import services to avoid circular dependency
  const { JobService, S3Service, PresignService, NotificationService } = await import('../../../src/services');

  // Always initialize JobService (core service)
  const jobService = new JobService(jobsTableName, region, batchTableName);

  const container: ServiceContainer = {
    logger,
    metrics,
    tracer,
    jobService,
  };

  // Conditionally initialize S3Service
  if (config.includeS3Service) {
    const s3Config: S3Config = {
      region,
      tempBucket: tempBucketName,
      finalBucket: finalBucketName,
      presignExpiration: 3600
    };
    container.s3Service = new S3Service(s3Config);
  }

  // Conditionally initialize PresignService (depends on JobService and S3Service)
  if (config.includePresignService) {
    if (!container.s3Service) {
      const s3Config: S3Config = {
        region,
        tempBucket: tempBucketName,
        finalBucket: finalBucketName,
        presignExpiration: 3600
      };
      container.s3Service = new S3Service(s3Config);
    }
    container.presignService = new PresignService(jobService, container.s3Service);
  }

  // Conditionally initialize NotificationService
  if (config.includeNotificationService) {
    const snsTopicArn = process.env.SNS_TOPIC_ARN!;
    container.notificationService = new NotificationService(snsTopicArn, region);
  }

  // Conditionally initialize ProviderFactory
  if (config.includeProviderFactory) {
    const ssmClient = createSSMClient(region);
    const configService = new ConfigService(ssmClient, projectName, environment);
    const providerCreator = new StandardProviderCreator();
    const bootstrapService = new BootstrapService(configService, providerCreator);
    container.providerFactory = await bootstrapService.initializeProviders();
  }

  return container;
}

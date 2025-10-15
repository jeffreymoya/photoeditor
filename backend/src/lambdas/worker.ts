import { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { JobService, S3Service, NotificationService } from '../services';
import { S3Config, JobStatus, GeminiAnalysisResponse, SeedreamEditingResponse } from '@photoeditor/shared';
import {
  createSSMClient,
  ConfigService,
  BootstrapService,
  StandardProviderCreator,
  ProviderFactory
} from '@backend/core';

const logger = new Logger();
const metrics = new Metrics();
const tracer = new Tracer();

let jobService: JobService;
let s3Service: S3Service;
let notificationService: NotificationService;
let providerFactory: ProviderFactory;

async function initializeServices(): Promise<void> {
  if (jobService) return;

  const region = process.env.AWS_REGION!;
  const projectName = process.env.PROJECT_NAME!;
  const environment = process.env.NODE_ENV!;
  const tempBucketName = process.env.TEMP_BUCKET_NAME!;
  const finalBucketName = process.env.FINAL_BUCKET_NAME!;
  const jobsTableName = process.env.JOBS_TABLE_NAME!;
  const batchTableName = process.env.BATCH_TABLE_NAME;
  const snsTopicArn = process.env.SNS_TOPIC_ARN!;

  const s3Config: S3Config = {
    region,
    tempBucket: tempBucketName,
    finalBucket: finalBucketName,
    presignExpiration: 3600
  };

  jobService = new JobService(jobsTableName, region, batchTableName);
  s3Service = new S3Service(s3Config);
  notificationService = new NotificationService(snsTopicArn, region);

  // Initialize providers using shared core
  const ssmClient = createSSMClient(region);
  const configService = new ConfigService(ssmClient, projectName, environment);
  const providerCreator = new StandardProviderCreator();
  const bootstrapService = new BootstrapService(configService, providerCreator);
  providerFactory = await bootstrapService.initializeProviders();
}

interface ParsedS3Event {
  bucketName: string;
  objectKey: string;
  userId: string;
  jobId: string;
  fileName: string;
}

async function parseS3EventRecord(record: SQSRecord): Promise<ParsedS3Event | null> {
  const body = JSON.parse(record.body);
  const s3Event = body.Records?.[0]?.s3;

  if (!s3Event) {
    logger.warn('Invalid S3 event format', { body });
    return null;
  }

  const bucketName = s3Event.bucket.name;
  const objectKey = decodeURIComponent(s3Event.object.key.replace(/\+/g, ' '));

  logger.info('Processing S3 upload', { bucketName, objectKey });

  const keyStrategy = s3Service.getKeyStrategy();
  const parsedKey = keyStrategy.parseTempKey(objectKey);

  if (!parsedKey) {
    const error = new Error(`Unable to parse temp key: ${objectKey}`);
    logger.error('Invalid S3 key format', { objectKey, error });
    throw error;
  }

  return {
    bucketName,
    objectKey,
    userId: parsedKey.userId,
    jobId: parsedKey.jobId,
    fileName: parsedKey.fileName
  };
}

async function processImageAnalysis(
  bucketName: string,
  objectKey: string,
  jobId: string,
  userPrompt: string
) {
  const optimizedKey = objectKey.replace(/^uploads\//, 'optimized/');
  await s3Service.optimizeAndUploadImage(bucketName, objectKey, bucketName, optimizedKey);

  const analysisProvider = providerFactory.getAnalysisProvider();
  const optimizedUrl = await s3Service.generatePresignedDownload(bucketName, optimizedKey, 300);

  const analysisRequest = { imageUrl: optimizedUrl, prompt: userPrompt };
  const analysisResult = await analysisProvider.analyzeImage(analysisRequest);

  await jobService.markJobEditing(jobId);

  return { optimizedKey, analysisResult };
}

async function processImageEditing(
  optimizedUrl: string,
  optimizedKey: string,
  analysisResult: { success: boolean; data?: unknown },
  userId: string,
  jobId: string,
  fileName: string
): Promise<string> {
  const editingProvider = providerFactory.getEditingProvider();
  const analysisData = analysisResult.success ? analysisResult.data as GeminiAnalysisResponse : null;

  const editingRequest = {
    imageUrl: optimizedUrl,
    analysis: analysisData?.analysis || 'Enhance and improve this image',
    editingInstructions: 'Apply professional photo enhancements based on the analysis'
  };
  const editedImageResult = await editingProvider.editImage(editingRequest);

  const keyStrategy = s3Service.getKeyStrategy();
  const finalKey = keyStrategy.generateFinalKey(userId, jobId, fileName);

  const editedImageData = editedImageResult.success ? editedImageResult.data as SeedreamEditingResponse : null;
  if (editedImageResult.success && editedImageData?.editedImageUrl) {
    const editedImageResponse = await fetch(editedImageData.editedImageUrl);
    const editedImageBuffer = await editedImageResponse.arrayBuffer();

    await s3Service.uploadObject(
      s3Service.getFinalBucket(),
      finalKey,
      Buffer.from(editedImageBuffer),
      'image/jpeg'
    );
  } else {
    await s3Service.copyObject(s3Service.getTempBucket(), optimizedKey, s3Service.getFinalBucket(), finalKey);
  }

  return finalKey;
}

async function handleBatchJobProgress(batchJobId: string, jobId: string): Promise<void> {
  try {
    const updatedBatchJob = await jobService.incrementBatchJobProgress(batchJobId);
    logger.info('Updated batch job progress', {
      batchJobId,
      completedCount: updatedBatchJob.completedCount,
      totalCount: updatedBatchJob.totalCount,
      isComplete: updatedBatchJob.status === JobStatus.COMPLETED
    });

    if (updatedBatchJob.status === JobStatus.COMPLETED) {
      await notificationService.sendBatchJobCompletionNotification(updatedBatchJob);
    }
  } catch (batchError) {
    logger.error('Failed to update batch job progress', {
      error: batchError as Error,
      batchJobId,
      jobId
    });
  }
}

async function processS3Event(record: SQSRecord): Promise<void> {
  const parsedEvent = await parseS3EventRecord(record);
  if (!parsedEvent) return;

  const { bucketName, objectKey, userId, jobId, fileName } = parsedEvent;

  try {
    await jobService.markJobProcessing(jobId, objectKey);

    const job = await jobService.getJob(jobId);
    if (!job) {
      logger.error('Job not found', { jobId, userId });
      return;
    }

    const userPrompt = job.prompt || 'Analyze this image and provide detailed suggestions for photo editing and enhancement.';

    const { optimizedKey, analysisResult } = await processImageAnalysis(bucketName, objectKey, jobId, userPrompt);
    const optimizedUrl = await s3Service.generatePresignedDownload(bucketName, optimizedKey, 300);
    const finalKey = await processImageEditing(optimizedUrl, optimizedKey, analysisResult, userId, jobId, fileName);

    const completedJob = await jobService.markJobCompleted(jobId, finalKey);

    if (job.batchJobId) {
      await handleBatchJobProgress(job.batchJobId, jobId);
    }

    await notificationService.sendJobStatusNotification(completedJob);
    await s3Service.deleteObject(bucketName, objectKey);
    await s3Service.deleteObject(bucketName, optimizedKey);

    metrics.addMetric('JobProcessed', MetricUnits.Count, 1);
    logger.info('Job processing completed', { jobId, userId });

  } catch (error) {
    logger.error('Error processing job', { error: error as Error, jobId, userId });

    try {
      const failedJob = await jobService.markJobFailed(jobId, (error as Error).message);
      await notificationService.sendJobStatusNotification(failedJob);
    } catch (notifyError) {
      logger.error('Failed to notify job failure', { notifyError: notifyError as Error, jobId });
    }

    metrics.addMetric('JobProcessingError', MetricUnits.Count, 1);
    throw error;
  }
}

export const handler = async (event: SQSEvent, _context: Context): Promise<void> => {
  const segment = tracer.getSegment();
  const subsegment = segment?.addNewSubsegment('worker-handler');
  if (subsegment) {
    tracer.setSegment(subsegment);
  }

  try {
    await initializeServices();

    logger.info('Processing SQS messages', { messageCount: event.Records.length });

    for (const record of event.Records) {
      await processS3Event(record);
    }

  } catch (error) {
    logger.error('Worker handler error', { error: error as Error });
    metrics.addMetric('WorkerError', MetricUnits.Count, 1);
    throw error;
  } finally {
    subsegment?.close();
    if (segment) {
      tracer.setSegment(segment);
    }
  }
};

// Test utility to reset module-level state
export function __resetForTesting(): void {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  jobService = undefined as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  s3Service = undefined as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  notificationService = undefined as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  providerFactory = undefined as any;
}

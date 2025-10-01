import { SQSEvent, SQSRecord, Context } from 'aws-lambda';
import { Logger } from '@aws-lambda-powertools/logger';
import { Metrics, MetricUnits } from '@aws-lambda-powertools/metrics';
import { Tracer } from '@aws-lambda-powertools/tracer';
import { JobService, S3Service, NotificationService, ConfigService, BootstrapService } from '../services';
import { ProviderFactory } from '../providers/factory';
import { S3Config, JobStatus, GeminiAnalysisResponse, SeedreamEditingResponse } from '@photoeditor/shared';

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
  const snsTopicArn = process.env.SNS_TOPIC_ARN!;

  const s3Config: S3Config = {
    region,
    tempBucket: tempBucketName,
    finalBucket: finalBucketName,
    presignExpiration: 3600
  };

  jobService = new JobService(jobsTableName, region);
  s3Service = new S3Service(s3Config);
  notificationService = new NotificationService(snsTopicArn, region);

  const configService = new ConfigService(region, projectName, environment);
  const bootstrapService = new BootstrapService(configService);
  providerFactory = await bootstrapService.initializeProviders();
}

async function processS3Event(record: SQSRecord): Promise<void> {
  const body = JSON.parse(record.body);
  const s3Event = body.Records?.[0]?.s3;

  if (!s3Event) {
    logger.warn('Invalid S3 event format', { body });
    return;
  }

  const bucketName = s3Event.bucket.name;
  const objectKey = decodeURIComponent(s3Event.object.key.replace(/\+/g, ' '));

  logger.info('Processing S3 upload', { bucketName, objectKey });

  // Parse the temp key to get job info
  const keyStrategy = s3Service.getKeyStrategy();
  const parsedKey = keyStrategy.parseTempKey(objectKey);

  if (!parsedKey) {
    logger.warn('Unable to parse temp key', { objectKey });
    return;
  }

  const { userId, jobId } = parsedKey;

  try {
    // Update job status to processing
    await jobService.markJobProcessing(jobId, objectKey);

    // Get the job to retrieve the prompt
    const job = await jobService.getJob(jobId);
    if (!job) {
      logger.error('Job not found', { jobId, userId });
      return;
    }

    const userPrompt = job.prompt || 'Analyze this image and provide detailed suggestions for photo editing and enhancement.';

    // First optimize the uploaded image before analysis
    const optimizedKey = objectKey.replace('temp/', 'optimized/');
    await s3Service.optimizeAndUploadImage(bucketName, objectKey, bucketName, optimizedKey);

    // Get analysis provider
    const analysisProvider = providerFactory.getAnalysisProvider();

    // Generate presigned URL for the optimized object
    const optimizedUrl = await s3Service.generatePresignedDownload(bucketName, optimizedKey, 300);

    // Analyze the image with structured request using user prompt
    const analysisRequest = {
      imageUrl: optimizedUrl,
      prompt: userPrompt
    };
    const analysisResult = await analysisProvider.analyzeImage(analysisRequest);

    // Update job status to editing
    await jobService.markJobEditing(jobId);

    // Get editing provider
    const editingProvider = providerFactory.getEditingProvider();

    // Edit the image based on analysis
    const analysisData = analysisResult.success ? analysisResult.data as GeminiAnalysisResponse : null;
    const editingRequest = {
      imageUrl: optimizedUrl,
      analysis: analysisData?.analysis || 'Enhance and improve this image',
      editingInstructions: 'Apply professional photo enhancements based on the analysis'
    };
    const editedImageResult = await editingProvider.editImage(editingRequest);

    // Generate final key and upload edited image
    const finalKey = keyStrategy.generateFinalKey(userId, jobId, parsedKey.fileName);

    // Download the edited image and upload to final bucket
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
      // Fallback: copy original if editing fails
      await s3Service.copyObject(bucketName, objectKey, s3Service.getFinalBucket(), finalKey);
    }

    // Mark job as completed
    const completedJob = await jobService.markJobCompleted(jobId, finalKey);

    // Handle batch job progress if this is part of a batch
    if (job.batchJobId) {
      try {
        const updatedBatchJob = await jobService.incrementBatchJobProgress(job.batchJobId);
        logger.info('Updated batch job progress', {
          batchJobId: job.batchJobId,
          completedCount: updatedBatchJob.completedCount,
          totalCount: updatedBatchJob.totalCount,
          isComplete: updatedBatchJob.status === JobStatus.COMPLETED
        });

        // Send batch completion notification if all jobs are done
        if (updatedBatchJob.status === JobStatus.COMPLETED) {
          await notificationService.sendBatchJobCompletionNotification(updatedBatchJob);
        }
      } catch (batchError) {
        logger.error('Failed to update batch job progress', {
          error: batchError as Error,
          batchJobId: job.batchJobId,
          jobId
        });
      }
    }

    // Send individual job notification
    await notificationService.sendJobStatusNotification(completedJob);

    // Clean up temp and optimized objects
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

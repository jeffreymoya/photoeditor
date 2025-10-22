import { Module } from '@nestjs/common';
import { JobController } from './job.controller';
import { JobService } from './job.service';
import { JobService as CoreJobService } from '../../../../src/services/job.service';
import { S3Service } from '../../../../src/services/s3.service';
import { S3Config } from '@photoeditor/shared';

/**
 * Job module provides job status and download functionality
 * Wires controllers, services, and adapters via DI per STANDARDS.md line 25
 */
@Module({
  controllers: [JobController],
  providers: [
    JobService,
    {
      provide: CoreJobService,
      useFactory: () => {
        const region = process.env.AWS_REGION || 'us-east-1';
        const jobsTableName = process.env.JOBS_TABLE_NAME || 'photoeditor-jobs';
        const batchTableName = process.env.BATCH_TABLE_NAME;
        return new CoreJobService(jobsTableName, region, batchTableName);
      },
    },
    {
      provide: S3Service,
      useFactory: () => {
        const region = process.env.AWS_REGION || 'us-east-1';
        const tempBucket = process.env.TEMP_BUCKET_NAME || 'photoeditor-temp';
        const finalBucket = process.env.FINAL_BUCKET_NAME || 'photoeditor-final';
        const config: S3Config = {
          region,
          tempBucket,
          finalBucket,
          presignExpiration: 3600,
        };
        return new S3Service(config);
      },
    },
  ],
  exports: [JobService],
})
export class JobModule {}

import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { JobStatusType, Job } from '@photoeditor/shared';

export interface NotificationPayload {
  jobId: string;
  userId: string;
  status: JobStatusType;
  message: string;
  timestamp: string;
  data?: Record<string, any>;
}

export interface FCMNotification {
  title: string;
  body: string;
  data: Record<string, string>;
}

export class NotificationService {
  private snsClient: SNSClient;
  private topicArn: string;

  constructor(topicArn: string, region: string) {
    this.topicArn = topicArn;
    this.snsClient = new SNSClient({ region });
  }

  async sendJobStatusNotification(job: Job, previousStatus?: JobStatusType): Promise<void> {
    const payload: NotificationPayload = {
      jobId: job.jobId,
      userId: job.userId,
      status: job.status,
      message: this.getStatusMessage(job.status),
      timestamp: job.updatedAt,
      data: {
        previousStatus,
        finalS3Key: job.finalS3Key,
        error: job.error
      }
    };

    const fcmNotification = this.buildFCMNotification(job);

    const message = {
      default: JSON.stringify(payload),
      GCM: JSON.stringify({
        notification: fcmNotification,
        data: {
          ...payload.data,
          jobId: job.jobId,
          status: job.status,
          type: 'job_status_update'
        }
      })
    };

    const command = new PublishCommand({
      TopicArn: this.topicArn,
      Message: JSON.stringify(message),
      MessageStructure: 'json',
      MessageAttributes: {
        userId: {
          DataType: 'String',
          StringValue: job.userId
        },
        jobId: {
          DataType: 'String',
          StringValue: job.jobId
        },
        status: {
          DataType: 'String',
          StringValue: job.status
        }
      }
    });

    await this.snsClient.send(command);
  }

  private getStatusMessage(status: JobStatusType): string {
    switch (status) {
      case 'QUEUED':
        return 'Your photo has been queued for processing';
      case 'PROCESSING':
        return 'Your photo is being analyzed';
      case 'EDITING':
        return 'Your photo is being enhanced';
      case 'COMPLETED':
        return 'Your photo has been successfully processed!';
      case 'FAILED':
        return 'Sorry, there was an error processing your photo';
      default:
        return `Job status updated to ${status}`;
    }
  }

  async sendJobCompletionNotification(userId: string, jobId: string, message: string): Promise<void> {
    const payload: NotificationPayload = {
      jobId,
      userId,
      status: 'COMPLETED',
      message,
      timestamp: new Date().toISOString()
    };

    const fcmNotification: FCMNotification = {
      title: 'Photo Editor - Ready!',
      body: message,
      data: {
        jobId,
        status: 'COMPLETED',
        action: 'download'
      }
    };

    const snsMessage = {
      default: JSON.stringify(payload),
      GCM: JSON.stringify({
        notification: fcmNotification,
        data: {
          jobId,
          userId,
          status: 'COMPLETED',
          type: 'job_completion'
        }
      })
    };

    const command = new PublishCommand({
      TopicArn: this.topicArn,
      Message: JSON.stringify(snsMessage),
      MessageStructure: 'json',
      MessageAttributes: {
        userId: {
          DataType: 'String',
          StringValue: userId
        },
        jobId: {
          DataType: 'String',
          StringValue: jobId
        },
        status: {
          DataType: 'String',
          StringValue: 'COMPLETED'
        }
      }
    });

    await this.snsClient.send(command);
  }

  private buildFCMNotification(job: Job): FCMNotification {
    const baseTitle = 'Photo Editor';

    switch (job.status) {
      case 'COMPLETED':
        return {
          title: `${baseTitle} - Ready!`,
          body: 'Your enhanced photo is ready to download',
          data: {
            jobId: job.jobId,
            status: job.status,
            action: 'download'
          }
        };

      case 'FAILED':
        return {
          title: `${baseTitle} - Error`,
          body: job.error || 'There was an error processing your photo',
          data: {
            jobId: job.jobId,
            status: job.status,
            action: 'retry'
          }
        };

      case 'PROCESSING':
        return {
          title: `${baseTitle} - Processing`,
          body: 'Analyzing your photo...',
          data: {
            jobId: job.jobId,
            status: job.status,
            action: 'none'
          }
        };

      case 'EDITING':
        return {
          title: `${baseTitle} - Enhancing`,
          body: 'Applying enhancements to your photo...',
          data: {
            jobId: job.jobId,
            status: job.status,
            action: 'none'
          }
        };

      default:
        return {
          title: baseTitle,
          body: this.getStatusMessage(job.status),
          data: {
            jobId: job.jobId,
            status: job.status,
            action: 'none'
          }
        };
    }
  }
}
/**
 * Messaging Stack - SQS, SNS
 *
 * STANDARDS.md compliance:
 * - SQS with DLQ (maxReceiveCount ≤3) (line 121)
 * - DLQ alarm on inflow >0 for 5m (line 80)
 * - Cost tags: Project, Env, Owner, CostCenter (line 44)
 * - Long polling (20s), visibility timeout = 6× avg processing (line 121)
 */

interface MessagingStackProps {
  kmsKey: aws.kms.Key;
}

export default function MessagingStack(props: MessagingStackProps) {
  const { kmsKey } = props;

  // Dead Letter Queue for failed processing
  const processingDLQ = new sst.aws.Queue("ProcessingDLQ", {
    fifo: false,
    transform: {
      queue: {
        messageRetentionSeconds: 1209600, // 14 days
        receiveWaitTimeSeconds: 20, // Long polling
        kmsDataKeyReusePeriodSeconds: 300,
        kmsMasterKeyId: kmsKey.arn,
        tags: {
          Project: "PhotoEditor",
          Env: $app.stage,
          Owner: "DevTeam",
          CostCenter: "Engineering",
          Purpose: "DLQ",
        },
      },
    },
  });

  // Main processing queue with DLQ redrive
  const processingQueue = new sst.aws.Queue("ProcessingQueue", {
    fifo: false,
    transform: {
      queue: {
        visibilityTimeoutSeconds: 180, // 3 min (6× estimated 30s avg processing)
        messageRetentionSeconds: 345600, // 4 days
        receiveWaitTimeSeconds: 20, // Long polling
        redrivePolicy: {
          deadLetterTargetArn: processingDLQ.arn,
          maxReceiveCount: 3,
        },
        kmsDataKeyReusePeriodSeconds: 300,
        kmsMasterKeyId: kmsKey.arn,
        tags: {
          Project: "PhotoEditor",
          Env: $app.stage,
          Owner: "DevTeam",
          CostCenter: "Engineering",
          Purpose: "Processing",
        },
      },
    },
  });

  // SNS topic for notifications
  const notificationTopic = new sst.aws.SnsTopic("NotificationTopic", {
    transform: {
      topic: {
        kmsMasterKeyId: kmsKey.arn,
        tags: {
          Project: "PhotoEditor",
          Env: $app.stage,
          Owner: "DevTeam",
          CostCenter: "Engineering",
          Purpose: "Notifications",
        },
      },
    },
  });

  // CloudWatch alarm: DLQ inflow >0 for 5m (STANDARDS.md line 80)
  new aws.cloudwatch.MetricAlarm("ProcessingDLQAlarm", {
    name: `photoeditor-${$app.stage}-dlq-inflow`,
    comparisonOperator: "GreaterThanThreshold",
    evaluationPeriods: 1,
    metricName: "NumberOfMessagesSent",
    namespace: "AWS/SQS",
    period: 300, // 5 minutes
    statistic: "Sum",
    threshold: 0,
    treatMissingData: "notBreaching",
    alarmDescription: "Alert when messages arrive in DLQ (STANDARDS.md line 80)",
    dimensions: {
      QueueName: processingDLQ.name,
    },
    tags: {
      Project: "PhotoEditor",
      Env: $app.stage,
      Owner: "DevTeam",
      CostCenter: "Engineering",
    },
  });

  // CloudWatch alarm: SQS ApproximateAgeOfOldestMessage >120s (STANDARDS.md line 78)
  new aws.cloudwatch.MetricAlarm("ProcessingQueueAgeAlarm", {
    name: `photoeditor-${$app.stage}-queue-age`,
    comparisonOperator: "GreaterThanThreshold",
    evaluationPeriods: 1,
    metricName: "ApproximateAgeOfOldestMessage",
    namespace: "AWS/SQS",
    period: 60, // 1 minute
    statistic: "Maximum",
    threshold: 120, // 2 minutes
    treatMissingData: "notBreaching",
    alarmDescription: "Alert when queue backlog exceeds 120s (STANDARDS.md line 78)",
    dimensions: {
      QueueName: processingQueue.name,
    },
    tags: {
      Project: "PhotoEditor",
      Env: $app.stage,
      Owner: "DevTeam",
      CostCenter: "Engineering",
    },
  });

  return {
    processingQueue,
    processingDLQ,
    notificationTopic,
  };
}

/**
 * Messaging Stack - SQS, SNS
 *
 * ADR-0008 Phase 1: Inline resource provisioning with standards compliance.
 * Phase 2 migration: Extract SQS, SNS into versioned Terraform modules.
 * See adr/0008-sst-parity.md for parity contract and migration plan.
 *
 * Standards compliance (inherited from future modules):
 * - SQS with DLQ (maxReceiveCount ≤3) (infrastructure-tier.md L32)
 * - DLQ alarm on inflow >0 for 5m (cross-cutting.md L47)
 * - Cost tags: Project, Env, Owner, CostCenter (cross-cutting.md L11)
 * - Long polling (20s), visibility timeout = 6× avg processing (infrastructure-tier.md L32)
 * - KMS encryption for queues and topics (cross-cutting.md L52)
 *
 * Module migration status:
 * - SQS queues (processing + DLQ) → Future module (TASK-0823)
 * - SNS topic → Future module (TASK-0823)
 * - CloudWatch alarms → Future module (TASK-0823)
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

  // CloudWatch alarm: DLQ inflow >0 for 5m (cross-cutting.md L47)
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
    alarmDescription: "Alert when messages arrive in DLQ (cross-cutting.md L47)",
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

  // CloudWatch alarm: SQS ApproximateAgeOfOldestMessage >120s (cross-cutting.md L47)
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
    alarmDescription: "Alert when queue backlog exceeds 120s (cross-cutting.md L47)",
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

# Dead Letter Queue
resource "aws_sqs_queue" "dlq" {
  name = "${var.common_name}-dlq"

  # Message retention
  message_retention_seconds = var.message_retention_days * 24 * 60 * 60

  # Encryption
  kms_master_key_id                 = var.kms_key_id
  kms_data_key_reuse_period_seconds = 300

  tags = merge(var.tags, {
    Name        = "${var.common_name}-dlq"
    Purpose     = "dead-letter-queue"
    Environment = var.environment
  })
}

# Main processing queue
resource "aws_sqs_queue" "main" {
  name = "${var.common_name}-queue"

  # Visibility timeout should be at least 6x the Lambda timeout
  visibility_timeout_seconds = var.visibility_timeout

  # Message retention
  message_retention_seconds = var.message_retention_days * 24 * 60 * 60

  # Dead letter queue configuration
  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = var.max_receive_count
  })

  # Encryption
  kms_master_key_id                 = var.kms_key_id
  kms_data_key_reuse_period_seconds = 300

  tags = merge(var.tags, {
    Name        = "${var.common_name}-queue"
    Purpose     = "image-processing"
    Environment = var.environment
  })
}

# Queue policy to allow S3 to send messages
resource "aws_sqs_queue_policy" "main" {
  queue_url = aws_sqs_queue.main.id

  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "SQSDefaultPolicy"
    Statement = [
      {
        Sid    = "AllowS3ToSendMessage"
        Effect = "Allow"
        Principal = {
          Service = "s3.amazonaws.com"
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.main.arn
        Condition = {
          ArnEquals = {
            "aws:SourceArn" = "arn:aws:s3:::${var.project_name}-${var.environment}-temp-${var.account_id}"
          }
        }
      }
    ]
  })
}

# CloudWatch Alarms for SQS
resource "aws_cloudwatch_metric_alarm" "queue_age" {
  alarm_name          = "${var.common_name}-queue-age"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ApproximateAgeOfOldestMessage"
  namespace           = "AWS/SQS"
  period              = "300"
  statistic           = "Maximum"
  threshold           = "600" # 10 minutes
  alarm_description   = "SQS messages are aging"
  alarm_actions       = []

  dimensions = {
    QueueName = aws_sqs_queue.main.name
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "dlq_messages" {
  alarm_name          = "${var.common_name}-dlq-messages"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "ApproximateNumberOfVisibleMessages"
  namespace           = "AWS/SQS"
  period              = "300"
  statistic           = "Maximum"
  threshold           = "0"
  alarm_description   = "Messages in dead letter queue"
  alarm_actions       = []

  dimensions = {
    QueueName = aws_sqs_queue.dlq.name
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "queue_depth" {
  alarm_name          = "${var.common_name}-queue-depth"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "ApproximateNumberOfVisibleMessages"
  namespace           = "AWS/SQS"
  period              = "300"
  statistic           = "Average"
  threshold           = "100"
  alarm_description   = "High number of messages in queue"
  alarm_actions       = []

  dimensions = {
    QueueName = aws_sqs_queue.main.name
  }

  tags = var.tags
}
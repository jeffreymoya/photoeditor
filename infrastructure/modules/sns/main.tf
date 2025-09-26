# SNS Topic for push notifications
resource "aws_sns_topic" "notifications" {
  name = "${var.common_name}-notifications"

  # Encryption
  kms_master_key_id = var.kms_key_id

  # Delivery policy
  delivery_policy = jsonencode({
    http = {
      defaultHealthyRetryPolicy = {
        minDelayTarget     = 20
        maxDelayTarget     = 20
        numRetries         = 3
        numMaxDelayRetries = 0
        numMinDelayRetries = 0
        numNoDelayRetries  = 0
        backoffFunction    = "linear"
      }
      disableSubscriptionOverrides = false
    }
  })

  tags = merge(var.tags, {
    Name        = "${var.common_name}-notifications"
    Purpose     = "push-notifications"
    Environment = var.environment
  })
}

# SNS Topic Policy
resource "aws_sns_topic_policy" "notifications" {
  arn = aws_sns_topic.notifications.arn

  policy = jsonencode({
    Version = "2012-10-17"
    Id      = "SNSTopicPolicy"
    Statement = [
      {
        Sid    = "AllowLambdaToPublish"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
        Action   = "sns:Publish"
        Resource = aws_sns_topic.notifications.arn
        Condition = {
          StringEquals = {
            "aws:SourceAccount" = data.aws_caller_identity.current.account_id
          }
        }
      }
    ]
  })
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}

# Platform applications for mobile push notifications
# iOS Platform Application
resource "aws_sns_platform_application" "ios" {
  count = var.ios_certificate_arn != "" ? 1 : 0

  name     = "${var.common_name}-ios"
  platform = "APNS"

  # Note: In production, you would provide the actual certificate ARN
  platform_credential = var.ios_certificate_arn
}

# Android Platform Application
resource "aws_sns_platform_application" "android" {
  count = var.android_api_key != "" ? 1 : 0

  name     = "${var.common_name}-android"
  platform = "GCM"

  # Note: In production, you would provide the actual FCM API key
  platform_credential = var.android_api_key
}

# CloudWatch Alarms for SNS
resource "aws_cloudwatch_metric_alarm" "sns_failed_notifications" {
  alarm_name          = "${var.common_name}-sns-failed-notifications"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "NumberOfNotificationsFailed"
  namespace           = "AWS/SNS"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "High number of failed SNS notifications"
  alarm_actions       = []

  dimensions = {
    TopicName = aws_sns_topic.notifications.name
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "sns_delivery_delay" {
  alarm_name          = "${var.common_name}-sns-delivery-delay"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "SMSSuccessRate"
  namespace           = "AWS/SNS"
  period              = "300"
  statistic           = "Average"
  threshold           = "95"
  alarm_description   = "SNS delivery success rate is low"
  alarm_actions       = []

  dimensions = {
    TopicName = aws_sns_topic.notifications.name
  }

  tags = var.tags
}
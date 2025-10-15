# Device Token DynamoDB Table
# Stores Expo push notification tokens for mobile devices
# Supports registration, query, deactivation, and TTL-based expiry
#
# Compliance:
# - KMS encryption (standards/infrastructure-tier.md line 27)
# - PITR enabled (standards/infrastructure-tier.md line 36)
# - On-demand billing for dev/stage (standards/infrastructure-tier.md line 37)
# - TTL attribute for token expiry (standards/infrastructure-tier.md line 38)
# - Required tags: Project/Env/Owner/CostCenter (standards/global.md line 18)

resource "aws_dynamodb_table" "device_tokens" {
  name         = var.device_token_table_name
  billing_mode = var.billing_mode
  hash_key     = "userId"
  range_key    = "deviceId"

  # Primary key attributes
  attribute {
    name = "userId"
    type = "S"
  }

  attribute {
    name = "deviceId"
    type = "S"
  }

  # TTL configuration for automatic token expiry (90 days)
  ttl {
    attribute_name = "expiresAt"
    enabled        = true
  }

  # Server-side encryption with KMS CMK (standards/infrastructure-tier.md line 27)
  server_side_encryption {
    enabled     = true
    kms_key_arn = var.kms_key_arn
  }

  # Point-in-time recovery (standards/infrastructure-tier.md line 36)
  point_in_time_recovery {
    enabled = true
  }

  # Required tags per standards/global.md line 18
  tags = merge(var.tags, {
    Name        = var.device_token_table_name
    Purpose     = "device-token-storage"
    Environment = var.environment
    Component   = "notifications"
  })
}

# CloudWatch Alarms for DynamoDB operational health
resource "aws_cloudwatch_metric_alarm" "device_tokens_read_throttle" {
  alarm_name          = "${var.device_token_table_name}-read-throttle"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ReadThrottleEvents"
  namespace           = "AWS/DynamoDB"
  period              = 300 # 5 minutes
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "Device token table read throttling detected (standards/infrastructure-tier.md line 79)"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = aws_dynamodb_table.device_tokens.name
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "device_tokens_write_throttle" {
  alarm_name          = "${var.device_token_table_name}-write-throttle"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "WriteThrottleEvents"
  namespace           = "AWS/DynamoDB"
  period              = 300 # 5 minutes
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "Device token table write throttling detected (standards/infrastructure-tier.md line 79)"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = aws_dynamodb_table.device_tokens.name
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "device_tokens_system_errors" {
  alarm_name          = "${var.device_token_table_name}-system-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "SystemErrors"
  namespace           = "AWS/DynamoDB"
  period              = 300 # 5 minutes
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Device token table experiencing DynamoDB service errors (standards/infrastructure-tier.md line 79)"
  treat_missing_data  = "notBreaching"

  dimensions = {
    TableName = aws_dynamodb_table.device_tokens.name
  }

  tags = var.tags
}

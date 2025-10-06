# CloudWatch Alarms Configuration

## Required Alarms (Per Rubric)

### Lambda Error Alarms
Monitor all Lambda functions for errors with 5-minute evaluation period.

#### Alarm Configuration
- **Metric**: `Errors` (AWS/Lambda)
- **Statistic**: Sum
- **Threshold**: > 0
- **Period**: 5 minutes (300 seconds)
- **Evaluation Periods**: 1
- **Action**: SNS notification to on-call

#### Monitored Functions
- [ ] presign Lambda
- [ ] status Lambda
- [ ] download Lambda
- [ ] deviceToken Lambda
- [ ] worker Lambda (image processing)

### API Gateway 5XX Error Alarms
Monitor API Gateway for server errors.

#### Alarm Configuration
- **Metric**: `5XXError` (AWS/ApiGateway)
- **Statistic**: Average
- **Threshold**: > 1% (0.01)
- **Period**: 5 minutes (300 seconds)
- **Evaluation Periods**: 1
- **Action**: SNS notification to on-call

### SQS Age Alarm
Monitor SQS queue for message processing delays.

#### Alarm Configuration
- **Metric**: `ApproximateAgeOfOldestMessage` (AWS/SQS)
- **Statistic**: Maximum
- **Threshold**: > 120 seconds
- **Period**: 5 minutes (300 seconds)
- **Evaluation Periods**: 2 (consecutive)
- **Action**: SNS notification to on-call

#### Queue Name
- `[PROJECT]-[ENV]-jobs-queue`

## Alarm ARNs

### Development Environment
```
Lambda Errors:
- arn:aws:cloudwatch:REGION:ACCOUNT:alarm:[PROJECT]-dev-presign-errors
- arn:aws:cloudwatch:REGION:ACCOUNT:alarm:[PROJECT]-dev-status-errors
- arn:aws:cloudwatch:REGION:ACCOUNT:alarm:[PROJECT]-dev-download-errors
- arn:aws:cloudwatch:REGION:ACCOUNT:alarm:[PROJECT]-dev-worker-errors

API Gateway:
- arn:aws:cloudwatch:REGION:ACCOUNT:alarm:[PROJECT]-dev-api-5xx-errors

SQS:
- arn:aws:cloudwatch:REGION:ACCOUNT:alarm:[PROJECT]-dev-sqs-age
```

### Production Environment
```
[TODO: Populate with production ARNs]
```

## SNS Topics

### Alerts Topic
- **Topic ARN**: `arn:aws:sns:REGION:ACCOUNT:[PROJECT]-[ENV]-alerts`
- **Subscribers**:
  - Email: [TODO: Add on-call email]
  - Slack webhook: [TODO: Add if configured]
  - PagerDuty: [TODO: Add if configured]

## Terraform Configuration

### Lambda Error Alarm (Template)
```hcl
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  alarm_name          = "${var.project}-${var.environment}-${var.function_name}-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Lambda ${var.function_name} error rate exceeded threshold"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    FunctionName = var.function_name
  }

  tags = {
    Environment = var.environment
    Project     = var.project
  }
}
```

### API 5XX Alarm
```hcl
resource "aws_cloudwatch_metric_alarm" "api_5xx" {
  alarm_name          = "${var.project}-${var.environment}-api-5xx-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "5XXError"
  namespace           = "AWS/ApiGateway"
  period              = 300
  statistic           = "Average"
  threshold           = 0.01  # 1%
  alarm_description   = "API Gateway 5XX error rate exceeded 1%"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    ApiName = var.api_name
  }

  tags = {
    Environment = var.environment
    Project     = var.project
  }
}
```

### SQS Age Alarm
```hcl
resource "aws_cloudwatch_metric_alarm" "sqs_age" {
  alarm_name          = "${var.project}-${var.environment}-sqs-age"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ApproximateAgeOfOldestMessage"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = 120
  alarm_description   = "SQS messages aging beyond 2 minutes"
  alarm_actions       = [aws_sns_topic.alerts.arn]

  dimensions = {
    QueueName = var.queue_name
  }

  tags = {
    Environment = var.environment
    Project     = var.project
  }
}
```

## Dashboard Integration

### CloudWatch Dashboard
Create a dashboard with widgets for:
1. Lambda invocations and errors (all functions)
2. API Gateway requests, latency, and error rates
3. SQS message counts and age
4. DynamoDB read/write capacity and throttles

Dashboard name: `[PROJECT]-[ENV]-overview`

## Verification

### List All Alarms
```bash
aws cloudwatch describe-alarms \
  --alarm-name-prefix "photoeditor-dev-" \
  --output table
```

### Test Alarm
```bash
# Set alarm to ALARM state for testing
aws cloudwatch set-alarm-state \
  --alarm-name "photoeditor-dev-presign-errors" \
  --state-value ALARM \
  --state-reason "Testing alarm notification"
```

### Verify SNS Subscription
```bash
aws sns list-subscriptions-by-topic \
  --topic-arn "arn:aws:sns:REGION:ACCOUNT:photoeditor-dev-alerts" \
  --output table
```

## Runbook Links

When alarms trigger:
- **Lambda Errors**: See [Lambda Troubleshooting Runbook](../../runbooks/lambda-errors.md)
- **API 5XX**: See [API Gateway Runbook](../../runbooks/api-errors.md)
- **SQS Age**: See [DLQ Redrive Runbook](../../runbooks/dlq.md)

## Last Updated
[TODO: Add date]

## Evidence Files
- [ ] Screenshot: CloudWatch Alarms list
- [ ] Screenshot: SNS topic subscriptions
- [ ] Screenshot: CloudWatch Dashboard
- [ ] Test alarm notification confirmation

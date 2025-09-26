# CloudWatch Dashboard
resource "aws_cloudwatch_dashboard" "main" {
  dashboard_name = "${var.common_name}-dashboard"

  dashboard_body = jsonencode({
    widgets = [
      {
        type   = "metric"
        x      = 0
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/ApiGatewayV2", "Count", "ApiId", var.api_gateway_name, "Stage", var.api_gateway_stage],
            [".", "4XXError", ".", ".", ".", "."],
            [".", "5XXError", ".", ".", ".", "."],
          ]
          period = 300
          stat   = "Sum"
          region = data.aws_region.current.name
          title  = "API Gateway Requests and Errors"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 0
        width  = 12
        height = 6

        properties = {
          metrics = [
            for func_name in var.lambda_function_names : [
              "AWS/Lambda", "Duration", "FunctionName", func_name
            ]
          ]
          period = 300
          stat   = "Average"
          region = data.aws_region.current.name
          title  = "Lambda Function Duration"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 0
        y      = 6
        width  = 12
        height = 6

        properties = {
          metrics = [
            ["AWS/SQS", "ApproximateNumberOfVisibleMessages", "QueueName", var.queue_name],
            [".", "ApproximateAgeOfOldestMessage", ".", "."],
            [".", "ApproximateNumberOfVisibleMessages", "QueueName", var.dlq_name],
          ]
          period = 300
          stat   = "Average"
          region = data.aws_region.current.name
          title  = "SQS Queue Metrics"
          view   = "timeSeries"
        }
      },
      {
        type   = "metric"
        x      = 12
        y      = 6
        width  = 12
        height = 6

        properties = {
          metrics = [
            for func_name in var.lambda_function_names : [
              "AWS/Lambda", "Errors", "FunctionName", func_name
            ]
          ]
          period = 300
          stat   = "Sum"
          region = data.aws_region.current.name
          title  = "Lambda Function Errors"
          view   = "timeSeries"
        }
      }
    ]
  })
}

# Data sources
data "aws_region" "current" {}

# CloudWatch Composite Alarms
resource "aws_cloudwatch_composite_alarm" "application_health" {
  alarm_name        = "${var.common_name}-application-health"
  alarm_description = "Overall application health based on multiple metrics"

  alarm_rule = join(" OR ", [
    "ALARM(${var.api_gateway_name}-5xx-error-rate)",
    "ALARM(${var.common_name}-queue-age)",
    "ALARM(${var.common_name}-dlq-messages)",
  ])

  actions_enabled = true
  alarm_actions   = []

  tags = var.tags
}

# CloudWatch Log Insights Queries
resource "aws_cloudwatch_query_definition" "error_analysis" {
  name = "${var.common_name}-error-analysis"

  log_group_names = [
    for func_name in var.lambda_function_names : "/aws/lambda/${func_name}"
  ]

  query_string = <<-EOT
    fields @timestamp, @message, @requestId
    | filter @message like /ERROR/
    | sort @timestamp desc
    | limit 100
  EOT
}

resource "aws_cloudwatch_query_definition" "performance_analysis" {
  name = "${var.common_name}-performance-analysis"

  log_group_names = [
    for func_name in var.lambda_function_names : "/aws/lambda/${func_name}"
  ]

  query_string = <<-EOT
    fields @timestamp, @duration, @billedDuration, @maxMemoryUsed, @requestId
    | filter @type = "REPORT"
    | sort @timestamp desc
    | limit 100
  EOT
}

# SNS Topic for alarm notifications
resource "aws_sns_topic" "alarms" {
  name = "${var.common_name}-alarms"

  tags = merge(var.tags, {
    Name        = "${var.common_name}-alarms"
    Purpose     = "alarm-notifications"
    Environment = var.environment
  })
}

# Lambda function alarms
resource "aws_cloudwatch_metric_alarm" "lambda_errors" {
  count = length(var.lambda_function_names)

  alarm_name          = "${var.lambda_function_names[count.index]}-errors"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Sum"
  threshold           = "5"
  alarm_description   = "Lambda function ${var.lambda_function_names[count.index]} error rate is high"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    FunctionName = var.lambda_function_names[count.index]
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "lambda_duration" {
  count = length(var.lambda_function_names)

  alarm_name          = "${var.lambda_function_names[count.index]}-duration"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "2"
  metric_name         = "Duration"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Average"
  threshold           = "30000" # 30 seconds
  alarm_description   = "Lambda function ${var.lambda_function_names[count.index]} duration is high"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    FunctionName = var.lambda_function_names[count.index]
  }

  tags = var.tags
}

resource "aws_cloudwatch_metric_alarm" "lambda_throttles" {
  count = length(var.lambda_function_names)

  alarm_name          = "${var.lambda_function_names[count.index]}-throttles"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = "1"
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = "300"
  statistic           = "Sum"
  threshold           = "0"
  alarm_description   = "Lambda function ${var.lambda_function_names[count.index]} is being throttled"
  alarm_actions       = [aws_sns_topic.alarms.arn]

  dimensions = {
    FunctionName = var.lambda_function_names[count.index]
  }

  tags = var.tags
}
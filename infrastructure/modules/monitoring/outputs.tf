output "dashboard_name" {
  description = "Name of the CloudWatch dashboard"
  value       = aws_cloudwatch_dashboard.main.dashboard_name
}

output "dashboard_url" {
  description = "URL to access the CloudWatch dashboard"
  value       = "https://${data.aws_region.current.name}.console.aws.amazon.com/cloudwatch/home?region=${data.aws_region.current.name}#dashboards:name=${aws_cloudwatch_dashboard.main.dashboard_name}"
}

output "alarms_topic_arn" {
  description = "ARN of the alarms SNS topic"
  value       = aws_sns_topic.alarms.arn
}

output "composite_alarm_name" {
  description = "Name of the composite alarm"
  value       = aws_cloudwatch_composite_alarm.application_health.alarm_name
}

output "error_analysis_query" {
  description = "CloudWatch Insights query for error analysis"
  value       = aws_cloudwatch_query_definition.error_analysis.name
}

output "performance_analysis_query" {
  description = "CloudWatch Insights query for performance analysis"
  value       = aws_cloudwatch_query_definition.performance_analysis.name
}
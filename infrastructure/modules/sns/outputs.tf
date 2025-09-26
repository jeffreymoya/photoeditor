output "topic_name" {
  description = "Name of the SNS topic"
  value       = aws_sns_topic.notifications.name
}

output "topic_arn" {
  description = "ARN of the SNS topic"
  value       = aws_sns_topic.notifications.arn
}

output "topic_id" {
  description = "ID of the SNS topic"
  value       = aws_sns_topic.notifications.id
}

output "ios_platform_app_arn" {
  description = "ARN of the iOS platform application"
  value       = length(aws_sns_platform_application.ios) > 0 ? aws_sns_platform_application.ios[0].arn : ""
}

output "android_platform_app_arn" {
  description = "ARN of the Android platform application"
  value       = length(aws_sns_platform_application.android) > 0 ? aws_sns_platform_application.android[0].arn : ""
}
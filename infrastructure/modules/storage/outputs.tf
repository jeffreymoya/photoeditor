# Storage Module Outputs
# Explicit output contract per standards/infrastructure-tier.md line 7

output "device_token_table_name" {
  description = "Name of the device token DynamoDB table"
  value       = aws_dynamodb_table.device_tokens.name
}

output "device_token_table_arn" {
  description = "ARN of the device token DynamoDB table"
  value       = aws_dynamodb_table.device_tokens.arn
}

output "device_token_table_id" {
  description = "ID of the device token DynamoDB table"
  value       = aws_dynamodb_table.device_tokens.id
}

output "device_token_table_stream_arn" {
  description = "ARN of the DynamoDB table stream (if enabled)"
  value       = try(aws_dynamodb_table.device_tokens.stream_arn, null)
}

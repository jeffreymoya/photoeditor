output "table_name" {
  description = "Name of the DynamoDB table"
  value       = aws_dynamodb_table.jobs.name
}

output "table_arn" {
  description = "ARN of the DynamoDB table"
  value       = aws_dynamodb_table.jobs.arn
}

output "table_id" {
  description = "ID of the DynamoDB table"
  value       = aws_dynamodb_table.jobs.id
}

output "table_stream_arn" {
  description = "ARN of the DynamoDB table stream"
  value       = aws_dynamodb_table.jobs.stream_arn
}

output "user_index_name" {
  description = "Name of the user GSI"
  value       = "user-index"
}

output "status_index_name" {
  description = "Name of the status GSI"
  value       = "status-index"
}
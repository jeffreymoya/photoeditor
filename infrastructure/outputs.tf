# LocalStack outputs - simplified version for testing

# API Gateway outputs
output "api_gateway_url" {
  description = "API Gateway stage invoke URL"
  value       = "http://localhost:4566/restapis/${aws_api_gateway_rest_api.api.id}/dev/_user_request_"
  sensitive   = false
}

output "api_gateway_id" {
  description = "API Gateway REST API ID"
  value       = aws_api_gateway_rest_api.api.id
  sensitive   = false
}

# S3 outputs
output "temp_bucket_name" {
  description = "Name of the temporary S3 bucket"
  value       = aws_s3_bucket.temp_bucket.bucket
  sensitive   = false
}

output "final_bucket_name" {
  description = "Name of the final S3 bucket"
  value       = aws_s3_bucket.final_bucket.bucket
  sensitive   = false
}

output "temp_bucket_arn" {
  description = "ARN of the temporary S3 bucket"
  value       = aws_s3_bucket.temp_bucket.arn
  sensitive   = false
}

output "final_bucket_arn" {
  description = "ARN of the final S3 bucket"
  value       = aws_s3_bucket.final_bucket.arn
  sensitive   = false
}

# DynamoDB outputs
output "jobs_table_name" {
  description = "Name of the DynamoDB jobs table"
  value       = aws_dynamodb_table.jobs.name
  sensitive   = false
}

output "jobs_table_arn" {
  description = "ARN of the DynamoDB jobs table"
  value       = aws_dynamodb_table.jobs.arn
  sensitive   = false
}

# SQS outputs
output "queue_url" {
  description = "URL of the SQS processing queue"
  value       = aws_sqs_queue.processing.id
  sensitive   = false
}

output "queue_arn" {
  description = "ARN of the SQS processing queue"
  value       = aws_sqs_queue.processing.arn
  sensitive   = false
}

output "dlq_url" {
  description = "URL of the SQS dead letter queue"
  value       = aws_sqs_queue.dlq.id
  sensitive   = false
}

output "dlq_arn" {
  description = "ARN of the SQS dead letter queue"
  value       = aws_sqs_queue.dlq.arn
  sensitive   = false
}

# Lambda outputs
output "lambda_function_arns" {
  description = "ARNs of Lambda functions"
  value = {
    presign = aws_lambda_function.presign.arn
    status  = aws_lambda_function.status.arn
    worker  = aws_lambda_function.worker.arn
  }
  sensitive = false
}

output "lambda_function_names" {
  description = "Names of Lambda functions"
  value = {
    presign = aws_lambda_function.presign.function_name
    status  = aws_lambda_function.status.function_name
    worker  = aws_lambda_function.worker.function_name
  }
  sensitive = false
}

# SNS outputs
output "sns_topic_arn" {
  description = "ARN of the SNS topic"
  value       = aws_sns_topic.notifications.arn
  sensitive   = false
}

# Environment configuration for mobile app
output "environment_config" {
  description = "Environment configuration for mobile app"
  value = {
    region           = var.region
    environment      = var.environment
    api_url          = "http://localhost:4566/restapis/${aws_api_gateway_rest_api.api.id}/dev/_user_request_"
    temp_bucket      = aws_s3_bucket.temp_bucket.bucket
    final_bucket     = aws_s3_bucket.final_bucket.bucket
    jobs_table       = aws_dynamodb_table.jobs.name
    queue_url        = aws_sqs_queue.processing.id
    sns_topic        = aws_sns_topic.notifications.arn
    aws_endpoint_url = "http://localhost:4566"
    gemini_endpoint  = var.gemini_api_endpoint
    seedream_endpoint = var.seedream_api_endpoint
    enable_stub_providers = var.enable_stub_providers
  }
  sensitive = false
}
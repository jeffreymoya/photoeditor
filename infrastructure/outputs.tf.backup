# API Gateway Outputs
output "api_gateway_url" {
  description = "API Gateway URL"
  value       = module.api_gateway.stage_invoke_url
}

output "api_gateway_id" {
  description = "API Gateway ID"
  value       = module.api_gateway.api_id
}

# S3 Outputs
output "temp_bucket_name" {
  description = "Temporary S3 bucket name"
  value       = module.s3.temp_bucket_name
}

output "final_bucket_name" {
  description = "Final S3 bucket name"
  value       = module.s3.final_bucket_name
}

output "temp_bucket_arn" {
  description = "Temporary S3 bucket ARN"
  value       = module.s3.temp_bucket_arn
}

output "final_bucket_arn" {
  description = "Final S3 bucket ARN"
  value       = module.s3.final_bucket_arn
}

# DynamoDB Outputs
output "jobs_table_name" {
  description = "DynamoDB jobs table name"
  value       = module.dynamodb.table_name
}

output "jobs_table_arn" {
  description = "DynamoDB jobs table ARN"
  value       = module.dynamodb.table_arn
}

# SQS Outputs
output "queue_url" {
  description = "SQS queue URL"
  value       = module.sqs.queue_url
}

output "queue_arn" {
  description = "SQS queue ARN"
  value       = module.sqs.queue_arn
}

output "dlq_url" {
  description = "SQS dead letter queue URL"
  value       = module.sqs.dlq_url
}

output "dlq_arn" {
  description = "SQS dead letter queue ARN"
  value       = module.sqs.dlq_arn
}

# Lambda Outputs
output "lambda_function_arns" {
  description = "Lambda function ARNs"
  value = {
    presign = module.lambda.presign_function_arn
    status  = module.lambda.status_function_arn
    worker  = module.lambda.worker_function_arn
  }
}

output "lambda_function_names" {
  description = "Lambda function names"
  value = {
    presign = module.lambda.presign_function_name
    status  = module.lambda.status_function_name
    worker  = module.lambda.worker_function_name
  }
}

# SNS Outputs
output "sns_topic_arn" {
  description = "SNS topic ARN for notifications"
  value       = module.sns.topic_arn
}

# KMS Outputs
output "kms_key_id" {
  description = "KMS key ID for encryption"
  value       = module.kms.key_id
}

output "kms_key_arn" {
  description = "KMS key ARN for encryption"
  value       = module.kms.key_arn
}

output "kms_alias_arn" {
  description = "KMS key alias ARN"
  value       = module.kms.alias_arn
}

# SSM Parameter Outputs
output "ssm_parameters" {
  description = "SSM parameter names for configuration"
  value = {
    gemini_api_key        = aws_ssm_parameter.gemini_api_key.name
    seedream_api_key      = aws_ssm_parameter.seedream_api_key.name
    gemini_endpoint       = aws_ssm_parameter.gemini_endpoint.name
    seedream_endpoint     = aws_ssm_parameter.seedream_endpoint.name
    enable_stub_providers = aws_ssm_parameter.enable_stub_providers.name
  }
}

# Environment Configuration
output "environment_config" {
  description = "Environment configuration for applications"
  value = {
    environment  = var.environment
    region       = var.region
    account_id   = local.account_id
    project_name = var.project_name

    # Service endpoints
    api_url = module.api_gateway.stage_invoke_url

    # Resource names
    temp_bucket  = module.s3.temp_bucket_name
    final_bucket = module.s3.final_bucket_name
    jobs_table   = module.dynamodb.table_name
    queue_url    = module.sqs.queue_url
    sns_topic    = module.sns.topic_arn

    # Configuration parameters
    kms_key_id         = module.kms.key_id
    log_retention_days = var.log_retention_days
  }
  sensitive = false
}
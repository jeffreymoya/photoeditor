terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }

  # Using local backend for initial deployment
  # backend "s3" {
  #   # Backend configuration will be provided via backend config file
  #   # or command line during terraform init
  # }
}

provider "aws" {
  region = var.region

  default_tags {
    tags = merge(var.tags, {
      Environment = var.environment
      Terraform   = "true"
    })
  }
}

# Data sources
data "aws_caller_identity" "current" {}
data "aws_partition" "current" {}

# Local values
locals {
  account_id = data.aws_caller_identity.current.account_id
  partition  = data.aws_partition.current.partition

  common_name = "${var.project_name}-${var.environment}"

  temp_bucket_name  = "${local.common_name}-temp-${local.account_id}"
  final_bucket_name = "${local.common_name}-final-${local.account_id}"

  jobs_table_name = "${local.common_name}-jobs"

  api_name = "${local.common_name}-api"

  lambda_names = {
    presign = "${local.common_name}-presign"
    status  = "${local.common_name}-status"
    worker  = "${local.common_name}-worker"
  }
}

# VPC Module
module "vpc" {
  source = "./modules/vpc"

  project_name             = var.project_name
  environment              = var.environment
  vpc_cidr                 = var.vpc_cidr
  public_subnet_cidrs      = var.public_subnet_cidrs
  private_subnet_cidrs     = var.private_subnet_cidrs
  enable_nat_gateway       = var.enable_nat_gateway
  enable_s3_endpoint       = var.enable_s3_endpoint
  enable_dynamodb_endpoint = var.enable_dynamodb_endpoint

  tags = var.tags
}

# KMS Module
module "kms" {
  source = "./modules/kms"

  project_name            = var.project_name
  environment             = var.environment
  description             = "KMS key for ${local.common_name} photo editor"
  deletion_window_in_days = 7
  enable_key_rotation     = true

  tags = var.tags
}

# S3 Module
module "s3" {
  source = "./modules/s3"

  environment  = var.environment
  project_name = var.project_name
  common_name  = local.common_name
  account_id   = local.account_id
  kms_key_id   = module.kms.key_arn

  temp_bucket_name      = local.temp_bucket_name
  final_bucket_name     = local.final_bucket_name
  temp_retention_days   = var.temp_bucket_retention_days
  final_transition_days = var.final_bucket_transition_days
  abort_multipart_days  = var.abort_multipart_days

  tags = var.tags
}

# DynamoDB Module
module "dynamodb" {
  source = "./modules/dynamodb"

  environment  = var.environment
  project_name = var.project_name
  table_name   = local.jobs_table_name
  billing_mode = var.dynamodb_billing_mode
  ttl_days     = var.job_ttl_days
  kms_key_id   = module.kms.key_arn

  tags = var.tags
}

# SQS Module
module "sqs" {
  source = "./modules/sqs"

  environment            = var.environment
  project_name           = var.project_name
  common_name            = local.common_name
  account_id             = local.account_id
  kms_key_id             = module.kms.key_arn
  visibility_timeout     = var.sqs_visibility_timeout
  message_retention_days = var.sqs_message_retention_days
  max_receive_count      = var.sqs_max_receive_count

  tags = var.tags
}

# Lambda Module
module "lambda" {
  source = "./modules/lambda"

  environment          = var.environment
  project_name         = var.project_name
  lambda_names         = local.lambda_names
  timeout              = var.lambda_timeout
  memory_size          = var.lambda_memory_size
  reserved_concurrency = var.lambda_reserved_concurrency
  enable_xray_tracing  = var.enable_xray_tracing
  log_retention_days   = var.log_retention_days
  kms_key_id           = module.kms.key_arn

  # Dependencies
  temp_bucket_name  = module.s3.temp_bucket_name
  final_bucket_name = module.s3.final_bucket_name
  jobs_table_name   = module.dynamodb.table_name
  jobs_table_arn    = module.dynamodb.table_arn
  queue_url         = module.sqs.queue_url
  queue_arn         = module.sqs.queue_arn
  dlq_arn           = module.sqs.dlq_arn
  sns_topic_arn     = module.sns.topic_arn

  tags = var.tags
}

# API Gateway Module
module "api_gateway" {
  source = "./modules/api-gateway"

  environment          = var.environment
  project_name         = var.project_name
  api_name             = local.api_name
  throttle_rate_limit  = var.api_throttle_rate_limit
  throttle_burst_limit = var.api_throttle_burst_limit
  log_retention_days   = var.log_retention_days

  # Lambda function ARNs
  presign_function_arn  = module.lambda.presign_function_arn
  presign_function_name = module.lambda.presign_function_name
  status_function_arn   = module.lambda.status_function_arn
  status_function_name  = module.lambda.status_function_name

  tags = var.tags
}

# SNS Module
module "sns" {
  source = "./modules/sns"

  environment  = var.environment
  project_name = var.project_name
  common_name  = local.common_name
  kms_key_id   = module.kms.key_arn

  tags = var.tags
}

# S3 Event Notifications
resource "aws_s3_bucket_notification" "temp_bucket_notification" {
  bucket = module.s3.temp_bucket_id

  queue {
    queue_arn = module.sqs.queue_arn
    events    = ["s3:ObjectCreated:*"]

    filter_prefix = "temp/"
    filter_suffix = ""
  }

  depends_on = [module.sqs.queue_policy]
}

# Systems Manager Parameters
resource "aws_ssm_parameter" "gemini_api_key" {
  name        = "/${local.common_name}/gemini/api-key"
  description = "Gemini API key for ${local.common_name}"
  type        = "SecureString"
  value       = "changeme" # Will be updated manually
  key_id      = module.kms.key_arn

  tags = var.tags

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "seedream_api_key" {
  name        = "/${local.common_name}/seedream/api-key"
  description = "Seedream API key for ${local.common_name}"
  type        = "SecureString"
  value       = "changeme" # Will be updated manually
  key_id      = module.kms.key_arn

  tags = var.tags

  lifecycle {
    ignore_changes = [value]
  }
}

resource "aws_ssm_parameter" "gemini_endpoint" {
  name        = "/${local.common_name}/gemini/endpoint"
  description = "Gemini API endpoint for ${local.common_name}"
  type        = "String"
  value       = var.gemini_api_endpoint

  tags = var.tags
}

resource "aws_ssm_parameter" "seedream_endpoint" {
  name        = "/${local.common_name}/seedream/endpoint"
  description = "Seedream API endpoint for ${local.common_name}"
  type        = "String"
  value       = var.seedream_api_endpoint

  tags = var.tags
}

resource "aws_ssm_parameter" "enable_stub_providers" {
  name        = "/${local.common_name}/providers/enable-stubs"
  description = "Enable stub providers for testing"
  type        = "String"
  value       = tostring(var.enable_stub_providers)

  tags = var.tags
}

# Cost Management
module "budgets" {
  source = "./modules/budgets"

  environment         = var.environment
  project_name        = var.project_name
  monthly_limit       = var.monthly_budget_limit
  notification_emails = var.budget_notification_emails

  tags = var.tags
}

# CloudWatch Alarms
module "monitoring" {
  source = "./modules/monitoring"

  environment  = var.environment
  project_name = var.project_name
  common_name  = local.common_name

  # Resource references for monitoring
  api_gateway_name      = module.api_gateway.api_name
  api_gateway_stage     = module.api_gateway.stage_name
  lambda_function_names = values(local.lambda_names)
  queue_name            = module.sqs.queue_name
  dlq_name              = module.sqs.dlq_name
  sns_topic_arn         = module.sns.topic_arn

  tags = var.tags
}
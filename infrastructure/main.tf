# LocalStack provider configuration
# This file should be used when deploying to LocalStack
terraform {
  required_version = ">= 1.6.0"

  required_providers {
    aws = {
      source  = "hashicorp/aws"
      version = "~> 5.0"
    }
  }
}

provider "aws" {
  region                      = var.region
  access_key                  = "test"
  secret_key                  = "test"
  s3_use_path_style           = true
  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true

  endpoints {
    apigateway     = "http://localhost:4566"
    cloudformation = "http://localhost:4566"
    cloudwatch     = "http://localhost:4566"
    dynamodb       = "http://localhost:4566"
    ec2            = "http://localhost:4566"
    iam            = "http://localhost:4566"
    kms            = "http://localhost:4566"
    lambda         = "http://localhost:4566"
    logs           = "http://localhost:4566"
    s3             = "http://localhost:4566"
    sns            = "http://localhost:4566"
    sqs            = "http://localhost:4566"
    ssm            = "http://localhost:4566"
    sts            = "http://localhost:4566"
  }

  default_tags {
    tags = merge(var.tags, {
      Environment = var.environment
      Terraform   = "true"
      LocalStack  = "true"
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
    presign  = "${local.common_name}-presign"
    status   = "${local.common_name}-status"
    worker   = "${local.common_name}-worker"
    download = "${local.common_name}-download"
  }
}

# KMS Module - Create KMS key for encryption
module "kms" {
  source = "./modules/kms"

  environment  = var.environment
  project_name = var.project_name
  description  = "KMS key for ${local.common_name} photo editor"

  allowed_services = [
    "s3.amazonaws.com",
    "dynamodb.amazonaws.com",
    "sqs.amazonaws.com",
    "sns.amazonaws.com",
    "lambda.amazonaws.com"
  ]

  tags = var.tags
}

# S3 Module - Temp and Final buckets with encryption, lifecycle, logging
module "s3" {
  source = "./modules/s3"

  environment       = var.environment
  project_name      = var.project_name
  common_name       = local.common_name
  account_id        = local.account_id
  temp_bucket_name  = local.temp_bucket_name
  final_bucket_name = local.final_bucket_name
  kms_key_id        = module.kms.key_id

  temp_retention_days            = var.temp_bucket_retention_days
  final_transition_days          = var.final_bucket_transition_days
  abort_multipart_days           = var.abort_multipart_days
  enable_lifecycle_configuration = var.enable_s3_lifecycle

  tags = var.tags
}

# DynamoDB tables - kept inline for LocalStack schema compatibility
# The module uses job_id but our code uses jobId
resource "aws_dynamodb_table" "jobs" {
  name         = local.jobs_table_name
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "jobId"

  attribute {
    name = "jobId"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = var.tags
}

resource "aws_dynamodb_table" "jobs_batches" {
  name         = "${local.jobs_table_name}-batches"
  billing_mode = "PAY_PER_REQUEST"
  hash_key     = "batchJobId"

  attribute {
    name = "batchJobId"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = var.tags
}

# SNS Module - Notifications topic
module "sns" {
  source = "./modules/sns"

  environment  = var.environment
  project_name = var.project_name
  common_name  = local.common_name
  kms_key_id   = module.kms.key_id

  # LocalStack doesn't fully support mobile push notifications
  ios_certificate_arn = ""
  android_api_key     = ""

  tags = var.tags
}

# SQS Module - Processing queue and DLQ with encryption
module "sqs" {
  source = "./modules/sqs"

  environment  = var.environment
  project_name = var.project_name
  common_name  = local.common_name
  account_id   = local.account_id
  kms_key_id   = module.kms.key_id

  visibility_timeout     = var.sqs_visibility_timeout
  message_retention_days = var.sqs_message_retention_days
  max_receive_count      = var.sqs_max_receive_count

  tags = var.tags
}

# Lambda execution role - shared for LocalStack simplicity
resource "aws_iam_role" "lambda_execution_role" {
  name = "${local.common_name}-lambda-execution-role"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy" "lambda_policy" {
  name = "${local.common_name}-lambda-policy"
  role = aws_iam_role.lambda_execution_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "logs:CreateLogGroup",
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "arn:aws:logs:*:*:*"
      },
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject",
          "s3:DeleteObject"
        ]
        Resource = [
          "${module.s3.temp_bucket_arn}/*",
          "${module.s3.final_bucket_arn}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem",
          "dynamodb:PutItem",
          "dynamodb:UpdateItem",
          "dynamodb:DeleteItem",
          "dynamodb:Query"
        ]
        Resource = [
          aws_dynamodb_table.jobs.arn,
          aws_dynamodb_table.jobs_batches.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = [
          module.sqs.queue_arn,
          module.sqs.dlq_arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = module.sns.topic_arn
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters"
        ]
        Resource = "arn:aws:ssm:*:*:parameter/${local.common_name}/*"
      }
    ]
  })
}

# Lambda functions - kept inline for LocalStack compatibility
# The lambda module uses archive_file which doesn't work with pre-built zips
resource "aws_lambda_function" "presign" {
  filename                       = "../backend/dist/lambdas/presign/presign.zip"
  function_name                  = local.lambda_names.presign
  role                           = aws_iam_role.lambda_execution_role.arn
  handler                        = "presign.handler"
  runtime                        = "nodejs20.x"
  timeout                        = var.lambda_timeout
  memory_size                    = var.lambda_memory_size
  reserved_concurrent_executions = var.lambda_reserved_concurrency

  environment {
    variables = {
      PROJECT_NAME      = var.project_name
      NODE_ENV          = var.environment
      TEMP_BUCKET_NAME  = module.s3.temp_bucket_name
      FINAL_BUCKET_NAME = module.s3.final_bucket_name
      JOBS_TABLE_NAME   = aws_dynamodb_table.jobs.name
    }
  }

  tags = var.tags
}

resource "aws_lambda_function" "status" {
  filename                       = "../backend/dist/lambdas/status/status.zip"
  function_name                  = local.lambda_names.status
  role                           = aws_iam_role.lambda_execution_role.arn
  handler                        = "status.handler"
  runtime                        = "nodejs20.x"
  timeout                        = var.lambda_timeout
  memory_size                    = var.lambda_memory_size
  reserved_concurrent_executions = var.lambda_reserved_concurrency

  environment {
    variables = {
      PROJECT_NAME    = var.project_name
      NODE_ENV        = var.environment
      JOBS_TABLE_NAME = aws_dynamodb_table.jobs.name
    }
  }

  tags = var.tags
}

resource "aws_lambda_function" "worker" {
  filename                       = "../backend/dist/lambdas/worker/worker.zip"
  function_name                  = local.lambda_names.worker
  role                           = aws_iam_role.lambda_execution_role.arn
  handler                        = "worker.handler"
  runtime                        = "nodejs20.x"
  timeout                        = var.lambda_timeout
  memory_size                    = var.lambda_memory_size
  reserved_concurrent_executions = var.lambda_reserved_concurrency

  environment {
    variables = {
      PROJECT_NAME      = var.project_name
      NODE_ENV          = var.environment
      TEMP_BUCKET_NAME  = module.s3.temp_bucket_name
      FINAL_BUCKET_NAME = module.s3.final_bucket_name
      JOBS_TABLE_NAME   = aws_dynamodb_table.jobs.name
      SNS_TOPIC_ARN     = module.sns.topic_arn
    }
  }

  tags = var.tags
}

resource "aws_lambda_function" "download" {
  filename                       = "../backend/dist/lambdas/download/download.zip"
  function_name                  = local.lambda_names.download
  role                           = aws_iam_role.lambda_execution_role.arn
  handler                        = "download.handler"
  runtime                        = "nodejs20.x"
  timeout                        = var.lambda_timeout
  memory_size                    = var.lambda_memory_size
  reserved_concurrent_executions = var.lambda_reserved_concurrency

  environment {
    variables = {
      PROJECT_NAME      = var.project_name
      NODE_ENV          = var.environment
      TEMP_BUCKET_NAME  = module.s3.temp_bucket_name
      FINAL_BUCKET_NAME = module.s3.final_bucket_name
      JOBS_TABLE_NAME   = aws_dynamodb_table.jobs.name
    }
  }

  tags = var.tags
}

# BFF Lambda (NestJS Backend for Frontend) - Future migration target
# Currently routing through individual lambdas; BFF will consolidate presign/status/download
resource "aws_lambda_function" "bff" {
  count                          = var.enable_bff_lambda ? 1 : 0
  filename                       = "../backend/dist/lambdas/bff/bff.zip"
  function_name                  = "${local.common_name}-bff"
  role                           = aws_iam_role.lambda_execution_role.arn
  handler                        = "handler.handler"
  runtime                        = "nodejs20.x"
  timeout                        = var.lambda_timeout
  memory_size                    = 512 # BFF requires more memory for NestJS runtime
  reserved_concurrent_executions = var.lambda_reserved_concurrency

  environment {
    variables = {
      PROJECT_NAME      = var.project_name
      NODE_ENV          = var.environment
      TEMP_BUCKET_NAME  = module.s3.temp_bucket_name
      FINAL_BUCKET_NAME = module.s3.final_bucket_name
      JOBS_TABLE_NAME   = aws_dynamodb_table.jobs.name
      SNS_TOPIC_ARN     = module.sns.topic_arn
    }
  }

  tags = merge(var.tags, {
    Component = "bff"
    Type      = "api-lambda"
  })
}

# CloudWatch Log Groups with retention policies per STANDARDS.md
# Prod: 90d, Staging: 30d, Dev: 14d
resource "aws_cloudwatch_log_group" "presign" {
  name              = "/aws/lambda/${aws_lambda_function.presign.function_name}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "status" {
  name              = "/aws/lambda/${aws_lambda_function.status.function_name}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${aws_lambda_function.worker.function_name}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "download" {
  name              = "/aws/lambda/${aws_lambda_function.download.function_name}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "bff" {
  count             = var.enable_bff_lambda ? 1 : 0
  name              = "/aws/lambda/${aws_lambda_function.bff[0].function_name}"
  retention_in_days = var.log_retention_days

  tags = var.tags
}

# API Gateway - kept inline for LocalStack compatibility (REST API v1)
# The api-gateway module uses HTTP API v2 which has different routing
resource "aws_api_gateway_rest_api" "api" {
  name = local.api_name
  tags = var.tags
}

resource "aws_api_gateway_resource" "presign" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "presign"
}

resource "aws_api_gateway_method" "presign_post" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.presign.id
  http_method   = "POST"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "presign_integration" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.presign.id
  http_method = aws_api_gateway_method.presign_post.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.presign.invoke_arn
}

resource "aws_api_gateway_resource" "status" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "status"
}

resource "aws_api_gateway_method" "status_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.status.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "status_integration" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.status.id
  http_method = aws_api_gateway_method.status_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.status.invoke_arn
}

resource "aws_api_gateway_resource" "status_item" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.status.id
  path_part   = "{jobId}"
}

resource "aws_api_gateway_method" "status_item_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.status_item.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "status_item_integration" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.status_item.id
  http_method = aws_api_gateway_method.status_item_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.status.invoke_arn
}

resource "aws_api_gateway_resource" "download" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_rest_api.api.root_resource_id
  path_part   = "download"
}

resource "aws_api_gateway_resource" "download_item" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  parent_id   = aws_api_gateway_resource.download.id
  path_part   = "{jobId}"
}

resource "aws_api_gateway_method" "download_item_get" {
  rest_api_id   = aws_api_gateway_rest_api.api.id
  resource_id   = aws_api_gateway_resource.download_item.id
  http_method   = "GET"
  authorization = "NONE"
}

resource "aws_api_gateway_integration" "download_item_integration" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  resource_id = aws_api_gateway_resource.download_item.id
  http_method = aws_api_gateway_method.download_item_get.http_method

  integration_http_method = "POST"
  type                    = "AWS_PROXY"
  uri                     = aws_lambda_function.download.invoke_arn
}

resource "aws_api_gateway_deployment" "api_deployment" {
  depends_on = [
    aws_api_gateway_integration.presign_integration,
    aws_api_gateway_integration.status_integration,
    aws_api_gateway_integration.status_item_integration,
    aws_api_gateway_integration.download_item_integration,
  ]

  rest_api_id = aws_api_gateway_rest_api.api.id

  lifecycle {
    create_before_destroy = true
  }
}

resource "aws_api_gateway_stage" "dev" {
  deployment_id = aws_api_gateway_deployment.api_deployment.id
  rest_api_id   = aws_api_gateway_rest_api.api.id
  stage_name    = "dev"
}

# Lambda permissions for API Gateway
resource "aws_lambda_permission" "presign_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.presign.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "status_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.status.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

resource "aws_lambda_permission" "download_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.download.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_api_gateway_rest_api.api.execution_arn}/*/*"
}

# S3 to SQS notification
resource "aws_sqs_queue_policy" "allow_s3_to_sqs" {
  queue_url = module.sqs.queue_id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid       = "AllowS3SendMessage",
        Effect    = "Allow",
        Principal = { Service = "s3.amazonaws.com" },
        Action    = "sqs:SendMessage",
        Resource  = module.sqs.queue_arn,
        Condition = {
          ArnLike = { "aws:SourceArn" = module.s3.temp_bucket_arn }
        }
      }
    ]
  })
}

resource "aws_s3_bucket_notification" "temp_bucket_notification" {
  bucket = module.s3.temp_bucket_id

  queue {
    queue_arn     = module.sqs.queue_arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "temp/"
  }

  depends_on = [aws_sqs_queue_policy.allow_s3_to_sqs]
}

# Lambda event source mapping for SQS
resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn                   = module.sqs.queue_arn
  function_name                      = aws_lambda_function.worker.arn
  batch_size                         = 1
  maximum_batching_window_in_seconds = 1

  depends_on = [aws_lambda_function.worker]
}

# SSM Parameters for provider configuration
resource "aws_ssm_parameter" "gemini_api_key" {
  name  = "/${local.common_name}/gemini/api-key"
  type  = "SecureString"
  value = "test-key"

  tags = var.tags
}

resource "aws_ssm_parameter" "seedream_api_key" {
  name  = "/${local.common_name}/seedream/api-key"
  type  = "SecureString"
  value = "test-key"

  tags = var.tags
}

resource "aws_ssm_parameter" "gemini_endpoint" {
  name  = "/${local.common_name}/gemini/endpoint"
  type  = "String"
  value = var.gemini_api_endpoint

  tags = var.tags
}

resource "aws_ssm_parameter" "seedream_endpoint" {
  name  = "/${local.common_name}/seedream/endpoint"
  type  = "String"
  value = var.seedream_api_endpoint

  tags = var.tags
}

resource "aws_ssm_parameter" "enable_stub_providers" {
  name  = "/${local.common_name}/providers/enable-stubs"
  type  = "String"
  value = tostring(var.enable_stub_providers)

  tags = var.tags
}

# Monitoring Module - CloudWatch dashboards and alarms
# Note: API Gateway dashboard uses v2 (HTTP API) metrics
# Current LocalStack setup uses REST API v1, so dashboard will show limited data in LocalStack
module "monitoring" {
  source = "./modules/monitoring"

  environment       = var.environment
  project_name      = var.project_name
  common_name       = local.common_name
  api_gateway_name  = aws_api_gateway_rest_api.api.id
  api_gateway_stage = aws_api_gateway_stage.dev.stage_name
  lambda_function_names = [
    aws_lambda_function.presign.function_name,
    aws_lambda_function.status.function_name,
    aws_lambda_function.worker.function_name,
    aws_lambda_function.download.function_name,
  ]
  queue_name    = module.sqs.queue_name
  dlq_name      = module.sqs.dlq_name
  sns_topic_arn = module.sns.topic_arn

  tags = var.tags
}

# API Gateway CloudWatch Logging
resource "aws_api_gateway_account" "main" {
  cloudwatch_role_arn = aws_iam_role.api_gateway_cloudwatch.arn
}

resource "aws_iam_role" "api_gateway_cloudwatch" {
  name = "${local.common_name}-api-gateway-cloudwatch"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "apigateway.amazonaws.com"
        }
      }
    ]
  })

  tags = var.tags
}

resource "aws_iam_role_policy_attachment" "api_gateway_cloudwatch" {
  role       = aws_iam_role.api_gateway_cloudwatch.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AmazonAPIGatewayPushToCloudWatchLogs"
}

resource "aws_api_gateway_method_settings" "all" {
  rest_api_id = aws_api_gateway_rest_api.api.id
  stage_name  = aws_api_gateway_stage.dev.stage_name
  method_path = "*/*"

  settings {
    metrics_enabled    = true
    logging_level      = var.api_gateway_log_level
    data_trace_enabled = var.environment == "dev"
  }
}

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
  s3_use_path_style          = true
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
    presign = "${local.common_name}-presign"
    status  = "${local.common_name}-status"
    worker  = "${local.common_name}-worker"
  }
}

# For LocalStack, we'll create simplified resources without VPC complexities

# S3 buckets (simplified for LocalStack)
resource "aws_s3_bucket" "temp_bucket" {
  bucket = local.temp_bucket_name
}

resource "aws_s3_bucket" "final_bucket" {
  bucket = local.final_bucket_name
}

# DynamoDB table
resource "aws_dynamodb_table" "jobs" {
  name           = local.jobs_table_name
  billing_mode   = "PAY_PER_REQUEST"
  hash_key       = "id"

  attribute {
    name = "id"
    type = "S"
  }

  ttl {
    attribute_name = "expires_at"
    enabled        = true
  }

  tags = var.tags
}

# DynamoDB table for batch jobs (used by batch upload flow)
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

# SQS queue
resource "aws_sqs_queue" "processing" {
  name                      = "${local.common_name}-processing"
  visibility_timeout_seconds = var.sqs_visibility_timeout
  message_retention_seconds = var.sqs_message_retention_days * 24 * 3600

  tags = var.tags
}

# SQS DLQ
resource "aws_sqs_queue" "dlq" {
  name = "${local.common_name}-dlq"
  tags = var.tags
}

# SNS topic
resource "aws_sns_topic" "notifications" {
  name = "${local.common_name}-notifications"
  tags = var.tags
}

# Lambda execution role
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
          "${aws_s3_bucket.temp_bucket.arn}/*",
          "${aws_s3_bucket.final_bucket.arn}/*"
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
          "sqs:DeleteMessage"
        ]
        Resource = [
          aws_sqs_queue.processing.arn,
          aws_sqs_queue.dlq.arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = aws_sns_topic.notifications.arn
      }
    ]
  })
}

# Lambda functions
resource "aws_lambda_function" "presign" {
  filename         = "../backend/dist/lambdas/presign/presign.zip"
  function_name    = local.lambda_names.presign
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "presign.handler"
  runtime         = "nodejs20.x"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size

  environment {
    variables = {
      PROJECT_NAME     = var.project_name
      NODE_ENV         = var.environment
      TEMP_BUCKET_NAME  = aws_s3_bucket.temp_bucket.bucket
      FINAL_BUCKET_NAME = aws_s3_bucket.final_bucket.bucket
      JOBS_TABLE_NAME   = aws_dynamodb_table.jobs.name
    }
  }

  tags = var.tags
}

resource "aws_lambda_function" "status" {
  filename         = "../backend/dist/lambdas/status/status.zip"
  function_name    = local.lambda_names.status
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "status.handler"
  runtime         = "nodejs20.x"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size

  environment {
    variables = {
      PROJECT_NAME   = var.project_name
      NODE_ENV       = var.environment
      JOBS_TABLE_NAME = aws_dynamodb_table.jobs.name
    }
  }

  tags = var.tags
}

resource "aws_lambda_function" "worker" {
  filename         = "../backend/dist/lambdas/worker/worker.zip"
  function_name    = local.lambda_names.worker
  role            = aws_iam_role.lambda_execution_role.arn
  handler         = "worker.handler"
  runtime         = "nodejs20.x"
  timeout         = var.lambda_timeout
  memory_size     = var.lambda_memory_size

  environment {
    variables = {
      PROJECT_NAME     = var.project_name
      NODE_ENV         = var.environment
      TEMP_BUCKET_NAME  = aws_s3_bucket.temp_bucket.bucket
      FINAL_BUCKET_NAME = aws_s3_bucket.final_bucket.bucket
      JOBS_TABLE_NAME   = aws_dynamodb_table.jobs.name
      SNS_TOPIC_ARN     = aws_sns_topic.notifications.arn
    }
  }

  tags = var.tags
}

# API Gateway
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

# Add /status/{jobId} resource so the status function can read the path parameter
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

resource "aws_api_gateway_deployment" "api_deployment" {
  depends_on = [
    aws_api_gateway_integration.presign_integration,
    aws_api_gateway_integration.status_integration,
    aws_api_gateway_integration.status_item_integration,
  ]

  rest_api_id = aws_api_gateway_rest_api.api.id
  stage_name  = "dev"
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

# Allow S3 to send notifications to SQS and trigger the worker via SQS event source mapping
resource "aws_sqs_queue_policy" "allow_s3_to_sqs" {
  queue_url = aws_sqs_queue.processing.id

  policy = jsonencode({
    Version = "2012-10-17",
    Statement = [
      {
        Sid       = "AllowS3SendMessage",
        Effect    = "Allow",
        Principal = { Service = "s3.amazonaws.com" },
        Action    = "sqs:SendMessage",
        Resource  = aws_sqs_queue.processing.arn,
        Condition = {
          ArnLike = { "aws:SourceArn" = aws_s3_bucket.temp_bucket.arn }
        }
      }
    ]
  })
}

resource "aws_s3_bucket_notification" "temp_bucket_notification" {
  bucket = aws_s3_bucket.temp_bucket.id

  queue {
    queue_arn     = aws_sqs_queue.processing.arn
    events        = ["s3:ObjectCreated:*"]
    filter_prefix = "temp/"
  }

  depends_on = [aws_sqs_queue_policy.allow_s3_to_sqs]
}

resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn                   = aws_sqs_queue.processing.arn
  function_name                      = aws_lambda_function.worker.arn
  batch_size                         = 1
  maximum_batching_window_in_seconds = 1

  depends_on = [aws_lambda_function.worker]
}

# SSM Parameters
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

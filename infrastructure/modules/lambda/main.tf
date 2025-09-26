# IAM Role for Presign Lambda function (least-privilege)
resource "aws_iam_role" "presign_lambda_role" {
  name = "${var.project_name}-${var.environment}-presign-lambda-role"

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

# IAM Role for Status Lambda function (least-privilege)
resource "aws_iam_role" "status_lambda_role" {
  name = "${var.project_name}-${var.environment}-status-lambda-role"

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

# IAM Role for Worker Lambda function (least-privilege)
resource "aws_iam_role" "worker_lambda_role" {
  name = "${var.project_name}-${var.environment}-worker-lambda-role"

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

# Basic Lambda execution policies
resource "aws_iam_role_policy_attachment" "presign_lambda_basic" {
  role       = aws_iam_role.presign_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "status_lambda_basic" {
  role       = aws_iam_role.status_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

resource "aws_iam_role_policy_attachment" "worker_lambda_basic" {
  role       = aws_iam_role.worker_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/service-role/AWSLambdaBasicExecutionRole"
}

# X-Ray tracing policies
resource "aws_iam_role_policy_attachment" "presign_lambda_xray" {
  count      = var.enable_xray_tracing ? 1 : 0
  role       = aws_iam_role.presign_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy_attachment" "status_lambda_xray" {
  count      = var.enable_xray_tracing ? 1 : 0
  role       = aws_iam_role.status_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

resource "aws_iam_role_policy_attachment" "worker_lambda_xray" {
  count      = var.enable_xray_tracing ? 1 : 0
  role       = aws_iam_role.worker_lambda_role.name
  policy_arn = "arn:aws:iam::aws:policy/AWSXRayDaemonWriteAccess"
}

# Presign Lambda policy - only needs S3 presign and DynamoDB jobs table write access
resource "aws_iam_role_policy" "presign_lambda_policy" {
  name = "${var.project_name}-${var.environment}-presign-lambda-policy"
  role = aws_iam_role.presign_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject"
        ]
        Resource = [
          "arn:aws:s3:::${var.temp_bucket_name}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem"
        ]
        Resource = [
          var.jobs_table_arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = var.kms_key_id
      }
    ]
  })
}

# Status Lambda policy - only needs DynamoDB jobs table read access
resource "aws_iam_role_policy" "status_lambda_policy" {
  name = "${var.project_name}-${var.environment}-status-lambda-policy"
  role = aws_iam_role.status_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "dynamodb:GetItem"
        ]
        Resource = [
          var.jobs_table_arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt"
        ]
        Resource = var.kms_key_id
      }
    ]
  })
}

# Worker Lambda policy - needs full S3 access, DynamoDB updates, SQS operations, and SNS publish
resource "aws_iam_role_policy" "worker_lambda_policy" {
  name = "${var.project_name}-${var.environment}-worker-lambda-policy"
  role = aws_iam_role.worker_lambda_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "s3:GetObject",
          "s3:PutObject"
        ]
        Resource = [
          "arn:aws:s3:::${var.temp_bucket_name}/*",
          "arn:aws:s3:::${var.final_bucket_name}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:UpdateItem"
        ]
        Resource = [
          var.jobs_table_arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = [
          var.queue_arn
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sns:Publish"
        ]
        Resource = var.sns_topic_arn
      },
      {
        Effect = "Allow"
        Action = [
          "ssm:GetParameter",
          "ssm:GetParameters",
          "ssm:GetParametersByPath"
        ]
        Resource = [
          "arn:aws:ssm:*:*:parameter/${var.project_name}-${var.environment}/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "kms:Decrypt",
          "kms:GenerateDataKey"
        ]
        Resource = var.kms_key_id
      }
    ]
  })
}

# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "presign" {
  name              = "/aws/lambda/${var.lambda_names.presign}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_id

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "status" {
  name              = "/aws/lambda/${var.lambda_names.status}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_id

  tags = var.tags
}

resource "aws_cloudwatch_log_group" "worker" {
  name              = "/aws/lambda/${var.lambda_names.worker}"
  retention_in_days = var.log_retention_days
  kms_key_id        = var.kms_key_id

  tags = var.tags
}

# Lambda Functions
# Real deployment packages for presign, status, and worker functions

# Presign Lambda deployment package
data "archive_file" "presign_zip" {
  type        = "zip"
  output_path = "${path.module}/../../../tmp/presign_function.zip"
  source_dir  = "${path.module}/../../../backend/dist/lambdas/presign"
  excludes    = ["*.map", "node_modules"]
}

# Status Lambda deployment package
data "archive_file" "status_zip" {
  type        = "zip"
  output_path = "${path.module}/../../../tmp/status_function.zip"
  source_dir  = "${path.module}/../../../backend/dist/lambdas/status"
  excludes    = ["*.map", "node_modules"]
}

# Worker Lambda deployment package
data "archive_file" "worker_zip" {
  type        = "zip"
  output_path = "${path.module}/../../../tmp/worker_function.zip"
  source_dir  = "${path.module}/../../../backend/dist/lambdas/worker"
  excludes    = ["*.map", "node_modules"]
}

# Presign Lambda Function
resource "aws_lambda_function" "presign" {
  filename                       = data.archive_file.presign_zip.output_path
  function_name                  = var.lambda_names.presign
  role                           = aws_iam_role.presign_lambda_role.arn
  handler                        = "index.handler"
  source_code_hash               = data.archive_file.presign_zip.output_base64sha256
  runtime                        = "nodejs20.x"
  timeout                        = var.timeout
  memory_size                    = var.memory_size
  reserved_concurrent_executions = var.reserved_concurrency

  environment {
    variables = {
      NODE_ENV                = var.environment
      PROJECT_NAME            = var.project_name
      TEMP_BUCKET_NAME        = var.temp_bucket_name
      FINAL_BUCKET_NAME       = var.final_bucket_name
      JOBS_TABLE_NAME         = var.jobs_table_name
      QUEUE_URL               = var.queue_url
      SNS_TOPIC_ARN           = var.sns_topic_arn
      KMS_KEY_ID              = var.kms_key_id
      POWERTOOLS_SERVICE_NAME = var.lambda_names.presign
      POWERTOOLS_LOG_LEVEL    = "INFO"
      LOG_LEVEL               = "INFO"
    }
  }

  dynamic "tracing_config" {
    for_each = var.enable_xray_tracing ? [1] : []
    content {
      mode = "Active"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.presign_lambda_basic,
    aws_cloudwatch_log_group.presign,
  ]

  tags = merge(var.tags, {
    Name = var.lambda_names.presign
    Type = "api"
  })
}

# Status Lambda Function
resource "aws_lambda_function" "status" {
  filename                       = data.archive_file.status_zip.output_path
  function_name                  = var.lambda_names.status
  role                           = aws_iam_role.status_lambda_role.arn
  handler                        = "index.handler"
  source_code_hash               = data.archive_file.status_zip.output_base64sha256
  runtime                        = "nodejs20.x"
  timeout                        = var.timeout
  memory_size                    = var.memory_size
  reserved_concurrent_executions = var.reserved_concurrency

  environment {
    variables = {
      NODE_ENV                = var.environment
      PROJECT_NAME            = var.project_name
      TEMP_BUCKET_NAME        = var.temp_bucket_name
      FINAL_BUCKET_NAME       = var.final_bucket_name
      JOBS_TABLE_NAME         = var.jobs_table_name
      QUEUE_URL               = var.queue_url
      SNS_TOPIC_ARN           = var.sns_topic_arn
      KMS_KEY_ID              = var.kms_key_id
      POWERTOOLS_SERVICE_NAME = var.lambda_names.status
      POWERTOOLS_LOG_LEVEL    = "INFO"
      LOG_LEVEL               = "INFO"
    }
  }

  dynamic "tracing_config" {
    for_each = var.enable_xray_tracing ? [1] : []
    content {
      mode = "Active"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.status_lambda_basic,
    aws_cloudwatch_log_group.status,
  ]

  tags = merge(var.tags, {
    Name = var.lambda_names.status
    Type = "api"
  })
}

# Worker Lambda Function
resource "aws_lambda_function" "worker" {
  filename                       = data.archive_file.worker_zip.output_path
  function_name                  = var.lambda_names.worker
  role                           = aws_iam_role.worker_lambda_role.arn
  handler                        = "index.handler"
  source_code_hash               = data.archive_file.worker_zip.output_base64sha256
  runtime                        = "nodejs20.x"
  timeout                        = var.timeout
  memory_size                    = var.memory_size
  reserved_concurrent_executions = var.reserved_concurrency

  environment {
    variables = {
      NODE_ENV                = var.environment
      PROJECT_NAME            = var.project_name
      TEMP_BUCKET_NAME        = var.temp_bucket_name
      FINAL_BUCKET_NAME       = var.final_bucket_name
      JOBS_TABLE_NAME         = var.jobs_table_name
      QUEUE_URL               = var.queue_url
      SNS_TOPIC_ARN           = var.sns_topic_arn
      KMS_KEY_ID              = var.kms_key_id
      POWERTOOLS_SERVICE_NAME = var.lambda_names.worker
      POWERTOOLS_LOG_LEVEL    = "INFO"
      LOG_LEVEL               = "INFO"
    }
  }

  dynamic "tracing_config" {
    for_each = var.enable_xray_tracing ? [1] : []
    content {
      mode = "Active"
    }
  }

  depends_on = [
    aws_iam_role_policy_attachment.worker_lambda_basic,
    aws_cloudwatch_log_group.worker,
  ]

  tags = merge(var.tags, {
    Name = var.lambda_names.worker
    Type = "worker"
  })
}

# SQS Event Source Mapping for Worker Lambda
resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn                   = var.queue_arn
  function_name                      = aws_lambda_function.worker.arn
  batch_size                         = 1
  maximum_batching_window_in_seconds = 5

  depends_on = [aws_lambda_function.worker]
}
# Global Variables
variable "environment" {
  description = "Environment name (dev, stage, prod)"
  type        = string

  validation {
    condition     = can(regex("^(dev|stage|prod)$", var.environment))
    error_message = "Environment must be one of: dev, stage, prod."
  }
}

variable "project_name" {
  description = "Name of the project"
  type        = string
  default     = "photo-editor"
}

variable "region" {
  description = "AWS region"
  type        = string
  default     = "us-east-1"
}

variable "tags" {
  description = "Common tags to apply to all resources"
  type        = map(string)
  default = {
    Project    = "photo-editor"
    Owner      = "engineering"
    CostCenter = "product"
  }
}

# S3 Configuration
variable "temp_bucket_retention_days" {
  description = "Number of days to retain temp files"
  type        = number
  default     = 2
}

variable "final_bucket_transition_days" {
  description = "Number of days before transitioning final files to IA"
  type        = number
  default     = 30
}

variable "abort_multipart_days" {
  description = "Number of days before aborting incomplete multipart uploads"
  type        = number
  default     = 7
}

# Lambda Configuration
variable "lambda_timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 300
}

variable "lambda_memory_size" {
  description = "Lambda function memory size in MB"
  type        = number
  default     = 1024
}

variable "lambda_reserved_concurrency" {
  description = "Reserved concurrency for Lambda functions"
  type        = number
  default     = 100
}

# DynamoDB Configuration
variable "dynamodb_billing_mode" {
  description = "DynamoDB billing mode"
  type        = string
  default     = "ON_DEMAND"

  validation {
    condition     = can(regex("^(ON_DEMAND|PROVISIONED)$", var.dynamodb_billing_mode))
    error_message = "DynamoDB billing mode must be either ON_DEMAND or PROVISIONED."
  }
}

variable "job_ttl_days" {
  description = "Number of days to retain job records"
  type        = number
  default     = 90
}

# SQS Configuration
variable "sqs_visibility_timeout" {
  description = "SQS message visibility timeout in seconds"
  type        = number
  default     = 900
}

variable "sqs_message_retention_days" {
  description = "Number of days to retain SQS messages"
  type        = number
  default     = 14
}

variable "sqs_max_receive_count" {
  description = "Maximum number of times a message can be received before moving to DLQ"
  type        = number
  default     = 3
}

# API Gateway Configuration
variable "api_throttle_rate_limit" {
  description = "API Gateway throttling rate limit (requests per second)"
  type        = number
  default     = 10000
}

variable "api_throttle_burst_limit" {
  description = "API Gateway throttling burst limit"
  type        = number
  default     = 20000
}

# Monitoring Configuration
variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 90
}

variable "enable_xray_tracing" {
  description = "Enable X-Ray tracing for Lambda functions"
  type        = bool
  default     = true
}

# Cost Management
variable "monthly_budget_limit" {
  description = "Monthly budget limit in USD"
  type        = number
  default     = 100
}

variable "budget_notification_emails" {
  description = "List of email addresses for budget notifications"
  type        = list(string)
  default     = []
}

# Provider Configuration
variable "gemini_api_endpoint" {
  description = "Gemini API endpoint URL"
  type        = string
  default     = "https://generativelanguage.googleapis.com"
}

variable "seedream_api_endpoint" {
  description = "Seedream API endpoint URL"
  type        = string
  default     = "https://api.seedream.com"
}

variable "enable_stub_providers" {
  description = "Enable stub providers for testing"
  type        = bool
  default     = false
}

# VPC Configuration
variable "vpc_cidr" {
  description = "CIDR block for VPC"
  type        = string
  default     = "10.0.0.0/16"
}

variable "public_subnet_cidrs" {
  description = "CIDR blocks for public subnets"
  type        = list(string)
  default     = ["10.0.1.0/24", "10.0.2.0/24"]
}

variable "private_subnet_cidrs" {
  description = "CIDR blocks for private subnets"
  type        = list(string)
  default     = ["10.0.11.0/24", "10.0.12.0/24"]
}

variable "enable_nat_gateway" {
  description = "Enable NAT Gateway for private subnets"
  type        = bool
  default     = true
}

variable "enable_s3_endpoint" {
  description = "Enable S3 VPC endpoint"
  type        = bool
  default     = true
}

variable "enable_dynamodb_endpoint" {
  description = "Enable DynamoDB VPC endpoint"
  type        = bool
  default     = true
}
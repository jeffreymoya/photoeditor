variable "environment" {
  description = "Environment name (dev, stage, prod)"
  type        = string
}

variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "lambda_names" {
  description = "Map of Lambda function names"
  type = object({
    presign = string
    status  = string
    worker  = string
  })
}

variable "timeout" {
  description = "Lambda function timeout in seconds"
  type        = number
  default     = 300
}

variable "memory_size" {
  description = "Lambda function memory size in MB"
  type        = number
  default     = 1024
}

variable "reserved_concurrency" {
  description = "Reserved concurrency for Lambda functions"
  type        = number
  default     = 100
}

variable "enable_xray_tracing" {
  description = "Enable X-Ray tracing for Lambda functions"
  type        = bool
  default     = true
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 90
}

variable "kms_key_id" {
  description = "KMS key ID for encryption"
  type        = string
}

# Dependencies from other modules
variable "temp_bucket_name" {
  description = "Name of the temporary S3 bucket"
  type        = string
}

variable "final_bucket_name" {
  description = "Name of the final S3 bucket"
  type        = string
}

variable "jobs_table_name" {
  description = "Name of the DynamoDB jobs table"
  type        = string
}

variable "jobs_table_arn" {
  description = "ARN of the DynamoDB jobs table"
  type        = string
}

variable "queue_url" {
  description = "URL of the SQS queue"
  type        = string
}

variable "queue_arn" {
  description = "ARN of the SQS queue"
  type        = string
}

variable "dlq_arn" {
  description = "ARN of the SQS dead letter queue"
  type        = string
}

variable "sns_topic_arn" {
  description = "ARN of the SNS topic"
  type        = string
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
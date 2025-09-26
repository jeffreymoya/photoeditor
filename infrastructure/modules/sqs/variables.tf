variable "environment" {
  description = "Environment name (dev, stage, prod)"
  type        = string
}

variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "common_name" {
  description = "Common name prefix for resources"
  type        = string
}

variable "kms_key_id" {
  description = "KMS key ID for encryption"
  type        = string
}

variable "visibility_timeout" {
  description = "SQS message visibility timeout in seconds"
  type        = number
  default     = 900
}

variable "message_retention_days" {
  description = "Number of days to retain SQS messages"
  type        = number
  default     = 14
}

variable "max_receive_count" {
  description = "Maximum number of times a message can be received before moving to DLQ"
  type        = number
  default     = 3
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

variable "account_id" {
  description = "AWS account ID for resource naming"
  type        = string
}
variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "environment" {
  description = "Environment name"
  type        = string
}

variable "description" {
  description = "Description of the KMS key"
  type        = string
}

variable "deletion_window_in_days" {
  description = "Duration in days after which the key is deleted after destruction of the resource"
  type        = number
  default     = 7
}

variable "enable_key_rotation" {
  description = "Specifies whether key rotation is enabled"
  type        = bool
  default     = true
}

variable "alias_suffix" {
  description = "Suffix to add to the KMS alias"
  type        = string
  default     = ""
}

variable "key_policy" {
  description = "Custom key policy JSON document (optional)"
  type        = string
  default     = null
}

variable "allowed_services" {
  description = "List of AWS services allowed to use the KMS key"
  type        = list(string)
  default = [
    "lambda.amazonaws.com",
    "s3.amazonaws.com",
    "dynamodb.amazonaws.com",
    "sqs.amazonaws.com",
    "sns.amazonaws.com",
    "logs.amazonaws.com"
  ]
}

variable "tags" {
  description = "A map of tags to add to all resources"
  type        = map(string)
  default     = {}
}
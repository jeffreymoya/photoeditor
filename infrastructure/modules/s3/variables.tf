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

variable "account_id" {
  description = "AWS Account ID"
  type        = string
}

variable "kms_key_id" {
  description = "KMS key ID for encryption"
  type        = string
}

variable "temp_bucket_name" {
  description = "Name of the temporary S3 bucket"
  type        = string
}

variable "final_bucket_name" {
  description = "Name of the final S3 bucket"
  type        = string
}

variable "temp_retention_days" {
  description = "Number of days to retain temp files"
  type        = number
  default     = 2
}

variable "final_transition_days" {
  description = "Number of days before transitioning final files to IA"
  type        = number
  default     = 30
}

variable "abort_multipart_days" {
  description = "Number of days before aborting incomplete multipart uploads"
  type        = number
  default     = 7
}

variable "enable_lifecycle_configuration" {
  description = "Whether lifecycle rules should be configured on buckets"
  type        = bool
  default     = true
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}

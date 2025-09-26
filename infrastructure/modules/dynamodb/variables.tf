variable "environment" {
  description = "Environment name (dev, stage, prod)"
  type        = string
}

variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "table_name" {
  description = "Name of the DynamoDB table"
  type        = string
}

variable "billing_mode" {
  description = "DynamoDB billing mode"
  type        = string
  default     = "ON_DEMAND"

  validation {
    condition     = can(regex("^(ON_DEMAND|PROVISIONED)$", var.billing_mode))
    error_message = "Billing mode must be either ON_DEMAND or PROVISIONED."
  }
}

variable "ttl_days" {
  description = "Number of days to retain job records"
  type        = number
  default     = 90
}

variable "kms_key_id" {
  description = "KMS key ID for encryption"
  type        = string
}

variable "backup_retention_days" {
  description = "Number of days to retain backups"
  type        = number
  default     = 7
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
# Storage Module Variables
# Explicit input contract per standards/infrastructure-tier.md line 7

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string
  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be dev, staging, or production"
  }
}

variable "project_name" {
  description = "Project name for resource naming"
  type        = string
}

variable "common_name" {
  description = "Common name prefix for all resources (typically project-environment)"
  type        = string
}

variable "device_token_table_name" {
  description = "Name for the device token DynamoDB table"
  type        = string
}

variable "billing_mode" {
  description = "DynamoDB billing mode (PAY_PER_REQUEST or PROVISIONED)"
  type        = string
  default     = "PAY_PER_REQUEST"
  validation {
    condition     = contains(["PAY_PER_REQUEST", "PROVISIONED"], var.billing_mode)
    error_message = "Billing mode must be PAY_PER_REQUEST or PROVISIONED"
  }
}

variable "kms_key_arn" {
  description = "ARN of KMS key for DynamoDB encryption"
  type        = string
}

variable "tags" {
  description = "Common tags to apply to all resources (must include Project, Env, Owner, CostCenter per standards/global.md line 18)"
  type        = map(string)
  default     = {}
  validation {
    condition = (
      contains(keys(var.tags), "Project") &&
      contains(keys(var.tags), "Env") &&
      contains(keys(var.tags), "Owner") &&
      contains(keys(var.tags), "CostCenter")
    )
    error_message = "Tags must include Project, Env, Owner, and CostCenter (standards/global.md line 18)"
  }
}

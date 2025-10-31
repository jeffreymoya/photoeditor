/**
 * KMS Key Module - Variables
 *
 * Input contract for KMS key module.
 * Standards: infrastructure-tier.md L7 (input/output contracts)
 */

variable "project" {
  description = "Project name for resource naming and tagging"
  type        = string

  validation {
    condition     = length(var.project) > 0
    error_message = "Project name must not be empty."
  }
}

variable "environment" {
  description = "Environment name (dev, staging, production)"
  type        = string

  validation {
    condition     = contains(["dev", "staging", "production"], var.environment)
    error_message = "Environment must be one of: dev, staging, production."
  }
}

variable "description" {
  description = "Description for the KMS key"
  type        = string
}

variable "deletion_window_in_days" {
  description = "Duration in days before the key is deleted after destruction"
  type        = number
  default     = 7

  validation {
    condition     = var.deletion_window_in_days >= 7 && var.deletion_window_in_days <= 30
    error_message = "Deletion window must be between 7 and 30 days."
  }
}

variable "owner" {
  description = "Owner tag for cost allocation"
  type        = string
  default     = "DevTeam"
}

variable "cost_center" {
  description = "Cost center tag for billing"
  type        = string
  default     = "Engineering"
}

variable "additional_tags" {
  description = "Additional tags to apply to the KMS key"
  type        = map(string)
  default     = {}
}

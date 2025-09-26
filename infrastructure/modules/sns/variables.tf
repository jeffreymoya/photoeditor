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

variable "ios_certificate_arn" {
  description = "ARN of the iOS APNS certificate (optional)"
  type        = string
  default     = ""
}

variable "android_api_key" {
  description = "FCM API key for Android push notifications (optional)"
  type        = string
  default     = ""
  sensitive   = true
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
variable "environment" {
  description = "Environment name (dev, stage, prod)"
  type        = string
}

variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "api_name" {
  description = "Name of the API Gateway"
  type        = string
}

variable "throttle_rate_limit" {
  description = "API Gateway throttling rate limit (requests per second)"
  type        = number
  default     = 10000
}

variable "throttle_burst_limit" {
  description = "API Gateway throttling burst limit"
  type        = number
  default     = 20000
}

variable "log_retention_days" {
  description = "CloudWatch log retention in days"
  type        = number
  default     = 90
}

# Lambda function references
variable "presign_function_arn" {
  description = "ARN of the presign Lambda function"
  type        = string
}

variable "presign_function_name" {
  description = "Name of the presign Lambda function"
  type        = string
}

variable "status_function_arn" {
  description = "ARN of the status Lambda function"
  type        = string
}

variable "status_function_name" {
  description = "Name of the status Lambda function"
  type        = string
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
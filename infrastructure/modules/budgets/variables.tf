variable "environment" {
  description = "Environment name (dev, stage, prod)"
  type        = string
}

variable "project_name" {
  description = "Name of the project"
  type        = string
}

variable "monthly_limit" {
  description = "Monthly budget limit in USD"
  type        = number
  default     = 100

  validation {
    condition     = var.monthly_limit > 0
    error_message = "Monthly budget limit must be greater than 0."
  }
}

variable "notification_emails" {
  description = "List of email addresses for budget notifications"
  type        = list(string)
  default     = []

  validation {
    condition = alltrue([
      for email in var.notification_emails : can(regex("^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}$", email))
    ])
    error_message = "All notification emails must be valid email addresses."
  }
}

variable "tags" {
  description = "Tags to apply to resources"
  type        = map(string)
  default     = {}
}
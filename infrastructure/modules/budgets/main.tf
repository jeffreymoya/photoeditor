# AWS Budgets for Cost Management

# Main budget for the entire project
resource "aws_budgets_budget" "project_budget" {
  name              = "${var.project_name}-${var.environment}-monthly-budget"
  budget_type       = "COST"
  limit_amount      = tostring(var.monthly_limit)
  limit_unit        = "USD"
  time_unit         = "MONTHLY"
  time_period_start = "2025-01-01_00:00"

  # Notification when 80% of budget is exceeded
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 80
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.notification_emails
  }

  # Notification when 100% of budget is exceeded
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 100
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.notification_emails
  }

  # Forecasted notification at 90%
  dynamic "notification" {
    for_each = length(var.notification_emails) > 0 ? [1] : []
    content {
      comparison_operator        = "GREATER_THAN"
      threshold                  = 90
      threshold_type             = "PERCENTAGE"
      notification_type          = "FORECASTED"
      subscriber_email_addresses = var.notification_emails
    }
  }

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-monthly-budget"
    Purpose     = "cost-management"
    Environment = var.environment
  })
}

# Daily budget to catch unexpected spikes early
resource "aws_budgets_budget" "daily_budget" {
  name              = "${var.project_name}-${var.environment}-daily-budget"
  budget_type       = "COST"
  limit_amount      = tostring(var.monthly_limit / 30) # Daily limit
  limit_unit        = "USD"
  time_unit         = "DAILY"
  time_period_start = "2025-01-01_00:00"

  # Alert when daily spend exceeds expected
  notification {
    comparison_operator        = "GREATER_THAN"
    threshold                  = 150 # 150% of expected daily spend
    threshold_type             = "PERCENTAGE"
    notification_type          = "ACTUAL"
    subscriber_email_addresses = var.notification_emails
  }

  tags = merge(var.tags, {
    Name        = "${var.project_name}-${var.environment}-daily-budget"
    Purpose     = "daily-cost-management"
    Environment = var.environment
  })
}
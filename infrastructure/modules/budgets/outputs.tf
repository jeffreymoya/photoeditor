output "project_budget_name" {
  description = "Name of the main project budget"
  value       = aws_budgets_budget.project_budget.name
}

output "project_budget_arn" {
  description = "ARN of the main project budget"
  value       = aws_budgets_budget.project_budget.arn
}

output "daily_budget_name" {
  description = "Name of the daily budget"
  value       = aws_budgets_budget.daily_budget.name
}

output "budget_summary" {
  description = "Summary of all created budgets"
  value = {
    total_monthly_limit = var.monthly_limit
    daily_limit         = var.monthly_limit / 30
    notification_emails = length(var.notification_emails)
  }
}
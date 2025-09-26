output "presign_function_name" {
  description = "Name of the presign Lambda function"
  value       = aws_lambda_function.presign.function_name
}

output "presign_function_arn" {
  description = "ARN of the presign Lambda function"
  value       = aws_lambda_function.presign.arn
}

output "presign_function_invoke_arn" {
  description = "Invoke ARN of the presign Lambda function"
  value       = aws_lambda_function.presign.invoke_arn
}

output "status_function_name" {
  description = "Name of the status Lambda function"
  value       = aws_lambda_function.status.function_name
}

output "status_function_arn" {
  description = "ARN of the status Lambda function"
  value       = aws_lambda_function.status.arn
}

output "status_function_invoke_arn" {
  description = "Invoke ARN of the status Lambda function"
  value       = aws_lambda_function.status.invoke_arn
}

output "worker_function_name" {
  description = "Name of the worker Lambda function"
  value       = aws_lambda_function.worker.function_name
}

output "worker_function_arn" {
  description = "ARN of the worker Lambda function"
  value       = aws_lambda_function.worker.arn
}

output "lambda_roles" {
  description = "ARNs of the Lambda execution roles"
  value = {
    presign = aws_iam_role.presign_lambda_role.arn
    status  = aws_iam_role.status_lambda_role.arn
    worker  = aws_iam_role.worker_lambda_role.arn
  }
}
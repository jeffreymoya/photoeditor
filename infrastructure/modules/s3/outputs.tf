output "temp_bucket_name" {
  description = "Name of the temporary S3 bucket"
  value       = aws_s3_bucket.temp.bucket
}

output "temp_bucket_id" {
  description = "ID of the temporary S3 bucket"
  value       = aws_s3_bucket.temp.id
}

output "temp_bucket_arn" {
  description = "ARN of the temporary S3 bucket"
  value       = aws_s3_bucket.temp.arn
}

output "temp_bucket_domain_name" {
  description = "Domain name of the temporary S3 bucket"
  value       = aws_s3_bucket.temp.bucket_domain_name
}

output "final_bucket_name" {
  description = "Name of the final S3 bucket"
  value       = aws_s3_bucket.final.bucket
}

output "final_bucket_id" {
  description = "ID of the final S3 bucket"
  value       = aws_s3_bucket.final.id
}

output "final_bucket_arn" {
  description = "ARN of the final S3 bucket"
  value       = aws_s3_bucket.final.arn
}

output "final_bucket_domain_name" {
  description = "Domain name of the final S3 bucket"
  value       = aws_s3_bucket.final.bucket_domain_name
}

output "access_logs_bucket_name" {
  description = "Name of the access logs S3 bucket"
  value       = aws_s3_bucket.access_logs.bucket
}

output "access_logs_bucket_arn" {
  description = "ARN of the access logs S3 bucket"
  value       = aws_s3_bucket.access_logs.arn
}
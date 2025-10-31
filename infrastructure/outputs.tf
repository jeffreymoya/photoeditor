/**
 * PhotoEditor Infrastructure - Outputs
 *
 * Output values for environment registry and SST consumption.
 * Standards: infrastructure-tier.md L12 (environment registry exports)
 */

output "environment" {
  description = "Deployed environment name"
  value       = var.environment
}

output "region" {
  description = "AWS region"
  value       = var.aws_region
}

# Future module outputs will be exported here
# Example:
# output "kms_key_id" {
#   description = "KMS key ID for encryption"
#   value       = module.kms.key_id
# }

# output "temp_bucket_name" {
#   description = "Temporary uploads bucket name"
#   value       = module.temp_bucket.bucket_name
# }

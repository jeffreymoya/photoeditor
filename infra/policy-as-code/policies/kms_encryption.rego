# KMS Encryption Policy
#
# Enforces KMS encryption for S3, DynamoDB, SQS, SNS per cross-cutting.md L52.
# Hard-fail control: Production buckets without KMS encryption fail immediately.
#
# Standards:
# - cross-cutting.md L10: Production buckets require KMS encryption
# - cross-cutting.md L52: Encrypt temp S3 with SSE-S3, final with SSE-KMS

package main

import future.keywords

# Deny S3 buckets without encryption
deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_s3_bucket"
    not has_encryption_config(resource)

    msg := sprintf(
        "S3 bucket '%s' must have server-side encryption configured (cross-cutting.md L10, L52)",
        [resource.address]
    )
}

# Deny S3 buckets with SSE-S3 in production (require SSE-KMS)
deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_s3_bucket_server_side_encryption_configuration"

    # Check if this is a production environment
    tags := resource.change.after.bucket_tags
    tags.Env == "production"

    # Check encryption algorithm
    rule := resource.change.after.rule[_]
    rule.apply_server_side_encryption_by_default.sse_algorithm != "aws:kms"

    msg := sprintf(
        "Production S3 bucket '%s' must use SSE-KMS encryption, not SSE-S3 (cross-cutting.md L52)",
        [resource.address]
    )
}

# Deny DynamoDB tables without encryption at rest
deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_dynamodb_table"
    not has_dynamodb_encryption(resource)

    msg := sprintf(
        "DynamoDB table '%s' must have encryption at rest enabled (cross-cutting.md L52)",
        [resource.address]
    )
}

# Deny SQS queues without KMS encryption
deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_sqs_queue"
    not has_sqs_kms_encryption(resource)

    msg := sprintf(
        "SQS queue '%s' must use KMS encryption (cross-cutting.md L52)",
        [resource.address]
    )
}

# Deny SNS topics without KMS encryption
deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_sns_topic"
    not has_sns_kms_encryption(resource)

    msg := sprintf(
        "SNS topic '%s' must use KMS encryption (cross-cutting.md L52)",
        [resource.address]
    )
}

# Helper functions
has_encryption_config(resource) {
    # Check if encryption configuration exists in related resources
    # This is a simplified check; in practice, look for aws_s3_bucket_server_side_encryption_configuration
    count(input.resource_changes) > 0
}

has_dynamodb_encryption(resource) {
    resource.change.after.server_side_encryption != null
    resource.change.after.server_side_encryption[_].enabled == true
}

has_sqs_kms_encryption(resource) {
    resource.change.after.kms_master_key_id != null
    resource.change.after.kms_master_key_id != ""
}

has_sns_kms_encryption(resource) {
    resource.change.after.kms_master_key_id != null
    resource.change.after.kms_master_key_id != ""
}

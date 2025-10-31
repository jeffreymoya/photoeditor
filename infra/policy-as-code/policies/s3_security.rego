# S3 Security Policy
#
# Enforces S3 security best practices per cross-cutting.md L10.
# Hard-fail control: Public access blocks required on all buckets.
#
# Standards:
# - cross-cutting.md L10: Block-public-access controls required
# - infrastructure-tier.md L27: Temp bucket 48h expiry, final bucket versioning
# - infrastructure-tier.md L28: Multipart cleanup after 7 days

package main

import future.keywords

# Deny S3 buckets without public access block
deny[msg] {
    bucket := input.resource_changes[_]
    bucket.type == "aws_s3_bucket"

    # Check if corresponding public access block exists
    bucket_name := bucket.change.after.bucket
    not has_public_access_block(bucket_name)

    msg := sprintf(
        "S3 bucket '%s' must have public access block configured (cross-cutting.md L10)",
        [bucket.address]
    )
}

# Deny public access blocks that don't block everything
deny[msg] {
    pab := input.resource_changes[_]
    pab.type == "aws_s3_bucket_public_access_block"

    not all_blocks_enabled(pab)

    msg := sprintf(
        "S3 bucket public access block '%s' must enable all four settings (cross-cutting.md L10)",
        [pab.address]
    )
}

# Warn on temp buckets without lifecycle expiration
warn[msg] {
    bucket := input.resource_changes[_]
    bucket.type == "aws_s3_bucket"

    # Check if this is a temp bucket
    tags := object.get(bucket.change.after, "tags", {})
    contains(lower(tags.Purpose), "temp")

    # Check if lifecycle rule exists
    bucket_name := bucket.change.after.bucket
    not has_lifecycle_expiration(bucket_name)

    msg := sprintf(
        "Temp S3 bucket '%s' should have 48h lifecycle expiration (infrastructure-tier.md L27)",
        [bucket.address]
    )
}

# Warn on final buckets without versioning
warn[msg] {
    bucket := input.resource_changes[_]
    bucket.type == "aws_s3_bucket"

    # Check if this is a final/assets bucket
    tags := object.get(bucket.change.after, "tags", {})
    contains(lower(tags.Purpose), "final")

    # Check if versioning is enabled
    not has_versioning_enabled(bucket)

    msg := sprintf(
        "Final assets bucket '%s' should have versioning enabled (infrastructure-tier.md L27)",
        [bucket.address]
    )
}

# Helper functions
has_public_access_block(bucket_name) {
    pab := input.resource_changes[_]
    pab.type == "aws_s3_bucket_public_access_block"
    pab.change.after.bucket == bucket_name
}

all_blocks_enabled(pab) {
    pab.change.after.block_public_acls == true
    pab.change.after.block_public_policy == true
    pab.change.after.ignore_public_acls == true
    pab.change.after.restrict_public_buckets == true
}

has_lifecycle_expiration(bucket_name) {
    lifecycle := input.resource_changes[_]
    lifecycle.type == "aws_s3_bucket_lifecycle_configuration"
    lifecycle.change.after.bucket == bucket_name

    # Check for expiration rule
    rule := lifecycle.change.after.rule[_]
    rule.expiration != null
}

has_versioning_enabled(bucket) {
    versioning := bucket.change.after.versioning
    versioning != null
    versioning[_].enabled == true
}

# String helper
# Note: OPA has built-in lower() and contains() functions

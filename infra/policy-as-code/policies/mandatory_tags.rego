# Mandatory Tags Policy
#
# Enforces mandatory cost tags on all cloud resources per cross-cutting.md L11.
# Hard-fail control: Resources without required tags block promotion.
#
# Standards:
# - cross-cutting.md L11: Project, Env, Owner, CostCenter tags required

package main

import future.keywords

# List of resources that must have tags
taggable_resources := {
    "aws_s3_bucket",
    "aws_dynamodb_table",
    "aws_sqs_queue",
    "aws_sns_topic",
    "aws_kms_key",
    "aws_lambda_function",
    "aws_cloudwatch_log_group",
    "aws_cloudwatch_metric_alarm"
}

# Required tags per cross-cutting.md L11
required_tags := {"Project", "Env", "Owner", "CostCenter"}

# Deny resources without all required tags
deny[msg] {
    resource := input.resource_changes[_]
    taggable_resources[resource.type]

    # Get tags from resource
    tags := object.get(resource.change.after, "tags", {})

    # Find missing tags
    missing := required_tags - {tag | tags[tag]}
    count(missing) > 0

    msg := sprintf(
        "Resource '%s' of type '%s' is missing required tags: %v (cross-cutting.md L11)",
        [resource.address, resource.type, missing]
    )
}

# Warn on empty tag values
warn[msg] {
    resource := input.resource_changes[_]
    taggable_resources[resource.type]

    tags := object.get(resource.change.after, "tags", {})

    # Check for empty tag values
    tag_name := required_tags[_]
    value := tags[tag_name]
    value == ""

    msg := sprintf(
        "Resource '%s' has empty value for required tag '%s' (cross-cutting.md L11)",
        [resource.address, tag_name]
    )
}

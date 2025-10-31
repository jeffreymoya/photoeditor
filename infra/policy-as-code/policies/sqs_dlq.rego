# SQS DLQ Policy
#
# Enforces SQS queue DLQ configuration per cross-cutting.md L25.
# Hard-fail control: DLQ configuration required with documented redrive procedures.
#
# Standards:
# - cross-cutting.md L25: DLQ configuration and redrive drills must remain green
# - infrastructure-tier.md L32: SQS queues pair with DLQs, maxReceiveCount ≤3

package main

import future.keywords

# Deny SQS queues without DLQ configuration (except DLQs themselves)
deny[msg] {
    queue := input.resource_changes[_]
    queue.type == "aws_sqs_queue"

    # Skip if this is a DLQ itself
    not is_dlq(queue)

    # Check if redrive policy exists
    not has_redrive_policy(queue)

    msg := sprintf(
        "SQS queue '%s' must have DLQ configured via redrive_policy (cross-cutting.md L25, infrastructure-tier.md L32)",
        [queue.address]
    )
}

# Deny DLQ configurations with maxReceiveCount > 3
deny[msg] {
    queue := input.resource_changes[_]
    queue.type == "aws_sqs_queue"

    redrive_policy := queue.change.after.redrive_policy
    redrive_policy != null

    # Parse redrive policy JSON
    policy := json.unmarshal(redrive_policy)
    max_receive_count := to_number(policy.maxReceiveCount)
    max_receive_count > 3

    msg := sprintf(
        "SQS queue '%s' has maxReceiveCount=%d, must be ≤3 (infrastructure-tier.md L32)",
        [queue.address, max_receive_count]
    )
}

# Warn on queues without long polling
warn[msg] {
    queue := input.resource_changes[_]
    queue.type == "aws_sqs_queue"

    receive_wait_time := queue.change.after.receive_wait_time_seconds
    receive_wait_time < 20

    msg := sprintf(
        "SQS queue '%s' should use 20-second long polling (infrastructure-tier.md L32)",
        [queue.address]
    )
}

# Warn on queues with visibility timeout not 6x average processing time
warn[msg] {
    queue := input.resource_changes[_]
    queue.type == "aws_sqs_queue"

    visibility_timeout := queue.change.after.visibility_timeout_seconds

    # Reasonable range: 30s to 360s (assuming 5s to 60s average processing)
    visibility_timeout < 30

    msg := sprintf(
        "SQS queue '%s' has low visibility timeout (%ds), should be 6x average processing time (infrastructure-tier.md L32)",
        [queue.address, visibility_timeout]
    )
}

# Helper functions
is_dlq(queue) {
    tags := object.get(queue.change.after, "tags", {})
    contains(lower(tags.Name), "dlq")
}

has_redrive_policy(queue) {
    queue.change.after.redrive_policy != null
    queue.change.after.redrive_policy != ""
}

# String helpers
# Note: OPA has built-in lower() and contains() functions

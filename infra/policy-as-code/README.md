# Policy-as-Code for PhotoEditor Infrastructure

OPA/Conftest policies enforcing infrastructure standards per `standards/infrastructure-tier.md` L21 and `standards/cross-cutting.md`.

## Overview

This directory contains Rego policies that validate Terraform plans against PhotoEditor infrastructure standards. Policies enforce hard-fail controls and provide warnings for best practices.

## Standards Compliance

These policies enforce:

- **cross-cutting.md L10**: Production buckets require KMS encryption and block-public-access
- **cross-cutting.md L11**: Mandatory tags (Project, Env, Owner, CostCenter)
- **cross-cutting.md L25**: SQS DLQ configuration with maxReceiveCount ≤3
- **cross-cutting.md L52**: KMS encryption for S3, DynamoDB, SQS, SNS
- **infrastructure-tier.md L27**: Temp bucket 48h expiry, final bucket versioning
- **infrastructure-tier.md L28**: Multipart cleanup after 7 days
- **infrastructure-tier.md L32**: SQS long polling (20s) and visibility timeout (6x processing time)

## Policy Files

### Hard-Fail Policies (deny)

1. **kms_encryption.rego** - Enforces KMS encryption on stateful resources
   - S3 buckets must have server-side encryption
   - Production S3 buckets must use SSE-KMS (not SSE-S3)
   - DynamoDB tables must have encryption at rest
   - SQS queues must use KMS encryption
   - SNS topics must use KMS encryption

2. **mandatory_tags.rego** - Enforces required cost tags
   - All taggable resources must have: Project, Env, Owner, CostCenter
   - Empty tag values trigger warnings

3. **s3_security.rego** - Enforces S3 security best practices
   - All S3 buckets must have public access block
   - Public access block must enable all four settings
   - Temp buckets should have 48h lifecycle expiration (warning)
   - Final buckets should have versioning enabled (warning)

4. **sqs_dlq.rego** - Enforces SQS DLQ configuration
   - All SQS queues (except DLQs) must have redrive policy
   - maxReceiveCount must be ≤3
   - Long polling should be 20 seconds (warning)
   - Visibility timeout should be appropriate (warning)

### Warning Policies (warn)

Warnings highlight potential issues but don't block deployment:
- Empty tag values
- Missing lifecycle rules on temp buckets
- Missing versioning on final buckets
- Suboptimal SQS queue configurations

## Usage

### Prerequisites

Install Conftest:

```bash
# macOS
brew install conftest

# Linux
curl -L -o conftest.tar.gz https://github.com/open-policy-agent/conftest/releases/download/v0.45.0/conftest_0.45.0_Linux_x86_64.tar.gz
tar xzf conftest.tar.gz
sudo mv conftest /usr/local/bin/
```

### Local Validation

```bash
# Generate Terraform plan in JSON format
cd infrastructure
terraform init
terraform plan -out=tfplan
terraform show -json tfplan > tfplan.json

# Run Conftest policies
conftest test tfplan.json --policy ../infra/policy-as-code/policies

# Or run from repository root
conftest test infrastructure/tfplan.json --policy infra/policy-as-code/policies
```

### CI Integration

Policies run automatically in CI via `.github/workflows/terraform.yml`:

```yaml
- name: Policy Validation
  run: |
    terraform show -json tfplan > tfplan.json
    conftest test tfplan.json --policy ../infra/policy-as-code/policies
```

### Expected Output

**Success (no violations)**:
```
PASS - tfplan.json
```

**Failure (policy violations)**:
```
FAIL - tfplan.json
  S3 bucket 'aws_s3_bucket.example' must have public access block configured (cross-cutting.md L10)
  Resource 'aws_sqs_queue.example' is missing required tags: ["CostCenter", "Owner"] (cross-cutting.md L11)
```

**Warnings**:
```
WARN - tfplan.json
  Temp S3 bucket 'aws_s3_bucket.temp' should have 48h lifecycle expiration (infrastructure-tier.md L27)
```

## Policy Development

### Adding New Policies

1. Create a new `.rego` file in `policies/` directory
2. Use package name `main`
3. Define `deny` rules for hard-fail controls
4. Define `warn` rules for best practices
5. Include standards citations in comments and error messages

Example template:

```rego
# Policy Name
#
# Description of what this policy enforces.
#
# Standards:
# - cross-cutting.md LXX: Specific requirement
# - infrastructure-tier.md LYY: Another requirement

package main

import future.keywords

# Deny [description]
deny[msg] {
    resource := input.resource_changes[_]
    resource.type == "aws_resource_type"

    # Check condition
    not meets_requirement(resource)

    msg := sprintf(
        "Resource '%s' must meet requirement (standards-file.md LXX)",
        [resource.address]
    )
}

# Helper functions
meets_requirement(resource) {
    # Implementation
    resource.change.after.property == expected_value
}
```

### Testing Policies

Create test fixtures in `tests/` directory (future enhancement):

```bash
# Run policy tests
conftest verify --policy policies/ --data tests/
```

## Maintenance

### Policy Updates

When updating policies:
1. Reference the exact standards clause being enforced
2. Update standards citations if requirements change
3. Test with sample Terraform plans before merging
4. Document breaking changes in PR description

### Standards Changes

If standards change (via Standards CR):
1. Update affected policy files
2. Update standards citations in comments and messages
3. Add migration notes for any breaking changes
4. Link Standards CR task in commit message

## References

- **Standards**: `standards/infrastructure-tier.md`, `standards/cross-cutting.md`
- **Terraform Config**: `infrastructure/`
- **CI Workflow**: `.github/workflows/terraform.yml`
- **Evidence Bundle**: `docs/infra/terraform-control-plane-evidence.md`
- **Conftest Docs**: https://www.conftest.dev/
- **OPA Docs**: https://www.openpolicyagent.org/docs/latest/

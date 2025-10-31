# KMS Key Module

Terraform module for creating customer-managed KMS keys with automatic rotation.

## Version

**Current Version**: 1.0.0

See [CHANGELOG.md](./CHANGELOG.md) for version history.

## Standards Compliance

- **infrastructure-tier.md L7**: Versioned modules with input/output contracts
- **cross-cutting.md L52**: KMS encryption for S3, DynamoDB, SQS, SNS
- **ADR-0008**: Module reuse for SST/Terraform parity

## Features

- Automatic key rotation enabled
- Configurable deletion window (7-30 days)
- Mandatory cost tags (Project, Env, Owner, CostCenter)
- KMS alias for easy key reference
- SYMMETRIC_DEFAULT key spec for general-purpose encryption

## Usage

```hcl
module "kms" {
  source = "./modules/kms"

  project     = "PhotoEditor"
  environment = "dev"
  description = "PhotoEditor dev environment encryption key"

  deletion_window_in_days = 7
  owner                   = "DevTeam"
  cost_center             = "Engineering"

  additional_tags = {
    Purpose = "DataEncryption"
  }
}
```

## Inputs

| Name | Description | Type | Default | Required |
|------|-------------|------|---------|----------|
| project | Project name for resource naming and tagging | string | n/a | yes |
| environment | Environment name (dev, staging, production) | string | n/a | yes |
| description | Description for the KMS key | string | n/a | yes |
| deletion_window_in_days | Duration in days before key deletion (7-30) | number | 7 | no |
| owner | Owner tag for cost allocation | string | "DevTeam" | no |
| cost_center | Cost center tag for billing | string | "Engineering" | no |
| additional_tags | Additional tags to apply | map(string) | {} | no |

## Outputs

| Name | Description |
|------|-------------|
| key_id | KMS key ID |
| key_arn | KMS key ARN |
| alias_name | KMS key alias name |
| alias_arn | KMS key alias ARN |

## SST Integration

To consume this module in SST stacks:

```typescript
// Option 1: Terraform data source
const kmsKey = new aws.kms.Key("PhotoEditorKey", {
  // Reference Terraform-managed key
  keyId: terraform.getOutput("kms_key_id")
});

// Option 2: Direct module import (when SST Terraform provider matures)
// See ADR-0008 for implementation details
```

## Validation

```bash
# Format check
terraform fmt -check

# Validate configuration
terraform validate

# Plan
terraform plan
```

## References

- **ADR-0008**: SST Parity with Terraform Modules
- **Standards**: infrastructure-tier.md, cross-cutting.md
- **SST Parity Checklist**: docs/infra/sst-parity-checklist.md

# PhotoEditor Infrastructure

Terraform control plane for PhotoEditor infrastructure management.

## Overview

This directory contains the Terraform configuration and modules for PhotoEditor infrastructure. Per ADR-0008, SST stacks (in `infra/sst/`) handle local development and rapid iteration, while Terraform provides the production-grade control plane with versioned modules, policy enforcement, and drift detection.

**Current State**: Phase 2 - Terraform modules defined but SST stacks still provision resources inline. See `docs/infra/sst-parity-checklist.md` for migration status.

## Standards Compliance

This infrastructure configuration enforces:

- **infrastructure-tier.md L5-12**: SST parity with Terraform modules
- **infrastructure-tier.md L7**: Versioned modules with published changelogs
- **infrastructure-tier.md L19-23**: Fitness gates (validate, plan, drift detection, policy enforcement)
- **cross-cutting.md L10**: Production buckets require KMS encryption
- **cross-cutting.md L11**: Mandatory cost tags (Project, Env, Owner, CostCenter)
- **cross-cutting.md L25**: DLQ configuration for SQS
- **cross-cutting.md L47**: CloudWatch alarms for observability

## Directory Structure

```
infrastructure/
├── main.tf              # Root configuration
├── variables.tf         # Input variables
├── outputs.tf           # Exported values for environment registry
├── .terraform-version   # Terraform version constraint
├── modules/             # Reusable Terraform modules
│   └── kms/            # KMS key module (v1.0.0)
└── README.md           # This file
```

**Note**: Additional modules (s3-bucket, dynamodb-table, sqs-queue, sns-topic, cloudwatch-log-group, cloudwatch-alarm) are planned for Phase 2 but not yet implemented.

## Module Catalog

### Implemented Modules

1. **kms** (v1.0.0) - Customer-managed KMS keys with rotation

### Planned Modules (Phase 2)

2. **s3-bucket** - S3 buckets with encryption, lifecycle rules, block-public-access
3. **dynamodb-table** - DynamoDB tables with PITR, streams, TTL, on-demand billing
4. **sqs-queue** - SQS queues with DLQ, long-polling, KMS encryption
5. **sns-topic** - SNS topics with KMS encryption
6. **cloudwatch-log-group** - Log groups with retention policies
7. **cloudwatch-alarm** - CloudWatch alarms for observability

See `docs/infra/sst-parity-checklist.md` for detailed module specifications.

## Usage

### Prerequisites

- Terraform >= 1.9.0 (use tfenv: `tfenv install`)
- AWS CLI configured with appropriate credentials
- Conftest (for policy-as-code validation)

### Validation

```bash
# Format check
terraform fmt -check -recursive

# Validate configuration
terraform validate

# Generate plan
terraform plan -out=tfplan

# Convert plan to JSON for policy validation
terraform show -json tfplan > tfplan.json

# Policy validation (OPA/Conftest)
conftest test tfplan.json --policy ../infra/policy-as-code/policies
```

### Deployment

```bash
# Initialize Terraform
terraform init

# Plan changes
terraform plan -var="environment=dev"

# Apply changes (with approval)
terraform apply -var="environment=dev"
```

### Drift Detection

Weekly drift detection runs automatically via GitHub Actions. See `.github/workflows/terraform.yml` for configuration.

Manual drift check:

```bash
# Generate current plan
terraform plan -out=drift-check.tfplan

# Compare with deployed state
terraform show drift-check.tfplan
```

## CI/CD Integration

Terraform validation and policy checks run automatically on every PR touching infrastructure files. See `.github/workflows/terraform.yml` for details.

### Required Checks

- `terraform fmt` - Code formatting
- `terraform validate` - Configuration validation
- `conftest test` - Policy-as-code validation
- Plan generation (read-only)

### Weekly Automation

- Drift detection with reports uploaded to `docs/infra/drift/`
- Dependency updates via Renovate

## Environment Registry

Terraform outputs are exported to the environment registry for SST consumption. See `docs/infra/terraform-control-plane-evidence.md` for registry documentation.

## Migration from SST

SST stacks currently provision resources inline. The migration to Terraform modules follows ADR-0008:

1. **Phase 1** (Complete): SST inline provisioning with standards compliance
2. **Phase 2** (Current): Extract shared infrastructure into Terraform modules
3. **Phase 3** (Future): SST imports Terraform modules, full parity achieved

See `docs/infra/sst-parity-checklist.md` for detailed migration status and follow-up tasks.

## References

- **ADR-0008**: SST Parity with Terraform Modules (`adr/0008-sst-parity.md`)
- **Standards**: Infrastructure Tier (`standards/infrastructure-tier.md`)
- **Standards**: Cross-Cutting Controls (`standards/cross-cutting.md`)
- **Parity Checklist**: `docs/infra/sst-parity-checklist.md`
- **Evidence Documentation**: `docs/infra/terraform-control-plane-evidence.md`

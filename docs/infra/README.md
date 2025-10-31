# Infrastructure Documentation

Documentation for PhotoEditor infrastructure management, control plane, and compliance evidence.

## Overview

PhotoEditor uses a hybrid infrastructure approach per ADR-0008:

- **SST**: Local development and rapid iteration
- **Terraform**: Production control plane with versioned modules
- **Policy-as-Code**: OPA/Conftest policies enforcing standards

## Key Documents

### Control Plane & Compliance

- **[Terraform Control Plane Evidence](./terraform-control-plane-evidence.md)** - Compliance evidence for fitness gates (infrastructure-tier.md L19-23)
  - Validation commands and workflows
  - Policy packages and enforcement
  - Drift detection and reporting
  - Evidence bundle contents

- **[SST Parity Checklist](./sst-parity-checklist.md)** - ADR-0008 implementation tracker
  - Parity matrix (SST vs Terraform)
  - Standards compliance summary
  - Migration status (Phase 1 → Phase 2 → Phase 3)
  - Module specifications

- **[Drift Reports](./drift/)** - Weekly infrastructure drift detection
  - Automated reports (every Monday)
  - Manual drift check instructions
  - Resolution workflow

## Standards Compliance

### Infrastructure Tier (standards/infrastructure-tier.md)

- **L5-12**: SST parity ADR and migration strategy → ADR-0008
- **L7**: Versioned modules with input/output contracts → `infrastructure/modules/`
- **L19-23**: Fitness gates → `.github/workflows/terraform.yml`
- **L20**: Weekly drift detection → `docs/infra/drift/`
- **L21**: Policy-as-code → `infra/policy-as-code/`

### Cross-Cutting Controls (standards/cross-cutting.md)

- **L10**: KMS encryption and block-public-access
- **L11**: Mandatory tags (Project, Env, Owner, CostCenter)
- **L25**: SQS DLQ configuration
- **L52**: KMS encryption for S3, DynamoDB, SQS, SNS

## Architecture Overview

### Current State (Phase 2)

```
┌─────────────────────────────────────────────┐
│         SST Stacks (Dev Environment)        │
│  - inline resource provisioning             │
│  - standards compliance enforced            │
│  - rapid development loop                   │
└─────────────┬───────────────────────────────┘
              │
              │ (Future: Import modules)
              │
┌─────────────▼───────────────────────────────┐
│      Terraform Modules (Control Plane)      │
│  - versioned infrastructure components      │
│  - KMS, S3, DynamoDB, SQS, SNS, CW          │
│  - policy enforcement via Conftest          │
└─────────────┬───────────────────────────────┘
              │
              │ Drift Detection (Weekly)
              │
┌─────────────▼───────────────────────────────┐
│         AWS Infrastructure (Dev)            │
│  - S3 buckets (temp/final)                  │
│  - DynamoDB tables (jobs/batch/tokens)      │
│  - SQS queues + DLQ                         │
│  - SNS topics                               │
│  - Lambda functions                         │
│  - CloudWatch logs + alarms                 │
└─────────────────────────────────────────────┘
```

### Target State (Phase 3)

- SST stacks import Terraform modules
- Full parity between development and production environments
- Terraform modules as single source of truth for shared infrastructure
- SST composes modules with application-specific Lambda/API Gateway definitions

## Quick Start

### Terraform Validation

```bash
# Format check
cd infrastructure
terraform fmt -check -recursive

# Validate
terraform init -backend=false
terraform validate

# Generate plan
terraform plan -var="environment=dev" -out=tfplan

# Policy check
terraform show -json tfplan > tfplan.json
conftest test tfplan.json --policy ../infra/policy-as-code/policies
```

### SST Deployment

```bash
cd infra/sst
pnpm install
sst deploy --stage dev
```

### Drift Detection

```bash
# Manual trigger via GitHub CLI
gh workflow run terraform.yml --field drift_check_only=true

# Or check local drift
cd infrastructure
terraform init
terraform plan -var="environment=dev" -out=drift-check.tfplan
```

## CI/CD Integration

### GitHub Actions Workflows

- **`.github/workflows/terraform.yml`** - Terraform validation, policy checks, drift detection
  - Triggers: PR, push to main, weekly schedule (Monday 9 AM UTC)
  - Jobs: terraform-validate, policy-validation, drift-detection
  - Artifacts: Terraform plans (30-day retention), drift reports (indefinite)

### Validation Gates

1. **Format Check**: `terraform fmt -check -recursive`
2. **Validation**: `terraform validate`
3. **Plan Generation**: `terraform plan` (read-only)
4. **Policy Enforcement**: `conftest test` (OPA/Rego policies)
5. **Drift Detection**: Weekly automated + on-demand manual

## Migration Status

**Current Phase**: Phase 2 - Control Plane Established

✅ **Completed**:
- Terraform directory structure
- Sample KMS module (v1.0.0)
- Policy-as-code (4 policy packages)
- CI workflow for validation and drift detection
- Evidence documentation

⏳ **In Progress**:
- Remaining Terraform modules (S3, DynamoDB, SQS, SNS, CloudWatch)
- SST stack refactoring to consume modules
- Environment registry implementation

📅 **Planned**:
- Full SST/Terraform parity (Phase 3)
- Terraform state backend (S3 + DynamoDB locking)
- AWS OIDC authentication for drift detection

See [SST Parity Checklist](./sst-parity-checklist.md) for detailed roadmap.

## References

### Documentation
- **ADR-0008**: SST Parity with Terraform Modules (`adr/0008-sst-parity.md`)
- **Infrastructure README**: `infrastructure/README.md`
- **Policy README**: `infra/policy-as-code/README.md`
- **Drift README**: `docs/infra/drift/README.md`

### Standards
- **Infrastructure Tier**: `standards/infrastructure-tier.md`
- **Cross-Cutting Controls**: `standards/cross-cutting.md`
- **SSOT**: `standards/standards-governance-ssot.md`

### Tasks
- **TASK-0822**: SST ADR and module parity (completed)
- **TASK-0823**: Terraform control plane (current)
- **Future**: Module authoring and SST integration

---

**Last Updated**: 2025-10-31
**Maintained By**: Solo Developer / Infrastructure Lead

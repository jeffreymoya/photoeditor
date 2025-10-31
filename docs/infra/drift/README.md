# Infrastructure Drift Reports

This directory contains automated drift detection reports per `standards/infrastructure-tier.md` L20.

## Overview

Drift detection compares deployed AWS infrastructure against Terraform state to identify manual changes, out-of-band modifications, or parity gaps between SST and Terraform.

## Schedule

- **Frequency**: Weekly (every Monday at 9 AM UTC)
- **Automation**: GitHub Actions workflow (`.github/workflows/terraform.yml`)
- **Environment**: Dev environment (SST-provisioned resources)

## Standards Compliance

- **infrastructure-tier.md L20**: Weekly drift check with reports uploaded to `docs/infra/drift`
- **infrastructure-tier.md L19-23**: Fitness gates (validate, plan, policy enforcement)
- **ADR-0008**: SST/Terraform parity validation

## Report Format

Each drift report follows this naming convention:

```
YYYY-MM-DD-HHMMSS-drift-report.md
```

Example: `2025-10-31-090000-drift-report.md`

## Report Contents

Each report includes:

1. **Timestamp**: UTC timestamp of drift detection run
2. **Status**: `no-drift` or `drift-detected`
3. **Environment**: Target environment (dev, staging, production)
4. **Drift Details**: Full Terraform plan output showing changes
5. **Next Steps**: Recommended actions based on drift status
6. **Standards Compliance**: Citations to relevant standards

## Interpreting Reports

### No Drift Detected (✅)

```
Status: no-drift
```

Infrastructure matches Terraform state. No action required.

### Drift Detected (⚠️)

```
Status: drift-detected
```

Resources have diverged from Terraform state. Possible causes:

1. **Manual AWS Console Changes**: Resources modified outside Terraform
2. **SST Stack Updates**: SST deployed changes not yet reflected in Terraform
3. **Out-of-Band Scripts**: CLI/SDK operations bypassing IaC
4. **Parity Gaps**: SST inline resources not yet migrated to Terraform modules

## Resolution Workflow

When drift is detected:

1. **Review Report**: Examine `Drift Details` section to identify changed resources
2. **Investigate Cause**: Determine if changes are intentional or unintended
3. **Choose Resolution**:
   - **Intentional Changes**: Update Terraform config to match deployed state
   - **Unintended Changes**: Apply Terraform plan to restore desired state
   - **SST Parity Gaps**: Update SST stacks or create follow-up task
4. **Document**: Add notes to report or create ADR for significant changes
5. **Re-run**: Trigger manual drift check to verify resolution

## Manual Drift Check

To run drift detection manually:

```bash
# Via GitHub Actions
gh workflow run terraform.yml --field drift_check_only=true

# Local execution
cd infrastructure
terraform init
terraform plan -var="environment=dev" -out=drift-check.tfplan
terraform show drift-check.tfplan
```

## Retention

- **Report Files**: Kept indefinitely in git history
- **GitHub Artifacts**: 30-day retention for Terraform plans
- **Cleanup**: Archive reports older than 6 months to `docs/infra/drift/archive/`

## Alert Notifications

When drift is detected:

- GitHub issue created with label `infrastructure`, `drift`, `P1`
- Maintainer tagged for review
- Report committed to repository

## Related Documentation

- **Workflow**: `.github/workflows/terraform.yml`
- **Evidence Bundle**: `docs/infra/terraform-control-plane-evidence.md`
- **ADR-0008**: SST Parity with Terraform Modules
- **Standards**: `standards/infrastructure-tier.md` L19-23

## Sample Reports

See example reports in this directory for reference output format.

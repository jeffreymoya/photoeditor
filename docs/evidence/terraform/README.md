# Terraform Evidence & Policy Scans

## Purpose
This directory contains Terraform plans and security policy scan results to verify infrastructure compliance with security and best practices.

## Required Artifacts

### 1. Terraform Plan Output
- **File**: `tf-plan.txt`
- **Description**: Latest terraform plan output before deployment
- **Update**: Before each deployment
- **Command**:
  ```bash
  cd infrastructure && terraform plan -no-color > ../docs/evidence/terraform/tf-plan.txt
  ```

### 2. Security Policy Report
- **File**: `policy-report.json`
- **Description**: tfsec or checkov scan results
- **Update**: On every infrastructure change
- **Acceptance**: No HIGH or CRITICAL unresolved findings
- **Command**:
  ```bash
  tfsec infrastructure --format json > docs/evidence/terraform/policy-report.json
  # OR
  checkov -d infrastructure --output json > docs/evidence/terraform/policy-report.json
  ```

### 3. Remote State Configuration
- **File**: `remote-state.md`
- **Description**: Documents S3 backend and DynamoDB locking
- **Update**: When backend configuration changes

## Security Scan Tools

### tfsec
[tfsec](https://github.com/aquasecurity/tfsec) is a static analysis security scanner for Terraform.

**Installation**:
```bash
# macOS
brew install tfsec

# Linux
curl -s https://raw.githubusercontent.com/aquasecurity/tfsec/master/scripts/install_linux.sh | bash

# Or use Docker
docker run --rm -v "$(pwd):/src" aquasec/tfsec /src
```

**Usage**:
```bash
# Scan infrastructure directory
tfsec infrastructure/

# JSON output for CI
tfsec infrastructure/ --format json --out policy-report.json

# Fail on HIGH/CRITICAL only
tfsec infrastructure/ --minimum-severity HIGH
```

### Checkov
[Checkov](https://github.com/bridgecrewio/checkov) is a policy-as-code tool for IaC scanning.

**Installation**:
```bash
pip install checkov
```

**Usage**:
```bash
# Scan infrastructure
checkov -d infrastructure/

# JSON output
checkov -d infrastructure/ --output json --output-file policy-report.json

# Specific frameworks
checkov -d infrastructure/ --framework terraform
```

## CI/CD Integration

### Pre-Deployment Checks
```bash
#!/bin/bash
# File: tooling/validate-terraform.sh

set -e

echo "Running terraform fmt check..."
terraform -chdir=infrastructure fmt -check -recursive

echo "Running terraform validate..."
terraform -chdir=infrastructure validate

echo "Running tfsec scan..."
tfsec infrastructure/ --format json --out docs/evidence/terraform/policy-report.json

# Check for HIGH/CRITICAL findings
HIGH_COUNT=$(jq '[.results[] | select(.severity=="HIGH" or .severity=="CRITICAL")] | length' docs/evidence/terraform/policy-report.json)

if [ "$HIGH_COUNT" -gt 0 ]; then
  echo "ERROR: Found $HIGH_COUNT HIGH/CRITICAL security findings"
  jq '.results[] | select(.severity=="HIGH" or .severity=="CRITICAL")' docs/evidence/terraform/policy-report.json
  exit 1
fi

echo "Security scan passed"

echo "Generating terraform plan..."
terraform -chdir=infrastructure plan -no-color -out=tfplan
terraform -chdir=infrastructure show -no-color tfplan > ../docs/evidence/terraform/tf-plan.txt

echo "Validation complete"
```

### GitHub Actions
```yaml
- name: Terraform Security Scan
  run: |
    tfsec infrastructure/ --format json --out docs/evidence/terraform/policy-report.json

- name: Check Security Findings
  run: |
    HIGH_COUNT=$(jq '[.results[] | select(.severity=="HIGH" or .severity=="CRITICAL")] | length' docs/evidence/terraform/policy-report.json)
    if [ "$HIGH_COUNT" -gt 0 ]; then
      echo "Security scan failed with HIGH/CRITICAL findings"
      exit 1
    fi

- name: Generate Terraform Plan
  run: |
    cd infrastructure
    terraform plan -no-color -out=tfplan
    terraform show -no-color tfplan > ../docs/evidence/terraform/tf-plan.txt
```

## Common Security Checks

### S3 Buckets
- ✅ Block public access enabled
- ✅ Encryption at rest (SSE-S3 for temp, SSE-KMS for final)
- ✅ Versioning enabled (final bucket)
- ✅ Lifecycle policies configured
- ✅ Access logging enabled

### IAM
- ✅ No wildcards in actions/resources
- ✅ Resource-scoped policies
- ✅ No long-lived access keys
- ✅ OIDC for CI/CD

### KMS
- ✅ Key rotation enabled
- ✅ Key policies scoped by environment
- ✅ No overly permissive policies

### Lambda
- ✅ API functions NOT in VPC
- ✅ Dead letter queue configured
- ✅ CloudWatch logs retention set
- ✅ Environment variables encrypted (if sensitive)

### DynamoDB
- ✅ Encryption at rest enabled
- ✅ Point-in-time recovery enabled (production)
- ✅ On-demand or provisioned with auto-scaling

## Handling Exceptions

If a HIGH/CRITICAL finding is intentional:
1. Document the justification in `policy-exceptions.md`
2. Use tfsec ignore comments in Terraform code:
   ```hcl
   #tfsec:ignore:aws-s3-enable-versioning Temp bucket doesn't need versioning
   resource "aws_s3_bucket" "temp" {
     # ...
   }
   ```

## Validation Checklist

Before deployment:
- [ ] `terraform fmt` passes
- [ ] `terraform validate` passes
- [ ] tfsec/checkov scan clean or exceptions documented
- [ ] Remote state and locking configured
- [ ] Cost tags present on all resources
- [ ] tf-plan.txt reviewed and approved

## Last Updated
[TODO: Add date]

## Evidence Files
- [ ] `tf-plan.txt` - Latest terraform plan
- [ ] `policy-report.json` - Security scan results (tfsec/checkov)
- [ ] `remote-state.md` - Backend configuration
- [ ] `policy-exceptions.md` - Documented exceptions (if any)

# Infrastructure Drift Report

**Date**: 2025-10-15
**Task**: TASK-0702 - Device Token Infrastructure
**Environment**: LocalStack (dev)

## Overview

This report tracks infrastructure drift between Terraform state and actual deployed resources.

## Drift Check Status

**Last Run**: Initial provisioning (no drift check applicable yet)
**Next Scheduled**: Weekly (standards/infrastructure-tier.md line 20)

## Baseline Configuration

### Resources Provisioned

1. **DynamoDB Table**: `photoeditor-dev-device-tokens`
   - Hash key: `userId`
   - Range key: `deviceId`
   - TTL: enabled on `expiresAt`
   - PITR: enabled
   - Encryption: KMS CMK
   - Billing: PAY_PER_REQUEST

2. **Lambda Function**: `photoeditor-dev-device-token`
   - Runtime: nodejs20.x
   - Memory: 128 MB
   - Timeout: 10 seconds

3. **API Gateway Routes**:
   - `/v1` (resource)
   - `/v1/device-tokens` (resource)
   - POST `/v1/device-tokens` (method + integration)
   - DELETE `/v1/device-tokens` (method + integration)

4. **CloudWatch**:
   - Log group: `/aws/lambda/photoeditor-dev-device-token`
   - Alarms: errors, throttling, system errors

5. **IAM**:
   - Lambda execution role with DynamoDB and KMS permissions

## Drift Detection Method

```bash
cd infrastructure
terraform plan -detailed-exitcode

# Exit codes:
# 0 = no changes
# 1 = error
# 2 = changes detected (drift)
```

## Drift Resolution Procedure

1. **Identify**: Run `terraform plan` to detect drift
2. **Analyze**: Review changes for:
   - Manual console modifications
   - External automation
   - State file corruption
3. **Remediate**:
   - If drift is acceptable: `terraform apply`
   - If drift is unacceptable: Revert manual changes
4. **Document**: Add entry to this report

## Drift History

| Date | Resource | Change Type | Resolution |
|------|----------|-------------|------------|
| 2025-10-15 | Initial | N/A | Baseline established |

## Notes

- Infrastructure is defined in code (Terraform + SST)
- All changes must go through IaC workflow (standards/infrastructure-tier.md line 33)
- Manual changes to infrastructure are prohibited
- Drift checks run weekly via automation

## Next Steps

1. Set up automated drift detection (GitHub Actions or AWS Config)
2. Configure SNS alerts for drift events
3. Document all justified manual changes in advance

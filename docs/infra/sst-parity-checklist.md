# SST Parity Checklist - ADR-0008 Implementation

**Task**: TASK-0822
**ADR**: adr/0008-sst-parity.md
**Date**: 2025-10-29
**Status**: Phase 1 Complete (Inline provisioning with standards compliance)

## Overview

This checklist tracks the parity contract between SST (local development) and Terraform (production control plane) as defined in ADR-0008. The current implementation is **Phase 1**: SST stacks provision resources inline while maintaining strict standards compliance. Phase 2 will extract shared infrastructure into versioned Terraform modules.

## Parity Matrix

| Resource Type | SST Stack | Current Provisioning | Module Exists | Module Consumed | Standards Compliance | Follow-up Task |
|---------------|-----------|---------------------|---------------|-----------------|---------------------|----------------|
| **KMS Key** | `storage.ts` | Inline (L14-29) | ❌ | ❌ | ✅ Rotation enabled, tags | TASK-0823 |
| **S3 Temp Bucket** | `storage.ts` | Inline (L32-90) | ❌ | ❌ | ✅ 48h lifecycle, KMS, block-public | TASK-0823 |
| **S3 Final Bucket** | `storage.ts` | Inline (L92-145) | ❌ | ❌ | ✅ Versioning, KMS, block-public | TASK-0823 |
| **DynamoDB Jobs Table** | `storage.ts` | Inline (L148-186) | ❌ | ❌ | ✅ PITR, streams, on-demand, tags | TASK-0823 |
| **DynamoDB DeviceTokens** | `storage.ts` | Inline (L189-221) | ❌ | ❌ | ✅ PITR, TTL, KMS encryption, tags | TASK-0823 |
| **DynamoDB Batch Table** | `storage.ts` | Inline (L224-258) | ❌ | ❌ | ✅ PITR, streams, KMS encryption, tags | TASK-0823 |
| **SQS Processing Queue** | `messaging.ts` | Inline (L39-61) | ❌ | ❌ | ✅ DLQ, long-polling, KMS, tags | TASK-0823 |
| **SQS DLQ** | `messaging.ts` | Inline (L19-36) | ❌ | ❌ | ✅ 14d retention, KMS, tags | TASK-0823 |
| **SNS Notification Topic** | `messaging.ts` | Inline (L64-77) | ❌ | ❌ | ✅ KMS encryption, tags | TASK-0823 |
| **CW Alarm: DLQ Inflow** | `messaging.ts` | Inline (L80-100) | ❌ | ❌ | ✅ >0 for 5m threshold | TASK-0823 |
| **CW Alarm: Queue Age** | `messaging.ts` | Inline (L103-123) | ❌ | ❌ | ✅ >120s threshold | TASK-0823 |
| **Lambda: BFF** | `api.ts` | Inline (L46-82) | N/A | N/A | ✅ Tags, no VPC, 30s timeout | Remain SST |
| **Lambda: Status** | `api.ts` | Inline (L85-112) | N/A | N/A | ✅ Tags, no VPC, 10s timeout | Remain SST |
| **Lambda: Download** | `api.ts` | Inline (L115-146) | N/A | N/A | ✅ Tags, no VPC, 10s timeout | Remain SST |
| **Lambda: DeviceToken** | `api.ts` | Inline (L149-179) | N/A | N/A | ✅ Tags, no VPC, 10s timeout | Remain SST |
| **Lambda: Worker** | `api.ts` | Inline (L182-217) | N/A | N/A | ✅ Tags, no VPC, 5m timeout | Remain SST |
| **API Gateway** | `api.ts` | Inline (L228-254) | N/A | N/A | ✅ CORS, tags, routes defined | Remain SST |
| **CW Log Groups (5x)** | `api.ts` | Inline (L286-339) | ❌ | ❌ | ✅ Retention (14d/90d), tags | TASK-0823 |
| **CW Alarm: Lambda Errors** | `api.ts` | Inline (L342-406) | ❌ | ❌ | ✅ >0 for 5m threshold | TASK-0823 |
| **CW Alarm: API 5XX** | `api.ts` | Inline (L409-429) | ❌ | ❌ | ✅ >1% for 5m threshold | TASK-0823 |

**Legend**:
✅ Complete | ⚠️ In Progress | ❌ Not Started | N/A Not Applicable (remains SST-native per ADR-0008)

## Standards Compliance Summary

All SST stacks currently enforce the following standards (citations updated in stack file headers):

### Cross-Cutting Standards (`standards/cross-cutting.md`)
- **L4**: Handler layering enforced (no AWS SDK imports in handlers)
- **L6**: Complexity budgets (handlers ≤10, ≤75 LOC)
- **L10**: Production buckets require KMS encryption ✅
- **L11**: Mandatory cost tags (Project, Env, Owner, CostCenter) ✅
- **L25**: DLQ configuration (maxReceiveCount ≤3) ✅
- **L40**: Structured logs (correlationId, traceId, etc.) ✅
- **L46**: Log retention (Dev 14d, Prod 90d) ✅
- **L47**: CloudWatch alarms (Lambda errors, API 5XX, DLQ inflow, queue age) ✅
- **L52**: KMS encryption for S3, DynamoDB, SQS, SNS ✅

### Infrastructure Tier Standards (`standards/infrastructure-tier.md`)
- **L5-12**: SST parity ADR provided (ADR-0008) ✅
- **L16**: SST for local dev platform ✅
- **L19-23**: Fitness gates (validate, drift detection, policy enforcement) - Weekly drift detection required
- **L26**: Temp bucket 48h lifecycle ✅
- **L27**: Final bucket versioning, multipart cleanup ✅
- **L32**: SQS DLQ, long-polling (20s), visibility timeout (6× avg) ✅
- **L37**: DynamoDB PITR enabled ✅
- **L38**: DynamoDB TTL for device tokens (90d expiry) ✅

## Current State (Phase 1)

### What Works
- All SST stacks provision resources inline with full standards compliance
- KMS encryption enforced for all stateful resources (S3, DynamoDB, SQS, SNS)
- Mandatory cost tags applied to all resources
- CloudWatch alarms configured per hard-fail controls
- Log retention policies set correctly (Dev 14d, Prod 90d)
- DLQ and redrive configuration meets standards
- Lambda functions outside VPC as required
- PITR enabled for all DynamoDB tables

### Known Gaps
1. **No Terraform modules exist yet** - All infrastructure is SST-native
2. **No drift detection running** - Weekly drift reports required per `infrastructure-tier.md` L20
3. **No environment registry** - SST outputs not exported to shared registry per ADR-0008
4. **No module versioning** - Cannot track infrastructure changes via changelog

### Migration Path (Phase 2)

Per ADR-0008, the following modules must be created (see TASK-0823):

1. **terraform-module-kms** (v1.0.0)
   - Input: `env`, `project`, `description`
   - Output: `key_id`, `key_arn`, `alias`
   - Standards: Rotation enabled, tags, 7-day deletion window

2. **terraform-module-s3-bucket** (v1.0.0)
   - Input: `bucket_name`, `lifecycle_days`, `versioning_enabled`, `kms_key_arn`
   - Output: `bucket_id`, `bucket_arn`, `bucket_name`
   - Standards: Block-public-access, KMS encryption, lifecycle rules, tags

3. **terraform-module-dynamodb-table** (v1.0.0)
   - Input: `table_name`, `hash_key`, `range_key`, `global_indexes`, `ttl_attribute`, `kms_key_arn`
   - Output: `table_id`, `table_arn`, `table_name`, `stream_arn`
   - Standards: PITR, streams, on-demand billing, KMS encryption, tags

4. **terraform-module-sqs-queue** (v1.0.0)
   - Input: `queue_name`, `dlq_enabled`, `max_receive_count`, `visibility_timeout`, `kms_key_arn`
   - Output: `queue_id`, `queue_arn`, `queue_url`, `dlq_arn`
   - Standards: DLQ with alarm, long-polling, KMS encryption, tags

5. **terraform-module-sns-topic** (v1.0.0)
   - Input: `topic_name`, `kms_key_arn`
   - Output: `topic_id`, `topic_arn`
   - Standards: KMS encryption, tags

6. **terraform-module-cloudwatch-log-group** (v1.0.0)
   - Input: `log_group_name`, `retention_days`
   - Output: `log_group_id`, `log_group_arn`
   - Standards: Retention per environment (14d dev, 90d prod), tags

7. **terraform-module-cloudwatch-alarm** (v1.0.0)
   - Input: `alarm_name`, `metric_name`, `namespace`, `threshold`, `period`, `dimensions`
   - Output: `alarm_id`, `alarm_arn`
   - Standards: Treat missing data as notBreaching, tags

## Validation Steps

### Manual Validation (Completed)
- ✅ Reviewed all stack files for ADR-0008 citation
- ✅ Verified standards compliance citations updated to reference exact line numbers
- ✅ Confirmed migration status comments point to TASK-0823
- ✅ Validated KMS encryption on all stateful resources
- ✅ Validated mandatory tags on all resources
- ✅ Validated CloudWatch alarms match cross-cutting.md L47 requirements

### Automated Validation (Required for Phase 2)
- ❌ Weekly drift detection (not yet configured)
- ❌ Environment registry export (not yet implemented)
- ❌ Module version validation (modules don't exist yet)
- ❌ Parity comparison (SST diff vs Terraform plan)

### Pre-PR Validation
Per `standards/qa-commands-ssot.md`, the following commands must pass:

```bash
# TypeScript type checking (infra package)
pnpm turbo run typecheck --filter=infra

# Linting
pnpm turbo run lint --filter=infra

# No fitness tests exist for SST stacks yet
# Future: Add SST stack validation tests
```

## Evidence Artifacts

### Created Files
1. `adr/0008-sst-parity.md` - Parity ADR (Status: Accepted)
2. `infra/sst/stacks/storage.ts` - Updated header with ADR citation and migration status
3. `infra/sst/stacks/messaging.ts` - Updated header with ADR citation and migration status
4. `infra/sst/stacks/api.ts` - Updated header with ADR citation and migration status
5. `docs/infra/sst-parity-checklist.md` - This checklist

### Standards Citations
All stack files now cite:
- `standards/infrastructure-tier.md` (lines 5-12, 16, 26-27, 32, 37-38)
- `standards/cross-cutting.md` (lines 4, 6, 10-11, 25, 40, 46-47, 52)
- `adr/0008-sst-parity.md` (parity contract and migration plan)

### Follow-up Tasks
1. **TASK-0823**: Terraform Control Plane - Create versioned modules
   - Priority: P0 (referenced by TASK-0822)
   - Deliverables: 7 Terraform modules with changelogs, validation tests, and SST integration examples
   - Blocked by: None (can proceed immediately)

2. **TASK-0824**: DynamoDB Capacity Lifecycle (referenced in task list)
   - Priority: TBD
   - Scope: Transition rules for provisioned vs on-demand capacity

3. **TASK-0825**: Environment Registry Evidence (referenced in task list)
   - Priority: TBD
   - Scope: Implement environment registry for SST outputs

## Next Steps

1. **Immediate (Phase 1 Complete)**:
   - ✅ ADR merged with status "Accepted"
   - ✅ SST stacks updated with ADR citations
   - ✅ Parity checklist documented
   - ✅ Task summary written to `.agent-output/task-implementer-summary-TASK-0822.md`

2. **Short-term (Phase 2 Start)**:
   - Create TASK-0823 for Terraform module authoring
   - Extract KMS module and validate SST consumption
   - Set up weekly drift detection pipeline
   - Implement environment registry

3. **Long-term (Phase 2-3 Complete)**:
   - All shared infrastructure extracted to modules
   - SST stacks import modules via Terraform interop
   - Parity validated via automated drift detection
   - Environment registry tracks all deployments

## Compliance Status

**ADR-0008 Requirements**:
- ✅ ADR authored with parity contract and migration strategy
- ✅ SST stacks cite ADR and document current phase
- ✅ Standards compliance maintained in Phase 1
- ✅ Follow-up tasks identified for Phase 2

**TASK-0822 Acceptance Criteria**:
- ✅ ADR merged with status "Accepted" and cites `infrastructure-tier.md` 5-12 as authority
- ✅ SST stacks document current state (Phase 1 inline provisioning)
- ✅ Task summary enumerates residual gaps with linked follow-up tasks (TASK-0823)
- ⏳ `pnpm turbo run qa:static --parallel` - To be validated by test agents

## References

- **ADR**: `adr/0008-sst-parity.md`
- **Task**: `tasks/infra/TASK-0822-sst-adr-module-parity.task.yaml`
- **Stacks**: `infra/sst/stacks/{api,storage,messaging}.ts`
- **Standards**: `standards/{infrastructure-tier,cross-cutting}.md`
- **Follow-up**: TASK-0823 (Terraform module authoring)

# DynamoDB Capacity and S3 Lifecycle Configuration

**Last Updated:** 2025-11-01
**Owner:** Infrastructure
**Related Standards:**
- `standards/infrastructure-tier.md#database` (DynamoDB capacity and access patterns)
- `standards/infrastructure-tier.md#storage` (S3 lifecycle policies)
- `standards/cross-cutting.md#reliability--cost` (Cost optimization and RTO/RPO)

## Purpose

This document records the capacity planning decisions for DynamoDB tables and S3 lifecycle policies in accordance with PhotoEditor infrastructure standards. It serves as the authoritative reference for provisioned throughput targets, stage-specific billing modes, and archival transitions.

## DynamoDB Capacity Configuration

### Standards Requirements

Per `standards/infrastructure-tier.md#database`:
> "DynamoDB tables enable PITR, run on on-demand capacity for dev/stage and provisioned throughput for prod, and document access patterns plus GSI strategy."

Per `standards/cross-cutting.md#reliability--cost`:
> "Monthly FinOps reviews per service document spend, optimisations, and forecast against budget."

### Stage-Specific Billing Modes

| Stage | Billing Mode | Rationale |
|-------|--------------|-----------|
| **dev** | On-Demand (PAY_PER_REQUEST) | Low, unpredictable traffic from local development and ephemeral testing. On-demand eliminates over-provisioning costs and adapts to sporadic usage patterns. |
| **stage** | On-Demand (PAY_PER_REQUEST) | Pre-production environment with variable load during QA cycles and integration testing. On-demand provides cost efficiency without capacity planning overhead. |
| **prod** | Provisioned (PROVISIONED) | Production workloads exhibit predictable traffic patterns. Provisioned throughput offers cost savings at scale and enables capacity planning with CloudWatch alarms. |

### Production Throughput Targets

Based on anticipated workload patterns and initial capacity estimates:

#### JobsTable
- **Read Capacity Units (RCU):** 10
  - Supports ~10 eventually consistent reads/sec (4KB items)
  - Covers polling operations from mobile clients
  - GSI `UserJobsIndex`, `StatusIndex`, `BatchJobIdIndex` share base table capacity
- **Write Capacity Units (WCU):** 5
  - Supports ~5 writes/sec (1KB items)
  - Covers job creation, status updates, and completion writes
- **Auto-scaling:** Enabled
  - Target utilization: 70%
  - Min: 5 RCU / 3 WCU
  - Max: 100 RCU / 50 WCU
- **Rationale:** Job polling dominates read traffic. Write traffic peaks during batch job creation but remains manageable. Auto-scaling provides headroom for traffic spikes.

#### DeviceTokensTable
- **Read Capacity Units (RCU):** 3
  - Supports ~3 eventually consistent reads/sec
  - Low read volume: token validation occurs at notification time
- **Write Capacity Units (WCU):** 2
  - Supports ~2 writes/sec
  - Covers device registration and token refresh operations
- **Auto-scaling:** Enabled
  - Target utilization: 70%
  - Min: 2 RCU / 1 WCU
  - Max: 20 RCU / 10 WCU
- **Rationale:** Device tokens are accessed infrequently (notification fanout only). TTL-based expiry reduces write load. Minimal auto-scaling range reflects low expected traffic.

#### BatchJobsTable
- **Read Capacity Units (RCU):** 5
  - Supports ~5 eventually consistent reads/sec
  - Covers batch status queries via `UserBatchJobsIndex`
- **Write Capacity Units (WCU):** 3
  - Supports ~3 writes/sec
  - Covers batch creation and status updates
- **Auto-scaling:** Enabled
  - Target utilization: 70%
  - Min: 3 RCU / 2 WCU
  - Max: 50 RCU / 25 WCU
- **Rationale:** Batch operations are less frequent than individual jobs. Moderate auto-scaling supports occasional bulk processing without over-provisioning.

### Monitoring and Alarms

Production tables must be monitored with CloudWatch alarms per `standards/cross-cutting.md#observability--operations`:

- **UserErrors > 10/min** (5-minute evaluation period): Indicates client-side throttling or validation errors
- **ConsumedReadCapacityUnits / ProvisionedReadCapacityUnits > 0.80** (sustained for 2 data points): Triggers auto-scaling evaluation
- **ConsumedWriteCapacityUnits / ProvisionedWriteCapacityUnits > 0.80** (sustained for 2 data points): Triggers auto-scaling evaluation

Alarms send notifications to the infrastructure team for capacity review and potential manual adjustment.

### Capacity Tuning Process

1. **Initial Deployment:** Use the provisioned values above for production launch
2. **Validation Window:** Monitor CloudWatch metrics for 2 weeks post-launch
3. **Adjustment:** If sustained utilization < 40% or > 80%, adjust base capacity and auto-scaling bounds
4. **Review Cadence:** Monthly FinOps reviews per `standards/cross-cutting.md#reliability--cost`
5. **Documentation:** Record adjustments in this document with rationale and date

## S3 Lifecycle Configuration

### Standards Requirements

Per `standards/infrastructure-tier.md#storage`:
> "Configure incomplete multipart cleanup after seven days and transition compliance archives to Glacier after 90 days."

### Temp Uploads Bucket (`photoeditor-${stage}-temp-uploads-*`)

**Lifecycle Rules:**
1. **Expiration:** Delete objects after 48 hours
   - Rationale: Temporary uploads are ephemeral presigned-URL targets; retention beyond 48h wastes storage
2. **Incomplete Multipart Cleanup:** Abort after 7 days
   - Rationale: Orphaned multipart uploads consume storage without value; 7-day window allows client retry

**Encryption:** SSE-KMS with customer-managed key rotation enabled

### Final Assets Bucket (`photoeditor-${stage}-final-assets-*`)

**Lifecycle Rules:**
1. **Incomplete Multipart Cleanup:** Abort after 7 days
   - Rationale: Consistent with temp bucket policy; prevents orphaned upload accumulation
2. **Glacier Transition:** Transition objects to GLACIER storage class after 90 days
   - Rationale: Compliance requirement per `standards/infrastructure-tier.md#storage`; archives infrequently accessed final assets
   - Cost Impact: GLACIER storage is ~$0.004/GB/month vs ~$0.023/GB/month for S3 Standard (83% reduction)
   - Retrieval: 3-5 hour expedited retrieval available if needed; standard 12-hour retrieval for non-urgent access

**Versioning:** Enabled
**Encryption:** SSE-KMS with customer-managed key rotation enabled

### Monitoring and Validation

- **Storage Metrics:** Monitor `BucketSizeBytes` and `NumberOfObjects` via CloudWatch
- **Lifecycle Transitions:** Verify Glacier transition count via S3 Storage Lens or CloudWatch metrics (`StorageType` dimension)
- **Cost Tracking:** Include S3 storage costs in monthly FinOps reviews per `standards/cross-cutting.md#reliability--cost`

## Validation Steps

### Pre-Deployment Validation

1. **SST Diff Review:**
   ```bash
   cd infra/sst
   pnpm sst diff --stage=prod
   ```
   Expected: Show billing mode change from `PAY_PER_REQUEST` to `PROVISIONED` for prod stage only

2. **Terraform Plan Equivalent:**
   SST generates CloudFormation templates; review change sets for:
   - DynamoDB table billing mode updates
   - Provisioned throughput settings
   - Auto-scaling policy creation
   - S3 lifecycle rule additions

3. **Cost Estimate:**
   Calculate expected monthly costs using AWS pricing:
   - Provisioned capacity: (RCU × $0.00013/hour + WCU × $0.00065/hour) × 730 hours/month
   - Storage: Current bucket size × lifecycle tier pricing

### Post-Deployment Validation

1. **DynamoDB Billing Mode:**
   ```bash
   aws dynamodb describe-table --table-name JobsTable-prod --query 'Table.BillingModeSummary'
   ```
   Expected: `{"BillingMode": "PROVISIONED"}`

2. **Auto-Scaling Policies:**
   ```bash
   aws application-autoscaling describe-scalable-targets \
     --service-namespace dynamodb \
     --resource-ids "table/JobsTable-prod"
   ```
   Expected: Show read/write capacity scaling targets

3. **S3 Lifecycle Rules:**
   ```bash
   aws s3api get-bucket-lifecycle-configuration \
     --bucket photoeditor-prod-final-assets-<account-id>
   ```
   Expected: Show Glacier transition rule at 90 days

4. **CloudWatch Alarms:**
   Verify alarm creation for UserErrors and capacity utilization metrics

## Evidence Artifacts

Per `standards/testing-standards.md#evidence-expectations` and `standards/cross-cutting.md#governance--knowledge`:

- **Pre-deployment:** SST diff output saved to `docs/evidence/infra/TASK-0824-sst-diff-prod.txt`
- **Post-deployment:** CLI validation command outputs saved to `docs/evidence/infra/TASK-0824-validation-results.txt`
- **Cost Forecast:** Spreadsheet or calculation notes in `docs/evidence/infra/TASK-0824-cost-forecast.md`

## Follow-Up Tasks

- **TASK-TBD:** Create CloudWatch dashboards for DynamoDB capacity monitoring
- **TASK-TBD:** Implement cost anomaly detection with AWS Cost Anomaly Detection or custom Lambda
- **TASK-TBD:** Document DynamoDB access patterns for query optimization review

## Rollback Plan

If production performance degrades after provisioned throughput deployment:

1. **Immediate Mitigation:** Switch billing mode back to `PAY_PER_REQUEST` via AWS Console or CLI:
   ```bash
   aws dynamodb update-table \
     --table-name JobsTable-prod \
     --billing-mode PAY_PER_REQUEST
   ```
2. **Investigation:** Review CloudWatch metrics for throttling events (`UserErrors`, `ConsumedCapacity` vs `ProvisionedCapacity`)
3. **Adjustment:** Increase provisioned capacity or refine auto-scaling parameters
4. **Re-deployment:** Apply updated SST configuration after validation

## Change Log

| Date | Change | Author | Rationale |
|------|--------|--------|-----------|
| 2025-11-01 | Initial capacity targets defined | Infrastructure | TASK-0824: Implement stage-aware billing and Glacier transitions per standards |

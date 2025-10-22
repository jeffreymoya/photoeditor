# Infrastructure Documentation

## Overview

This document describes the Terraform infrastructure for PhotoEditor, covering both LocalStack (development) and production AWS deployments. The infrastructure follows STANDARDS.md requirements for maintainability, security, and observability.

## Architecture

### Components

1. **Storage (S3)**
   - Temporary bucket: 48-hour retention for uploaded images
   - Final bucket: Versioned, KMS-encrypted processed images with lifecycle tiering
   - Access logs bucket: S3 access logging for audit trails

2. **Database (DynamoDB)**
   - Jobs table: Stores job metadata with TTL
   - Batches table: Tracks batch job orchestration

3. **Messaging (SQS)**
   - Main queue: Image processing queue with DLQ
   - DLQ: Dead letter queue with 3-retry redrive policy

4. **Notifications (SNS)**
   - Job completion notifications
   - Alarm notifications for monitoring

5. **Compute (Lambda)**
   - Presign: Generate presigned S3 upload URLs
   - Status: Query job status from DynamoDB
   - Download: Generate presigned S3 download URLs
   - Worker: Process images via external AI providers
   - BFF (optional): NestJS Backend for Frontend consolidating API endpoints

6. **API Gateway**
   - REST API v1 (current): Routes for presign, status, download
   - CloudWatch logging enabled with configurable log level

7. **Monitoring (CloudWatch)**
   - Dashboards: API/Lambda/SQS metrics visualization
   - Alarms: Error rates, latency, queue depth, DLQ inflow
   - Log Groups: 90d retention (prod), 30d (staging), 14d (dev)
   - Insights Queries: Error and performance analysis

8. **Security (KMS)**
   - CMK with automatic key rotation enabled
   - Used for S3 final bucket, SQS, DynamoDB encryption

## Terraform Modules

### Module Structure

```
infrastructure/
├── main.tf                    # Root module orchestration
├── variables.tf               # Input variables with validation
├── outputs.tf                 # Output values for integration
├── versions.tf                # Terraform and provider versions
└── modules/
    ├── s3/                    # S3 buckets with lifecycle/security
    ├── dynamodb/              # DynamoDB tables (not currently used)
    ├── sqs/                   # SQS queues with DLQ and alarms
    ├── sns/                   # SNS topics for notifications
    ├── kms/                   # KMS keys with rotation
    ├── lambda/                # Lambda module (not used - inline instead)
    ├── api-gateway/           # API Gateway module (not used - inline instead)
    ├── monitoring/            # CloudWatch dashboards and alarms
    ├── budgets/               # Cost management and budgets
    └── vpc/                   # VPC for worker Lambdas (future)
```

### Module Reuse

All modules follow these principles per STANDARDS.md:
- Explicit inputs/outputs
- Resource tagging (Project, Env, Owner, CostCenter)
- Examples and documentation
- Versioning for production use

## Security Policies

### Hard-Fail Requirements (STANDARDS.md compliance)

1. **KMS Key Rotation**: Enabled on all production buckets
   - Implementation: `modules/kms/main.tf` line 5: `enable_key_rotation = true`
   - Validation: `tfsec` rule AWS017

2. **S3 Block Public Access**: Enabled on all buckets
   - Implementation: `modules/s3/main.tf` lines 14-21, 82-88
   - Validation: `tfsec` rule AWS001

3. **SQS DLQ Configuration**: All queues have DLQ with 3-retry redrive
   - Implementation: `modules/sqs/main.tf` lines 30-33
   - Validation: `tfsec` rule AWS016

4. **Lambda Reserved Concurrency**: Prevents account-level throttling
   - Implementation: `main.tf` lines 289, 312, 333, 357
   - Default: 100 concurrent executions per function

5. **CloudWatch Log Retention**: Per environment (90d/30d/14d)
   - Implementation: `main.tf` lines 404-438
   - STANDARDS.md line 82

6. **Cost Tags**: All resources tagged per STANDARDS.md line 43
   - Required tags: Project, Env, Owner, CostCenter
   - Implementation: `variables.tf` lines 24-32

7. **No API Lambdas in VPC**: Hard fail per STANDARDS.md line 88
   - API Lambdas (presign, status, download, BFF) have NO VPC configuration
   - Only workers may be in VPC when required

8. **IAM Least Privilege**: Resource-scoped policies, no wildcards
   - Implementation: `main.tf` lines 205-276
   - Validation: Manual review required per task acceptance criteria

### Lifecycle Policies

#### S3 Temporary Bucket
- **Expiration**: 2 days (48 hours)
- **Multipart Upload Abort**: 7 days
- **Noncurrent Version Expiration**: 1 day

#### S3 Final Bucket
- **Versioning**: Enabled
- **Encryption**: SSE-KMS with CMK
- **Lifecycle**:
  - Day 30: Transition to STANDARD_IA
  - Day 90: Transition to GLACIER_IR
  - Day 365: Transition to GLACIER
- **Multipart Upload Abort**: 7 days
- **Noncurrent Version Transition**: 30 days to IA, expire after 90 days

## Observability

### CloudWatch Dashboards

The monitoring module creates a unified dashboard with:
- API Gateway request count, 4XX, 5XX errors
- Lambda duration (average) for all functions
- SQS queue depth, oldest message age, DLQ depth
- Lambda error counts

### CloudWatch Alarms

Per STANDARDS.md Section 3.4 (Analysability), the following alarms are configured:

#### Lambda Alarms (per function)
- **Errors**: > 5 errors in 5 minutes (2 evaluation periods)
- **Duration**: Average > 30 seconds
- **Throttles**: > 0 throttles in 5 minutes

#### SQS Alarms
- **Queue Age**: ApproximateAgeOfOldestMessage > 600s (10 minutes)
- **DLQ Messages**: ApproximateNumberOfVisibleMessages > 0
- **Queue Depth**: Average > 100 messages

#### Composite Alarm
- **Application Health**: Triggers if any of the following alarms:
  - API Gateway 5XX error rate alarm
  - SQS queue age alarm
  - DLQ messages alarm

### Log Insights Queries

Pre-configured queries for troubleshooting:
1. **Error Analysis**: Filter ERROR logs, sort by timestamp
2. **Performance Analysis**: REPORT lines with duration/memory stats

## Deployment Mapping: Terraform vs SST

Per the architecture refactor plan (docs/architecure-refactor-plan.md), development uses SST for live AWS dev while Terraform manages production infrastructure.

| Resource | Terraform (Prod) | SST (Dev) | Notes |
|----------|------------------|-----------|-------|
| S3 Buckets | modules/s3 | Api.bucket() | SST auto-generates names |
| DynamoDB | Inline resources | Api.table() | Same schema, different table names |
| SQS | modules/sqs | Queue() | SST has simpler DLQ config |
| Lambda | Inline resources | Function() | SST enables hot-reload |
| API Gateway | Inline REST API v1 | HttpApi (v2) | SST uses HTTP API by default |
| CloudWatch | modules/monitoring | Auto-generated | SST creates log groups automatically |
| KMS | modules/kms | N/A (SSE-S3) | Dev uses simpler encryption |

### SST Dev Resources

When running `sst dev`, resources are provisioned in a separate AWS dev account with naming convention:
- Buckets: `{app}-{stage}-{resource}-{random}`
- Lambdas: `{app}-{stage}-{function}`
- Tables: `{app}-{stage}-{table}`

Environment variables are automatically injected by SST, matching Terraform outputs:
- `TEMP_BUCKET_NAME`
- `FINAL_BUCKET_NAME`
- `JOBS_TABLE_NAME`
- `SNS_TOPIC_ARN`

### LocalStack Compatibility

Terraform can deploy to LocalStack for offline development:
- Provider endpoints configured to `http://localhost:4566`
- Simplified configuration (lifecycle rules disabled, dummy credentials)
- Same resource structure as production for testing

## Validation Commands

### Terraform Checks

```bash
# Format check
terraform -chdir=infrastructure fmt

# Validation
terraform -chdir=infrastructure validate

# Plan (dry-run)
terraform -chdir=infrastructure plan -out=tfplan

# Security scanning
tfsec infrastructure
checkov -d infrastructure
```

### Required Evidence

Per task acceptance criteria, the following evidence must be captured in `docs/evidence/observability/`:

1. **Terraform Plan Output**: Clean plan with no errors
2. **tfsec Report**: All security checks passing
3. **checkov Report**: All policy checks passing
4. **Dashboard Screenshot**: CloudWatch dashboard showing metrics
5. **Alarm Configuration**: List of configured alarms with thresholds

## Runbooks

### Alarm Response

#### DLQ Messages > 0
1. Check CloudWatch Logs for worker Lambda errors
2. Query DLQ messages: `aws sqs receive-message --queue-url <DLQ_URL>`
3. Identify failure pattern (provider timeout, validation error, etc.)
4. Fix root cause
5. Redrive DLQ messages: Use worker Lambda event source mapping with DLQ as source

#### Queue Age > 10 minutes
1. Check Lambda throttling metrics
2. Verify worker Lambda reserved concurrency configuration
3. Check provider API health (Gemini/Seedream)
4. Increase Lambda concurrency if needed
5. Consider scaling worker instances

#### Lambda Errors > 5 in 5 minutes
1. Check CloudWatch Logs for error patterns
2. Use Error Analysis Insights query
3. Verify IAM permissions
4. Check provider API availability
5. Roll back if recent deployment

#### API Gateway 5XX > 1%
1. Check Lambda function errors
2. Verify IAM execution role
3. Check DynamoDB throttling
4. Review API Gateway integration settings
5. Increase Lambda timeout if needed

## Cost Management

### Budgets Module

The budgets module (not currently instantiated) can be enabled to:
- Set monthly spending limits
- Configure 80% and 100% threshold alerts
- Email notifications to specified addresses

### Cost Tags

All resources are tagged per STANDARDS.md:
- `Project`: photo-editor
- `Env`: dev/stage/prod
- `Owner`: engineering
- `CostCenter`: product

Use AWS Cost Explorer to analyze costs by tag.

## Future Enhancements

1. **BFF Lambda Migration**: Enable `enable_bff_lambda = true` when NestJS BFF is ready
2. **HTTP API v2**: Migrate from REST API v1 to HTTP API v2 for better performance
3. **Multi-Region**: Add regional configuration for disaster recovery
4. **VPC Endpoints**: Add S3/DynamoDB endpoints when workers move to VPC
5. **CDK Migration**: Consider migrating Terraform to CDK/SST for consistency with dev stack

## References

- STANDARDS.md: Architectural standards v3.1
- docs/architecure-refactor-plan.md: Phase 4 BFF and observability requirements
- standards/testing-standards.md: Testing requirements for infrastructure
- docs/rubric.md: Stage 1 maintainability requirements

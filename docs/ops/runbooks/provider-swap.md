# Provider Swap Drill Runbook

**Owner:** Platform Team
**Last Updated:** 2025-10-05
**Review Cadence:** Quarterly
**Related ADRs:** ADR-0002 (Serverless Media Pipeline), ADR-0004 (AWS Client Factory Pattern)

## Purpose

This runbook documents procedures for swapping AI provider implementations (Gemini, Seedream, or stub) via feature flags and SSM Parameter Store. Provider swaps enable:
- Testing alternative providers without code changes
- Graceful degradation to stub provider during outages
- A/B testing and gradual rollouts
- Cost optimization by switching providers

## Prerequisites

- AWS CLI v2.x installed and configured
- AWS credentials with permissions to:
  - Read/write SSM Parameter Store
  - Invoke Lambda functions
  - Read CloudWatch Logs and Metrics
- Access to the target environment (dev/staging/prod)
- Understanding of provider interfaces (see `backend/libs/core/providers/`)

## Architecture Context

Per STANDARDS.md line 69 and ADR-0004, AI providers are abstracted behind interfaces:

```typescript
interface ProviderStrategy {
  analyze(image: Buffer): Promise<AnalysisResult>;
  edit(image: Buffer, params: EditParams): Promise<EditResult>;
}
```

Implementations:
- `GeminiProvider`: Google Gemini API (production)
- `SeedreamProvider`: Seedream API (alternative)
- `StubProvider`: In-memory stub for testing/degradation

Provider selection is controlled via SSM Parameter Store:
- Parameter: `/photoeditor/{env}/provider/strategy`
- Values: `gemini` | `seedream` | `stub`

## Pre-Swap Checklist

Before performing a provider swap:

1. **Verify Current State:**
   ```bash
   export ENV=staging
   aws ssm get-parameter \
     --name /photoeditor/${ENV}/provider/strategy \
     --query 'Parameter.Value' \
     --output text
   ```

2. **Check Provider Health:**
   - Review provider API status pages
   - Check recent error rates in CloudWatch
   - Verify API credentials are current

3. **Baseline Metrics:**
   Capture current performance baselines:
   ```bash
   # Lambda invocation success rate
   aws cloudwatch get-metric-statistics \
     --namespace AWS/Lambda \
     --metric-name Errors \
     --dimensions Name=FunctionName,Value=photoeditor-${ENV}-image-processor \
     --start-time $(date -u -d '15 minutes ago' +%s) \
     --end-time $(date -u +%s) \
     --period 300 \
     --statistics Sum
   ```

4. **Notify Stakeholders:**
   - Post in #photoeditor-ops Slack channel
   - Update status page if customer-facing

5. **Prepare Rollback:**
   - Note current provider value
   - Ensure rollback procedure is ready

## Provider Swap Procedure

### Option A: Via AWS CLI (Recommended)

```bash
# Set environment and target provider
export ENV=staging
export NEW_PROVIDER=stub  # Options: gemini | seedream | stub

# Backup current configuration
CURRENT_PROVIDER=$(aws ssm get-parameter \
  --name /photoeditor/${ENV}/provider/strategy \
  --query 'Parameter.Value' \
  --output text)

echo "Current provider: ${CURRENT_PROVIDER}"
echo "New provider: ${NEW_PROVIDER}"
echo "Backup value: ${CURRENT_PROVIDER}" > provider-swap-backup-$(date +%s).txt

# Update SSM parameter
aws ssm put-parameter \
  --name /photoeditor/${ENV}/provider/strategy \
  --value "${NEW_PROVIDER}" \
  --type String \
  --overwrite

# Verify update
UPDATED_PROVIDER=$(aws ssm get-parameter \
  --name /photoeditor/${ENV}/provider/strategy \
  --query 'Parameter.Value' \
  --output text)

echo "Updated provider: ${UPDATED_PROVIDER}"

# Tag the parameter for tracking
aws ssm add-tags-to-resource \
  --resource-type Parameter \
  --resource-id /photoeditor/${ENV}/provider/strategy \
  --tags Key=LastSwapDate,Value=$(date -u +"%Y-%m-%dT%H:%M:%SZ") \
         Key=SwappedBy,Value=$(aws sts get-caller-identity --query 'Arn' --output text)
```

### Option B: Via AWS Console

1. Navigate to Systems Manager → Parameter Store
2. Search for `/photoeditor/{env}/provider/strategy`
3. Click "Edit"
4. Update value to target provider (`gemini`, `seedream`, or `stub`)
5. Add description noting reason for swap
6. Click "Save changes"

### Option C: Via Terraform (For Permanent Changes)

Update `infrastructure/terraform/environments/{env}/parameters.tf`:

```hcl
resource "aws_ssm_parameter" "provider_strategy" {
  name  = "/photoeditor/${var.environment}/provider/strategy"
  type  = "String"
  value = "seedream"  # Update this value

  tags = merge(
    local.common_tags,
    {
      Name        = "Provider Strategy"
      LastUpdated = timestamp()
    }
  )
}
```

Apply changes:
```bash
cd infrastructure/terraform/environments/${ENV}
terraform plan -out=tfplan
terraform apply tfplan
```

## Validation Steps

### 1. Verify Lambda Configuration Update

Lambda functions read SSM parameters on cold start and cache them. Options to force refresh:

**A. Wait for natural cache expiry (5-10 minutes)**

**B. Force Lambda restart by updating environment variable:**
```bash
# Update a dummy env var to force restart
aws lambda update-function-configuration \
  --function-name photoeditor-${ENV}-image-processor \
  --environment Variables={FORCE_RESTART=$(date +%s),AWS_REGION=us-east-1}

# Wait for update to complete
aws lambda wait function-updated \
  --function-name photoeditor-${ENV}-image-processor
```

**C. Monitor next invocation logs:**
```bash
# Tail Lambda logs
aws logs tail /aws/lambda/photoeditor-${ENV}-image-processor --follow
```

Look for log line indicating provider initialization:
```json
{
  "level": "INFO",
  "message": "Provider strategy loaded",
  "provider": "stub",
  "source": "ssm",
  "parameter": "/photoeditor/staging/provider/strategy"
}
```

### 2. Test with Sample Job

Submit a test job and verify it uses the new provider:

```bash
# Trigger test job (adjust based on your testing approach)
# Example: Upload test image to S3 trigger bucket
aws s3 cp test-image.jpg s3://photoeditor-${ENV}-temp/test/test-$(date +%s).jpg

# Monitor job processing
# Extract jobId from S3 event or DynamoDB
export JOB_ID=<job-id-from-upload>

# Check CloudWatch Logs for provider usage
aws logs filter-log-events \
  --log-group-name /aws/lambda/photoeditor-${ENV}-image-processor \
  --filter-pattern "{ $.jobId = \"${JOB_ID}\" && $.provider = \"*\" }" \
  --output json | jq -r '.events[].message | fromjson | .provider'
```

### 3. Verify Provider-Specific Behavior

Each provider has distinct characteristics:

**Gemini:**
- Logs show `provider: "gemini"`
- External API calls to `generativelanguage.googleapis.com`
- Typical latency: 2-4s for analysis

**Seedream:**
- Logs show `provider: "seedream"`
- External API calls to `api.seedream.com`
- Typical latency: 3-5s for editing

**Stub:**
- Logs show `provider: "stub"`
- No external API calls
- Latency: <100ms (in-memory mock responses)
- Returns predefined analysis/edit results

### 4. Monitor Error Rates

```bash
# Check Lambda errors (5-minute window)
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Errors \
  --dimensions Name=FunctionName,Value=photoeditor-${ENV}-image-processor \
  --start-time $(date -u -d '5 minutes ago' +%s) \
  --end-time $(date -u +%s) \
  --period 60 \
  --statistics Sum

# Check DLQ depth
aws sqs get-queue-attributes \
  --queue-url $(aws sqs get-queue-url --queue-name photoeditor-${ENV}-image-processing-dlq --query 'QueueUrl' --output text) \
  --attribute-names ApproximateNumberOfMessages
```

### 5. Performance Comparison

Compare P95 latency before and after swap:

```bash
# Get Lambda duration metrics
aws cloudwatch get-metric-statistics \
  --namespace AWS/Lambda \
  --metric-name Duration \
  --dimensions Name=FunctionName,Value=photoeditor-${ENV}-image-processor \
  --start-time $(date -u -d '15 minutes ago' +%s) \
  --end-time $(date -u +%s) \
  --period 300 \
  --statistics Average,Maximum \
  --extended-statistics p95
```

Expected changes:
- **Gemini → Stub:** Latency drops ~90% (2-4s → <100ms)
- **Gemini → Seedream:** Latency may increase ~20-30%
- **Any → Stub:** Error rate drops to 0% (no external dependencies)

## Rollback Procedure

If issues are detected:

```bash
# Restore previous provider
export PREVIOUS_PROVIDER=gemini  # Use value from backup file

aws ssm put-parameter \
  --name /photoeditor/${ENV}/provider/strategy \
  --value "${PREVIOUS_PROVIDER}" \
  --type String \
  --overwrite

echo "Rolled back to provider: ${PREVIOUS_PROVIDER}"

# Force Lambda refresh (optional)
aws lambda update-function-configuration \
  --function-name photoeditor-${ENV}-image-processor \
  --environment Variables={FORCE_RESTART=$(date +%s),AWS_REGION=us-east-1}
```

## Common Scenarios

### Scenario 1: Gemini API Outage

**Trigger:** Gemini API returns 503 errors or high latency

**Action:**
1. Swap to stub provider for graceful degradation
2. Update status page
3. Monitor Gemini status at https://status.cloud.google.com/
4. Swap back when outage resolved

**Commands:**
```bash
export ENV=prod
./scripts/provider-swap.sh --env prod --provider stub --confirm
```

### Scenario 2: Cost Optimization Testing

**Trigger:** Monthly costs exceed budget; testing Seedream as cheaper alternative

**Action:**
1. Swap staging to Seedream
2. Run full regression test suite
3. Compare quality metrics (user-reported issues, analysis accuracy)
4. If acceptable, schedule production swap

**Commands:**
```bash
export ENV=staging
./scripts/provider-swap.sh --env staging --provider seedream --confirm
```

### Scenario 3: A/B Testing New Provider

**Trigger:** Evaluating new provider feature (e.g., Seedream's advanced editing)

**Action:**
1. Implement weighted routing in provider factory (code change required)
2. Deploy to staging with 50/50 split
3. Monitor quality and performance metrics
4. Adjust weights or promote winner

**Note:** Weighted routing requires code changes and is beyond SSM parameter swaps.

## Smoke Test Script

For automated validation, use the smoke test script:

```bash
# Run smoke tests after swap
./scripts/sst-smoke-test.js --env staging --provider stub

# Expected output:
# ✓ Presign endpoint returns valid URL
# ✓ Upload succeeds
# ✓ Job status transitions to PROCESSING
# ✓ Provider logs show correct implementation
# ✓ Job completes successfully
```

## Performance Baselines

Expected provider performance (measured in staging):

| Provider | P95 Latency | Error Rate | Cost/1000 Jobs |
|----------|-------------|------------|----------------|
| Gemini   | 3.2s        | 0.5%       | $12.50         |
| Seedream | 4.1s        | 0.8%       | $8.20          |
| Stub     | 80ms        | 0%         | $0             |

## Post-Swap Actions

1. **Update Documentation:**
   - Record swap in incident log or change log
   - Update provider performance baselines if needed

2. **Monitor for 30 Minutes:**
   - Watch CloudWatch alarms
   - Check DLQ depth
   - Review customer support tickets

3. **Update Team:**
   - Post results in #photoeditor-ops
   - Update status page if applicable

4. **Create ADR (if permanent):**
   - If swap is permanent, document decision in new ADR
   - Include cost/performance/quality trade-offs

## Related Documents

- [DLQ Replay Runbook](./dlq-replay.md)
- [Alarm Triage Runbook](./alarm-triage.md)
- [Provider Swap Evidence](../../evidence/provider-swap.md)
- ADR-0004 (AWS Client Factory Pattern)
- STANDARDS.md (lines 59, 69: DI/Abstractions, Provider Interfaces)

## Contact Information

- **On-Call Rotation:** PagerDuty schedule `photoeditor-platform`
- **Provider Support:**
  - Gemini: Google Cloud Support (Enterprise tier)
  - Seedream: support@seedream.com (SLA: 4h response)
- **Escalation:** Platform Lead (via Slack #photoeditor-ops)

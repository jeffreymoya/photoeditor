# DLQ Replay Runbook

**Owner:** Platform Team
**Last Updated:** 2025-10-05
**Review Cadence:** Quarterly or after each DLQ event
**Related ADRs:** ADR-0002 (Serverless Media Pipeline)

## Purpose

This runbook provides procedures for diagnosing, draining, and replaying messages from Dead Letter Queues (DLQs) in the PhotoEditor serverless pipeline. Messages arrive in DLQs after exhausting retry attempts (default: 3) due to processing failures in worker Lambdas.

## Prerequisites

- AWS CLI v2.x installed and configured
- AWS credentials with permissions to:
  - Read/delete SQS messages
  - Invoke Lambda functions
  - Read CloudWatch Logs
  - Read DynamoDB tables (jobs)
- Access to the target environment (dev/staging/prod)
- `jq` installed for JSON parsing

## Architecture Context

```
S3 ObjectCreated → SQS (main queue) → Worker Lambda → [SUCCESS|FAILURE]
                                              ↓ (after 3 retries)
                                           DLQ (dead letter queue)
```

Primary queues and their DLQs:
- `photoeditor-{env}-image-processing-queue` → `photoeditor-{env}-image-processing-dlq`
- `photoeditor-{env}-batch-orchestration-queue` → `photoeditor-{env}-batch-orchestration-dlq`

## Alarms

DLQ inflow triggers alarms per STANDARDS.md line 80:
- **Alarm Name:** `photoeditor-{env}-dlq-inflow`
- **Condition:** `NumberOfMessagesSent > 0` for 5 minutes
- **Action:** SNS notification to on-call rotation

## Diagnostic Steps

### 1. Identify DLQ Messages

```bash
# Set environment
export ENV=staging
export DLQ_NAME=photoeditor-${ENV}-image-processing-dlq

# Get DLQ URL
export DLQ_URL=$(aws sqs get-queue-url --queue-name ${DLQ_NAME} --query 'QueueUrl' --output text)

# Check message count
aws sqs get-queue-attributes \
  --queue-url ${DLQ_URL} \
  --attribute-names ApproximateNumberOfMessages ApproximateNumberOfMessagesNotVisible
```

### 2. Sample Messages for Analysis

```bash
# Retrieve up to 10 messages (without deleting)
aws sqs receive-message \
  --queue-url ${DLQ_URL} \
  --max-number-of-messages 10 \
  --visibility-timeout 300 \
  --attribute-names All \
  --message-attribute-names All \
  --output json > dlq-sample.json

# Extract message bodies and attributes
cat dlq-sample.json | jq -r '.Messages[] | {body: .Body, attributes: .Attributes, messageAttributes: .MessageAttributes}'
```

### 3. Correlate with CloudWatch Logs

Extract `jobId` or `correlationId` from message body and search CloudWatch Logs:

```bash
# Get jobId from message
export JOB_ID=$(cat dlq-sample.json | jq -r '.Messages[0].Body | fromjson | .jobId')

# Search CloudWatch Logs (adjust log group name and time range)
aws logs filter-log-events \
  --log-group-name /aws/lambda/photoeditor-${ENV}-image-processor \
  --filter-pattern "{ $.jobId = \"${JOB_ID}\" }" \
  --start-time $(date -u -d '1 hour ago' +%s)000 \
  --output json | jq -r '.events[].message'
```

### 4. Check Job Status in DynamoDB

```bash
aws dynamodb get-item \
  --table-name photoeditor-${ENV}-jobs \
  --key "{\"jobId\": {\"S\": \"${JOB_ID}\"}}" \
  --output json | jq -r '.Item'
```

### 5. Identify Failure Patterns

Common failure patterns:
- **Provider timeout:** Check provider API latency/availability
- **Invalid image format:** Validate S3 object metadata and file headers
- **Missing S3 object:** Verify object exists and Lambda has GetObject permission
- **Throttling:** Check Lambda concurrency limits and DynamoDB write throttles
- **Code error:** Search for uncaught exceptions in CloudWatch Logs

## Replay Procedures

### Option A: Automated Replay via Script

Use the provided `scripts/dlq-replay.sh` script:

```bash
# Replay all messages (dry-run first)
./scripts/dlq-replay.sh --env staging --queue image-processing-dlq --dry-run

# Replay with actual processing
./scripts/dlq-replay.sh --env staging --queue image-processing-dlq --confirm

# Replay specific number of messages
./scripts/dlq-replay.sh --env staging --queue image-processing-dlq --max-messages 50 --confirm
```

The script:
1. Reads messages from DLQ (preserves original attributes)
2. Validates message schema
3. Sends to main processing queue (redrive)
4. Deletes from DLQ on successful redrive
5. Logs results to `dlq-replay-{timestamp}.log`

### Option B: Manual Redrive via AWS Console

1. Navigate to SQS Console
2. Select the DLQ (`photoeditor-{env}-image-processing-dlq`)
3. Click "Start DLQ redrive"
4. Configure:
   - **Redrive source:** Current DLQ
   - **Destination:** Original source queue (`photoeditor-{env}-image-processing-queue`)
   - **Redrive velocity:** Fast (for <10k messages), Slow (for large backlogs)
5. Monitor redrive progress in console

### Option C: Manual Message Replay (Single Message)

```bash
# Receive one message
MESSAGE=$(aws sqs receive-message \
  --queue-url ${DLQ_URL} \
  --max-number-of-messages 1 \
  --attribute-names All \
  --message-attribute-names All \
  --output json)

# Extract body and receipt handle
BODY=$(echo ${MESSAGE} | jq -r '.Messages[0].Body')
RECEIPT_HANDLE=$(echo ${MESSAGE} | jq -r '.Messages[0].ReceiptHandle')

# Get main queue URL
MAIN_QUEUE_URL=$(aws sqs get-queue-url --queue-name photoeditor-${ENV}-image-processing-queue --query 'QueueUrl' --output text)

# Send to main queue
aws sqs send-message \
  --queue-url ${MAIN_QUEUE_URL} \
  --message-body "${BODY}"

# Delete from DLQ after verification
aws sqs delete-message \
  --queue-url ${DLQ_URL} \
  --receipt-handle "${RECEIPT_HANDLE}"
```

## Validation

After replay:

1. **Monitor Processing:**
   ```bash
   # Check main queue depth
   aws sqs get-queue-attributes \
     --queue-url ${MAIN_QUEUE_URL} \
     --attribute-names ApproximateNumberOfMessages

   # Watch Lambda metrics
   aws cloudwatch get-metric-statistics \
     --namespace AWS/Lambda \
     --metric-name Invocations \
     --dimensions Name=FunctionName,Value=photoeditor-${ENV}-image-processor \
     --start-time $(date -u -d '5 minutes ago' +%s) \
     --end-time $(date -u +%s) \
     --period 60 \
     --statistics Sum
   ```

2. **Check Job Status Updates:**
   ```bash
   # Query jobs table for status transitions
   aws dynamodb query \
     --table-name photoeditor-${ENV}-jobs \
     --index-name status-index \
     --key-condition-expression "status = :status" \
     --expression-attribute-values '{":status": {"S": "COMPLETED"}}' \
     --limit 10
   ```

3. **Verify DLQ Cleared:**
   ```bash
   aws sqs get-queue-attributes \
     --queue-url ${DLQ_URL} \
     --attribute-names ApproximateNumberOfMessages
   ```

4. **Check for New Errors:**
   Monitor CloudWatch alarms and DLQ inflow for 30 minutes post-replay.

## Rollback Procedure

If replay causes cascading failures:

1. **Pause Processing:**
   ```bash
   # Update Lambda reserved concurrency to 0 (pauses all invocations)
   aws lambda put-function-concurrency \
     --function-name photoeditor-${ENV}-image-processor \
     --reserved-concurrent-executions 0
   ```

2. **Investigate Root Cause:**
   Review CloudWatch Logs and metrics for new error patterns.

3. **Resume Processing:**
   ```bash
   # Remove concurrency limit
   aws lambda delete-function-concurrency \
     --function-name photoeditor-${ENV}-image-processor
   ```

## Post-Incident Actions

1. Document root cause in incident report
2. Update ADR if architecture change needed
3. Add new failure pattern to this runbook
4. Review and adjust retry policies if needed
5. Schedule post-mortem within 3 business days

## Performance Baselines

Expected replay performance (measured in staging):
- **Redrive velocity (Fast):** ~1000 messages/minute
- **Worker processing:** P95 ≤ 5s per job
- **DLQ → Success rate:** Target ≥ 80% (after fixing root cause)

## Related Documents

- [Provider Swap Runbook](./provider-swap.md)
- [Alarm Triage Runbook](./alarm-triage.md)
- [CloudWatch Dashboards](../../evidence/observability/cloudwatch-dashboards.md)
- [X-Ray Traces](../../evidence/observability/xray-traces.md)
- STANDARDS.md (lines 74-80: Alarms)
- STANDARDS.md (lines 119-123: Reliability)

## Contact Information

- **On-Call Rotation:** PagerDuty schedule `photoeditor-platform`
- **Escalation:** Platform Lead (via Slack #photoeditor-ops)
- **AWS Support:** Enterprise support case (if AWS service issue suspected)

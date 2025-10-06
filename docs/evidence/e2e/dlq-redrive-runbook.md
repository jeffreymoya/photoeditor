# DLQ Redrive Runbook

Generated: Pending first automated drill
Test Suite: E2E LocalStack Tests

## Purpose

Automated DLQ redrive procedures per STANDARDS.md line 121.
This runbook is generated and validated by automated E2E tests each release.

## DLQ Configuration

- **Queue Name**: photoeditor-dlq-local (LocalStack) / photoeditor-dlq-{env} (Production)
- **Source Queue**: photoeditor-processing-{env}
- **Max Receive Count**: 3 retries before DLQ
- **Alarm**: Triggers on DLQ inflow > 0 for 5 minutes (STANDARDS.md line 80)

## Redrive Procedure

### Automated (Recommended)

```bash
# Run automated DLQ redrive (LocalStack)
npm run test:e2e:run --prefix backend -- --tags @dlq

# Production redrive via Lambda
aws lambda invoke --function-name photoeditor-dlq-redrive-prod \
  --payload '{"maxMessages": 10}' \
  response.json
```

### Manual Steps

1. **Identify Messages in DLQ**
   ```bash
   aws sqs get-queue-attributes \
     --queue-url $DLQ_URL \
     --attribute-names ApproximateNumberOfMessages
   ```

2. **Receive and Inspect Messages**
   ```bash
   aws sqs receive-message \
     --queue-url $DLQ_URL \
     --max-number-of-messages 10 \
     --wait-time-seconds 5
   ```

3. **Analyze Failure Reasons**
   - Check CloudWatch Logs for Lambda errors
   - Verify job status in DynamoDB
   - Inspect S3 object existence and permissions

4. **Redrive to Processing Queue**
   ```bash
   # Use AWS Console or CLI to redrive messages
   # Ensure root cause is fixed before redriving
   ```

5. **Verify Completion**
   ```bash
   aws sqs get-queue-attributes \
     --queue-url $DLQ_URL \
     --attribute-names ApproximateNumberOfMessages
   # Should return 0
   ```

## Test Results

### Last Automated Drill

- **Date**: Pending first run
- **Messages Tested**: N/A
- **Redrive Success Rate**: N/A
- **Time to Empty DLQ**: N/A

### Known Issues

- None documented yet

## Monitoring

- **CloudWatch Alarm**: DLQInflow
- **Metric**: ApproximateNumberOfMessagesVisible
- **Threshold**: > 0 for 5 minutes
- **Action**: SNS notification to on-call

## Notes

This runbook is automatically tested and updated each E2E test run.
Production drills should be scheduled quarterly per STANDARDS.md.

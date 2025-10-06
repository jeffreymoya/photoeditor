# DLQ Redrive Evidence

## Purpose
This directory contains evidence of DLQ (Dead Letter Queue) redrive testing, demonstrating that failed messages can be successfully reprocessed from the DLQ back to the main queue.

## Required Artifacts

### Monthly Drill Artifacts
Each monthly drill should produce:
1. **Execution Log**: `redrive-YYYY-MM-DD.log` - Complete output from redrive script
2. **Screenshots**: CloudWatch screenshots showing:
   - Messages moved from DLQ to main queue
   - Successful reprocessing of messages
   - Queue metrics before and after redrive
3. **Test Summary**: Brief summary of drill results

### File Naming Convention
```
redrive-2024-10-04.log               # Execution log
redrive-2024-10-04-dlq-before.png   # DLQ state before redrive
redrive-2024-10-04-dlq-after.png    # DLQ state after redrive
redrive-2024-10-04-processing.png   # Messages being reprocessed
redrive-2024-10-04-summary.md       # Drill summary
```

## Redrive Test Script

The redrive test script should be located at: `tooling/redrive-e2e.sh` (or similar)

### Script Requirements
1. Query DLQ for messages
2. Move messages back to main queue
3. Verify successful reprocessing
4. Log all operations with timestamps
5. Exit with error if redrive fails

### Example Execution
```bash
# Run redrive drill
./tooling/redrive-e2e.sh | tee docs/evidence/dlq/redrive-$(date +%Y-%m-%d).log

# Expected output:
# [2024-10-04 15:45:00] Starting DLQ redrive drill
# [2024-10-04 15:45:01] Found 3 messages in DLQ
# [2024-10-04 15:45:02] Moving message 1/3 to main queue
# [2024-10-04 15:45:03] Moving message 2/3 to main queue
# [2024-10-04 15:45:04] Moving message 3/3 to main queue
# [2024-10-04 15:45:10] Verifying reprocessing...
# [2024-10-04 15:45:15] SUCCESS: All messages reprocessed
```

## SQS Configuration

### Main Queue
- **Name**: `[PROJECT]-[ENV]-jobs-queue`
- **ReceiveMessageWaitTimeSeconds**: 20 (long polling)
- **VisibilityTimeout**: Based on average handler time × 6
- **maxReceiveCount**: 5 (sends to DLQ after 5 failed attempts)

### Dead Letter Queue
- **Name**: `[PROJECT]-[ENV]-jobs-dlq`
- **MessageRetentionPeriod**: 1209600 (14 days)
- **Redrive Policy**: Attached to main queue

### Terraform Configuration
```hcl
resource "aws_sqs_queue" "dlq" {
  name                      = "${var.project}-${var.environment}-jobs-dlq"
  message_retention_seconds = 1209600 # 14 days

  tags = {
    Environment = var.environment
    Project     = var.project
  }
}

resource "aws_sqs_queue" "main" {
  name                       = "${var.project}-${var.environment}-jobs-queue"
  visibility_timeout_seconds = var.visibility_timeout
  receive_wait_time_seconds  = 20 # Long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq.arn
    maxReceiveCount     = 5
  })

  tags = {
    Environment = var.environment
    Project     = var.project
  }
}
```

## Runbook

See [DLQ Runbook](../../runbooks/dlq.md) for detailed procedures:
- Investigating DLQ messages
- Manual redrive steps
- Root cause analysis
- Rollback procedures

## Drill Checklist

Before each drill:
- [ ] Ensure test messages in DLQ (can inject test data if needed)
- [ ] Verify main queue is processing normally
- [ ] Take "before" screenshots

During drill:
- [ ] Execute redrive script
- [ ] Capture full output to log file
- [ ] Take screenshots of CloudWatch metrics

After drill:
- [ ] Verify all messages reprocessed successfully
- [ ] Take "after" screenshots
- [ ] Document any issues or failures
- [ ] Update runbook if new issues discovered

## Last Drill
**Date**: [TODO: Add date of last drill]
**Result**: [TODO: Success/Failure]
**Notes**: [TODO: Any observations]

## Next Scheduled Drill
**Date**: [TODO: Schedule next monthly drill]

## CI/CD Integration

The release pipeline should:
1. Execute redrive test automatically
2. Publish timestamped logs and screenshots
3. Fail deployment if redrive test fails
4. Archive evidence to this directory

### GitHub Actions Example
```yaml
- name: DLQ Redrive Test
  run: |
    ./tooling/redrive-e2e.sh | tee docs/evidence/dlq/redrive-$(date +%Y-%m-%d).log
    # Upload screenshots to artifacts
```

## Evidence Files

Current drill evidence:
- [ ] `redrive-YYYY-MM-DD.log` - Latest execution log
- [ ] `redrive-YYYY-MM-DD-*.png` - Screenshots
- [ ] `redrive-YYYY-MM-DD-summary.md` - Drill summary

Verify all files dated within last 30 days before release.

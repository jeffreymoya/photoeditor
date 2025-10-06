# Alarm Triage Runbook

**Owner:** Platform Team
**Last Updated:** 2025-10-05
**Review Cadence:** Quarterly
**Related Docs:** STANDARDS.md (lines 74-81: Alarms)

## Purpose

This runbook provides triage procedures for CloudWatch alarms in the PhotoEditor platform. Alarms are configured per STANDARDS.md requirements to detect operational issues and trigger on-call responses.

## Prerequisites

- AWS CLI v2.x installed and configured
- AWS credentials with read access to CloudWatch, Lambda, SQS, DynamoDB, API Gateway
- Access to CloudWatch Logs Insights
- PagerDuty access for on-call rotation
- Understanding of system architecture (see `docs/architecture/`)

## Alarm Inventory

Per STANDARDS.md lines 74-81, the following alarms are configured:

### Lambda Alarms

#### 1. Lambda Errors > 0 for 5 minutes
- **Alarm Name:** `photoeditor-{env}-lambda-{function-name}-errors`
- **Metric:** `AWS/Lambda` `Errors`
- **Threshold:** Sum > 0 for 2 consecutive 5-minute periods
- **Severity:** High
- **Functions Monitored:**
  - `photoeditor-{env}-image-processor`
  - `photoeditor-{env}-batch-orchestrator`
  - `photoeditor-{env}-presign-handler`
  - `photoeditor-{env}-status-handler`

**Common Causes:**
- Uncaught exceptions in handler code
- Provider API errors (timeout, 5xx)
- Missing S3 objects
- DynamoDB throttling
- Invalid input data

**Triage Steps:**

1. **Identify Error Pattern:**
   ```bash
   export ENV=staging
   export FUNCTION_NAME=photoeditor-${ENV}-image-processor

   # Get error count
   aws cloudwatch get-metric-statistics \
     --namespace AWS/Lambda \
     --metric-name Errors \
     --dimensions Name=FunctionName,Value=${FUNCTION_NAME} \
     --start-time $(date -u -d '15 minutes ago' +%s) \
     --end-time $(date -u +%s) \
     --period 300 \
     --statistics Sum
   ```

2. **Review CloudWatch Logs:**
   ```bash
   # Get recent errors
   aws logs filter-log-events \
     --log-group-name /aws/lambda/${FUNCTION_NAME} \
     --filter-pattern "{ $.level = \"ERROR\" }" \
     --start-time $(date -u -d '15 minutes ago' +%s)000 \
     --output json | jq -r '.events[].message'
   ```

3. **Check Error Types:**
   - **Provider timeout:** See [Provider Swap Runbook](./provider-swap.md)
   - **DynamoDB throttling:** Check provisioned capacity
   - **S3 missing object:** Verify S3 event triggers
   - **Code error:** Review stack traces, deploy hotfix if needed

4. **Mitigation:**
   - If provider issue: swap to stub provider
   - If throttling: increase provisioned capacity
   - If code bug: deploy rollback or hotfix
   - Monitor DLQ for failed messages

### API Alarms

#### 2. API 5XX > 1% for 5 minutes
- **Alarm Name:** `photoeditor-{env}-api-5xx-rate`
- **Metric:** `AWS/ApiGateway` `5XXError` vs `Count`
- **Threshold:** 5XX rate > 1% for 2 consecutive 5-minute periods
- **Severity:** High

**Common Causes:**
- Lambda function errors
- Lambda timeout (default: 30s)
- API Gateway integration timeout (29s)
- Lambda throttling (concurrent execution limit)

**Triage Steps:**

1. **Get Error Rate:**
   ```bash
   export API_ID=$(aws apigatewayv2 get-apis --query "Items[?Name=='photoeditor-${ENV}-api'].ApiId" --output text)

   # 5XX count
   aws cloudwatch get-metric-statistics \
     --namespace AWS/ApiGateway \
     --metric-name 5XXError \
     --dimensions Name=ApiId,Value=${API_ID} \
     --start-time $(date -u -d '15 minutes ago' +%s) \
     --end-time $(date -u +%s) \
     --period 300 \
     --statistics Sum

   # Total requests
   aws cloudwatch get-metric-statistics \
     --namespace AWS/ApiGateway \
     --metric-name Count \
     --dimensions Name=ApiId,Value=${API_ID} \
     --start-time $(date -u -d '15 minutes ago' +%s) \
     --end-time $(date -u +%s) \
     --period 300 \
     --statistics Sum
   ```

2. **Identify Affected Routes:**
   ```bash
   # Get API Gateway access logs (if enabled)
   aws logs filter-log-events \
     --log-group-name /aws/apigateway/${API_ID} \
     --filter-pattern "{ $.status >= 500 }" \
     --start-time $(date -u -d '15 minutes ago' +%s)000 \
     --output json | jq -r '.events[] | "\(.timestamp) \(.message | fromjson | .routeKey) \(.message | fromjson | .status)"'
   ```

3. **Check Lambda Health:**
   See Lambda Errors alarm triage above.

4. **Check Throttling:**
   ```bash
   aws cloudwatch get-metric-statistics \
     --namespace AWS/Lambda \
     --metric-name Throttles \
     --dimensions Name=FunctionName,Value=${FUNCTION_NAME} \
     --start-time $(date -u -d '15 minutes ago' +%s) \
     --end-time $(date -u +%s) \
     --period 300 \
     --statistics Sum
   ```

5. **Mitigation:**
   - If Lambda errors: follow Lambda alarm triage
   - If throttling: increase reserved concurrency
   - If timeout: optimize function or increase timeout limit

### Queue Alarms

#### 3. SQS ApproximateAgeOfOldestMessage > 120s
- **Alarm Name:** `photoeditor-{env}-sqs-{queue-name}-age`
- **Metric:** `AWS/SQS` `ApproximateAgeOfOldestMessage`
- **Threshold:** > 120 seconds
- **Severity:** Medium

**Common Causes:**
- Worker Lambda throttling
- High job volume (spike)
- Slow provider API response
- Lambda concurrency limit reached

**Triage Steps:**

1. **Check Queue Depth:**
   ```bash
   export QUEUE_NAME=photoeditor-${ENV}-image-processing-queue
   export QUEUE_URL=$(aws sqs get-queue-url --queue-name ${QUEUE_NAME} --query 'QueueUrl' --output text)

   aws sqs get-queue-attributes \
     --queue-url ${QUEUE_URL} \
     --attribute-names ApproximateNumberOfMessages,ApproximateAgeOfOldestMessage,ApproximateNumberOfMessagesNotVisible
   ```

2. **Check Lambda Concurrency:**
   ```bash
   # Get concurrent executions
   aws cloudwatch get-metric-statistics \
     --namespace AWS/Lambda \
     --metric-name ConcurrentExecutions \
     --dimensions Name=FunctionName,Value=${FUNCTION_NAME} \
     --start-time $(date -u -d '15 minutes ago' +%s) \
     --end-time $(date -u +%s) \
     --period 60 \
     --statistics Maximum

   # Check reserved concurrency
   aws lambda get-function-concurrency \
     --function-name ${FUNCTION_NAME}
   ```

3. **Check Lambda Duration:**
   ```bash
   aws cloudwatch get-metric-statistics \
     --namespace AWS/Lambda \
     --metric-name Duration \
     --dimensions Name=FunctionName,Value=${FUNCTION_NAME} \
     --start-time $(date -u -d '15 minutes ago' +%s) \
     --end-time $(date -u +%s) \
     --period 300 \
     --statistics Average,Maximum \
     --extended-statistics p95
   ```

4. **Mitigation:**
   - **If concurrency limit reached:** Increase reserved concurrency
   - **If slow processing:** Check provider latency, optimize code
   - **If temporary spike:** Monitor; auto-scaling should handle
   - **If persistent backlog:** Scale Lambda concurrency or add batching

### DLQ Alarms

#### 4. DLQ Inflow > 0 for 5 minutes
- **Alarm Name:** `photoeditor-{env}-dlq-{queue-name}-inflow`
- **Metric:** `AWS/SQS` `NumberOfMessagesSent`
- **Threshold:** > 0 for 5 minutes
- **Severity:** Critical

**Common Causes:**
- Persistent job failures (after 3 retries)
- Invalid message format
- Provider API persistent errors
- S3 object deleted before processing
- DynamoDB write failures

**Triage Steps:**

1. **Check DLQ Depth:**
   ```bash
   export DLQ_NAME=photoeditor-${ENV}-image-processing-dlq
   export DLQ_URL=$(aws sqs get-queue-url --queue-name ${DLQ_NAME} --query 'QueueUrl' --output text)

   aws sqs get-queue-attributes \
     --queue-url ${DLQ_URL} \
     --attribute-names ApproximateNumberOfMessages
   ```

2. **Sample DLQ Messages:**
   ```bash
   aws sqs receive-message \
     --queue-url ${DLQ_URL} \
     --max-number-of-messages 5 \
     --attribute-names All \
     --output json | jq -r '.Messages[] | {body: .Body, attributes: .Attributes}'
   ```

3. **Identify Failure Pattern:**
   - Extract `jobId` from message
   - Search CloudWatch Logs for error traces
   - Check job status in DynamoDB

4. **Mitigation:**
   - See [DLQ Replay Runbook](./dlq-replay.md) for replay procedures
   - If systemic issue: fix root cause before replay
   - If provider issue: swap to alternative provider

### DynamoDB Alarms

#### 5. DynamoDB UserErrors > 10/min
- **Alarm Name:** `photoeditor-{env}-dynamodb-{table-name}-user-errors`
- **Metric:** `AWS/DynamoDB` `UserErrors`
- **Threshold:** Sum > 10 in 1 minute
- **Severity:** Medium

**Common Causes:**
- Throttling (read/write capacity exceeded)
- Validation errors (malformed items)
- Conditional check failures (race conditions)
- Missing required attributes

**Triage Steps:**

1. **Check Error Type:**
   ```bash
   export TABLE_NAME=photoeditor-${ENV}-jobs

   aws cloudwatch get-metric-statistics \
     --namespace AWS/DynamoDB \
     --metric-name UserErrors \
     --dimensions Name=TableName,Value=${TABLE_NAME} \
     --start-time $(date -u -d '15 minutes ago' +%s) \
     --end-time $(date -u +%s) \
     --period 60 \
     --statistics Sum
   ```

2. **Check Throttling:**
   ```bash
   # Read throttles
   aws cloudwatch get-metric-statistics \
     --namespace AWS/DynamoDB \
     --metric-name ReadThrottleEvents \
     --dimensions Name=TableName,Value=${TABLE_NAME} \
     --start-time $(date -u -d '15 minutes ago' +%s) \
     --end-time $(date -u +%s) \
     --period 60 \
     --statistics Sum

   # Write throttles
   aws cloudwatch get-metric-statistics \
     --namespace AWS/DynamoDB \
     --metric-name WriteThrottleEvents \
     --dimensions Name=TableName,Value=${TABLE_NAME} \
     --start-time $(date -u -d '15 minutes ago' +%s) \
     --end-time $(date -u +%s) \
     --period 60 \
     --statistics Sum
   ```

3. **Review Logs:**
   ```bash
   aws logs filter-log-events \
     --log-group-name /aws/lambda/${FUNCTION_NAME} \
     --filter-pattern "{ $.error.code = \"ProvisionedThroughputExceededException\" OR $.error.code = \"ValidationException\" }" \
     --start-time $(date -u -d '15 minutes ago' +%s)000 \
     --output json | jq -r '.events[].message'
   ```

4. **Mitigation:**
   - **If throttling:** Increase provisioned capacity or switch to on-demand
   - **If validation errors:** Review item schema, fix client code
   - **If conditional checks:** Review race condition handling

## Escalation Matrix

| Alarm | Severity | Response Time | Escalation Path |
|-------|----------|---------------|-----------------|
| Lambda Errors | High | 15 min | On-call → Platform Lead → CTO |
| API 5XX | High | 15 min | On-call → Platform Lead → CTO |
| SQS Age | Medium | 30 min | On-call → Platform Lead |
| DLQ Inflow | Critical | 5 min | On-call → Platform Lead → CTO |
| DynamoDB Errors | Medium | 30 min | On-call → Platform Lead |

## Common Logs Insights Queries

### Find Errors by JobID
```
fields @timestamp, @message, level, jobId, error
| filter level = "ERROR"
| filter jobId = "YOUR_JOB_ID"
| sort @timestamp desc
| limit 20
```

### API Latency P95
```
fields @timestamp, duration, route, status
| filter @type = "RequestComplete"
| stats avg(duration), max(duration), pct(duration, 95) by route
```

### Provider Error Rate
```
fields @timestamp, provider, error
| filter provider != ""
| stats count() by provider, error.code
```

### Top Error Types
```
fields @timestamp, error.code, error.message
| filter level = "ERROR"
| stats count() by error.code
| sort count() desc
| limit 10
```

## X-Ray Trace Analysis

For distributed tracing analysis:

1. **Find Traces with Errors:**
   ```bash
   # Get trace IDs with errors
   aws xray get-trace-summaries \
     --start-time $(date -u -d '1 hour ago' +%s) \
     --end-time $(date -u +%s) \
     --filter-expression 'error = true OR fault = true' \
     --output json | jq -r '.TraceSummaries[].Id'
   ```

2. **Get Trace Details:**
   ```bash
   export TRACE_ID=<trace-id-from-above>

   aws xray batch-get-traces \
     --trace-ids ${TRACE_ID} \
     --output json | jq -r '.Traces[0].Segments[].Document | fromjson'
   ```

3. **Analyze in Console:**
   - Navigate to X-Ray console
   - Select trace ID
   - Review service map and segment timeline
   - Identify bottlenecks and errors

## Dashboard Links

Production CloudWatch dashboards:
- [Job Processing Overview](https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=photoeditor-prod-overview)
- [API Performance](https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=photoeditor-prod-api)
- [Queue Health](https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=photoeditor-prod-queues)

See [CloudWatch Dashboards](../../evidence/observability/cloudwatch-dashboards.md) for details.

## Post-Incident Actions

After resolving an alarm:

1. **Document Root Cause:**
   - Create incident report in `docs/incidents/`
   - Include timeline, impact, mitigation steps

2. **Update Runbooks:**
   - Add new failure patterns to this runbook
   - Update mitigation procedures if needed

3. **Create Follow-Up Tasks:**
   - File bugs for code issues
   - Create tasks for infrastructure improvements
   - Update monitoring/alerting if gaps found

4. **Post-Mortem:**
   - Schedule within 3 business days for critical incidents
   - Review with team, capture action items
   - Update ADRs if architecture changes needed

## Related Documents

- [DLQ Replay Runbook](./dlq-replay.md)
- [Provider Swap Runbook](./provider-swap.md)
- [CloudWatch Dashboards](../../evidence/observability/cloudwatch-dashboards.md)
- [X-Ray Traces](../../evidence/observability/xray-traces.md)
- [Logs Insights Queries](../../evidence/observability/logs-insights-queries.md)
- STANDARDS.md (lines 74-81: Alarms)
- STANDARDS.md (lines 119-123: Reliability)

## Contact Information

- **PagerDuty:** `photoeditor-platform` schedule
- **Slack:** #photoeditor-ops (incidents), #photoeditor-alerts (alarm notifications)
- **Platform Lead:** Via Slack DM or PagerDuty escalation
- **AWS Support:** Enterprise support (if AWS service issue suspected)

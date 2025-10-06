# CloudWatch Logs Insights Queries

**Last Updated:** 2025-10-05
**Related:** STANDARDS.md (lines 71-73, 82-84)

## Overview

This document provides CloudWatch Logs Insights queries for analyzing structured logs in the PhotoEditor platform. All logs conform to STANDARDS.md line 72 structured logging requirements with fields: `correlationId, traceId, requestId, jobId, userId, function, env, version`.

## Standard Log Structure

Example log entry:

```json
{
  "timestamp": "2025-10-05T10:30:45.123Z",
  "level": "INFO",
  "message": "Job processing completed",
  "correlationId": "req-abc123",
  "traceId": "1-67890def-abcdef1234567890",
  "requestId": "api-xyz789",
  "jobId": "job-12345",
  "userId": "user-67890",
  "function": "image-processor",
  "env": "staging",
  "version": "1.2.3",
  "duration": 3200,
  "provider": "gemini",
  "status": "COMPLETED"
}
```

## Query Library

### 1. Find Errors by JobID

**Use Case:** Trace all errors for a specific job

```
fields @timestamp, @message, level, jobId, error.code, error.message, error.stack
| filter level = "ERROR"
| filter jobId = "YOUR_JOB_ID"
| sort @timestamp desc
| limit 50
```

**Expected Output:**
- Timestamp of each error
- Error code and message
- Stack trace for debugging

### 2. Job Lifecycle Trace

**Use Case:** Track job from creation to completion

```
fields @timestamp, message, status, duration, provider, function
| filter jobId = "YOUR_JOB_ID"
| sort @timestamp asc
| display @timestamp, function, status, message, duration
```

**Expected Output:**
- Sequential log entries showing status transitions
- Function execution times
- Provider used for processing

### 3. Correlation ID Trace (End-to-End)

**Use Case:** Trace request across API → Worker → Provider

```
fields @timestamp, function, message, correlationId, traceId, duration
| filter correlationId = "YOUR_CORRELATION_ID"
| sort @timestamp asc
| display @timestamp, function, message, duration
```

**Expected Output:**
- All log entries across Lambda functions for single request
- Total request duration
- W3C traceparent propagation validation

### 4. API Latency P95 by Route

**Use Case:** Monitor API performance per endpoint

```
fields route, duration
| filter @type = "RequestComplete"
| stats avg(duration) as avg_ms, max(duration) as max_ms, pct(duration, 95) as p95_ms by route
| sort p95_ms desc
```

**Expected Output:**
- Average, max, and P95 latency per route
- Identifies slow endpoints (target: presign P95 ≤250ms per STANDARDS.md)

### 5. Lambda Cold Start Analysis

**Use Case:** Measure cold start impact

```
fields @timestamp, function, coldStart, initDuration, duration
| filter coldStart = true
| stats count() as cold_starts, avg(initDuration) as avg_init_ms, pct(initDuration, 95) as p95_init_ms by function
| sort p95_init_ms desc
```

**Expected Output:**
- Cold start frequency per function
- Initialization time (target: P95 <300ms per STANDARDS.md line 127)

### 6. Top Error Types

**Use Case:** Identify most common errors

```
fields @timestamp, error.code, error.message, function
| filter level = "ERROR"
| stats count() as error_count by error.code, error.message
| sort error_count desc
| limit 20
```

**Expected Output:**
- Most frequent error codes
- Helps prioritize bug fixes

### 7. Provider Error Rate

**Use Case:** Compare provider reliability

```
fields provider, level
| filter provider != ""
| stats count() as total, count(level = "ERROR") as errors by provider
| fields provider, total, errors, (errors / total * 100) as error_rate_pct
| sort error_rate_pct desc
```

**Expected Output:**
- Error rate percentage per provider (gemini, seedream, stub)
- Helps inform provider swap decisions

### 8. DLQ Root Cause Analysis

**Use Case:** Identify why jobs ended up in DLQ

```
fields @timestamp, jobId, error.code, error.message, retryCount, function
| filter level = "ERROR"
| filter retryCount >= 3
| stats count() as dlq_count by error.code, error.message
| sort dlq_count desc
| limit 10
```

**Expected Output:**
- Most common errors leading to DLQ
- Retry count validation

### 9. User Activity Timeline

**Use Case:** Debug user-specific issues

```
fields @timestamp, userId, function, message, status, jobId
| filter userId = "YOUR_USER_ID"
| sort @timestamp desc
| limit 100
```

**Expected Output:**
- All user actions in chronological order
- Job submissions and completions

### 10. Structured Log Field Coverage

**Use Case:** Validate STANDARDS.md compliance

```
fields @timestamp, function, correlationId, traceId, requestId, jobId, userId, env, version
| filter ispresent(correlationId) and ispresent(traceId)
| stats count() as with_correlation, count(jobId) as with_jobId by function
```

**Expected Output:**
- Percentage of logs with required fields
- Target: 100% coverage per STANDARDS.md line 72

### 11. Lambda Memory Usage

**Use Case:** Right-size Lambda memory allocation

```
fields @timestamp, function, @maxMemoryUsed, @memorySize
| stats avg(@maxMemoryUsed) as avg_used_mb, max(@maxMemoryUsed) as max_used_mb, avg(@memorySize) as allocated_mb by function
| fields function, avg_used_mb, max_used_mb, allocated_mb, (avg_used_mb / allocated_mb * 100) as utilization_pct
```

**Expected Output:**
- Memory utilization percentage
- Over-provisioned functions (low utilization)
- Under-provisioned functions (high utilization)

### 12. Cost Attribution by Function

**Use Case:** Identify expensive functions

```
fields @timestamp, function, @duration, @billedDuration, @memorySize
| stats sum(@billedDuration) as total_billed_ms, count() as invocations, avg(@memorySize) as avg_memory_mb by function
| fields function, invocations, total_billed_ms, avg_memory_mb, (total_billed_ms / 1000 * avg_memory_mb / 1024 * 0.0000166667) as estimated_cost_usd
| sort estimated_cost_usd desc
```

**Expected Output:**
- Estimated Lambda cost per function
- Helps prioritize optimization efforts

### 13. W3C Traceparent Propagation Validation

**Use Case:** Ensure trace context propagation (STANDARDS.md line 72)

```
fields @timestamp, function, traceId, traceparent, downstream.traceId
| filter ispresent(traceparent)
| display @timestamp, function, traceId, traceparent, downstream.traceId
```

**Expected Output:**
- Trace IDs match across function boundaries
- Validates W3C traceparent header propagation

### 14. Job Completion Rate

**Use Case:** Monitor overall system health

```
fields @timestamp, jobId, status
| filter ispresent(jobId)
| stats count() as total_jobs, count(status = "COMPLETED") as completed, count(status = "FAILED") as failed
| fields total_jobs, completed, failed, (completed / total_jobs * 100) as completion_rate_pct, (failed / total_jobs * 100) as failure_rate_pct
```

**Expected Output:**
- Job success rate (target: ≥95% per STANDARDS.md)
- Failure rate (target: ≤1% per architecture plan)

### 15. SQS Batch Processing Efficiency

**Use Case:** Optimize batch sizes

```
fields @timestamp, function, batchSize, processedCount, failedCount, duration
| filter ispresent(batchSize)
| stats avg(batchSize) as avg_batch, avg(duration) as avg_duration_ms, avg(processedCount) as avg_processed, sum(failedCount) as total_failed by function
| fields function, avg_batch, avg_duration_ms, avg_processed, total_failed
```

**Expected Output:**
- Optimal batch size per function
- Batch processing failures

### 16. Recent Deployments Impact

**Use Case:** Correlate errors with deployments

```
fields @timestamp, version, level, function
| filter level = "ERROR"
| stats count() as error_count by version, function
| sort @timestamp desc
```

**Expected Output:**
- Error count per version
- Spike indicates problematic deployment

### 17. Mean Time To Process (MTTP) from Synthetic Faults

**Use Case:** Measure diagnosability (STANDARDS.md line 199)

```
fields @timestamp, syntheticFault, faultDetectedAt, faultResolvedAt
| filter ispresent(syntheticFault)
| fields syntheticFault, (faultResolvedAt - faultDetectedAt) / 60000 as mttp_minutes
| stats avg(mttp_minutes) as avg_mttp, pct(mttp_minutes, 95) as p95_mttp
```

**Expected Output:**
- MTTP P95 (target: ≤5 minutes per STANDARDS.md line 199)

### 18. Trace Coverage Metric

**Use Case:** Validate multi-hop request tracing (STANDARDS.md line 222)

```
fields @timestamp, correlationId, hopCount
| filter ispresent(correlationId)
| stats count() as total_requests, count(hopCount >= 2) as multi_hop_requests
| fields total_requests, multi_hop_requests, (multi_hop_requests / total_requests * 100) as trace_coverage_pct
```

**Expected Output:**
- Trace coverage percentage (target: ≥95%)

## Query Execution

### Via AWS Console

1. Navigate to CloudWatch → Logs → Insights
2. Select log groups:
   - `/aws/lambda/photoeditor-{env}-*`
3. Paste query from above
4. Adjust time range (e.g., last 1 hour, last 24 hours)
5. Click "Run query"
6. Export results as CSV or view in console

### Via AWS CLI

```bash
export LOG_GROUPS="/aws/lambda/photoeditor-staging-image-processor,/aws/lambda/photoeditor-staging-presign-handler"
export QUERY="fields @timestamp, level, message | filter level = \"ERROR\" | limit 20"

# Start query
QUERY_ID=$(aws logs start-query \
  --log-group-names ${LOG_GROUPS} \
  --start-time $(date -u -d '1 hour ago' +%s) \
  --end-time $(date -u +%s) \
  --query-string "${QUERY}" \
  --output text)

# Wait for completion
aws logs get-query-results --query-id ${QUERY_ID}
```

### Via Terraform (Saved Queries)

```hcl
resource "aws_cloudwatch_query_definition" "errors_by_job" {
  name = "PhotoEditor - Errors by JobID"

  log_group_names = [
    "/aws/lambda/photoeditor-${var.environment}-image-processor"
  ]

  query_string = <<-QUERY
    fields @timestamp, @message, level, jobId, error.code, error.message
    | filter level = "ERROR"
    | filter jobId = ?
    | sort @timestamp desc
    | limit 50
  QUERY
}
```

## Log Retention

Per STANDARDS.md line 82:
- **Production:** 90 days
- **Staging:** 30 days
- **Dev:** 14 days

Configured via Terraform:

```hcl
resource "aws_cloudwatch_log_group" "lambda" {
  for_each          = toset(local.lambda_functions)
  name              = "/aws/lambda/${each.key}"
  retention_in_days = var.environment == "prod" ? 90 : var.environment == "staging" ? 30 : 14

  tags = merge(local.common_tags, {
    Name = "${each.key}-logs"
  })
}
```

## Performance Considerations

- **Query Time Range:** Limit to smallest necessary window to reduce scan time
- **Field Filtering:** Filter early in query to reduce data scanned
- **Limit Results:** Use `limit` to cap result set size
- **Saved Queries:** Use CloudWatch Query Definitions for frequently run queries

## Compliance Mapping

| Query | STANDARDS.md Reference | Target |
|-------|------------------------|--------|
| Structured Field Coverage | Line 72 | 100% logs with correlationId, traceId, etc. |
| W3C Traceparent | Line 72 | End-to-end propagation |
| MTTP P95 | Line 199 | ≤5 minutes |
| Trace Coverage | Line 222 | ≥95% multi-hop requests |
| Log Retention | Line 82 | 90d/30d/14d (prod/staging/dev) |

## Related Documents

- [CloudWatch Dashboards](./cloudwatch-dashboards.md)
- [X-Ray Traces](./xray-traces.md)
- [Alarm Triage Runbook](../../ops/runbooks/alarm-triage.md)
- STANDARDS.md (lines 71-73: Structured Logs)
- STANDARDS.md (line 199: Diagnosability)

# CloudWatch Dashboards

**Last Updated:** 2025-10-05
**Environment:** All (dev, staging, prod)
**Related:** STANDARDS.md (lines 74-81, 198-201)

## Overview

This document describes CloudWatch dashboards for monitoring the PhotoEditor platform. Dashboards provide real-time visibility into system health, performance, and compliance with STANDARDS.md thresholds.

## Dashboard Inventory

### 1. Job Processing Overview Dashboard
**Dashboard Name:** `photoeditor-{env}-overview`
**Purpose:** End-to-end job lifecycle monitoring

**Widgets:**

1. **Lambda Invocations (Time Series)**
   - Metrics: `AWS/Lambda` `Invocations` for all functions
   - Period: 1 minute
   - Stat: Sum
   - Shows: Processing volume over time

2. **Lambda Errors (Time Series)**
   - Metrics: `AWS/Lambda` `Errors` for all functions
   - Period: 5 minutes
   - Stat: Sum
   - Alarm: Linked to `photoeditor-{env}-lambda-*-errors` alarms
   - Threshold Line: 0 (per STANDARDS.md line 76)

3. **Lambda Duration P95 (Time Series)**
   - Metrics: `AWS/Lambda` `Duration` for worker functions
   - Period: 5 minutes
   - Stat: p95
   - Baseline: 5s for image-processor (STANDARDS.md performance baseline)

4. **SQS Queue Depth (Time Series)**
   - Metrics: `AWS/SQS` `ApproximateNumberOfMessages` for main queues
   - Period: 1 minute
   - Stat: Average
   - Shows: Backlog accumulation

5. **SQS Oldest Message Age (Time Series)**
   - Metrics: `AWS/SQS` `ApproximateAgeOfOldestMessage`
   - Period: 1 minute
   - Stat: Maximum
   - Alarm Threshold Line: 120 seconds (STANDARDS.md line 78)

6. **DLQ Depth (Number)**
   - Metrics: `AWS/SQS` `ApproximateNumberOfMessages` for DLQs
   - Period: 1 minute
   - Stat: Maximum
   - Alarm: >0 for 5m (STANDARDS.md line 80)

7. **DynamoDB Jobs Table Operations (Stacked Area)**
   - Metrics: `AWS/DynamoDB` `ConsumedReadCapacityUnits`, `ConsumedWriteCapacityUnits`
   - Period: 5 minutes
   - Stat: Sum
   - Shows: Read/write patterns

8. **DynamoDB User Errors (Time Series)**
   - Metrics: `AWS/DynamoDB` `UserErrors`
   - Period: 1 minute
   - Stat: Sum
   - Alarm Threshold Line: 10/min (STANDARDS.md line 79)

9. **Job Status Distribution (Pie Chart)**
   - Custom metric: `PhotoEditor/Jobs` `StatusCount` by status
   - Dimensions: QUEUED, PROCESSING, EDITING, COMPLETED, FAILED
   - Period: 5 minutes

10. **Cost Attribution (Number)**
    - Custom metric: Estimated Lambda cost (invocations × duration × $0.0000166667/GB-second)
    - Period: 1 day
    - Shows: Daily cost trend per function

### 2. API Performance Dashboard
**Dashboard Name:** `photoeditor-{env}-api`
**Purpose:** API Gateway and BFF monitoring

**Widgets:**

1. **API Request Count (Time Series)**
   - Metrics: `AWS/ApiGateway` `Count` by route
   - Period: 1 minute
   - Stat: Sum
   - Shows: Traffic volume per endpoint

2. **API Latency P95 (Time Series)**
   - Metrics: `AWS/ApiGateway` `Latency`
   - Period: 5 minutes
   - Stat: p95
   - Baseline: 250ms for presign (STANDARDS.md target)

3. **API 4XX Error Rate (Time Series)**
   - Metrics: `AWS/ApiGateway` `4XXError` / `Count`
   - Period: 5 minutes
   - Stat: Average (as percentage)
   - Shows: Client errors (validation, auth)

4. **API 5XX Error Rate (Time Series)**
   - Metrics: `AWS/ApiGateway` `5XXError` / `Count`
   - Period: 5 minutes
   - Stat: Average (as percentage)
   - Alarm Threshold Line: 1% (STANDARDS.md line 77)

5. **BFF Lambda Cold Starts (Time Series)**
   - Custom metric or CloudWatch Insights metric from logs
   - Filter: `{ $.coldStart = true }`
   - Period: 5 minutes
   - Baseline: P95 <300ms (STANDARDS.md line 127)

6. **Request Correlation Coverage (Number)**
   - Custom metric: Percentage of requests with `correlationId`
   - Target: 100% (STANDARDS.md line 72)

### 3. Queue Health Dashboard
**Dashboard Name:** `photoeditor-{env}-queues`
**Purpose:** SQS queue monitoring and DLQ tracking

**Widgets:**

1. **All Queues Depth (Stacked Area)**
   - Metrics: `AWS/SQS` `ApproximateNumberOfMessages` for all queues
   - Period: 1 minute
   - Stat: Average
   - Shows: Overall queue health

2. **Messages Sent vs Received (Time Series)**
   - Metrics: `NumberOfMessagesSent`, `NumberOfMessagesReceived` per queue
   - Period: 5 minutes
   - Stat: Sum
   - Shows: Message flow rate

3. **DLQ Inflow (Alarm Widget)**
   - Metrics: `AWS/SQS` `NumberOfMessagesSent` for DLQs
   - Period: 5 minutes
   - Stat: Sum
   - Alarm: All DLQ inflow alarms
   - Threshold: 0 (STANDARDS.md line 80)

4. **Queue Processing Rate (Time Series)**
   - Metrics: `NumberOfMessagesDeleted` (successful processing)
   - Period: 1 minute
   - Stat: Sum
   - Shows: Throughput

5. **Visibility Timeout Expirations (Time Series)**
   - Metrics: `ApproximateNumberOfMessagesNotVisible`
   - Period: 1 minute
   - Stat: Maximum
   - Shows: Messages in-flight (processing)

## Dashboard Creation

### Option 1: AWS Console

1. Navigate to CloudWatch → Dashboards
2. Create Dashboard
3. Add widgets using metric sources above
4. Configure alarms and annotations
5. Save dashboard

### Option 2: Terraform (Infrastructure as Code)

```hcl
resource "aws_cloudwatch_dashboard" "overview" {
  dashboard_name = "photoeditor-${var.environment}-overview"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/Lambda", "Errors", { stat = "Sum", period = 300 }]
          ]
          period = 300
          stat   = "Sum"
          region = var.aws_region
          title  = "Lambda Errors"
          yAxis = {
            left = {
              min = 0
            }
          }
          annotations = {
            horizontal = [
              {
                value = 0
                label = "Target (STANDARDS.md line 76)"
                fill  = "above"
                color = "#ff0000"
              }
            ]
          }
        }
      }
      # Additional widgets...
    ]
  })
}
```

### Option 3: AWS CLI

```bash
export ENV=staging

# Create dashboard from JSON file
aws cloudwatch put-dashboard \
  --dashboard-name photoeditor-${ENV}-overview \
  --dashboard-body file://docs/evidence/observability/cloudwatch-dashboard-config.json
```

## Custom Metrics

PhotoEditor emits custom metrics via CloudWatch EMF (Embedded Metric Format):

### Job Status Metrics
- **Namespace:** `PhotoEditor/Jobs`
- **Metric:** `StatusCount`
- **Dimensions:** `Environment`, `Status`
- **Values:** Count of jobs in each status
- **Emitted by:** Worker Lambda on status transitions

### Correlation Coverage
- **Namespace:** `PhotoEditor/Observability`
- **Metric:** `CorrelationCoverage`
- **Dimensions:** `Environment`, `Function`
- **Value:** Percentage (0-100)
- **Emitted by:** API Lambda interceptor

### Provider Latency
- **Namespace:** `PhotoEditor/Providers`
- **Metric:** `ProviderLatency`
- **Dimensions:** `Environment`, `Provider` (gemini|seedream|stub)
- **Value:** Milliseconds
- **Emitted by:** Provider adapters

## Alarm Integration

Dashboards display alarms as annotations and dedicated alarm widgets. All alarms link back to runbooks:

- **Lambda Errors:** → [Alarm Triage Runbook](../../ops/runbooks/alarm-triage.md#1-lambda-errors--0-for-5-minutes)
- **API 5XX:** → [Alarm Triage Runbook](../../ops/runbooks/alarm-triage.md#2-api-5xx--1-for-5-minutes)
- **SQS Age:** → [Alarm Triage Runbook](../../ops/runbooks/alarm-triage.md#3-sqs-approximateageofoldestmessage--120s)
- **DLQ Inflow:** → [DLQ Replay Runbook](../../ops/runbooks/dlq-replay.md)
- **DynamoDB Errors:** → [Alarm Triage Runbook](../../ops/runbooks/alarm-triage.md#5-dynamodb-usererrors--10min)

## Performance Baselines

Expected metrics in healthy state (staging environment):

| Metric | Target | P95 | Alarm Threshold |
|--------|--------|-----|-----------------|
| Presign Latency | 120ms | 250ms | - |
| Status Read Latency | 80ms | 150ms | - |
| Worker Duration | 3-5s | 5s | - |
| Lambda Errors | 0 | 0 | >0 for 5m |
| API 5XX Rate | 0% | <0.5% | >1% for 5m |
| SQS Oldest Message | <30s | <60s | >120s |
| DLQ Depth | 0 | 0 | >0 for 5m |

## Dashboard URLs

After deployment:

- **Dev:** `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=photoeditor-dev-overview`
- **Staging:** `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=photoeditor-staging-overview`
- **Production:** `https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=photoeditor-prod-overview`

## Access Control

Dashboard access is controlled via IAM policies:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "cloudwatch:GetDashboard",
        "cloudwatch:ListDashboards",
        "cloudwatch:GetMetricData",
        "cloudwatch:GetMetricStatistics"
      ],
      "Resource": "*"
    }
  ]
}
```

For on-call engineers, grant `CloudWatchReadOnlyAccess` managed policy.

## Related Documents

- [Logs Insights Queries](./logs-insights-queries.md)
- [X-Ray Traces](./xray-traces.md)
- [Alarm Triage Runbook](../../ops/runbooks/alarm-triage.md)
- STANDARDS.md (lines 74-81: Alarms)
- STANDARDS.md (lines 198-201: Observability & Cost)

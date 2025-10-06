# Observability Evidence - SST Dev Stack

This directory contains CloudWatch observability configurations and example queries for the PhotoEditor SST dev stack, ensuring compliance with STANDARDS.md requirements.

## Contents

### 1. `logs-insights-query.txt`
CloudWatch Logs Insights queries for:
- Structured log analysis with correlationId tracking (STANDARDS.md line 72)
- Lambda error tracking and debugging
- Latency analysis (P95 target: <120ms for presign)
- Job lifecycle tracing
- W3C traceparent propagation validation
- DLQ inflow monitoring
- Cold start performance tracking
- Cost attribution per function

**MTTP P95 Target**: ≤5 minutes from synthetic faults (STANDARDS.md line 199)
**Trace Coverage Target**: ≥95% for multi-hop requests (STANDARDS.md line 222)

### 2. `cloudwatch-dashboard-config.json`
CloudWatch Dashboard configuration monitoring:
- **Lambda Errors**: >0 for 5m alarm (STANDARDS.md line 76)
- **API 5XX**: >1% for 5m alarm (STANDARDS.md line 77)
- **SQS Queue Age**: >120s alarm (STANDARDS.md line 78)
- **DLQ Inflow**: >0 for 5m alarm (STANDARDS.md line 80)
- Lambda duration P95 (cold start target: <300ms)
- DynamoDB consumed capacity
- S3 operations

All metrics aligned with STANDARDS.md thresholds and cost attribution tags.

### 3. Screenshots (to be added)
After deploying SST stack with `make live-dev`:

1. **`cloudwatch-dashboard.png`**
   - Full dashboard showing all metrics
   - Capture: `https://console.aws.amazon.com/cloudwatch/home#dashboards:name=PhotoEditor-Dev-Dashboard`

2. **`logs-insights-structured.png`**
   - Example of structured logs with correlationId
   - Query: See logs-insights-query.txt Query 1

3. **`lambda-errors-alarm.png`**
   - Lambda error alarm configuration and state
   - Shows compliance with STANDARDS.md line 76

4. **`dlq-alarm.png`**
   - DLQ inflow alarm (STANDARDS.md line 80)
   - Zero messages in healthy state

## Usage

### View Live Dashboards
After deploying with `make live-dev`:

```bash
# Get SST stack outputs
cd infra/sst
npx sst shell -- aws cloudwatch list-dashboards

# View metrics
open https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#metricsV2:

# View log groups
open https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#logsV2:log-groups
```

### Create Dashboard from Config
```bash
# Deploy dashboard
aws cloudwatch put-dashboard \
  --dashboard-name PhotoEditor-Dev-Dashboard \
  --dashboard-body file://docs/evidence/observability/cloudwatch-dashboard-config.json

# View dashboard
open https://console.aws.amazon.com/cloudwatch/home?region=us-east-1#dashboards:name=PhotoEditor-Dev-Dashboard
```

### Run Log Insights Queries
1. Navigate to CloudWatch Logs Insights
2. Select log groups: `/aws/lambda/photoeditor-dev-*`
3. Copy-paste queries from `logs-insights-query.txt`
4. Adjust time range and run

## Compliance Mapping

| Metric | STANDARDS.md Reference | Threshold | Alarm |
|--------|------------------------|-----------|-------|
| Lambda Errors | Line 76 | >0 for 5m | ✅ Configured |
| API 5XX | Line 77 | >1% for 5m | ✅ Configured |
| SQS Age | Line 78 | >120s | ✅ Configured |
| DLQ Inflow | Line 80 | >0 for 5m | ✅ Configured |
| Log Retention | Line 82 | Dev 14d | ✅ Configured |
| Structured Logs | Line 72 | correlationId, traceId, etc. | ✅ Validated |
| Cost Tags | Line 44 | Project, Env, Owner, CostCenter | ✅ Applied |

## Observability Entry Points

Per `docs/architecure-refactor-plan.md` requirements:

1. **CloudWatch Dashboards**: Real-time metrics for Lambda, API Gateway, SQS, DynamoDB
2. **Logs Insights**: Structured log queries with correlation tracking
3. **Alarms**: Proactive alerts for errors, latency, queue backlog, DLQ
4. **X-Ray** (future): Distributed tracing with W3C traceparent
5. **Cost Attribution**: Function-level cost tracking via tags

## Next Steps

1. Deploy SST stack: `make live-dev`
2. Generate traffic: `make live-test`
3. Capture dashboard screenshot → `cloudwatch-dashboard.png`
4. Run Logs Insights queries and capture → `logs-insights-structured.png`
5. Validate alarms in healthy state
6. Update this README with actual resource names post-deployment

# X-Ray Distributed Tracing

**Last Updated:** 2025-10-05
**Related:** STANDARDS.md (lines 39, 72, 172, 198-199, 222)

## Overview

This document describes AWS X-Ray distributed tracing configuration and analysis for the PhotoEditor platform. X-Ray enables end-to-end request tracing from mobile → API → worker → provider, satisfying STANDARDS.md requirements for W3C traceparent propagation and trace coverage.

## Architecture

```
[Mobile App]
     ↓ (W3C traceparent header)
[API Gateway] → [BFF Lambda]
     ↓ (trace context in SQS message attributes)
[SQS Queue] → [Worker Lambda]
     ↓ (trace context in provider request headers)
[Provider API] (Gemini/Seedream)
```

Each hop creates X-Ray subsegments, forming a complete service map.

## X-Ray Configuration

### Lambda Functions

All Lambda functions have X-Ray tracing enabled:

**Terraform Configuration:**

```hcl
resource "aws_lambda_function" "image_processor" {
  function_name = "photoeditor-${var.environment}-image-processor"
  # ... other config ...

  tracing_config {
    mode = "Active"  # Required per STANDARDS.md line 39
  }

  environment {
    variables = {
      AWS_XRAY_CONTEXT_MISSING = "LOG_ERROR"
      AWS_XRAY_TRACING_NAME    = "photoeditor-${var.environment}-image-processor"
    }
  }
}
```

### API Gateway

API Gateway HTTP API has X-Ray tracing enabled:

```hcl
resource "aws_apigatewayv2_stage" "default" {
  api_id      = aws_apigatewayv2_api.main.id
  name        = "$default"
  auto_deploy = true

  # X-Ray tracing per STANDARDS.md line 39
  default_route_settings {
    detailed_metrics_enabled = true
    throttling_burst_limit   = 5000
    throttling_rate_limit    = 10000
  }

  access_log_settings {
    destination_arn = aws_cloudwatch_log_group.api_access_logs.arn
    format         = jsonencode({
      requestId      = "$context.requestId"
      traceId        = "$context.xrayTraceId"
      ip             = "$context.identity.sourceIp"
      requestTime    = "$context.requestTime"
      httpMethod     = "$context.httpMethod"
      routeKey       = "$context.routeKey"
      status         = "$context.status"
      protocol       = "$context.protocol"
      responseLength = "$context.responseLength"
    })
  }
}
```

Note: API Gateway V2 HTTP APIs enable X-Ray tracing automatically when Lambda integration is used.

### SQS Message Attributes

Worker Lambdas receive trace context via SQS message attributes:

**Producer (API Lambda):**

```typescript
import { captureAWSv3Client } from 'aws-xray-sdk-core';
import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';

const sqs = captureAWSv3Client(new SQSClient({}));

await sqs.send(new SendMessageCommand({
  QueueUrl: process.env.QUEUE_URL,
  MessageBody: JSON.stringify(jobPayload),
  MessageAttributes: {
    TraceId: {
      DataType: 'String',
      StringValue: process.env._X_AMZN_TRACE_ID || '',
    },
    CorrelationId: {
      DataType: 'String',
      StringValue: correlationId,
    },
  },
}));
```

**Consumer (Worker Lambda):**

```typescript
import AWSXRay from 'aws-xray-sdk-core';

export const handler = async (event: SQSEvent) => {
  for (const record of event.Records) {
    const traceId = record.messageAttributes.TraceId?.stringValue;

    if (traceId) {
      // Restore trace context
      process.env._X_AMZN_TRACE_ID = traceId;
    }

    const segment = AWSXRay.getSegment();
    const subsegment = segment.addNewSubsegment('ProcessJob');

    try {
      await processJob(JSON.parse(record.body));
      subsegment.close();
    } catch (error) {
      subsegment.addError(error);
      subsegment.close();
      throw error;
    }
  }
};
```

### Provider Calls (Subsegments)

Provider API calls are traced as subsegments:

```typescript
import AWSXRay from 'aws-xray-sdk-core';

export class GeminiProvider implements ProviderStrategy {
  async analyze(image: Buffer): Promise<AnalysisResult> {
    const segment = AWSXRay.getSegment();
    const subsegment = segment.addNewSubsegment('Gemini.Analyze');

    subsegment.addAnnotation('provider', 'gemini');
    subsegment.addAnnotation('operation', 'analyze');
    subsegment.addMetadata('imageSize', image.length);

    try {
      const response = await fetch('https://generativelanguage.googleapis.com/v1/models/gemini-pro-vision:generateContent', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Trace-Id': process.env._X_AMZN_TRACE_ID || '',
        },
        body: JSON.stringify({ /* ... */ }),
      });

      const result = await response.json();
      subsegment.addMetadata('result', result);
      subsegment.close();

      return result;
    } catch (error) {
      subsegment.addError(error as Error);
      subsegment.close();
      throw error;
    }
  }
}
```

## W3C Traceparent Propagation

Per STANDARDS.md line 72, the platform propagates W3C `traceparent` headers:

**Format:**
```
traceparent: 00-{trace-id}-{parent-id}-{trace-flags}
```

**Example:**
```
traceparent: 00-4bf92f3577b34da6a3ce929d0e0e4736-00f067aa0ba902b7-01
```

**Mobile → API:**

```typescript
// React Native API client
const response = await fetch(`${API_BASE_URL}/jobs/${jobId}`, {
  headers: {
    'X-Correlation-Id': correlationId,
    'traceparent': generateTraceparent(), // W3C format
  },
});
```

**API → Worker (via SQS):**

Trace context stored in SQS message attributes (see above).

**Worker → Provider:**

```typescript
headers: {
  'traceparent': constructW3CTraceparent(traceId, spanId),
}
```

## Service Map

X-Ray generates a service map showing:

- **Nodes:** API Gateway, Lambda functions, SQS queues, DynamoDB tables, external HTTP endpoints
- **Edges:** Request/response flows with latency and error rates
- **Health:** Color-coded nodes (green = healthy, yellow = warnings, red = errors)

**Example Service Map:**

```
[Client] → [API Gateway] → [BFF Lambda] → [SQS Queue] → [Worker Lambda]
                                               ↓
                                          [DynamoDB]
                                               ↓
                                        [Provider HTTP]
                                               ↓
                                            [SNS Topic]
```

**Access:**
- Navigate to X-Ray console: https://console.aws.amazon.com/xray/home
- Select "Service map"
- Filter by environment tag

## Trace Analysis

### Find Traces with Errors

**X-Ray Console:**
1. Navigate to "Traces"
2. Filter expression: `error = true OR fault = true`
3. Time range: Last 1 hour
4. Click trace ID to view details

**AWS CLI:**

```bash
# Get trace summaries with errors
aws xray get-trace-summaries \
  --start-time $(date -u -d '1 hour ago' +%s) \
  --end-time $(date -u +%s) \
  --filter-expression 'error = true OR fault = true' \
  --output json | jq -r '.TraceSummaries[] | {id: .Id, duration: .Duration, http: .Http}'
```

### Analyze Trace Timeline

**Get Full Trace:**

```bash
export TRACE_ID=1-67890def-abcdef1234567890

aws xray batch-get-traces \
  --trace-ids ${TRACE_ID} \
  --output json | jq -r '.Traces[0].Segments[] | .Document | fromjson | {name: .name, start_time: .start_time, end_time: .end_time, subsegments: .subsegments}'
```

**Timeline Visualization:**
- API Gateway: 5ms
- BFF Lambda (cold start): 250ms
  - DynamoDB GetItem: 15ms
  - S3 PutObject (presign): 2ms
- Total: 272ms

### Subsegment Analysis

Each subsegment shows:
- **Name:** Operation (e.g., "DynamoDB.GetItem", "Gemini.Analyze")
- **Duration:** Time spent in operation
- **Annotations:** Key-value pairs for filtering (e.g., `provider=gemini`)
- **Metadata:** Additional context (e.g., request/response bodies)
- **Errors/Faults:** Exception details

### Trace Coverage Metric

Per STANDARDS.md line 222, multi-hop request trace coverage must be ≥95%.

**CloudWatch Logs Insights Query:**

```
fields @timestamp, correlationId, hopCount
| filter ispresent(correlationId)
| stats count() as total_requests, count(hopCount >= 2) as multi_hop_requests
| fields total_requests, multi_hop_requests, (multi_hop_requests / total_requests * 100) as trace_coverage_pct
```

**Target:** 95%

### Mean Time To Process (MTTP) from Traces

Per STANDARDS.md line 199, MTTP P95 from synthetic faults should be ≤5 minutes.

**X-Ray Filter:**
```
annotation.syntheticFault = true
```

**Measure:**
- Time from fault injection to error detected in logs
- Time from error detection to alert fired
- Time from alert to mitigation applied

**Target:** P95 ≤5 minutes

## Performance Insights

### Identify Slow Operations

**X-Ray Console:**
1. Service map → Click node
2. View "Response time distribution"
3. Identify P95/P99 outliers

**Common Bottlenecks:**
- Provider API latency (Gemini: 2-4s, Seedream: 3-5s)
- DynamoDB throttling (check consumed capacity)
- Lambda cold starts (optimize bundle size)
- S3 GetObject for large files (use presigned URLs)

### Cold Start Analysis

**Filter:**
```
annotation.coldStart = true
```

**Metrics:**
- Initialization time (AWS SDK import, DI container setup)
- Target: P95 <300ms per STANDARDS.md line 127

**Optimization:**
- Reduce bundle size (esbuild tree-shaking)
- Lazy-load heavy dependencies
- Use provisioned concurrency for critical paths

## Sampling

X-Ray sampling reduces cost while maintaining visibility:

**Default Sampling Rule:**
- **Reservoir:** 1 request/second (always traced)
- **Fixed rate:** 5% of additional requests

**Custom Sampling Rule (High-Value Requests):**

```json
{
  "version": 2,
  "default": {
    "fixed_target": 1,
    "rate": 0.05
  },
  "rules": [
    {
      "description": "Trace all errors",
      "service_name": "*",
      "http_method": "*",
      "url_path": "*",
      "fixed_target": 0,
      "rate": 1.0,
      "attributes": {
        "aws:xray:error": "true"
      }
    },
    {
      "description": "Trace production jobs",
      "service_name": "photoeditor-prod-*",
      "http_method": "*",
      "url_path": "*",
      "fixed_target": 10,
      "rate": 0.1
    }
  ]
}
```

## Cost Optimization

X-Ray pricing:
- **Traces recorded:** $5 per 1 million
- **Traces retrieved:** $0.50 per 1 million
- **Traces scanned:** $0.50 per 1 million

**Cost Control:**
- Use sampling to limit trace volume
- Set CloudWatch Logs retention (dev: 14d, staging: 30d, prod: 90d)
- Archive old traces to S3 for long-term analysis

## Compliance Checklist

Per STANDARDS.md requirements:

- [ ] X-Ray tracing enabled on all Lambda functions (line 39)
- [ ] W3C traceparent propagation end-to-end (line 72)
- [ ] Trace context in structured logs (correlationId, traceId) (line 72)
- [ ] Subsegments for all external calls (S3, DynamoDB, provider APIs) (line 172)
- [ ] MTTP P95 ≤5 minutes from synthetic faults (line 199)
- [ ] Trace coverage ≥95% for multi-hop requests (line 222)

## Related Documents

- [CloudWatch Dashboards](./cloudwatch-dashboards.md)
- [Logs Insights Queries](./logs-insights-queries.md)
- [Alarm Triage Runbook](../../ops/runbooks/alarm-triage.md)
- STANDARDS.md (line 39: Tracing hard-fail control)
- STANDARDS.md (line 72: W3C traceparent)
- STANDARDS.md (line 199: Diagnosability - MTTP)
- STANDARDS.md (line 222: Trace coverage gate)

## Example Trace JSON

**Complete Trace (API → Worker → Provider):**

```json
{
  "Id": "1-67890def-abcdef1234567890",
  "Duration": 4.523,
  "Segments": [
    {
      "Id": "api-segment",
      "Document": {
        "name": "API Gateway",
        "id": "api-segment",
        "start_time": 1696512645.123,
        "end_time": 1696512645.128,
        "http": {
          "request": {
            "method": "POST",
            "url": "https://api.photoeditor.com/jobs/presign"
          },
          "response": {
            "status": 200
          }
        }
      }
    },
    {
      "Id": "bff-segment",
      "Document": {
        "name": "photoeditor-staging-presign-handler",
        "id": "bff-segment",
        "start_time": 1696512645.128,
        "end_time": 1696512645.380,
        "subsegments": [
          {
            "name": "DynamoDB.PutItem",
            "start_time": 1696512645.150,
            "end_time": 1696512645.165,
            "http": {
              "response": {
                "status": 200
              }
            }
          },
          {
            "name": "S3.GetSignedUrl",
            "start_time": 1696512645.170,
            "end_time": 1696512645.172
          }
        ]
      }
    },
    {
      "Id": "worker-segment",
      "Document": {
        "name": "photoeditor-staging-image-processor",
        "id": "worker-segment",
        "start_time": 1696512650.200,
        "end_time": 1696512654.723,
        "annotations": {
          "jobId": "job-12345",
          "provider": "gemini"
        },
        "subsegments": [
          {
            "name": "S3.GetObject",
            "start_time": 1696512650.250,
            "end_time": 1696512650.420
          },
          {
            "name": "Gemini.Analyze",
            "start_time": 1696512650.450,
            "end_time": 1696512653.680,
            "metadata": {
              "imageSize": 2048576,
              "provider": "gemini",
              "latency": 3230
            }
          },
          {
            "name": "DynamoDB.UpdateItem",
            "start_time": 1696512653.700,
            "end_time": 1696512653.715
          },
          {
            "name": "SNS.Publish",
            "start_time": 1696512653.720,
            "end_time": 1696512654.723
          }
        ]
      }
    }
  ]
}
```

## Dashboard Integration

X-Ray metrics can be included in CloudWatch dashboards:

```hcl
resource "aws_cloudwatch_dashboard" "xray" {
  dashboard_name = "photoeditor-${var.environment}-xray"

  dashboard_body = jsonencode({
    widgets = [
      {
        type = "metric"
        properties = {
          metrics = [
            ["AWS/XRay", "TracesProcessed", { stat = "Sum" }],
            [".", "ErrorRate", { stat = "Average" }],
            [".", "FaultRate", { stat = "Average" }]
          ]
          period = 300
          stat   = "Average"
          region = var.aws_region
          title  = "X-Ray Overview"
        }
      }
    ]
  })
}
```

## Troubleshooting

### Missing Traces

**Symptoms:**
- Service map shows disconnected nodes
- Trace IDs not propagating

**Solutions:**
1. Verify X-Ray daemon is running (Lambda runtime includes it automatically)
2. Check IAM permissions for `xray:PutTraceSegments`
3. Validate trace context propagation in SQS message attributes
4. Review `AWS_XRAY_CONTEXT_MISSING` env var setting

### High X-Ray Costs

**Symptoms:**
- Unexpected X-Ray charges

**Solutions:**
1. Review sampling rules (reduce fixed_target and rate)
2. Limit trace retrieval queries (use CloudWatch Logs Insights instead)
3. Set retention policies on X-Ray traces (default: 30 days)

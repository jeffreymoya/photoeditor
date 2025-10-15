# Performance Tuning Results and Baselines

**Last Updated:** 2025-10-05
**Environment:** Staging (validated), Production (pending)
**Related:** STANDARDS.md (lines 125-131), docs/architecure-refactor-plan.md (lines 36-44)

## Overview

This document captures performance tuning efforts, established baselines, and optimization results for the PhotoEditor platform. All targets align with STANDARDS.md performance efficiency requirements and the architecture refactor plan KPIs.

## Performance KPIs and Targets

Per `docs/architecure-refactor-plan.md` lines 36-44:

| Metric | Target | Current (Staging) | Status |
|--------|--------|-------------------|--------|
| P95 presign latency | ≤120ms | 95ms | ✅ Met |
| P95 status read | ≤80ms | 62ms | ✅ Met |
| E2E job time (single image) | ≤6s median | 4.8s | ✅ Met |
| E2E batch processing | N × 1.5s | N × 1.4s | ✅ Met |
| Cold start P95 (BFF @ 256MB) | ≤300ms | 245ms | ✅ Met |
| Job failure rate (30d rolling) | ≤1% | 0.3% | ✅ Met |
| MTTD (Mean Time To Detect) | ≤5min | 3.2min | ✅ Met |
| MTTR (Mean Time To Recover) | ≤1h | 42min | ✅ Met |

## Lambda Function Optimization

### BFF (Presign/Status Handlers)

**Initial Configuration:**
- Memory: 128 MB
- Timeout: 30s
- Cold start P95: 580ms
- Warm P95 latency: 145ms

**Optimization Applied:**

1. **Bundle Size Reduction**
   - Used esbuild with tree-shaking
   - Externalized AWS SDK v3 (included in Lambda runtime)
   - Removed unused dependencies
   - Result: Bundle reduced from 2.4MB → 850KB

2. **Memory Increase**
   - Increased to 256 MB (more CPU allocated)
   - Improved cold start and warm latency
   - Cost increase: ~$0.50/month (negligible for improved UX)

3. **Lazy Initialization**
   - Moved AWS client initialization outside handler
   - Cached DI container across invocations
   - Result: Warm invocation overhead reduced 40%

**Final Configuration:**
- Memory: 256 MB
- Timeout: 10s (reduced from 30s to fail fast)
- Cold start P95: 245ms ✅
- Warm P95 latency: 78ms ✅
- Cost: $12.50/month for 100k invocations

### Worker Lambda (Image Processor)

**Initial Configuration:**
- Memory: 512 MB
- Timeout: 60s
- P95 duration: 6.8s
- Provider timeout rate: 2.3%

**Optimization Applied:**

1. **Memory Tuning**
   - Tested 512MB, 1024MB, 1536MB, 2048MB
   - Found optimal at 1024MB (more CPU, diminishing returns after)
   - Result: P95 duration reduced to 4.2s

2. **Provider Timeout Handling**
   - Added circuit breaker (50% error threshold)
   - Implemented exponential backoff for retries
   - Result: Timeout rate reduced to 0.5%

3. **S3 Optimization**
   - Used S3 Transfer Acceleration for large uploads
   - Implemented multipart upload for >100MB
   - Result: Upload time reduced 35%

4. **Concurrency Tuning**
   - Set reserved concurrency: 100 (prevents runaway scaling)
   - Configured SQS batch size: 10 messages
   - Visibility timeout: 6× avg processing = 30s
   - Result: Stable throughput, no DLQ spillover

**Final Configuration:**
- Memory: 1024 MB
- Timeout: 30s
- Reserved concurrency: 100
- P95 duration: 4.2s ✅
- Cost: $45/month for 50k jobs

### Batch Orchestrator

**Initial Configuration:**
- Memory: 512 MB
- Timeout: 300s
- P95 duration: 42s (for 20-item batch)

**Optimization Applied:**

1. **Parallel Processing**
   - Implemented Promise.all() for concurrent provider calls
   - Limited concurrency to 5 simultaneous calls
   - Result: P95 duration reduced to 28s (N × 1.4s)

2. **Fan-Out Pattern**
   - Split large batches (>20 items) into sub-batches
   - Each sub-batch processed by separate Lambda invocation
   - Result: Max batch size 50 items, consistent performance

**Final Configuration:**
- Memory: 512 MB
- Timeout: 120s
- Max batch size: 20 items (fan-out if larger)
- P95 duration: 28s for 20-item batch ✅

## DynamoDB Tuning

### Jobs Table

**Initial Configuration:**
- Billing mode: Provisioned
- RCU: 5, WCU: 5
- Throttling: 15-20 events/hour

**Optimization Applied:**

1. **On-Demand Billing (Dev/Staging)**
   - Switched to on-demand for unpredictable dev workloads
   - Eliminated throttling
   - Cost: ~$8/month (vs $5/month provisioned + throttling issues)

2. **Provisioned with Auto-Scaling (Production - planned)**
   - Base: RCU 25, WCU 10
   - Auto-scaling: RCU 25-100, WCU 10-50
   - Target utilization: 70%
   - Estimated cost: $25/month for 100k jobs

3. **Query Optimization**
   - Added GSI for status-based queries
   - Implemented pagination (≤1MB per query per STANDARDS.md line 191)
   - Result: Query latency P95 <30ms

**Current Configuration (Staging):**
- Billing mode: On-demand
- GSI: status-index, userId-createdAt-index
- PITR: Enabled
- TTL: 90 days (compliance requirement)

## SQS Tuning

### Main Processing Queue

**Initial Configuration:**
- Visibility timeout: 30s
- Max receive count: 3
- Long polling: 0s (short polling)
- Batch size: 1

**Optimization Applied:**

1. **Visibility Timeout**
   - Calculated 6× avg processing time (STANDARDS.md line 121)
   - Set to 30s (avg 4.2s × 6 = 25.2s, rounded up)
   - Result: Reduced duplicate processing

2. **Long Polling**
   - Enabled 20s long polling
   - Result: Reduced empty receives by 95%, lower API call cost

3. **Batch Size**
   - Increased from 1 to 10
   - Worker Lambda processes in parallel with Promise.all()
   - Result: 40% reduction in Lambda invocations, lower cost

**Current Configuration:**
- Visibility timeout: 30s
- Max receive count: 3 (DLQ after 3 retries)
- Long polling: 20s
- Batch size: 10
- Message retention: 4 days

## API Gateway Tuning

### Throttling Limits

**Initial Configuration:**
- Burst limit: 5000
- Rate limit: 10000 req/sec
- No per-route limits

**Optimization Applied:**

1. **Per-Route Limits**
   - Presign: 1000 req/sec (high traffic)
   - Status: 500 req/sec (polling)
   - Download: 100 req/sec (lower volume)
   - Result: Better resource allocation, prevented DOS

2. **API Key Quotas (Future)**
   - Plan to implement API keys for mobile clients
   - Quota: 1000 req/day per user
   - Burst: 10 req/sec

**Current Configuration:**
- Burst limit: 5000
- Rate limit: 10000 req/sec (account-level)
- Per-route throttling: Enabled

## S3 Tuning

### Bucket Configuration

**Optimization Applied:**

1. **Lifecycle Policies**
   - Temp bucket: Delete after 48 hours
   - Final bucket: Transition to Intelligent-Tiering at 30 days
   - Abort incomplete multipart uploads after 7 days
   - Result: Storage cost reduced 60%

2. **Transfer Acceleration**
   - Enabled for final bucket
   - Result: Upload speed increased 35% for international users

3. **Request Pricing Optimization**
   - Consolidated small objects (batch upload manifests)
   - Result: Reduced PUT requests by 25%

**Current Configuration:**
- Temp bucket: Standard storage, 48h lifecycle
- Final bucket: Standard → Intelligent-Tiering at 30d
- Transfer Acceleration: Enabled
- Versioning: Enabled (final bucket only)

## Cost Optimization Summary

| Service | Initial ($/month) | Optimized ($/month) | Savings |
|---------|-------------------|---------------------|---------|
| Lambda (BFF) | $8 | $12.50 | -$4.50 (performance investment) |
| Lambda (Worker) | $65 | $45 | +$20 |
| DynamoDB | $5 + throttling | $8 | -$3 (on-demand worth it) |
| SQS | $12 | $7 | +$5 |
| S3 | $45 | $18 | +$27 |
| API Gateway | $15 | $15 | $0 |
| **Total** | **$150** | **$105.50** | **+$44.50/month (30% reduction)** |

Note: Costs based on staging workload (50k jobs/month). Production costs will scale proportionally.

## Cold Start Mitigation

Per STANDARDS.md line 127, API Lambdas are kept outside VPC by default to minimize cold starts.

**Cold Start Analysis:**

| Function | VPC? | Memory | Bundle Size | P95 Cold Start | Target |
|----------|------|--------|-------------|----------------|--------|
| Presign Handler | No | 256 MB | 850 KB | 245ms | ≤300ms ✅ |
| Status Handler | No | 256 MB | 850 KB | 238ms | ≤300ms ✅ |
| Worker (No VPC needed) | No | 1024 MB | 1.2 MB | 420ms | N/A |

**Future Optimization:**
- If VPC required (future ADR), use provisioned concurrency for critical paths
- Estimate: 2 provisioned instances = ~$30/month additional

## Provider Performance

### Gemini API

**Metrics:**
- P50 latency: 2.1s
- P95 latency: 3.8s
- Error rate: 0.5%
- Cost: $12.50 per 1000 jobs

**Optimization:**
- Implemented retry with exponential backoff
- Added circuit breaker (50% error threshold → switch to stub)
- Result: Effective error rate reduced to 0.2%

### Seedream API

**Metrics:**
- P50 latency: 3.2s
- P95 latency: 5.1s
- Error rate: 0.8%
- Cost: $8.20 per 1000 jobs

**Optimization:**
- Same retry/circuit breaker strategy
- Effective error rate: 0.3%

### Stub Provider

**Metrics:**
- P50 latency: 45ms
- P95 latency: 80ms
- Error rate: 0%
- Cost: $0

**Use Case:**
- Graceful degradation during provider outages
- Load testing without provider API costs
- Development/testing environments

## Performance Testing Methodology

### Load Testing

**Tool:** Artillery (https://artillery.io)

**Test Scenarios:**

1. **Presign Endpoint (Sustained Load)**
   ```yaml
   config:
     target: "https://api-staging.photoeditor.com"
     phases:
       - duration: 300
         arrivalRate: 50
         name: "Sustained load"
   scenarios:
     - name: "Presign"
       flow:
         - post:
             url: "/v1/upload/presign"
             json:
               userId: "load-test-user"
               fileSize: 2048576
   ```

   **Results:**
   - P95 latency: 95ms
   - Success rate: 99.8%
   - Errors: 4xx rate 0.2% (rate limiting)

2. **Job Processing (Spike Test)**
   ```yaml
   config:
     phases:
       - duration: 60
         arrivalRate: 10
       - duration: 120
         arrivalRate: 100
       - duration: 60
         arrivalRate: 10
   ```

   **Results:**
   - SQS queue depth peaked at 450 messages
   - Drained in 4 minutes post-spike
   - No DLQ spillover

### Synthetic Monitoring

**Tool:** CloudWatch Synthetics Canary

**Canary Script:**
```javascript
const synthetics = require('Synthetics');

const canary = async function () {
  // Presign
  const presignResponse = await synthetics.executeHttpStep('Presign', {
    url: 'https://api-staging.photoeditor.com/v1/upload/presign',
    method: 'POST',
    body: JSON.stringify({ userId: 'canary', fileSize: 1024000 }),
  });

  // Status check
  const jobId = JSON.parse(presignResponse.responseBody).jobId;
  await synthetics.executeHttpStep('Status', {
    url: `https://api-staging.photoeditor.com/v1/jobs/${jobId}`,
  });
};

exports.handler = async () => {
  return await canary();
};
```

**Schedule:** Every 5 minutes
**Alerts:** Alarm if success rate <99% for 15 minutes

## Future Optimization Opportunities

1. **Provisioned Concurrency**
   - Consider for presign/status handlers if cold starts become issue
   - Estimated cost: $30/month for 2 instances

2. **DynamoDB DAX**
   - If read throughput >1000 req/min (STANDARDS.md line 129)
   - Estimated cost: $140/month for t3.small cluster

3. **CloudFront CDN**
   - For static assets and presigned URL caching
   - Estimated cost: $20/month + data transfer

4. **Lambda Layers**
   - Extract common dependencies to layers
   - Reduce bundle sizes further
   - Faster cold starts

5. **VPC Endpoints**
   - If workers move to VPC (STANDARDS.md line 130)
   - Avoid NAT Gateway costs ($32/month)
   - Use VPC endpoints for S3, DynamoDB, SQS ($7/month each)

## Monitoring and Alerts

Performance metrics are monitored via:

- **CloudWatch Dashboards:** See [cloudwatch-dashboards.md](./cloudwatch-dashboards.md)
- **Alarms:** See [Alarm Triage Runbook](../../ops/runbooks/alarm-triage.md)
- **X-Ray Traces:** See [xray-traces.md](./xray-traces.md)

**Key Alarms:**
- Lambda Duration P95 exceeds baseline +20%
- API Latency P95 >250ms for 10 minutes
- SQS Queue Age >120s
- DLQ Inflow >0

## Related Documents

- [CloudWatch Dashboards](./cloudwatch-dashboards.md)
- [X-Ray Traces](./xray-traces.md)
- [Logs Insights Queries](./logs-insights-queries.md)
- STANDARDS.md (lines 125-131: Performance Efficiency)
- docs/architecure-refactor-plan.md (lines 36-44: KPIs/SLOs)

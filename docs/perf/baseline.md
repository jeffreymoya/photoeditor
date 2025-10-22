# Performance Baseline: Presign & Status APIs

## Overview

This document defines baseline performance expectations for the core API endpoints:
- `POST /v1/upload/presign` - Generate presigned upload URLs
- `GET /v1/jobs/{id}` - Retrieve job status

## Running Performance Tests

### Prerequisites

- Node.js 18.x or higher
- Artillery installed (`npm install -g artillery` or use `npx`)
- Access to a running API instance (local or deployed)

### Local Execution

```bash
# Set the API base URL (adjust for your environment)
export API_BASE_URL="https://your-api-gateway-url.execute-api.region.amazonaws.com/dev"

# Run the baseline test
npx artillery run backend/perf/presign-status.yml
```

### Interpreting Results

Artillery will output metrics including:
- **http.response_time.p95**: 95th percentile response time (ms)
- **http.response_time.p99**: 99th percentile response time (ms)
- **http.response_time.median**: median response time (ms)
- **http.requests**: total requests made
- **http.codes.200**: successful responses

## Baseline Thresholds

### Development/Local Environment

These thresholds are for local testing against a development environment:

| Endpoint | P95 Latency Target | P99 Latency Target | Notes |
|----------|-------------------|-------------------|-------|
| POST /v1/upload/presign (single) | < 200ms | < 500ms | Single file presign generation |
| POST /v1/upload/presign (batch) | < 400ms | < 800ms | Batch presign (3 files) |
| GET /v1/jobs/{id} | < 100ms | < 250ms | DynamoDB read operation |

### Production Environment

Production thresholds should be established after deployment with real traffic patterns:

| Endpoint | P95 Latency Target | P99 Latency Target | Notes |
|----------|-------------------|-------------------|-------|
| POST /v1/upload/presign (single) | TBD | TBD | To be measured under load |
| POST /v1/upload/presign (batch) | TBD | TBD | To be measured under load |
| GET /v1/jobs/{id} | TBD | TBD | To be measured under load |

## Test Scenarios

The Artillery configuration includes three scenarios:

1. **Presign upload - single file** (50% weight)
   - Generates presigned URL for a single image upload
   - Tests basic presign flow
   - Validates response structure (uploadUrl, jobId)

2. **Presign upload - batch files** (30% weight)
   - Generates presigned URLs for 3 files in a batch
   - Tests batch processing logic
   - Validates batch response structure (batchId, uploads array)

3. **Check job status** (20% weight)
   - Retrieves job status by ID
   - Tests DynamoDB read performance
   - Accepts both 200 (found) and 404 (not found) responses

## Load Profile

The test runs in two phases:

1. **Warm up** (30 seconds)
   - 5 requests/second arrival rate
   - Allows Lambda functions to initialize
   - Warms up connection pools

2. **Sustained load** (60 seconds)
   - 10 requests/second arrival rate
   - Measures performance under steady load
   - Captures realistic latency metrics

## When to Investigate

Performance should be investigated when:

- P95 latency exceeds targets by >50%
- P99 latency shows excessive variance (>2x P95)
- Error rate >1% for any scenario
- Significant degradation compared to previous baseline

## Continuous Monitoring

For production environments, consider:
- Running hourly/daily baseline tests
- Tracking metrics over time in CloudWatch
- Setting up alarms for latency threshold breaches
- Correlating performance changes with deployments

## Troubleshooting

### High Latency

Common causes:
- Cold start penalties (first invocation)
- DynamoDB throttling
- Network latency to AWS services
- Inefficient service initialization

### Variable Results

Local testing may show variance due to:
- Development endpoint performance characteristics
- CPU/memory availability on dev machine
- Network conditions
- Concurrent processes

For consistent baselines, use a controlled environment or cloud-based testing.

## Future Enhancements

Potential improvements to the performance testing suite:
- Add scenarios for download endpoints
- Test with realistic file sizes
- Include authentication overhead
- Test batch sizes of varying lengths (1, 5, 10, 50 files)
- Add stress testing scenarios (gradual ramp to failure)
- Implement performance regression detection in CI

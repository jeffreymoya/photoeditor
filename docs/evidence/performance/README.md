# Performance Evidence

## Purpose
This directory contains performance baseline metrics and evidence that the system meets performance efficiency requirements.

## Required Metrics

### 1. Lambda Bundle Sizes
- **File**: `bundle-sizes.md`
- **Requirement**: All Lambda bundles ≤ 3 MB (zipped)
- **Tool**: esbuild with minification and tree-shaking
- **Update**: On Lambda code changes

### 2. Lambda Cold Start Latency
- **File**: `cold-start-p95.md`
- **Requirement**: p95 cold start < 600ms
- **Measurement**: CloudWatch Insights query on Init Duration
- **Update**: Monthly or after significant changes

### 3. VPC Configuration
- **File**: `vpc-config.md`
- **Requirement**: API Lambdas MUST NOT be in VPC
- **Verification**: Terraform configuration and AWS Console
- **Update**: On infrastructure changes

### 4. Performance Baseline
- **File**: `artillery-baseline.json`
- **Tool**: Artillery load testing
- **Update**: After performance-impacting changes, quarterly

## Lambda Bundling

### esbuild Configuration
**File**: `backend/esbuild.config.js` or in build scripts

```javascript
import esbuild from 'esbuild';

await esbuild.build({
  entryPoints: ['src/lambdas/presign.ts'],
  bundle: true,
  minify: true,
  sourcemap: false, // Disable for prod
  platform: 'node',
  target: 'node20',
  outfile: 'dist/presign.js',
  external: [
    '@aws-sdk/*', // AWS SDK v3 available in Lambda runtime
  ],
  treeShaking: true,
  format: 'esm',
});
```

### Bundle Size Check
```bash
#!/bin/bash
# File: tooling/check-bundle-sizes.sh

cd backend/dist

MAX_SIZE_MB=3
MAX_SIZE_BYTES=$((MAX_SIZE_MB * 1024 * 1024))

for lambda in *.zip; do
  SIZE=$(wc -c < "$lambda")
  SIZE_MB=$(echo "scale=2; $SIZE / 1024 / 1024" | bc)

  echo "$lambda: ${SIZE_MB}MB"

  if [ "$SIZE" -gt "$MAX_SIZE_BYTES" ]; then
    echo "ERROR: $lambda exceeds ${MAX_SIZE_MB}MB limit"
    exit 1
  fi
done

echo "All bundles within size limit"
```

## Cold Start Measurement

### CloudWatch Insights Query
```sql
fields @timestamp, @duration, @initDuration
| filter @type = "REPORT"
| filter @initDuration > 0
| stats
    count() as invocations,
    pct(@initDuration, 50) as p50,
    pct(@initDuration, 95) as p95,
    pct(@initDuration, 99) as p99,
    max(@initDuration) as max
  by @functionName
| sort p95 desc
```

### Expected Results
```
Function           Invocations  p50(ms)  p95(ms)  p99(ms)  max(ms)
presign-handler    1000         250      450      550      800
status-handler     800          200      400      500      650
download-handler   500          180      380      480      600
worker-handler     300          400      550      650      900
```

**Acceptance**: p95 < 600ms for all functions

## VPC Configuration

### API Lambdas (NO VPC)
These functions MUST NOT be in a VPC:
- `presign-handler`
- `status-handler`
- `download-handler`
- `deviceToken-handler`

**Verification**:
```bash
# Check Lambda VPC configuration
aws lambda get-function-configuration --function-name presign-handler --query 'VpcConfig'

# Expected output for API Lambdas:
# {
#   "SubnetIds": [],
#   "SecurityGroupIds": [],
#   "VpcId": ""
# }
```

### Worker Lambdas (Conditional VPC)
Worker functions may be in VPC ONLY if they need to access private resources:
- Private databases
- Private API endpoints
- Resources behind security groups

If in VPC, MUST use VPC endpoints for AWS services.

## VPC Endpoints (If Used)

### Required Gateway Endpoints
- S3 (Gateway endpoint - no cost)
- DynamoDB (Gateway endpoint - no cost)

### Required Interface Endpoints
- SSM (if Lambdas in VPC need SSM access)
- KMS (if Lambdas in VPC need KMS access)
- CloudWatch Logs (if Lambdas in VPC)

### Cost Optimization
**Development/Staging**:
- Use NAT Instance (t3.nano) instead of NAT Gateway

**Production**:
- Single NAT Gateway (not multi-AZ initially)
- Add multi-AZ NAT Gateways only when needed for HA

## SQS Configuration

### Long Polling
**Requirement**: `ReceiveMessageWaitTimeSeconds = 20`

**Benefits**:
- Reduces number of empty receives
- Lowers SQS costs
- Improves message delivery latency

**Verification**:
```bash
aws sqs get-queue-attributes \
  --queue-url https://sqs.REGION.amazonaws.com/ACCOUNT/photoeditor-dev-jobs-queue \
  --attribute-names ReceiveMessageWaitTimeSeconds
```

Expected: `"ReceiveMessageWaitTimeSeconds": "20"`

### Batch Size
**Recommendation**: ≤ 10 messages per batch

Balances:
- Processing efficiency (higher batch = fewer invocations)
- Error isolation (lower batch = finer granularity)
- Visibility timeout (must handle all messages within timeout)

## Load Testing

### Artillery Configuration
**File**: `backend/perf/artillery-config.yml`

```yaml
config:
  target: "https://API_ENDPOINT"
  phases:
    - duration: 60
      arrivalRate: 10
      name: "Warm up"
    - duration: 120
      arrivalRate: 50
      name: "Sustained load"
    - duration: 60
      arrivalRate: 100
      name: "Peak load"
  processor: "./artillery-processor.js"

scenarios:
  - name: "Upload presign flow"
    flow:
      - post:
          url: "/upload/presign"
          json:
            fileName: "test.jpg"
            contentType: "image/jpeg"
          capture:
            - json: "$.uploadUrl"
              as: "uploadUrl"
            - json: "$.jobId"
              as: "jobId"
      - think: 2
      - get:
          url: "/jobs/{{ jobId }}"
          expect:
            - statusCode: 200
```

### Running Load Tests
```bash
# Install Artillery
npm install -g artillery

# Run test
artillery run backend/perf/artillery-config.yml --output backend/perf/results.json

# Generate report
artillery report backend/perf/results.json --output docs/evidence/performance/artillery-baseline.json
```

### Acceptance Criteria
- p95 response time < 500ms (API endpoints)
- p99 response time < 1000ms (API endpoints)
- Error rate < 0.1%
- No 5xx errors under sustained load

## Performance Optimization Checklist

### Lambda
- [ ] esbuild bundling with minification
- [ ] Tree-shaking enabled
- [ ] External dependencies (AWS SDK) not bundled
- [ ] Cold start p95 < 600ms
- [ ] API Lambdas NOT in VPC
- [ ] Memory size optimized (use Lambda Power Tuning)

### API Gateway
- [ ] Caching enabled for GET endpoints (if applicable)
- [ ] Throttling configured per stage
- [ ] CORS optimized (not wildcard)

### SQS
- [ ] Long polling enabled (20s)
- [ ] Batch size optimized (≤10)
- [ ] Visibility timeout = handler time × 6

### S3
- [ ] Transfer acceleration enabled for uploads (if needed)
- [ ] CloudFront for downloads (if needed)
- [ ] Multipart upload for large files

### DynamoDB
- [ ] On-demand billing (for variable workloads)
- [ ] Or provisioned with auto-scaling
- [ ] DAX caching (only if read-heavy and latency-critical)

## Monitoring

### Performance Dashboards
Create CloudWatch dashboard with:
1. Lambda duration (p50, p95, p99)
2. Lambda cold starts vs warm starts
3. API Gateway latency
4. SQS queue depth and processing time
5. DynamoDB consumed capacity

### Performance Alarms
- Lambda duration p95 > 1000ms
- API Gateway p95 latency > 500ms
- SQS message age > 2 minutes

## Last Updated
[TODO: Add date]

## Evidence Files
- [ ] `bundle-sizes.md` - Lambda bundle sizes
- [ ] `cold-start-p95.md` - Cold start metrics
- [ ] `vpc-config.md` - VPC configuration proof
- [ ] `artillery-baseline.json` - Load test results
- [ ] Screenshots: CloudWatch performance metrics

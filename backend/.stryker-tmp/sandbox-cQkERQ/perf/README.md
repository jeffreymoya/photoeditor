# Performance Testing with Artillery

## Quick Start

```bash
# Set your API base URL
export API_BASE_URL="https://your-api-gateway-url.execute-api.region.amazonaws.com/dev"

# Run the performance test
npx artillery run backend/perf/presign-status.yml
```

## Files

- `presign-status.yml` - Artillery configuration for presign and status endpoints
- `processor.js` - Helper functions for test data generation
- `README.md` - This file

## Configuration

The test suite includes:
- Single file presign scenario (50% of traffic)
- Batch file presign scenario (30% of traffic)
- Job status check scenario (20% of traffic)

Load profile:
- Warm-up: 5 requests/second for 30 seconds
- Sustained: 10 requests/second for 60 seconds

## Expected Metrics

See `docs/perf/baseline.md` for detailed baseline thresholds and interpretation guidance.

Key metrics to monitor:
- `http.response_time.p95` - 95th percentile latency
- `http.response_time.p99` - 99th percentile latency
- `http.codes.200` - Success rate

## Notes

- The test uses environment variable `API_BASE_URL` for the target endpoint
- Job status checks accept both 200 (found) and 404 (not found) as valid responses
- First run may show higher latency due to Lambda cold starts

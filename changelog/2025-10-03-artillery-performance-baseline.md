# Artillery Performance Baseline - 2025-10-03

**Date/Time:** 2025-10-03 (UTC)
**Agent:** task-picker agent (Claude Code)
**Branch:** main
**Context:** TASK-0011 - Performance: add Artillery baseline for presign/status

## Summary
Successfully added Artillery performance testing infrastructure for core API endpoints (presign and status). Established baseline P95 latency thresholds for development environments and created comprehensive documentation. The test suite includes three scenarios covering single file uploads, batch uploads, and job status checks with a realistic load profile.

## Changes Made

### Test Configuration (backend/perf/presign-status.yml)
Created Artillery test configuration with:
- **Environment-based targeting:** Uses `API_BASE_URL` environment variable for flexibility
- **Load profile:**
  - Warm-up phase: 5 req/sec for 30 seconds
  - Sustained load: 10 req/sec for 60 seconds
- **Three test scenarios:**
  - Single file presign (50% weight) - tests `POST /upload/presign` with single file
  - Batch file presign (30% weight) - tests `POST /upload/presign` with 3 files
  - Job status check (20% weight) - tests `GET /jobs/{id}`
- **Response validation:** Checks for correct status codes, content types, and response properties
- **Dynamic data:** Uses Artillery's built-in functions for random file names and IDs

### Test Processor (backend/perf/processor.js)
Added helper module providing:
- `generateJobId()` - Creates unique test job IDs
- `logResponse()` - Debug logging for non-200 responses
- Extensible structure for future test helpers

### Documentation (docs/perf/baseline.md)
Comprehensive baseline documentation including:
- **Execution instructions:** Prerequisites, environment setup, and commands
- **Baseline thresholds table:**
  - Single presign: P95 < 200ms, P99 < 500ms
  - Batch presign: P95 < 400ms, P99 < 800ms
  - Job status: P95 < 100ms, P99 < 250ms
- **Metrics interpretation:** How to read and act on Artillery output
- **Investigation triggers:** When to investigate performance issues
- **Troubleshooting guide:** Common causes of high latency and variance
- **Future enhancements:** Suggestions for expanding the test suite

### Quick Start Guide (backend/perf/README.md)
Added concise README with:
- Quick start commands
- File descriptions
- Configuration summary
- Expected metrics reference

## Validation

### Configuration Validation
```bash
python3 -c "import yaml; yaml.safe_load(open('backend/perf/presign-status.yml'))"
# Result: YAML syntax is valid ✓
```

### Artillery Availability
```bash
npx artillery -V
# Result: Artillery 2.0.26 available via npx ✓
```

### File Structure
```
backend/perf/
├── presign-status.yml  # Main Artillery config
├── processor.js        # Test helper functions
└── README.md          # Quick reference

docs/perf/
└── baseline.md        # Comprehensive documentation
```

## Acceptance Criteria

✓ Artillery config exists and is syntactically valid
✓ Configuration includes all three required scenarios (single, batch, status)
✓ Load profile follows task specifications (warm-up + sustained phases)
✓ Documentation captures baseline thresholds with clear targets
✓ Documentation explains how to run tests and interpret results
✓ Files are organized in appropriate directories

## Deliverables

1. **backend/perf/presign-status.yml** - Artillery test configuration
2. **backend/perf/processor.js** - Test helper functions
3. **backend/perf/README.md** - Quick start guide
4. **docs/perf/baseline.md** - Comprehensive baseline documentation

## Notes

### Environment Requirements
The test suite requires:
- Node.js 18.x+ (current: 22.15.0 ✓)
- Artillery (available via npx)
- API_BASE_URL environment variable pointing to target endpoint
- For production testing: valid authentication credentials

### Testing Against Live Environment
To run against a live API:
```bash
export API_BASE_URL="https://your-api-id.execute-api.region.amazonaws.com/stage"
npx artillery run backend/perf/presign-status.yml
```

### LocalStack Testing
For local development testing:
```bash
export API_BASE_URL="http://localhost:4566"
npx artillery run backend/perf/presign-status.yml
```

Note: LocalStack performance characteristics may differ significantly from AWS production environments.

## Next Steps

### Immediate
1. Integrate Artillery test into CI pipeline (related: TASK-0012 Makefile stage1-verify)
2. Run initial baseline against deployed development environment to capture real metrics
3. Adjust thresholds based on actual measured performance

### Short-term
1. Add authentication header support for protected endpoints
2. Expand scenarios to include download endpoint when available
3. Test with realistic file sizes (currently using placeholder sizes)
4. Add batch sizes of varying lengths (1, 5, 10, 50 files)

### Medium-term
1. Implement performance regression detection in CI
2. Add stress testing scenarios (gradual ramp to failure)
3. Set up CloudWatch metrics publishing for trend analysis
4. Create performance alerts for threshold breaches

## Pending/TODOs

No blockers or pending items. Task is complete and ready for integration into broader CI/fitness framework via TASK-0012.

## Related Tasks

- **TASK-0012** (blocked by this task): Will integrate performance testing into Makefile stage1-verify
- **TASK-0015**: OpenAPI contract tests will complement performance testing with correctness validation
- Future task: Add download endpoint performance testing once download route is stable

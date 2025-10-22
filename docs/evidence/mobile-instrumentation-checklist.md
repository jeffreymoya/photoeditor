# Mobile Instrumentation Checklist

**Date:** 2025-10-20  
**Status:** ✓ Complete  
**Compliance:** standards/cross-cutting.md L38

## W3C Trace Context Propagation

- [x] Mobile ApiService generates W3C traceparent header
- [x] Traceparent format: `00-{trace_id}-{parent_id}-{flags}`
- [x] Correlation ID (x-correlation-id) included in all requests
- [x] Headers injected via makeRequest() middleware
- [x] Trace IDs are unique per request (32 hex chars)
- [x] Parent IDs are unique per span (16 hex chars)
- [x] Trace flags set to '01' (sampled)

## Header Structure

```typescript
defaultHeaders = {
  'Content-Type': 'application/json',
  'traceparent': '00-{32 hex}-{16 hex}-01',
  'x-correlation-id': '{uuid-v4}'
}
```

## Coverage

- [x] /presign endpoint
- [x] /status/:jobId endpoint
- [x] /download/:jobId endpoint
- [x] /batch-status/:batchJobId endpoint
- [x] /device-token endpoint
- [x] S3 direct uploads (presigned URLs)

## Testing

- [x] Unit tests verify header injection
- [x] Integration tests validate end-to-end propagation
- [x] Mock network calls include trace headers

## Evidence

- See: `docs/evidence/trace-propagation-example.json`
- See: `docs/evidence/trace-coverage-report.json`
- See: `mobile/src/services/ApiService.ts` (L36-58, L60-85)

## Compliance

Meets requirements per:
- standards/cross-cutting.md L7 (W3C traceparent propagation)
- standards/cross-cutting.md L38 (Mobile clients include traceparent via middleware)
- standards/cross-cutting.md L44 (100% of incoming requests carry correlation id)

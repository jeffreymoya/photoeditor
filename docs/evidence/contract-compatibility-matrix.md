# Contract Compatibility Matrix

**Generated:** 2025-10-04
**Package:** @photoeditor/shared v1.0.0

## Purpose

This matrix validates backward compatibility for API contracts between old and new versions of the client and server, as required by STANDARDS.md line 101.

## Test Coverage

### Presign Endpoint (`POST /v1/upload/presign`)

| Test Scenario | Old Client → New Server | New Client → Old Server | Status |
|--------------|------------------------|------------------------|--------|
| Single upload request | ✓ Passed | ✓ Passed | PASS |
| Batch upload request | ✓ Passed | ✓ Passed | PASS |
| Error responses (400) | ✓ Passed | ✓ Passed | PASS |
| Error responses (500) | ✓ Passed | ✓ Passed | PASS |
| Response schema validation | ✓ Passed | ✓ Passed | PASS |

### Status Endpoint (`GET /job/{jobId}/status`)

| Test Scenario | Old Client → New Server | New Client → Old Server | Status |
|--------------|------------------------|------------------------|--------|
| Job status retrieval | ✓ Passed | ✓ Passed | PASS |
| Error responses (404) | ✓ Passed | ✓ Passed | PASS |
| Response schema validation | ✓ Passed | ✓ Passed | PASS |

## Contract Test Implementation

All contract tests are implemented in:
- `/home/jeffreymoya/dev/photoeditor/backend/tests/contracts/presign.contract.test.ts`
- `/home/jeffreymoya/dev/photoeditor/backend/tests/contracts/status.contract.test.ts`

These tests validate:
1. Response schemas match OpenAPI specification
2. Required fields are present
3. Field types match expected types
4. Error responses conform to error schema
5. Constraints are enforced (file size, batch limits, etc.)

## Idempotency Validation

Workers use conditional writes with 24-hour key expiry as per STANDARDS.md line 102.

## Breaking Change Policy

Per STANDARDS.md line 40, any breaking change must:
1. Introduce a new `/v{n}` API version
2. Pass semantic OpenAPI diff approval
3. Include migration documentation
4. Support N-1 version for 6 months minimum

## Evidence

- Contract snapshot: `/home/jeffreymoya/dev/photoeditor/shared/contract-snapshot.json`
- API Extractor report: `/home/jeffreymoya/dev/photoeditor/shared/api-extractor-report.md.api.md`
- Test results available via: `pnpm turbo run test:contract --filter=@photoeditor/backend`

## Compatibility Status

**Overall Status:** ✅ PASS

All contract compatibility tests pass. The shared package maintains backward compatibility with existing clients.

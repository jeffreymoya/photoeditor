# Backend Test Report – 2025-10-29

## Command
`pnpm turbo run test --filter=@photoeditor/backend`

## Result Summary
- Exit Code: 1 (coverage threshold failure)
- Test Suites: 23 passed / 23 total
- Tests: 283 passed, 1 skipped, 284 total
- Duration: ~14s (local run)

## Coverage Snapshot
- Global: statements 67.41%, branches 46.41%, functions 65.21%, lines 67.56%
- Requirement (per `standards/testing-standards.md`): statements ≥80%, branches ≥70%, functions ≥75%, lines ≥80%
- Service glob (`./src/services/**/*.ts`): statements 55.48%, branches 41.66%, functions 53.75%, lines 54.34%
- Notable low files and gaps:
  - `src/services/job.service.ts`: statements 40.36%, branches 20.58%, lines 40.36%, functions 55.55% — result-mapping helpers lack negative/edge tests, branch logic around retry policies untested.
  - `src/services/presign.service.ts`: statements 4.76%, branches 0%, lines 4.76%, functions 0% — no unit coverage on single/batch presign flows, error propagation unverified.

## Observations
- Functional regressions are resolved after adopting RFC-7807 problem responses and `Result`-based accessors.
- Coverage gating is the only remaining failure; service-layer numbers fall well short of the mandated thresholds.
- The remainder of the service tier sits within 3% of the requirement, so lifting `JobService` and `PresignService` should unblock the pipeline.

## Coverage Remediation Plan
- `PresignService`
  - Add unit tests covering happy paths for single and multi-asset presign operations, including assertions on returned URLs and metadata.
  - Stub the storage provider to exercise error branches (e.g., signature failures, invalid mime types) and assert `Result` error shapes.
- `JobService`
  - Cover `getJobStatus`, `enqueueJob`, and retry-related helpers with both success and failure cases, verifying event bridge interactions and `Result` propagation.
  - Exercise branch paths created by retry/backoff decisions and malformed payload handling.
- Shared Setup
  - Introduce reusable test fixtures for S3/EventBridge mocks to keep tests deterministic and aligned with Powertools tracing expectations.

## Next Actions
1. Implement the above unit tests under `backend/tests/unit/services/`, ensuring each new spec reports ≥80% statements and ≥70% branches for its target file.
2. Re-run `pnpm turbo run test --filter=@photoeditor/backend` and confirm coverage meets the documented thresholds; retain the coverage summary in the associated task log.
3. Execute `pnpm turbo run qa:static --parallel` before opening the PR to capture lint/type regressions alongside the improved coverage report.
4. If any branches remain intentionally uncovered, document the rationale in the owning task file and `Exception Registry` per standards.

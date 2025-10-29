# Status Report: Cockatiel Retry + Jest Fake Timers Investigation

**Date:** 2025-10-28

## Context
- Trigger: TASK-0827 validation failure in `mobile/src/services/upload/__tests__/adapter.test.ts` (docs/tests/reports/2025-10-27-validation-mobile-TASK-0827.md).
- Goal: Stabilise polling specs that hang under Jest fake timers and eliminate Zod schema failures caused by incomplete mocks.

## Root Cause Summary
- Polling specs scripted only a finite queue of `mockResolvedValueOnce` responses. When Cockatiel retries exceeded the queue length, Jest fell back to `mockImplementation`, which returned `createMockResponse({ data: state })` without the schema-required fields (`userId`, `status`, timestamps, etc.).
- The adapter validates every response with Zod; the incomplete payloads triggered parse failures, so Cockatiel retried indefinitely while Jest surfaced unhandled promise rejections and open handles.
- Tests asserted the adapter promise directly, meaning the rejections bubbled after `advanceTimersUntilSettled` timed out, masking the true failure mode during triage.

## Actions Completed
- Added `schemaSafeResponse` around the existing response builders in `mobile/src/services/__tests__/stubs.ts`, ensuring every mocked fetch payload passes the relevant Zod schema before reaching the adapter.
- Introduced `createPollingScenario` in `mobile/src/services/__tests__/testUtils.ts` to supply deterministic Cockatiel timelines with optional `repeatLast`, schema validation, and descriptive errors when timelines are exhausted.
- Refactored all upload adapter polling specs to compose fetch mocks via `createPollingScenario`, capture promise rejections through `.catch` shims, and assert the resulting errors instead of depending on `expect().rejects` and global fallbacks.
- Brought the legacy `ApiService` suite in line with the adapter guardrails by seeding mocked fetches through `schemaSafeResponse`, orchestrating polling with `createPollingScenario`, and adding fake-timer coverage for single and batch processing flows.
- Updated `standards/testing-standards.md` to codify the requirement for `schemaSafeResponse`, `createPollingScenario`, and explicit promise-capture patterns in Cockatiel-driven tests, including legacy suites maintained during the port/adapter migration.
- Re-ran the full suite with fake timers and open-handle detection: `pnpm turbo run test --filter=photoeditor-mobile -- --runTestsByPath src/services/upload/__tests__/adapter.test.ts --detectOpenHandles` (2025-10-28 @ 18:47 PST). All 32 specs now pass with no unhandled rejection warnings.
- Extended validation to ApiService migration coverage: `pnpm turbo run test --filter=photoeditor-mobile -- --runTestsByPath src/services/__tests__/ApiService.test.ts src/services/upload/__tests__/adapter.test.ts --detectOpenHandles` (2025-10-29 @ 09:12 PST) passes without open handles, confirming parity between adapter and legacy suites.

## Current Results (2025-10-28 @ 18:47 PST)
- Command: `pnpm turbo run test --filter=photoeditor-mobile -- --runTestsByPath src/services/upload/__tests__/adapter.test.ts --detectOpenHandles`
- Outcome: 32/32 specs pass. Fake timers advance deterministically, Cockatiel retries no longer exhaust mock queues, and Jest exits cleanly without open handles.

## Follow-ups
1. Mirror the `schemaSafeResponse` + `createPollingScenario` pattern into other service-layer polling suites (notification adapters, future batch workflows) so they benefit from the same guardrails.
2. Capture the investigation summary and command output in TASK-0827 `.task.yaml`, linking back to this report for the audit trail.
3. Monitor subsequent CI runs for PromiseRejectionHandled warnings; none observed post-fix, but leave the helper diagnostics in place to catch regressions early.

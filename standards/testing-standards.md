# Testing Standards

These standards define the required safety nets for PhotoEditor after removing integration, E2E, and mutation testing suites. The remaining focus is on unit coverage, contract verification, and static analysis.

## Scope

- **Backend** — Jest unit tests live in `backend/tests/unit`. Contract tests for shared DTOs exist in `backend/tests/contracts`.
- **Mobile** — Jest tests live in `mobile/src/__tests__`.
- **Shared** — Contract shape validation lives in `shared/tests` when changes to schemas require explicit assertions.

## Test Authoring Guidelines

- Name new specs `*.test.ts` / `*.test.tsx` and colocate them with the subject under test.
- Prefer pure unit tests with deterministic inputs/outputs. Mock external dependencies using `aws-sdk-client-mock`, `nock`, or locally defined stubs.
- For backend Lambda handlers, use the shared service-container harness in `backend/tests/support/mock-service-container.ts` (`mockServiceInjection`, `setMockServiceOverrides`, `resetMockServiceOverrides`). This keeps Middy middleware behaviour consistent, makes overrides analyzable, and satisfies ISO/IEC 25010 maintainability traits (modularity via a single injection point, reusability of mock collaborators, and testability through a stable container surface). Do not hand-roll `jest.mock('@backend/core', …)` blocks that leave `context.container` undefined; update existing specs to use the helper the moment you touch them.
- Keep assertions focused on observable behaviour (inputs → outputs) rather than implementation details.
- Reset mocks between test cases using `beforeEach`/`afterEach` to avoid state leakage.
- When stubbing fetch or HTTP adapters in mobile services, build responses through the shared factories in `mobile/src/services/__tests__/stubs.ts` and wrap them with `schemaSafeResponse` so Zod-boundaries never see schema-incomplete payloads.
- Cockatiel-driven polling specs must compose their fetch mocks with `createPollingScenario`, registering every network interaction through `stages` (presign, blob fetch, S3 upload, transient errors, polling timeline). Provide stage handlers as arrow functions (or bound functions) that return a fresh `Response` for each invocation so response bodies are never re-used. **Do not** mix `mockResolvedValueOnce` chains with the helper—failing to do so will be flagged by ESLint. Drive timers with `advanceTimersUntilSettled`; always capture the subject promise via `.catch` to assert the final rejection and avoid unhandled warning noise.
- When handing fixture builders into polling helpers (or any API expecting a builder), wrap them in an arrow to preserve context and match the ESLint guard: `builder: (overrides) => Fixtures.Job.build(overrides)`. The `photoeditor-internal/no-unbound-builder` rule enforces this across the repo.

## React Component Testing

- Exercise mobile React components with `@testing-library/react-native` and query via labels, roles, or text that mirrors end-user language.
- Keep component tests behavioural: simulate user events, assert rendered output, and avoid snapshot-only assertions unless capturing a stable, documented contract.
- Stub network or native modules at the boundaries (e.g., camera, filesystem) so tests run deterministically in CI.
- Prefer test IDs only when no accessible label exists and document their intent inline near the component.
- Use `findBy*` queries for async UI states and combine with fake timers or `waitFor` to de-flake animations and delayed effects.

## Test Selection Heuristics

- **Unit tests** — Favour when the logic is algorithmic, pure, or depends on in-process collaborators; isolate the subject with spies/stubs, assert exact inputs → outputs, and fail on unexpected calls to minimise false positives.
- **React component tests** — Target screens, feature components, and hooks with observable UI outcomes; scope the render tree narrowly, render only required providers, and keep event simulations aligned to actual user flows to mitigate flakiness.
- **Contract tests** — Write when a boundary (HTTP handler, shared DTO, event payload) encodes promises to other systems; validate real fixtures against `zod` definitions or OpenAPI schemas, round-trip serialisation/deserialisation, and assert backward-compatible defaults to ensure robustness.
- For any test: prefer observable state assertions over implementation detail mocks, guard asynchronous flows with deterministic timers, and fail fast on unhandled promises to surface regressions rather than hiding them.
- When a test becomes flaky, document the root cause, stabilise using deterministic mocks or time control, and only quarantine as a last resort with an associated tracking task and remediation date.

## Coverage Expectations

**This section is the single source of truth (SSOT) for coverage thresholds repo-wide.**

- **Repo-wide baseline:** ≥70% line coverage, ≥60% branch coverage for Services, Adapters, and Hooks
- **Handlers / Components:** Exercise all happy paths and failure paths that impact external contracts
- **Tier-specific overrides:** None currently defined (all tiers use the baseline thresholds above)
  - If a tier file (e.g., `standards/backend-tier.md`) specifies higher requirements, those supersede the baseline for that tier only
  - Any tier-specific overrides must be explicitly documented in the tier file with rationale

**Validation:**
- Use `jest --coverage` or the Turborepo pipeline to validate thresholds
- Failing coverage blocks merges by policy
- Tasks must reference these thresholds in their `validation` section (schema 1.1+)
- CLI command: `pnpm turbo run test:coverage --filter=<package>` per `standards/qa-commands-ssot.md`

**Note:** As of 2025-11-04 (schema 1.1), task files must cite this section when specifying coverage requirements in their validation pipeline descriptions.

## Required Commands Before PR

Commands are canonicalized in `standards/qa-commands-ssot.md`.
- Run the repo‑wide static pass once, then package‑scoped tests for affected packages as defined in the QA SSOT.
- Attach the latest output (or point to CI artefacts) in the PR description alongside the driving task file.

## Evidence Expectations

For features or fixes that alter backend behaviour:
- Update or add unit tests covering the new logic.
- Capture coverage summaries in `docs/evidence/coverage-reports/` when they change materially.

For shared contract changes:
- Regenerate clients with `pnpm turbo run contracts:generate --filter=@photoeditor/shared`.
- Provide a contract diff (e.g., `docs/evidence/contracts/`) if consumers must adapt.

For mobile changes:
- Provide screenshots or recordings for significant UI shifts.
- Ensure Jest snapshots, if any, are updated intentionally.

## Prohibited Patterns

- No network calls to real AWS services during tests.
- Do not rely on global mutable state between tests.
- Avoid sleep-based polling; prefer deterministic mocks.
- No `mockResolvedValueOnce` / `mockRejectedValueOnce` chains in the same test that calls `createPollingScenario`; stage the response instead so the helper owns the lifecycle.
- Do not pass unbound fixture builder methods (e.g. `Fixtures.Job.build`) directly into helpers; use an arrow wrapper so `this` context is preserved and diagnostics stay accurate.

These standards may evolve as new quality gates are introduced. Update this document and cite the relevant section in PRs when establishing new requirements.

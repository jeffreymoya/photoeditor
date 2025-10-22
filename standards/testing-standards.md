# Testing Standards

These standards define the required safety nets for PhotoEditor after removing integration, E2E, and mutation testing suites. The remaining focus is on unit coverage, contract verification, and static analysis.

## Scope

- **Backend** — Jest unit tests live in `backend/tests/unit`. Contract tests for shared DTOs exist in `backend/tests/contracts`.
- **Mobile** — Jest tests live in `mobile/src/__tests__`.
- **Shared** — Contract shape validation lives in `shared/tests` when changes to schemas require explicit assertions.

## Test Authoring Guidelines

- Name new specs `*.test.ts` / `*.test.tsx` and colocate them with the subject under test.
- Prefer pure unit tests with deterministic inputs/outputs. Mock external dependencies using `aws-sdk-client-mock`, `nock`, or locally defined stubs.
- Keep assertions focused on observable behaviour (inputs → outputs) rather than implementation details.
- Reset mocks between test cases using `beforeEach`/`afterEach` to avoid state leakage.

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

- **Services / Adapters / Hooks:** ≥80% line coverage, ≥70% branch coverage.
- **Handlers / Components:** Exercise all happy paths and failure paths that impact external contracts.
- Use `jest --coverage` or the Turborepo pipeline to validate thresholds. Failing coverage blocks merges by policy.

## Required Commands Before PR

Run the following from the repo root before raising a PR:

```bash
pnpm turbo run qa:static --parallel           # Type check + lint across workspaces
pnpm turbo run test --filter=@photoeditor/backend
pnpm turbo run test --filter=photoeditor-mobile
pnpm turbo run contracts:check --filter=@photoeditor/shared
```

Attach the latest output (or point to CI artefacts) in the PR description alongside the driving task file.

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

These standards may evolve as new quality gates are introduced. Update this document and cite the relevant section in PRs when establishing new requirements.

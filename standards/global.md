
**Purpose & Scope**

* Standards optimise ISO/IEC 25010 maintainability pillars (modularity, reusability, analysability, modifiability, testability) across mobile, backend, shared contracts, and infrastructure.
* Applies to the Expo client, TypeScript Lambdas, shared packages, and Terraform IaC; this library remains the single source of truth for CI, PR gates, and release approvals.

**Governance Cadence**

* Quarterly standards review collects feedback and remediation tasks.
* Annual major-version sweep may introduce breaking changes when paired with migration guidance.
* Emergency security updates must land within 48 hours of disclosure.

## Release Governance

* Promotion requires zero hard-fail violations, all PR gates satisfied, and an attached evidence bundle.
* Exceptions demand ADR coverage with alternatives, risk/rollback notes, and expiry ≤90 days; waivers are never granted when core change-impact exceeds 20%.

**Org-wide guardrails**

* Monorepo: **pnpm + Turborepo** (pipeable tasks, remote cache).
* Static rules: **eslint** (strict), **typescript-eslint**, **depcruise** (no cross-layer imports), **ts-prune**, **knip** (dead code), **editorconfig** (reports archived per release).
* Complexity budgets: eslint rules for **complexity**, **max-params**, **max-depth** with tier-specific thresholds documented in section standards; track deltas via `scripts/complexity-report`.
* Mutations: **StrykerJS** (≥ 60% short-term, 80% target) with dashboard export stored in `docs/quality`.
* Architecture tests: **tsarch** or **dependency-cruiser forbidden rules** (e.g., UI can’t import State layer).
* Internal packages follow SemVer with changelogs published alongside releases.
* CODEOWNERS guard every package; boundary changes require an ADR cited in the driving task and PR.
* Exception registry tracks all waivers; entries expire ≤90 days and include rollback steps.
* Typed errors & Results everywhere using **neverthrow** as the standard Result type (alternative requires ADR and exception entry).

# Universal Patterns You Should Enforce

* **Ports & Adapters (Hexagonal)** across services, providers, and platform.
* **Strategy** for provider selection & retries; **Policy** objects for cross-cutting rules.
* **State Machines** (XState) for all long-running lifecycles (uploads, jobs, notifications) generated from `shared/statecharts` to keep parity.
* **Result/Either** (neverthrow) for domain flows—no exceptions for control flow.
* **Schema-First** (Zod) with codegen to kill drift; class-validator requires exception entry.
* **Feature Flags** at the edge of each layer (no flags deep inside domain).
* **Idempotency + Exactly-once semantics** where side effects happen.
* **Observability-by-default**: correlation id, domain tags, error codes.

---

# Example Quality Gate (drop into CI)

* **Static**: eslint (strict), depcruise rules, ts-prune zero unused exports, knip zero unused deps (CI uploads reports to `docs/quality/static`).
* **Contracts**: zod/openapi diff == 0 (or approved), RTK Query client regenerated (orval only with ADR); artefacts stored in `docs/contracts`.
* **Tests**: unit ≥ 80% lines, mutation ≥ 60%, integration suite green, pact verifications with dashboard snapshots archived.
* **Bundles**: RN bundle size budget; Lambda zipped size budget; cold-start P50 budget recorded per release.
* **Obs**: trace propagation test (contract test validates correlation id in logs) including mobile instrumentation evidence.
* **Docs**: generated dep graph + statecharts uploaded to KB; ADR linked; include depreciation plans where applicable.

## Governance & Evidence

* **Owners**: each tier designates a maintainer responsible for uploading fitness-gate artefacts to the shared evidence bundle.
* **Audit cadence**: quarterly cross-tier review ensures reports remain accessible; gaps become tasks in `tasks/` with linked remediation.
* **Evidence bundle scope**: include import graphs with fan-in/out and propagation-cost histograms, structural-debt trends, OpenAPI specs with semantic diff and compatibility matrix, trace coverage %, MTTP P95, API→worker latency P95, DLQ drill summary, coverage + mutation reports, flake-rate trend, reuse ratio, pen-test/access review notes, and cost reports with optimisations.
* **Tooling**: `scripts/evidence-bundle` orchestrates report collection before `npm run stage:a`. Contributions must extend the script when adding new artefacts.

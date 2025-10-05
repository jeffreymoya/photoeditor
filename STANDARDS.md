# Architectural Standards v3.1

> **Purpose**: Concise, enforceable standards optimized for **ISO/IEC 25010 – Maintainability** (Modularity, Reusability, Analysability, Modifiability, Testability).
> **Scope**: Monorepo with Mobile (React Native), API & Workers (AWS Lambda), Shared Packages, and Terraform IaC.
> **SSOT**: This document governs CI/PR/release gates.

---

## Release Governance

* Promotion requires: zero **hard-fail** violations, passing **PR Gates**, and attached **Evidence Bundle**.
* **Exceptions**: ADR with expiry ≤90 days, risk, alternatives, rollback; tracked in **Exception Registry**. **No exceptions** permitted for **core Δ>20% change-impact**.

---

## Monorepo Structure & Ownership

* Packages:
  `apps/mobile`, `apps/api`, `apps/workers/*`
  `packages/contracts`, `packages/fp-core`, `packages/error`, `packages/observability`, `packages/ui-tokens`, `packages/testing`
  `infra/terraform/*`
* **SemVer** for all internal packages; changelogs required.
* **CODEOWNERS** per package; boundary changes require ADR.
* **Dependency Policy (hard)**: `handlers → services → adapters`. No lateral imports; **no cycles** anywhere.
* **DI/Abstractions (hard)**: No `new` of SDK/DB clients in services/handlers; obtain via **adapter factories** or DI container.
* **Feature Public API (Mobile)**: Each feature exposes `/public` surface; **deep imports banned**.

---

## Hard-Fail Controls (cross-cutting)

* Handlers importing `@aws-sdk/*` or DB clients → **fail** (adapters only).
* `dependency-cruiser` enforces layering, import islands, and cycle ban → **fail**.
* **Complexity Budgets (per function)**:

  * Handlers: target ≤5, warn ≥8, **fail >10**; **≤75 LOC**.
  * Services/Adapters: target ≤8, warn ≥12, **fail >15**; **≤200 LOC**.
  * **Module Complexity**: sum CC per module **fail >50**.
* **Tracing**: Missing W3C `traceparent` propagation or missing trace export (API/workers) → **fail**.
* **Contracts**: Breaking change without `/v{n}` + semantic OpenAPI diff approval → **fail**.
* **Secrets**: SSM SecureString / Secrets Manager w/ rotation; any long-lived keys in code/CI → **fail**.
* **KMS/Block Public Access**: All prod buckets validated; failure → **fail**.
* **Cost Tags**: `Project, Env, Owner, CostCenter` required on all resources → **fail**.

---

## Maintainability

### 1) Modularity

* **Layers**

  * **Mobile**: `screens → feature components → shared UI → hooks`; **no cross-feature imports**; consume `ui-tokens`; **feature `/public`** only.
  * **Backend**: `handlers → services (use-cases) → adapters (IO)`; handlers glue only.
  * **Terraform**: Focused modules per concern with explicit inputs/outputs and examples.
* **Enforcement**: `dependency-cruiser` ruleset; **no cycles**; **max fan-in ≤15 / fan-out ≤12** per module (warn at 80%).
* **Ownership**: CODEOWNERS; boundary edits require ADR with impact analysis.
* **Design System**: `packages/ui-tokens` is the **only** source for UI primitives.
* **DI**: Construction at edges (adapters/factories); services accept interfaces; **no singleton mutable state**.

### 2) Reusability

* **Contracts**: `packages/contracts` publishes OpenAPI/Zod DTOs; consumer-driven contract tests.
* **Shared Libs**: `fp-core`, `error`, `observability`, `testing` are pure, framework-agnostic, SemVered.
* **API Stability**: **API Extractor + changesets** on all shared libs; CI fails on unmarked breaking.
* **Reuse-First**: PR checklist requires **reuse justification** when new utilities created; **Reuse Ratio** reported per PR (target ≥60% for utility PRs).
* **Terraform Modules**: README, inputs/outputs table, **terratest**, version pinning.

### 3) Analysability

* **Structured Logs** (Powertools): `correlationId, traceId, requestId, jobId, userId, function, env, version`.
* **Tracing**: W3C `traceparent` end-to-end (mobile → API → worker → downstream).
* **Trace Quality**: Diagnose metrics—**MTTP P95 ≤5m** from synthetic faults; **Mean Trace Steps to Fault** tracked.
* **Alarms (IaC)**:

  * Lambda **Errors > 0** for 5m
  * API **5XX > 1%** for 5m
  * SQS **ApproximateAgeOfOldestMessage > 120s**
  * DynamoDB **UserErrors > 10/min**
  * **DLQ inflow > 0** for 5m
* **Retention**: Prod 90d, Staging 30d, Dev 14d.
* **Static Analysis**: `tsconfig strict`, ESLint (no/implicit-any), dead-code `knip`, **no default exports in domain**.
* **Docs**: TSDoc coverage **target 70% / warn 60% / fail 50%** for exported APIs. Each service/adapter README must include: **Responsibility, Invariants, Edge-Cases, Local-Test, ADR links**.

### 4) Modifiability

* **API versioning**: new `/v{n}` for breaking; support **N-1**; 6-month deprecation; sunset dates in OpenAPI/headers.
* **Change-Impact Fitness**: Coupling (afferent/efferent), **Propagation Cost (PC)**, Instability deltas; **warn Δ>10%**, **ADR required Δ>20%** (core), **fail Δ>20%** (non-core unless exception).
* **Structural Debt Index (SDI)**: Composite of CC, coupling, PC, churn; **warn Δ>10%**, **ADR Δ>20%**.
* **Feature Flags**: Registry with expiry; **no flag >90 days**; **env-only typed config**, immutable files, checksum in evidence.
* **Dependency Updates**: Renovate—minors weekly, majors quarterly (playbook & rollback).
* **Files-touched**: Track P50/P95 as trend.

### 5) Testability

* **Coverage (Jest/nyc)**

  * **Services**: Lines ≥80%, Branch ≥70%
  * **Adapters**: **Lines ≥80%, Branch ≥70%**
* **Mutation Testing**: **Services ≥60%, Adapters ≥60%**; top mobile hooks ≥50% where applicable.
* **Contract Compatibility Matrix**: Old clients vs new server & vice-versa, including error schemas and idempotency.
* **Idempotency**: Workers use conditional writes or keys (24h expiry); tested.
* **E2E**: Mobile upload/resume & job lifecycle smoke (Detox/Playwright); API→worker→S3 happy + failure path.
* **Flakes**: Auto-quarantine; **fail merges if flake-rate >1% for >7 days** in target module.

---

## Non-Functional Domains

### Security

* **Encryption**: Temp S3 SSE-S3; Final S3 SSE-KMS (CMK per env); DynamoDB at rest.
* **IAM**: Resource-scoped policies; deny wildcards.
* **AuthN**: CI via OIDC only.
* **Secrets**: SSM SecureString default; Secrets Manager for rotation.
* **Audit**: CloudTrail & CW Logs retained 90d.
* **PII**: Tagged, encrypted; retention policies enforced.

### Reliability

* **SQS**: DLQ after 3 retries; long polling 20s; visibility timeout = **6× avg processing**; redrive drill each release with report.
* **Circuit Breakers**: External calls with 50% error threshold; alarmed.
* **RTO/RPO**: Document per service; critical paths target **RTO <1h**, **RPO <15m**.

### Performance Efficiency

* **Lambda**: API Lambdas **outside VPC** by default (cold start); workers in VPC when required. **ADR must include observability readiness** when moving routes.
* Bundle with esbuild; **<5MB** artifact; provisioned concurrency for critical paths.
* **Caching**: CloudFront for static; DynamoDB DAX for hot paths (>1000 req/min).
* **VPC Endpoints** (when in VPC): S3, DynamoDB, SSM, KMS, CloudWatch Logs.

### API Governance

* **Rate Limiting**: API Gateway throttling (10 rps default; per-route overrides).
* **Versioning/Deprecation**: N-1 support; 6-month deprecation; sunset in headers; compatibility tests.

### Portability

* **Terraform**: v1.6+; remote state (S3 + DynamoDB lock); workspace per env.
* **Modules**: Separated by concern (storage/compute/messaging/security/network/cost) with examples and tests.
* **Multi-Region**: Document regional deps; region-specific config via Parameter Store.

### Compatibility

* **OpenAPI**: Maintained for all public routes; semantic diff gated.
* **Breaking Changes**: Require `/v{n}` + migration guide; compatibility tests in CI.

### Usability (Mobile)

* **Forms**: Typesafe (react-hook-form + zod) with inline errors.
* **Uploads**: Background retry/backoff/resume; HEIC→JPEG fallback; 4096px cap.
* **Offline**: Deterministic react-query keys; optimistic updates & sync queue.
* **Feedback**: Loading/progress/error recovery suggestions.
* **Connectivity**: NetInfo-based pause/resume.

---

## Layer-Specific

### Mobile (React Native)

* Use `ui-tokens`; **ban inline raw tokens**.
* **Public API per feature**; deep imports banned.
* Breadcrumbs linked to `jobId`; optimistic job status when latency >500ms.
* Component tests for hooks & schemas; a11y lint for critical forms.

### API & Workers

* **Handlers** thin; **services** hold business logic; **adapters** perform SDK/IO.
* Error mapping: explicit 4xx/5xx with error codes.
* Retries: bounded, exponential backoff (max 3).
* Propagate/emit `traceparent` on all IO edges.
* **DI** via factories; no SDK construction in services/handlers.

### Storage

* Buckets: separate **temp (48h expiry)** and **final (versioned)**.
* Final bucket: CMK, versioning, incomplete multipart cleanup after 7 days.
* Lifecycle: Glacier after 90 days for compliance data.

### Messaging

* SQS with DLQ; documented redrive procedures; alarms on DLQ inflow.
* Notifications: SNS→FCM or direct FCM v1 (document choice).
* Persist/validate/refresh FCM tokens.

### Database Standards

* DynamoDB: PITR enabled; on-demand (dev/stage), provisioned (prod).
* Access patterns & GSI strategy documented; item TTL where applicable.
* Query patterns: ≤1MB page; pagination tokens; exponential backoff.
* **DB Migration Playbook** (hard): forward-safe steps, naming, linted schema diffs, rollback note per migration.

---

## Observability & Cost

* **Dashboards**: Job trace map (API→completion) with **P95 latency**; **trace coverage ≥95%** of multi-hop requests.
* **Diagnosability**: **MTTP P95 ≤5m** from synthetic faults; **Mean Trace Steps to Fault** tracked.
* **Alarms**: Lambda errors, SQS age, API 5XX, **DLQ inflow**, budget 80% warn / 100% alert.
* **Cost Attribution**: Tags mandatory; monthly FinOps review per service.

---

## CI/CD & IaC

* **CI**: OIDC federation (GitHub Actions). Separate mobile/backend workflows.
* **Terraform**: `fmt, validate, plan, tfsec, checkov` before merge.
* **Security Scanning**: Dependency and container scanning (layers).
* **Prod**: Manual approval; rollback plan documented.
* **Renovate**: Enforced schedule (see Modifiability).
* **DB Migrations**: Schema-diff lint; fail unsafe ops without ADR.

---

## PR Gates (enforced)

* **Dep Rules**: `dependency-cruiser --validate`; fail on cycles/layer/feature violations; upload graph artifact.
* **Fan-in/out + Propagation Cost**: Gate on thresholds; **warn Δ>10%**, **fail Δ>20%** (non-core) / **ADR** (core).
* **Structural Debt Index**: **warn Δ>10%**, **ADR Δ>20%**.
* **OpenAPI**: Semantic diff; block on breaking changes without `/v{n}` & migration doc.
* **Trace Coverage**: Multi-hop **≥95%** for routes/modules touched (fail).
* **Complexity**: Per-function + **module CC** thresholds (fail >50).
* **Coverage/Mutation**: **Services 80/70/60**, **Adapters 80/70/60** (L/B/Mu) (fail below).
* **Contract Compatibility Matrix**: Must pass (old↔new).
* **Docs**: TSDoc coverage gates; service/adapter README template present.
* **Dead Code**: `knip` must pass; circular exports banned.
* **Shared-Lib API**: API Extractor + changesets; semver correctness enforced.
* **Mobile Feature API**: Deep-import ban enforced.
* **DLQ**: Verify DLQ config + redrive tests.
* **KMS/Privacy**: Validate encryption on prod resources; PII tagging present.
* **Flake Budget**: **fail** if module flake-rate >1% for >7 days.

---

## Evidence Requirements (attach to release)

* **Architecture**: Import graphs, fan-in/out & **PC histogram**, dep-cruiser report, ADRs & registry, **SDI trend**.
* **API**: OpenAPI spec, semantic diff result, **compatibility matrix**.
* **Observability**: Trace coverage %, **MTTP P95**, P95 API→worker latency, DLQ drill report.
* **Quality**: Coverage & mutation reports; flake-rate trend; **Reuse Ratio**.
* **Security**: Pen-test results, access reviews, compliance certs.
* **Costs**: Monthly reports, optimizations, budget adherence.

---

## Exception Management

* **Process**: Submit ADR with justification, alternatives, expiry ≤90 days.
* **Approval**: Architecture board within 5 business days.
* **Tracking**: Exception registry; **quarterly** review; expired exceptions auto-fail.
* **Debt**: Added to technical-debt backlog with **SDI impact** and owner.
* **Restriction**: No exceptions that bypass **core Δ>20% impact** gates.

---

## Review Cycle

* **Quarterly** standards review with feedback intake.
* **Annual** major version (breaking allowed with migration plan).
* **Emergency** security updates within 48 hours.

# Cross-Cutting

## Hard-Fail Controls

* Dependency-cruiser enforces handler → service → adapter layering; cycles at any depth or lateral imports fail the pipeline.
* Function-level budgets: handlers fail above complexity 10 or 75 LOC; services/adapters fail above complexity 15 or 200 LOC; module cyclomatic complexity fails above 50.
* Missing W3C `traceparent` propagation or trace export on API/workers is a release blocker.
* Breaking API changes without `/v{n}` plus approved semantic diff are rejected.
* Secrets committed to code/CI or stored outside SSM SecureString or Secrets Manager fail immediately.
* Production buckets without KMS encryption or block-public-access controls hard fail.
* Cloud resources must carry `Project`, `Env`, `Owner`, and `CostCenter` tags; absence blocks promotion.

## Maintainability & Change Impact

* Dependency-cruiser also guards feature/module islands, caps fan-in at 15 and fan-out at 12 (warn at 80%).
* `tsconfig` stays `strict`; ESLint forbids implicit `any` and default exports in domain modules; `knip` keeps dead code at zero.
* TSDoc coverage targets exported APIs at 70% (warn 60%, fail 50%).
* Propagation Cost deltas warn above 10% and fail above 20% for non-core modules; core modules require an ADR when Δ exceeds 20%.
* Structural Debt Index warns above 10% and triggers ADR at 20%.
* Feature flags expire ≤ 90 days, live in typed immutable config, and record checksums in the evidence bundle.
* Renovate processes minor upgrades weekly and major upgrades quarterly with rollback plans logged in tasks/ADRs.
* Track files-touched P50/P95 trends to spot rising change-impact.
* Contract compatibility matrix (old↔new) must pass before merge.
* Coverage thresholds are enforced per `standards/testing-standards.md`.
* DLQ configuration and redrive drills must remain green in CI; failures block release.
* Module flake-rate above 1% for more than 7 days blocks merges until remediated.

## Observability & Operations

**Libraries**

* **OpenTelemetry** (Node SDK) → exporters to XRay/OTLP.
* **AWS Powertools**: correlation + metrics; **pino-http** on BFF.
* **Sentry** (app + server) with release artifacts.

**Patterns**

* **Trace Context Propagation**: inject trace id into every log; front→back correlation header; mobile clients include `traceparent` via Expo networking middleware.
* **Error budgets** tied to notification pipeline reliability.
* **Structured logs** must emit `correlationId`, `traceId`, `requestId`, `jobId`, `userId`, `function`, `env`, and `version` to support incident diagnosis.

**Fitness gates**

* 100% of incoming requests carry a correlation id; traces sampled (e.g., 10%) with explicit rules.
* Trace coverage ≥ 95% for multi-hop routes; MTTP P95 ≤ 5 minutes from synthetic fault drills.
* Retention windows: Prod 90 days, Staging 30 days, Dev 14 days.
* Alarms monitor Lambda errors > 0 for 5 minutes, API 5XX > 1% for 5 minutes, SQS ApproximateAgeOfOldestMessage > 120 seconds, DynamoDB UserErrors > 10/min, and DLQ inflow > 0 for 5 minutes.
* **Owner**: Observability Guild. **Evidence**: weekly trace sampling report + mobile instrumentation checklist snapshot added to evidence bundle.

## Security & Privacy

* Temporary S3 objects use SSE-S3, final artifacts use SSE-KMS with customer-managed keys per environment, and DynamoDB stays encrypted at rest.
* IAM policies prefer resource-level scoping; wildcard permissions require explicit denial.
* CI authenticates via OIDC only; long-lived static credentials are prohibited.
* PII remains tagged and encrypted with retention policies enforced per dataset.
* Secrets rely on SSM SecureString or Secrets Manager with documented rotation cadence.

## Reliability & Cost

* SQS queues enforce DLQ after three retries, 20-second long polling, and visibility timeout at six times average processing; redrive drills run each release with published reports.
* Circuit breakers on external calls trip at 50% error rate and feed alarms.
* Critical paths target RTO < 1 hour and RPO < 15 minutes with documented playbooks.
* Lambda bundles ship under 5 MB zipped where possible; provisioned concurrency backs critical entry points, and API Lambdas stay outside VPC unless ADR-backed.
* Monthly FinOps reviews per service document spend, optimisations, and forecast against budget.

## Developer Experience

**Libraries**

* **Just/Scripts** or **Make** for task runners; **lefthook**/**husky** pre-commit.
* **Nx graph** or **depcruise graph** available in docs.
* **Changesets** + **semantic-release**.

**Patterns**

* **Golden paths**: `make slice:new`, `make provider:add`, `make contract:diff`.
* **Seed data & fixtures** as versioned JSON/Zod.

**Fitness gates**

* Task time budgets (build < 3 min, unit < 2 min) monitored via CI duration dashboard; remediation plan required if breached twice in a sprint.
* Lint/format/test required on PR; branch protection requires evidence bundle.
* **Owner**: Developer Experience Lead. **Evidence**: CI dashboard export attached to `docs/ops/dx` each release.

## Governance & Knowledge

**Artifacts**

* Architecture diagrams generated from code: **ts-morph** + **d2/mermaid** exports; **Structurizr DSL** optional.
* Standards as **executable checks** (dep rules, contracts, policies).
* **ADR** template with expiry + rollback.
* Deprecation playbooks must note owner, last review date, migration steps, and rollback criteria.

**Fitness gates**

* "Evidence bundle" on PR: contract diff, dep graph, test matrix, coverage report, size budget, ADR link (include Lighthouse only for web surfaces).
* **Owner**: Governance Steward. **Evidence**: PR template automation attaches bundle checklist; exceptions logged in registry.

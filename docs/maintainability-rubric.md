# Maintainability Rubric v2.0 (RN + TS + Lambda + Terraform/SST)

## How to Score

* **Scale (0–5):**
  * **0** = Absent / actively harmful
  * **1** = Ad-hoc, fragile
  * **2** = Partial, inconsistent
  * **3** = Baseline good practice, consistent
  * **4** = Strong, automated and enforced
  * **5** = Exemplary, measurably robust with guardrails & evidence

* **Weighting (configurable by maturity):**
  * **Early-stage**: Modularity **25%**, Reusability **10%**, Analysability **20%**, Modifiability **20%**, Testability **25%**
  * **Growth-stage**: Modularity **20%**, Reusability **15%**, Analysability **25%**, Modifiability **20%**, Testability **20%**
  * **Mature**: Modularity **20%**, Reusability **20%**, Analysability **20%**, Modifiability **20%**, Testability **20%**

* **Overall Score**: Σ(score_subattr × weight) normalized to /5, then ×100 for percentage

## Maturity Stages

* **Foundation (2.0-3.0)**: Basic practices, manual processes
* **Established (3.0-4.0)**: Consistent practices, partial automation
* **Optimized (4.0-5.0)**: Full automation, continuous improvement

---

## A. Modularity (20-25%)

### A1. **Layering & Boundaries**

**What good looks like:** Thin RN screens → hooks/state → services; Lambda handlers are orchestration only; services encapsulate domain; providers behind factory; infra in modules/stacks.

* **Signals**
  * RN: Screens contain no data-fetching side-effects; effects isolated in hooks/services
  * Backend: `lambdas/*` < 80 LOC each; no SDK calls in handlers; all IO via `services/*`
  * Providers: concrete impls only in `providers/*` behind `ProviderFactory`
  * Terraform/SST: resources grouped in modules/stacks; no cross-layer leakage

* **Measurement Tools**
  * dependency-cruiser with strict rules
  * ESLint import/no-restricted-paths
  * SonarQube complexity metrics

* **Score Guide**
  * 0–1: Handlers call AWS SDKs directly; RN screens fetch + mutate
  * 2: Some separation, frequent violations
  * 3: Clean layering with occasional leaks (<10% violations)
  * 4: Enforced boundaries, <5% violations
  * 5: Zero violations in CI, architecture tests pass

### A2. **Contract-First (Zod)**

**What good looks like:** Shared `@photoeditor/shared` types/schemas are the single source of truth for mobile + backend.

* **Signals**
  * All request/response validated with Zod at edges
  * Versioned schemas with migration strategies
  * Breaking changes require version bump + migration path
  * Contract tests run on every commit

* **Measurement Tools**
  * Zod strict mode enabled
  * OpenAPI generation from Zod schemas
  * Pact or similar contract testing

* **Score Guide**
  * 0–1: Types drift; copy-pasted interfaces
  * 2: Some schema usage, gaps exist
  * 3: 70%+ coverage, manual versioning
  * 4: 90%+ coverage, automated versioning
  * 5: 100% coverage, automated compatibility checks, zero runtime type errors

### A3. **Observability Boundaries**

**What good looks like:** Powertools handlers add correlation IDs, structured logs, metrics, tracing; RN logs are scoped and redact PII.

* **Signals**
  * Consistent `logger.child({ jobId, batchId, correlationId })`
  * Metric namespacing follows team.service.operation pattern
  * X-Ray/DataDog APM on all Lambdas
  * RN: Sentry/Bugsnag integration with user context
  * PII redaction verified by tests

* **Measurement Tools**
  * AWS X-Ray service map coverage
  * CloudWatch Insights queries
  * Sentry issue grouping effectiveness

* **Score Guide**
  * 0–1: Printf logs; no IDs
  * 2: Some structured logging
  * 3: Structured logs, basic tracing
  * 4: Full tracing, useful metrics
  * 5: E2E correlation, <5min MTTI, PII compliance verified

---

## B. Reusability (10-20%)

### B1. **Composable UI & State**

* **Signals**
  * Atomic design system (atoms → molecules → organisms)
  * Hooks follow use* convention with consistent return shapes
  * State normalization with entities/ids pattern
  * FlatList optimization: `keyExtractor`, `getItemLayout`, `windowSize` tuned
  * Storybook coverage >80% of components

* **Measurement Tools**
  * Storybook with accessibility/snapshot tests
  * Bundle analyzer for duplicate code
  * Redux DevTools for state shape analysis

* **Score Guide**
  * 0–1: Monolithic screens/components
  * 2: Some reusable components
  * 3: Component library, 50%+ reuse
  * 4: Full design system, 80%+ reuse
  * 5: Published component library, zero duplication, composability metrics

### B2. **Service & Provider Abstractions**

* **Signals**
  * Interface-first design for all services
  * Providers extend BaseProvider with standard retry/timeout/circuit-breaker
  * Error taxonomy with error codes, not just messages
  * Factory pattern with runtime swapping capability
  * Mock providers for testing

* **Measurement Tools**
  * TypeScript strict checks
  * Test coverage by provider type
  * Interface stability metrics

* **Score Guide**
  * 0–1: Direct SDK/vendor calls everywhere
  * 2: Some abstraction, inconsistent
  * 3: Most calls abstracted, some leaks
  * 4: Full abstraction, swappable providers
  * 5: Multi-provider support, zero vendor lock-in, provider health dashboard

---

## C. Analysability (20-25%)

### C1. **Codebase Navigability**

* **Signals**
  * Consistent naming conventions (enforced by lint)
  * File length ≤200 LOC (95th percentile)
  * Cyclomatic complexity ≤10
  * Cognitive complexity ≤15
  * TypeScript `strict: true`, `noUncheckedIndexedAccess: true`
  * Import depth ≤5 levels

* **Measurement Tools**
  * SonarQube/CodeClimate quality gates
  * ESLint complexity rules
  * madge for circular dependencies
  * TypeScript strict mode

* **Score Guide**
  * 0–1: High complexity (>20), long files (>500 LOC)
  * 2: Some files exceed limits
  * 3: 80% within limits
  * 4: 95% within limits, trends improving
  * 5: 100% compliance, complexity decreased QoQ, automatic refactoring suggestions

### C2. **Runtime Explainability**

* **Signals**
  * Structured logs with consistent schema
  * Business metrics (not just technical)
  * Trace sampling strategy (100% for errors, 10% for success)
  * Alert runbooks with remediation steps
  * SLI/SLO dashboards with error budgets

* **Measurement Tools**
  * CloudWatch/DataDog dashboards
  * Grafana with Prometheus
  * Alert manager with PagerDuty
  * Runbook automation (Rundeck/Ansible)

* **Score Guide**
  * 0–1: Can't reconstruct incidents
  * 2: Manual log diving required
  * 3: Can trace 80% of flows
  * 4: Single query for any transaction
  * 5: Predictive alerting, auto-remediation for known issues

### C3. **Documentation Quality**

* **Signals**
  * README with quickstart ≤5 min
  * API documentation auto-generated
  * Architecture Decision Records (ADRs) for major decisions
  * Inline comments for complex logic (why, not what)
  * Onboarding checklist with measurable milestones
  * Video walkthroughs for complex flows

* **Measurement Tools**
  * Documentation coverage tools
  * README scoring (readme-score-api)
  * Time-to-first-commit metrics
  * Documentation freshness checks

* **Score Guide**
  * 0–1: No/outdated documentation
  * 2: Basic README exists
  * 3: Good README, some inline docs
  * 4: Comprehensive docs, ADRs current
  * 5: Interactive docs, <1 day onboarding, doc-driven development

### C4. **IaC Clarity**

* **Signals**
  * Terraform modules with clear interfaces
  * Variable validation and descriptions
  * Resource tagging strategy (owner, environment, cost-center)
  * No hardcoded values (use data sources/locals)
  * State management with locking
  * Drift detection automated

* **Measurement Tools**
  * Terraform validate/fmt/docs
  * Checkov/tfsec security scanning
  * Infracost for cost analysis
  * Terraform Cloud/Spacelift for state management

* **Score Guide**
  * 0–1: Flat files, hardcoded values
  * 2: Some modules, inconsistent
  * 3: Modularized, documented
  * 4: Full automation, drift alerts
  * 5: GitOps, policy as code, cost optimization automated

---

## D. Modifiability (20%)

### D1. **Change Isolation / Blast Radius**

* **Signals**
  * Feature flags (LaunchDarkly/Unleash) for behavior changes
  * Canary deployments with automatic rollback
  * Database migrations reversible
  * API versioning strategy
  * Microservices boundaries align with team boundaries
  * Change failure rate <15%

* **Measurement Tools**
  * Feature flag usage analytics
  * Deployment frequency metrics
  * Change failure rate tracking
  * Rollback success rate

* **Score Guide**
  * 0–1: Changes ripple widely, no feature flags
  * 2: Some isolation, manual flags
  * 3: Feature flags common, some automation
  * 4: Full flag lifecycle, canary deployments
  * 5: Progressive delivery, <5% change failure rate, automated rollbacks

### D2. **Config & Secrets Hygiene**

* **Signals**
  * All config in SSM/Secrets Manager
  * Typed config interfaces with validation
  * Environment parity (dev/staging/prod)
  * Secret rotation automated
  * No secrets in logs/errors
  * Config hot-reloading where appropriate

* **Measurement Tools**
  * git-secrets pre-commit hooks
  * AWS Config rules
  * Vault/AWS Secrets Manager with rotation
  * Config drift detection

* **Score Guide**
  * 0–1: Secrets in code/env files
  * 2: Centralized but untyped
  * 3: Typed config, manual rotation
  * 4: Automated rotation, validated
  * 5: Zero-trust, dynamic secrets, compliance certified

### D3. **Resilience Patterns**

* **Signals**
  * Idempotency keys on all mutations
  * Retry with exponential backoff + jitter
  * Circuit breakers on external calls
  * Dead letter queues with SLOs
  * Graceful degradation strategies
  * Chaos engineering practices

* **Measurement Tools**
  * AWS Lambda Powertools for retries
  * Hystrix/resilience4j for circuit breakers
  * Chaos Monkey/Gremlin for testing
  * DLQ message age monitoring

* **Score Guide**
  * 0–1: No resilience patterns
  * 2: Basic retries
  * 3: Retries + timeouts + DLQs
  * 4: Full patterns, tested monthly
  * 5: Chaos engineering, <1% message loss, self-healing

### D4. **Developer Experience**

* **Signals**
  * Local development ≤5 min setup
  * Hot reload <3s
  * Pre-commit hooks <30s
  * CI feedback <10 min
  * Debugging tools configured
  * Development environment parity with production

* **Measurement Tools**
  * Build time metrics
  * Developer satisfaction surveys
  * Time-to-first-commit tracking
  * CI/CD pipeline analytics

* **Score Guide**
  * 0–1: Painful setup, slow feedback
  * 2: Setup documented, slow builds
  * 3: Decent DX, some automation
  * 4: Smooth DX, fast feedback
  * 5: Exceptional DX, <5min commit-to-deploy, instant local feedback

### D5. **Deployment Safety**

* **Signals**
  * Blue-green or canary deployments
  * Automated rollback triggers
  * Database migration testing
  * Smoke tests post-deployment
  * Deployment frequency >1/day
  * MTTR <1 hour

* **Measurement Tools**
  * GitHub Actions/CircleCI metrics
  * ArgoCD/Flux for GitOps
  * Deployment frequency tracking
  * MTTR/MTTD dashboards

* **Score Guide**
  * 0–1: Manual deployments, no rollback
  * 2: Some automation, slow rollback
  * 3: Automated deploy, manual rollback
  * 4: Full automation, quick rollback
  * 5: Progressive delivery, instant rollback, deployment on-demand

---

## E. Testability (20-25%)

### E1. **Testing Pyramid & Coverage**

* **Signals**
  * Unit tests: 80%+ coverage on business logic
  * Integration tests: API contracts, database operations
  * E2E tests: Critical user journeys only
  * Contract tests: All service boundaries
  * Mutation testing: >60% kill rate on critical paths
  * Performance tests: Load testing on key endpoints

* **Measurement Tools**
  * Jest/Vitest with coverage reports
  * Stryker for mutation testing
  * Pact for contract testing
  * K6/Artillery for load testing
  * Playwright/Cypress for E2E

* **Score Guide**
  * 0–1: <30% coverage, no integration tests
  * 2: 50% coverage, some integration
  * 3: 70% coverage, good integration
  * 4: 80%+ coverage, contract tests
  * 5: 90%+ coverage, mutation testing, performance baselines

### E2. **Deterministic Test Environments**

* **Signals**
  * LocalStack/Docker for local AWS services
  * Seed data versioned and deterministic
  * Test data factories (not fixtures)
  * Snapshot tests with deterministic IDs
  * Time/date mocking consistent
  * Zero test flakiness over 30 days

* **Measurement Tools**
  * Docker Compose for services
  * Testcontainers for integration tests
  * Flakiness dashboard
  * Test execution time tracking

* **Score Guide**
  * 0–1: Flaky tests, no isolation
  * 2: Some isolation, frequent flakes
  * 3: Good isolation, occasional flakes
  * 4: Full isolation, rare flakes
  * 5: Hermetic tests, zero flakes, parallel execution

### E3. **Test Observability**

* **Signals**
  * Test failure categorization (product/test/infra)
  * Assertions on logs/metrics for failure paths
  * Performance regression detection
  * Code coverage trends
  * Test execution time optimization
  * Failed test impact analysis

* **Measurement Tools**
  * Allure/ReportPortal for reporting
  * Test impact analysis tools
  * Coverage trend tracking
  * Performance baseline comparison

* **Score Guide**
  * 0–1: Basic pass/fail
  * 2: Some categorization
  * 3: Good reporting, manual analysis
  * 4: Automated analysis, trends
  * 5: Predictive test selection, automatic test optimization

### E4. **Mobile Testing Specifics**

* **Signals**
  * Device farm testing (iOS/Android variants)
  * Accessibility testing automated
  * App size regression tests
  * Crash-free rate >99.5%
  * Beta testing pipeline
  * Over-the-air update testing

* **Measurement Tools**
  * Detox/Appium for mobile E2E
  * Firebase Test Lab/AWS Device Farm
  * Fastlane for automation
  * Crashlytics/Bugsnag for crash reporting

* **Score Guide**
  * 0–1: Manual testing only
  * 2: Some automation, single device
  * 3: Multi-device, basic automation
  * 4: Full device coverage, beta pipeline
  * 5: Continuous device testing, A/B test framework

### E5. **Security Testing**

* **Signals**
  * Dependency vulnerability scanning
  * SAST/DAST in CI pipeline
  * Secret scanning pre-commit
  * Security headers tested
  * OWASP Top 10 coverage
  * Penetration testing quarterly

* **Measurement Tools**
  * Snyk/Dependabot for dependencies
  * SonarQube for SAST
  * OWASP ZAP for DAST
  * GitHub secret scanning

* **Score Guide**
  * 0–1: No security testing
  * 2: Basic dependency scanning
  * 3: SAST + dependency scanning
  * 4: Full automated security suite
  * 5: Continuous security testing, bug bounty program

---

# Implementation Roadmap

## Phase 1: Foundation (Weeks 1-4)
**Target Score: 2.5-3.0**

1. **Week 1**: Establish baselines
   - Run all measurement tools
   - Document current scores
   - Identify critical gaps

2. **Week 2**: Quick wins
   - Enable TypeScript strict mode
   - Add basic ESLint rules
   - Setup pre-commit hooks

3. **Week 3**: Core testing
   - Unit test critical paths
   - Add integration tests for APIs
   - Setup coverage reporting

4. **Week 4**: Documentation
   - Create/update READMEs
   - Document architecture decisions
   - Setup API documentation

## Phase 2: Established (Weeks 5-12)
**Target Score: 3.5-4.0**

1. **Weeks 5-6**: Automation
   - CI/CD pipeline optimization
   - Automated deployments
   - Feature flags implementation

2. **Weeks 7-8**: Observability
   - Structured logging
   - Distributed tracing
   - Alert setup

3. **Weeks 9-10**: Resilience
   - Implement retry patterns
   - Add circuit breakers
   - Setup DLQs

4. **Weeks 11-12**: Advanced testing
   - Contract testing
   - Performance testing
   - Security scanning

## Phase 3: Optimized (Weeks 13+)
**Target Score: 4.0-5.0**

1. **Continuous improvement**
   - Mutation testing
   - Chaos engineering
   - Progressive delivery

2. **Team practices**
   - Documentation-driven development
   - Pair programming metrics
   - Knowledge sharing sessions

3. **Innovation**
   - AI-assisted code review
   - Predictive alerting
   - Self-healing systems

---

# Scoring Worksheet

| Category | Sub-attribute | Weight | Score (0-5) | Weighted |
|----------|--------------|--------|-------------|----------|
| **Modularity** | | **25%** | | |
| | A1. Layering & Boundaries | 35% | | |
| | A2. Contract-First | 35% | | |
| | A3. Observability Boundaries | 30% | | |
| **Reusability** | | **15%** | | |
| | B1. Composable UI & State | 50% | | |
| | B2. Service Abstractions | 50% | | |
| **Analysability** | | **20%** | | |
| | C1. Code Navigability | 25% | | |
| | C2. Runtime Explainability | 25% | | |
| | C3. Documentation Quality | 25% | | |
| | C4. IaC Clarity | 25% | | |
| **Modifiability** | | **20%** | | |
| | D1. Change Isolation | 20% | | |
| | D2. Config & Secrets | 20% | | |
| | D3. Resilience Patterns | 20% | | |
| | D4. Developer Experience | 20% | | |
| | D5. Deployment Safety | 20% | | |
| **Testability** | | **20%** | | |
| | E1. Testing Pyramid | 25% | | |
| | E2. Deterministic Environments | 20% | | |
| | E3. Test Observability | 20% | | |
| | E4. Mobile Testing | 20% | | |
| | E5. Security Testing | 15% | | |
| **TOTAL** | | **100%** | **/5** | **/100%** |

---

# Gate Thresholds

## Maturity-Based Gates

### Foundation Stage (New Teams/Products)
- **Green**: Overall ≥ 2.5/5, no critical items <2
- **Yellow**: Overall 2.0-2.49/5, plan to reach 2.5 in 30 days
- **Red**: Overall <2.0/5 OR any security/resilience item <1

### Established Stage (Growing Products)
- **Green**: Overall ≥ 3.5/5, no category <3
- **Yellow**: Overall 3.0-3.49/5, improvement plan required
- **Red**: Overall <3.0/5 OR regression from previous quarter

### Optimized Stage (Mature Products)
- **Green**: Overall ≥ 4.0/5, continuous improvement demonstrated
- **Yellow**: Overall 3.5-3.99/5, justify any <4 scores
- **Red**: Overall <3.5/5 OR any critical regression

## Critical Items (Always Required)
- Config & Secrets ≥ 3 (no secrets in code)
- Security Testing ≥ 2 (basic scanning)
- Documentation Quality ≥ 2 (README exists)
- Change Isolation ≥ 2 (basic version control)

---

# Evidence Bundle Checklist

## Required Artifacts
- [ ] **Baseline Report**: Current scores with evidence
- [ ] **Tool Reports**: 
  - [ ] SonarQube/CodeClimate analysis
  - [ ] Test coverage report
  - [ ] Bundle size analysis
  - [ ] Security scan results
- [ ] **Metrics Dashboards**:
  - [ ] Build/deployment metrics
  - [ ] Application performance
  - [ ] Error rates and alerts
- [ ] **Documentation**:
  - [ ] Architecture diagrams
  - [ ] API documentation
  - [ ] Runbooks
- [ ] **Improvement Plan**: 
  - [ ] Gap analysis
  - [ ] Prioritized backlog
  - [ ] Timeline with milestones

## Automation Integration
```yaml
# .github/workflows/maintainability-check.yml
name: Maintainability Scorecard
on: [pull_request]
jobs:
  score:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v3
      - name: Run Complexity Analysis
      - name: Check Test Coverage
      - name: Validate Documentation
      - name: Security Scan
      - name: Generate Scorecard
      - name: Comment on PR
```

---

# ROI Prioritization Matrix

| Improvement | Effort | Impact | ROI | Priority |
|------------|--------|--------|-----|----------|
| Enable TypeScript strict | Low | High | 9/10 | P0 |
| Add contract tests | Medium | High | 8/10 | P0 |
| Implement feature flags | Medium | High | 8/10 | P0 |
| Structure logging | Low | Medium | 7/10 | P1 |
| Add mutation testing | High | Medium | 5/10 | P2 |
| Chaos engineering | High | Low | 3/10 | P3 |

---

# Appendix: Tool Recommendations

## Static Analysis
- **TypeScript**: strict mode, noUncheckedIndexedAccess
- **ESLint**: airbnb-typescript, complexity rules
- **SonarQube**: quality gates, technical debt tracking

## Testing
- **Unit**: Jest/Vitest with 80% coverage target
- **Integration**: Supertest, TestContainers
- **E2E**: Playwright (web), Detox (mobile)
- **Performance**: K6, Artillery
- **Security**: Snyk, OWASP ZAP

## Observability
- **Logging**: Winston/Pino with correlation IDs
- **Tracing**: AWS X-Ray, OpenTelemetry
- **Metrics**: CloudWatch, Prometheus
- **Errors**: Sentry, Rollbar

## Infrastructure
- **IaC**: Terraform with Checkov scanning
- **Secrets**: AWS Secrets Manager with rotation
- **Config**: AWS Systems Manager Parameter Store

## CI/CD
- **Pipeline**: GitHub Actions, CircleCI
- **Deployment**: AWS CodeDeploy, ArgoCD
- **Feature Flags**: LaunchDarkly, Unleash
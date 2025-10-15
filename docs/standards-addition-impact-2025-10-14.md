# Impact Assessment: Candidates for Standards Expansion (2025-10-14)

## Scope
This note reviews guidance that exists only in `docs/maintainability-rubric.md` and evaluates whether it should be promoted into the authoritative standards library. Each candidate includes the originating rubric section, the gap it would close, expected benefits, risks or adoption costs, and the standards artefacts that would need to change. Recommendations use three buckets: **Adopt**, **Pilot**, or **Defer**.

## Candidates

### 1. Maintainability Score Framework & Weightings
- **Rubric source**: scoring scale, maturity weightings, and gate thresholds (`docs/maintainability-rubric.md`:5-24,547-596).
- **Current gap**: `standards/` relies on binary promotion gates without a shared numeric benchmark for continuous tracking.
- **Benefits**: enables quarterly governance to track progress numerically, aligns evidence bundles with target deltas, and codifies expectations for teams at different maturity levels.
- **Risks / costs**: duplicate gating logic could confuse reviewers unless hard-fail controls are reconciled; requires calibration to avoid false positives where numeric “green” conflicts with existing hard fails; adds reporting overhead.
- **Required updates**: extend `standards/global.md` with the scoring model, update `standards/cross-cutting.md` governance section to reference the scale, and adjust PR templates in `docs/` to capture score submissions.
- **Recommendation**: **Pilot** during the next quarterly standards review to validate calibration before enshrining as mandatory.

### 2. Evidence Bundle Checklist & Automation Workflow
- **Rubric source**: detailed artefact list and GitHub Actions skeleton (`docs/maintainability-rubric.md`:606-643).
- **Current gap**: standards demand an evidence bundle but stop short of defining minimum contents or automation entry points.
- **Benefits**: removes ambiguity for release stewards, encourages consistent artefact archival, and gives a ready-made CI workflow for teams lacking automation.
- **Risks / costs**: checklist may need tailoring per tier; enforcing a single workflow could clash with existing pipelines; maintenance burden for the template.
- **Required updates**: enrich `standards/global.md` governance section with the canonical checklist, add automation guidance to `standards/cross-cutting.md` governance & knowledge area, and publish the workflow under `docs/quality/` as a reference template.
- **Recommendation**: **Adopt** with minor tailoring, because it reinforces an existing standard with precise deliverables.

### 3. Observability Operational Metrics (SLI/SLO Dashboards & Runbook Automation)
- **Rubric source**: runtime explainability signals & measurement tools (e.g., Grafana/Prometheus dashboards, PagerDuty runbooks, trace sampling strategies) (`docs/maintainability-rubric.md`:170-190,179-184).
- **Current gap**: cross-cutting standards require correlation IDs and trace coverage but lack explicit expectations for SLO dashboards or automated remediation assets.
- **Benefits**: strengthens incident readiness, supports auditability for MTTR/MTTP targets, and clarifies evidence bundle content for observability guild reviews.
- **Risks / costs**: mandates additional platform investments (Grafana, PagerDuty) that some squads may not own; requires owner assignment for runbook automation.
- **Required updates**: append explicit SLI/SLO dashboard and runbook automation requirements to `standards/cross-cutting.md` Observability & Operations; update evidence section to reference dashboard exports.
- **Recommendation**: **Pilot** with observability guild to confirm tooling alignment before turning into a hard requirement.

### 4. Developer Experience Metrics & Feedback Loop
- **Rubric source**: developer experience signals including setup time targets, hot reload expectations, satisfaction surveys, and time-to-first-commit tracking (`docs/maintainability-rubric.md`:313-333,321-325).
- **Current gap**: standards monitor CI task durations but omit qualitative DX surveys and onboarding lead-time metrics.
- **Benefits**: provides leading indicators for burnout risk, ties DX improvements to measurable goals, and supports quarterly governance cadences.
- **Risks / costs**: gathering survey data requires coordination with People Ops; metrics could be gamed without a central owner; adds reporting overhead to evidence bundles.
- **Required updates**: enhance `standards/cross-cutting.md` Developer Experience section with survey cadence and onboarding metrics, and document reporting responsibilities in `tasks/` templates.
- **Recommendation**: **Pilot** with Developer Experience Lead to validate data collection before roll-out.

### 5. Mobile Quality Benchmarks (Device Farm Coverage & Crash-Free Rate)
- **Rubric source**: mobile testing specifics, device farm coverage, crash-free rate ≥99.5%, and beta pipeline expectations (`docs/maintainability-rubric.md`:431-452).
- **Current gap**: frontend tier mandates Detox runs and navigation coverage but does not set crash-rate SLAs or require multi-device automation evidence.
- **Benefits**: raises confidence for mobile releases, gives measurable thresholds for beta funnels, and aligns with app store reliability goals.
- **Risks / costs**: device farm subscriptions increase spend; achieving 99.5% crash-free rate may be unrealistic for early-stage features; requires analytics instrumentation alignment (e.g., Bugsnag/Crashlytics).
- **Required updates**: add crash-free SLA and device farm artifact requirements to `standards/frontend-tier.md` Platform & Delivery section and ensure evidence bundle references (e.g., `docs/ui/e2e`) capture device farm exports.
- **Recommendation**: **Adopt** with phased enforcement (warn → hard fail) to give squads time to budget and integrate tooling.

## Next Steps
1. Circulate this assessment at the 14 October 2025 standards council sync and gather owner sign-off for each **Pilot**/**Adopt** item.
2. For approved pilots, create linked tasks in `tasks/` with success metrics and due dates aligned to the next quarterly governance window.
3. Revisit outcomes during the Q1 2026 standards review to determine which pilots graduate into hard-fail controls.

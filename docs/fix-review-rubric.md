# 🧩 Fix Review Rubric (Systemic Proposal Evaluation)

> Purpose: Stress-test every implementation proposal so the eventual fix lands as a **systemic, reusable, and architecturally aligned change** rather than a narrow patch. Scores represent reviewer confidence in the proposal’s ability to deliver ISO/IEC 25010 attributes (maintainability, reliability, modifiability, operability) once implemented.

---

## 📋 Structure Overview

Each proposal/fix plan is scored across **five dimensions** (0–5 confidence scale each). Attach prospective evidence (diagrams, contracts, rollout plans) that justifies the expected score once the work ships.

| # | Dimension | Goal | Weight | Scoring Range |
|---|-----------|------|--------|---------------|
| 1 | Generality | Solve classes of problems, not isolated bugs | 1.5× | 0–5 |
| 2 | Coupling & Boundaries | Reduce hidden dependencies and clarify contracts | 1.2× | 0–5 |
| 3 | Test Depth | Prove correctness under variation and regressions | 1.0× | 0–5 |
| 4 | Design Alignment | Adhere to or improve architectural patterns and ADRs | 1.2× | 0–5 |
| 5 | Complexity & Clarity | Maintain or reduce cognitive/branching complexity | 1.0× | 0–5 |

**Weighted Score Formula:** `Σ(scoreₙ × weightₙ)` (confidence-weighted outlook)

- **Maximum Weighted Score:** 29.5 (Σ weights = 5.9; each score ≤5). Use it as a directional comparison, not a substitute for judgment.
- **Per-dimension floor:** Any score `< 2` means the proposal is too implementation-specific or fragile; mark `NEED_REWORK` regardless of totals.

### Tier Thresholds

| Weighted Score | Tier | Expectation | Merge Gate |
|----------------|------|-------------|------------|
| ≤ 16.9 | Needs Design Review | Stop; revisit solution/architecture | Blocked |
| 17.0 – 21.2 | Foundational | Merge only with explicit follow-up task | Conditional |
| 21.3 – 25.5 | Advanced | Target bar for day-to-day fixes | Mergeable |
| ≥ 25.6 | Strategic | Systemic uplift with measurable deltas | Celebrate | 

---

## 🧭 How to Apply

1. **Task Source of Truth:** Embed the rubric snippet in the driving `tasks/<ID>.task.yaml` and reference the proposal (`docs/proposals/...`) plus any ADRs explaining the planned approach.
2. **Prospective QA Strategy:** Outline which QA commands, coverage targets, or chaos exercises *will* prove the change once implemented. Actual logs attach later during execution.
3. **Standards Alignment:** Cite the clauses or ADRs the proposal leans on; note any exceptions and how they’ll be ratified.
4. **Architecture & Complexity Evidence:** Provide diagrams, interface drafts, and sequencing notes that show how the change keeps coupling low and complexity in check.
5. **Metrics Commitment:** Define the baseline data source (or placeholder) and target window so success can be measured when the change lands.

---

## 🧱 Dimension Definitions & Guardrails

Each table spells out observable criteria for every score. Use the guardrail notes to know what evidence must be attached.

### 1. Generality (Weight: 1.5×)
**Question:** Does this fix solve a class of issues?

| Score | Criteria |
|-------|----------|
| 0 | Patches a single condition/input; no reuse possible.
| 1 | Handles a couple of known variants but still ad-hoc.
| 2 | Extracts shared logic but only local callers use it.
| 3 | Provides a reusable helper/guard accessible to multiple modules.
| 4 | Establishes a rule/pattern applied across features or services.
| 5 | Elevates the behavior to domain/shared policy with tests + docs.

**Guardrail:** Point to the shared module, ADR, or layering doc the proposal will update (or create) so the new rule becomes reusable once built.

### 2. Coupling & Boundaries (Weight: 1.2×)
**Question:** Does the fix reduce hidden dependencies and clarify interfaces?

| Score | Criteria |
|-------|----------|
| 0 | Introduces implicit shared state or cross-layer bleed.
| 1 | Adds a dependency without contracts or validation.
| 2 | Uses an existing interface but leaks assumptions in comments/tests.
| 3 | Respects current module boundaries with clear ownership.
| 4 | Tightens encapsulation, updates types/contracts, or adds adapters.
| 5 | Fully decouples logic, documents the interface, and backfills callers.

**Guardrail:** Provide proposed interface/type changes, sequence diagrams, or contract-test plans that will enforce the boundary post-implementation.

### 3. Test Depth (Weight: 1.0×)
**Question:** Are tests sufficient to demonstrate correctness under variation?

| Score | Criteria |
|-------|----------|
| 0 | Only reproduces the exact failing case.
| 1 | Reproducer plus one happy-path assertion.
| 2 | Adds a negative case but no boundary/extreme coverage.
| 3 | Covers boundary cases or alternative flows (min/max inputs, race).
| 4 | Adds property/fuzz/soak testing for varied input envelopes.
| 5 | Expands systemic tests (contract/integration/regression harness).

**Guardrail:** Link to the planned test matrix, coverage expectations, or automation hooks; reserve actual command logs for execution time.

### 4. Design Alignment (Weight: 1.2×)
**Question:** Does the fix align with architectural patterns or improve them?

| Score | Criteria |
|-------|----------|
| 0 | Breaks standards/architecture outright.
| 1 | Adds bespoke logic divergent from patterns.
| 2 | Uses the pattern but leaves TODOs or inconsistencies.
| 3 | Fits existing design without regression.
| 4 | Strengthens the abstraction, clarifies layering, or updates ADR.
| 5 | Refactors toward cleaner domain boundary with documented decision.

**Guardrail:** Cite the ADR or standards clause governing the proposed design; outline the ADR change or addendum you’ll file for scores ≥4.

### 5. Complexity & Clarity (Weight: 1.0×)
**Question:** Did the change increase complexity or reduce clarity?

| Score | Criteria |
|-------|----------|
| 0 | Raises cyclomatic complexity by >5 and introduces nested branching.
| 1 | Adds non-obvious branching or duplicated logic.
| 2 | Net-neutral complexity but readability suffers (naming, comments).
| 3 | Complexity neutral and code remains understandable.
| 4 | Simplifies flow/naming or removes a conditional branch.
| 5 | Collapses branching, removes duplication, and adds intent-revealing names.

**Guardrail:** Include draft diagrams, pseudocode, or complexity analysis describing how the implementation will simplify or avoid added branching.

## 📊 Success Metrics & Feedback Blueprint

- **Metric Definition:** For every proposal, list the metrics the future implementation should improve (error rate, crash-free sessions, latency, MTTR) and identify the data source that will provide baselines when work begins.
- **Target Window:** Document the desired delta and measurement window (e.g., “reduce backend retry rate from TBD to <1% within 14 days of launch”). Use `TBD` placeholders if baselines are pending but state how they’ll be gathered.
- **Feedback Loop:** Assign an owner and follow-up date to confirm the metrics/alerts after deployment. Capture planned inspection points (pilot retro, dashboard review, chaos exercise) so future you can close the loop.

---

## 📈 Scoring Template

```yaml
proposal_systemic_review:
  proposal: "docs/proposals/automated-test-spec-handoff-pipeline.md"
  title: "<short description of proposed fix>"
  author: "<name>"
  reviewer: "<name>"
  date: "<YYYY-MM-DD>"
  task_ref: "tasks/TASK-0123.task.yaml"
  adr_refs:
    - "adr/2025-11-10-safe-retries.md"

  scores:
    generality: 4
    coupling_boundaries: 3
    test_depth: 4
    design_alignment: 4
    complexity_clarity: 5

  weighted_score: 23.4 # Σ(score × weight)
  tier: "Advanced" # Foundational / Advanced / Strategic
  outcome: "READY" # NEED_REWORK / NEED_DESIGN_REVIEW / READY

  systemic_rationale:
    - "Generalization plan: move validation into shared contract layer."
    - "Coupling mitigation: introduce API adapter documented in ADR-012."
    - "Test strategy: fuzz harness + contract tests listed below."
    - "Complexity stays flat by collapsing two conditionals into one guard."

  qa_plan:
    commands:
      - "pnpm turbo run qa:static --parallel"
      - "pnpm turbo run test --filter=@photoeditor/backend"
    coverage_expectations: "≥80% line / ≥70% branch on modified services"
    automation_notes: "Add chaos experiment script once watcher lands."

  metrics:
    - metric: "spec_pipeline_success_rate"
      baseline_source: "Pending instrumentation (TBD via Datadog query)"
      target: "≥95% within 30 minutes"
      measurement_window: "First 14 days after launch"

  feedback_loop:
    owner: "<name>"
    follow_up_date: "<YYYY-MM-DD>"
    planned_checks:
      - "Review dashboard 48h post launch"
      - "Run chaos test for watcher restart"
```

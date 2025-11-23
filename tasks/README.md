# Tasks Authoring Guide

This guide shows how to create a new machine‑readable task file using the canonical template. For how to decide and perform task breakdown, see the Task Breakdown Canon in `standards/task-breakdown-canon.md` (authoritative).

## Template Selection

All work now uses a single canonical template: `docs/templates/TASK-0000-template.task.yaml` (Schema 1.1).

- Copy that file verbatim, then replace every `REPLACE` placeholder.
- Delete comment lines once satisfied, but keep the YAML keys so automation can parse the task.
- If the scope feels broader than one independently shippable change, stop and split the requirements into multiple task files—the template is intentionally concise, so multiple tasks are preferred over an oversized document.
- After filling out the template, run `scripts/validate-task-yaml tasks/<area>/TASK-<id>-<slug>.task.yaml` to lint the YAML via the Python CLI before moving past draft status. Capture the command output in your implementation notes.

**Schema 1.1 Requirements (active as of 2025-11-04):**
- Tasks MUST include a `validation` section with `pipeline` commands (see `standards/qa-commands-ssot.md`)
- Plan step `outputs` cannot be empty arrays - list specific deliverable files or use inline comments to guide completion
- Standards references in plan steps must cite verifiable anchor headings (e.g., `#analyzability`, not made-up slugs)
- Evidence paths referenced in `clarifications.evidence_path` must exist before transitioning from `draft` to `todo`
- See `docs/templates/validation-section-examples.md` for copy-paste examples per package

## Quick Start
- Choose an `area`: `backend | mobile | shared | infra | docs | ops | other`.
- Allocate a stable `id` (e.g., `TASK-0123`) and a short slug (e.g., `image-crop-bounds`).
- Copy the single template: `cp docs/templates/TASK-0000-template.task.yaml tasks/<area>/TASK-<id>-<slug>.task.yaml`
- Replace every placeholder. Keep IDs and titles stable.
- Leave `status: draft` until clarifications, standards citations, and evidence paths are complete; only then transition to `todo`.
- Record every ambiguity under the template's `clarifications` block and link the evidence file you will use to resolve it.
- Link the relevant standards via `context.standards_tier` and `context.related_docs`.
- Add a dedicated plan stage to confirm the work complies with the cited standards and to record any gaps that require standards updates.
- Commit the task alongside the code branch that will implement it.

> **Update (2025-11-01)**: Python task CLI is now active (Week 3 cutover complete, see `docs/proposals/task-workflow-python-refactor.md`). All commands available via `scripts/pick-task` (delegates to Python) or direct Python invocation `python scripts/tasks.py`. Key improvements:
> - Inline `blocked_by` arrays parse correctly
> - Unblocker prioritization works (unblockers always first)
> - JSON output: `python scripts/tasks.py --list --format json`
> - Graph export: `python scripts/tasks.py --graph`
> - Status transitions: `--claim`, `--complete` (auto-archives to docs/completed-tasks/)

## Fields You Must Fill
Use the comments in the template as your checklist. At minimum, complete:
- `id`, `title`, `status`, `priority`, `area` (start in `draft`; move to `todo` only when clarifications settle)
- `description` (2–6 sentences of context)
- `outcome` (verifiable end state, not steps)
- `scope.in` and `scope.out`
- `context.related_docs` with the applicable tier standards + testing standards
- `repo_paths` for touched files (approximate is fine initially; update it before implementation wraps so reviewers inherit the exact diff scope)
- `environment`, `constraints`
- `clarifications.outstanding` (list open questions; remove once answered) and `clarifications.evidence_path` (point to `docs/evidence/tasks/<task-id>-clarifications.md`)
- `plan` (ordered steps)
  - Each step must declare: `actor` (agent|human), `inputs`, `outputs`, `definition_of_done`, and an `estimate` (S|M|L). Do not include shell `commands` in plan steps; validation runs elsewhere and AC is the source of truth.
  - Cite the exact standards clause governing the step (file path + heading slug, e.g., `standards/backend-tier.md#service-layer-boundaries`) inside `details` or `definition_of_done` so the reviewer can trace intent directly to the rule.
  - Write `definition_of_done` statements as observable outcomes ("Document notes in docs/evidence/standards-review.md citing standards/backend-tier.md#service-layer-boundaries") rather than vague actions.
- `acceptance_criteria` (objective checks tied to observable signals)
- `validation` (REQUIRED in schema 1.1):
  - `validation.pipeline`: array of commands from `standards/qa-commands-ssot.md` (e.g., lint:fix, qa:static, test, coverage)
  - `validation.manual_checks`: optional human verification steps if automation cannot cover; default to empty array
  - Each pipeline command must have `command` and `description` fields
  - Reference coverage thresholds from `standards/testing-standards.md` (SSOT: ≥70% lines, ≥60% branches)
  - See `docs/templates/validation-section-examples.md` for package-specific templates
- `deliverables` and `risks`

If sequencing matters, also set `blocked_by`, `depends_on`, and `order`. Any downstream task referencing a `draft` MUST list that draft under `blocked_by` (not merely `depends_on`) and stay `status: blocked` until the draft transitions to `todo`.

### Draft Resolution Checklist
Before flipping a task from `draft` to `todo`, confirm:
- All `clarifications.outstanding` entries are resolved (delete the list or leave it empty).
- `clarifications.evidence_path` exists and points to the Markdown file capturing the resolution (REQUIRED for schema 1.1).
- The `validation` section is complete with non-empty `pipeline` array (schema 1.1 requirement).
- Plan step `outputs` are populated with specific deliverable files (no empty arrays in schema 1.1).
- Standards references cite verifiable anchor headings (use `python scripts/tasks.py --lint` to validate).
- Acceptance criteria, plan steps, and standards citations are complete and referenced.
- Downstream tasks that depend on this work have updated their `blocked_by` lists and `blocked_reason` values if applicable.

**Tip:** Run `python scripts/tasks.py --lint tasks/<area>/TASK-XXXX.task.yaml` to verify schema 1.1 compliance before transitioning to `todo`.

### Dependency Fields: `blocked_by` vs `depends_on`

Tasks support two types of dependencies with different semantics:

**`blocked_by` (hard execution blocker):**
- Task **CANNOT START** until all dependencies have `status: completed`
- Enforced by the Python CLI task picker (`python scripts/tasks.py --pick`)
- Use for strict sequencing (e.g., schema definition must complete before implementation)
- Include draft tasks here until they exit `draft`; this keeps downstream work explicitly blocked and surfaces CLI warnings if missing.
- Example: `blocked_by: [TASK-0199]` means this task is not ready until TASK-0199 completes

**`depends_on` (informational/artifact dependency):**
- Task **NEEDS OUTPUTS** from these tasks but can start in parallel
- NOT enforced by the task picker (documentation only)
- Use for artifact tracing, context, and dependency visualization
- Helps developers understand relationships without blocking execution
- Example: `depends_on: [TASK-0150]` means this task uses S3 bucket from TASK-0150 (already completed)

**When to use which:**
- Use `blocked_by` when the task literally cannot begin until dependencies finish
- Use `depends_on` when the task needs artifacts/outputs but the blocker is already resolved or can proceed in parallel
- A task can have both (e.g., blocked by schema definition, depends on infrastructure that's already done)

**Example:**
```yaml
# TASK-0200: Implement image upload handler
blocked_by: [TASK-0199]  # Cannot start until upload schema is defined
depends_on: [TASK-0150]  # Uses S3 bucket from infra (already completed, for context)
```

**Draft tasks and artifact dependencies:**
When a task depends on an artifact produced by a draft task, you MUST include the draft task in `blocked_by` to ensure work doesn't start before the design is clarified. The CLI only checks task status for `blocked_by` dependencies—it does not track which tasks produce which artifacts. Without explicit `blocked_by` linkage, a task could appear ready even though its upstream artifact producer is still in draft status.

Example:
```yaml
# TASK-A (draft): Design data model
status: draft
deliverables:
  - shared/schemas/user-profile.ts

# TASK-B: Implement profile endpoint (depends on schema from TASK-A)
blocked_by: [TASK-A]  # Required! Schema producer is still in draft
depends_on: [TASK-A]  # Documents artifact dependency (schema file)
```

See `docs/proposals/task-workflow-python-refactor.md` Section 3.5 for detailed semantics and Python CLI implementation.

### Unblocker Tasks
Set `unblocker: true` for tasks that unblock other work. The Python task picker now correctly prioritizes unblocker tasks FIRST, even over higher-priority non-unblockers (P2 unblocker selected before P0 non-unblocker). Use this flag for tasks that:
- Fix test infrastructure preventing other tests from running
- Resolve dependency/tooling blockers
- Address cross-cutting issues that impede multiple feature branches
- Clear path for other high-priority work

### Automatic Priority Propagation

**Phase 2 (Active)**: The Python CLI automatically propagates priority through dependency chains. Tasks inherit the **maximum priority** of all work they transitively block, eliminating the need for manual `unblocker: true` flags in most cases.

**How it works:**
- If TASK-A (P2) blocks TASK-B (P1), TASK-A automatically inherits P1 effective priority
- Multi-hop chains work: TASK-A → TASK-B → TASK-C means TASK-A inherits the max priority of B and C
- Diamond dependencies handled correctly: each task inherits the highest priority from all downstream work

**Example:**
```yaml
# TASK-0832: Backfill screens coverage (P2 declared)
priority: P2
status: todo
blocked_by: []

# TASK-0830: Test coverage evidence (P1 declared)
priority: P1
status: blocked
blocked_by: [TASK-0832]  # Blocks P1 work

# Result: TASK-0832 automatically inherits P1 effective priority
# CLI output: reason="priority_inherited", effective_priority="P1"
```

**When tasks inherit priority:**
- Task blocks higher-priority work (P2 blocking P1 → inherits P1)
- Task blocks same priority work (P1 blocking P1 → no change)
- Task blocks lower-priority work (P0 blocking P1 → no change, keeps P0)

**Manual override:**
- Setting `unblocker: true` still takes highest precedence (selected before all priority-based work)
- Use manual override for external blockers not tracked in the system

**JSON output:**
- `effective_priority`: Computed priority (inherited from blocked work)
- `priority_reason`: Audit trail (e.g., "Blocks P1 work: TASK-0830")
- Fields always present in JSON output, null when not applicable

See `docs/proposals/transitive-unblocker-detection.md` for complete design and rationale.

## Standards Alignment
- SSOT for grounding and standards changes: `standards/standards-governance-ssot.md`.
- Before drafting the plan, read the standards referenced in `context.related_docs` so the work stays grounded in approved architectural rules.
- Add a `Standards review` step in the task plan that confirms the implementation matches the cited standards and documents any gaps.
- When new behaviour is not covered by existing standards, author a change request:
  - Create a follow-up task (typically under `tasks/docs/`) using the same template to describe the required standards update.
  - Update or add files inside `standards/` as part of that change request, following the SSOT workflow.
  - Link the CR task back to the original work so auditors can trace why the standards evolved.

### Handling Blockers
- When work is impeded by an issue outside the task scope, change `status` to `blocked` and record a one-line reason in `blocked_reason` (see template updates below).
- Create a dedicated unblocker task in the appropriate `tasks/<area>/` folder. Its description must focus on clearing the blocker, and its `priority` should match or exceed the highest-priority task depending on it (default to the parent task's priority unless an escalation to P0 is warranted).
- **IMPORTANT:** Set `unblocker: true` on the new task so the Python task picker raises it ahead of ALL other work (unblockers always selected first regardless of priority).
- Add the new task's ID to the original task's `blocked_by` list so orchestration scripts understand the dependency chain.
- Treat unblocker tasks as top-of-queue items; close them promptly, then flip the original task back to `in_progress` or `todo` and continue.
 - If the blocker is "complexity/decomposition required", follow `standards/task-breakdown-canon.md` to run a Breakdown Pass and create the necessary subtasks.

## Task Breakdown
Refer to the comprehensive Task Breakdown Canon: `standards/task-breakdown-canon.md`.
It defines when to decompose work, how to create subtasks using the canonical template, how to encode dependencies via `blocked_by`/`order`, and how agents should proceed when tasks are blocked due to complexity.



## Validation & Evidence

**Schema 1.1 requires a `validation` section with structured pipeline commands.**

### Validation Section Structure
```yaml
validation:
  pipeline:
    - command: pnpm turbo run lint:fix --filter=@photoeditor/backend
      description: Auto-fix linting issues in backend package
    - command: pnpm turbo run qa:static --filter=@photoeditor/backend
      description: Run static analysis (typecheck + lint) on backend
    - command: pnpm turbo run test --filter=@photoeditor/backend
      description: Run unit tests for backend package
    - command: pnpm turbo run test:coverage --filter=@photoeditor/backend
      description: Run tests with coverage reporting to verify thresholds
  manual_checks: []  # Optional: add human verification steps if needed
```

### Guidelines
- Automated static, unit, and contract tests run through the `.claude/` test agents. Command names are authoritative in `standards/qa-commands-ssot.md`.
- Each `pipeline` entry must specify the exact command and a clear description
- Reference coverage thresholds from `standards/testing-standards.md` (≥70% lines, ≥60% branches repo-wide; tier-specific overrides documented in tier standards)
- Use `manual_checks` sparingly - prefer automated pipeline commands
- See `docs/templates/validation-section-examples.md` for copy-paste templates per package (backend, mobile, shared)
- Attach artifacts listed under the task's `artifacts` list when applicable, especially when they prove standards compliance


## Status Flow & Archival
- Default flow: `draft → todo → in_progress → completed`, with `blocked` as an exception state for external dependencies. Tasks MUST start in `draft` until clarifications are documented.
- The CLI refuses to pick `draft` tasks and prints a warning summary listing drafts and downstream tasks still waiting on clarifications.
- On completion, move the file to `docs/completed-tasks/` (see template notes).

## Task Context Cache

The task context cache provides a persistent, immutable snapshot of task metadata, standards citations, and validation baselines for agent coordination. This eliminates redundant uploads of standards boilerplate and ensures deterministic handoffs between agents.

### Key Concepts

**Immutable Context**: When a task transitions to `in_progress`, the system captures:
- Task snapshot (title, priority, description, scope, acceptance criteria)
- Standards citations (file, section, requirement, line spans, content SHA)
- Validation baseline (QA commands from `standards/qa-commands-ssot.md`)
- Repository paths (scope.in expanded via glob macros)

**Delta Tracking**: Working tree state is tracked across dirty git handoffs:
- Implementer → Reviewer → Validator handoffs without intermediate commits
- File checksums detect manual edits between agents
- Incremental diffs show what each agent changed
- Drift detection prevents validation on modified code

### CLI Commands

All context cache operations use `python scripts/tasks.py`:

**Initialization** (automatic via task-runner):
```bash
python scripts/tasks.py --init-context TASK-0824
```

**Reading context** (agents use this to load immutable SSOT):
```bash
python scripts/tasks.py --get-context TASK-0824 --format json
```

**Delta tracking** (agents call after edits):
```bash
# Implementer snapshots working tree state
python scripts/tasks.py --snapshot-worktree TASK-0824 --agent implementer

# Reviewer verifies no drift, then snapshots
python scripts/tasks.py --verify-worktree TASK-0824 --expected-agent implementer
python scripts/tasks.py --snapshot-worktree TASK-0824 --agent reviewer --previous-agent implementer

# Validator verifies before testing
python scripts/tasks.py --verify-worktree TASK-0824 --expected-agent reviewer
```

**QA results** (record validation baseline):
```bash
python scripts/tasks.py --record-qa TASK-0824 --agent implementer --from .agent-output/TASK-0824-qa.log
```

**Cleanup** (automatic on task completion):
```bash
python scripts/tasks.py --purge-context TASK-0824
```

### Workflow Integration

1. **Task Start**: Context initialized automatically when task transitions to `in_progress`
2. **Agent Execution**: Each agent loads context via `--get-context` (replaces reading standards files)
3. **Agent Handoff**:
   - Outgoing agent calls `--snapshot-worktree` after all edits complete
   - Incoming agent calls `--verify-worktree` before starting (detects drift)
4. **Task Completion**: Context auto-purged via lifecycle hooks

### Benefits

- **Token efficiency**: Standards citations loaded once, referenced by agents
- **Drift detection**: File checksums catch manual edits between agent handoffs
- **Audit trail**: All coordination state (QA logs, diffs, timestamps) persisted
- **Deterministic**: Cross-platform diff normalization ensures identical hashes
- **No commits required**: Delta tracking works on dirty working tree throughout agent workflow

See `docs/proposals/task-context-cache.md` for full specification, troubleshooting procedures, and recovery workflows.

### Task Context Cache Hardening (v1.0)

**Status**: Active as of 2025-11-19
**Proposal**: `docs/proposals/task-context-cache-hardening.md`
**Migration Guide**: `docs/guides/task-cache-hardening-migration.md`

The hardening implementation adds evidence bundling, exception ledger, quarantine, QA log parsing, and structured validation commands to the context cache system.

#### Key Improvements

1. **Evidence Bundling**: Attach QA logs, summaries, standards excerpts as typed artifacts
2. **Exception Ledger**: Suppress repeated warnings for known broken tasks
3. **Quarantine**: Isolate critically malformed tasks from normal workflow
4. **QA Log Parsing**: Automatic extraction of lint errors, test counts, coverage percentages
5. **Standards Excerpts**: Cache specific standards sections with SHA256 validation
6. **Task Snapshot**: Embed acceptance criteria, plan, scope in immutable context
7. **Clean JSON Output**: Warnings to stderr, JSON to stdout (no interleaving)
8. **Metrics Dashboard**: Track file reads, warnings, QA coverage, prompt size, JSON reliability

#### New CLI Commands

**Evidence Bundling**:
```bash
# Attach evidence (logs, summaries, screenshots)
python scripts/tasks.py --attach-evidence TASK-0123 \
  --type qa_output \
  --path .agent-output/TASK-0123/qa-static.log \
  --description "Static analysis output" \
  --metadata '{"command": "pnpm turbo run qa:static", "exit_code": 0}'

# List attached evidence
python scripts/tasks.py --list-evidence TASK-0123 --format json

# Record QA results (with automatic log parsing)
python scripts/tasks.py --record-qa TASK-0123 \
  --command "pnpm turbo run test --filter=@photoeditor/backend" \
  --log-path .agent-output/TASK-0123/test-output.log \
  --command-type test
```

**Standards Excerpts**:
```bash
# Cache standards excerpt with SHA256 validation
python scripts/tasks.py --attach-standard standards/backend-tier.md \
  --section "Handler Constraints" \
  --task-id TASK-0123

# Verify excerpt freshness (detects stale excerpts)
python scripts/tasks.py --verify-excerpts TASK-0123
```

**Exception Ledger**:
```bash
# Add exception (idempotent - won't duplicate)
python scripts/tasks.py --add-exception TASK-0123 \
  --type empty_acceptance_criteria \
  --error "Empty acceptance_criteria array (schema 1.1 violation)"

# List exceptions with status filter
python scripts/tasks.py --list-exceptions --status open --format json

# Resolve exception after fixing
python scripts/tasks.py --resolve-exception TASK-0123 \
  --notes "Fixed acceptance_criteria in commit abc123"

# Cleanup completed tasks (auto-removes exceptions)
python scripts/tasks.py --cleanup-exceptions --trigger task_completion
```

**Quarantine**:
```bash
# Quarantine critically broken task
python scripts/tasks.py --quarantine-task TASK-0123 \
  --reason malformed_yaml \
  --error "Invalid YAML: unexpected character at line 42"

# List quarantined tasks
python scripts/tasks.py --list-quarantined --format json

# Release from quarantine after repair
python scripts/tasks.py --release-quarantine TASK-0123 \
  --notes "Fixed YAML syntax in commit abc123"
```

**Validation Commands**:
```bash
# Run structured validation command (pre-flight checks, env export, retry)
python scripts/tasks.py --run-validation TASK-0123 --command-id val-001

# Run all validation commands
python scripts/tasks.py --run-validation TASK-0123 --all
```

**Metrics**:
```bash
# Collect task metrics (file reads, warnings, QA coverage, prompt size)
python scripts/tasks.py --collect-metrics TASK-0123

# Generate rollup dashboard across multiple tasks
python scripts/tasks.py --generate-dashboard \
  --from 2025-11-01 \
  --to 2025-11-19 \
  --output docs/evidence/metrics/cache-hardening-dashboard.json

# Compare baseline to current metrics
python scripts/tasks.py --compare-metrics \
  --baseline docs/evidence/metrics/pilot-baseline-backend.json \
  --current docs/evidence/metrics/pilot-hardening-backend.json
```

#### Enhanced --init-context Workflow

Context initialization now includes full validation:

```bash
python scripts/tasks.py --init-context TASK-0123
# Validates:
# - Acceptance criteria non-empty (E001 if empty)
# - Task not quarantined (E030 if quarantined)
# - Working tree clean or expected dirty (E050 if unexpected changes)
# Creates:
# - Task snapshot with embedded AC/plan/scope
# - Standards excerpts cache (if referenced)
# - Checklist snapshots
# - Evidence directory structure
```

**Exit codes**:
- `0`: Success
- `10-19`: Validation errors (E001: empty fields, E010: schema invalid)
- `20-29`: Drift errors (E020: file modified)
- `30-39`: Blocker errors (E030: quarantined, E031: blocked by task)
- `40-49`: I/O errors (E040: file not found)
- `50-59`: Context errors (E050: context exists, E051: not found)
- `60-69`: Git errors (E060: dirty tree)

#### Agent Workflow Updates

**Implementer**:
```bash
# 1. Load context (embedded AC, plan, scope, standards excerpts)
python scripts/tasks.py --get-context TASK-0123 --format json

# 2. Implement changes...

# 3. Run QA commands
pnpm turbo run lint:fix --filter=@photoeditor/backend
pnpm turbo run qa:static --filter=@photoeditor/backend
pnpm turbo run test --filter=@photoeditor/backend

# 4. Record QA results (with log parsing)
python scripts/tasks.py --record-qa TASK-0123 \
  --command "pnpm turbo run qa:static --filter=@photoeditor/backend" \
  --log-path .agent-output/TASK-0123/qa-static.log \
  --command-type lint

# 5. Attach implementation summary
python scripts/tasks.py --attach-evidence TASK-0123 \
  --type summary \
  --path .agent-output/TASK-0123/implementer-summary.md \
  --description "Implementation summary"
```

**Reviewer**:
```bash
# 1. Load context and evidence
python scripts/tasks.py --get-context TASK-0123 --format json
python scripts/tasks.py --list-evidence TASK-0123

# 2. Review implementation, run QA
# 3. Attach reviewer summary
```

**Validator**:
```bash
# 1. Load QA baseline from context
python scripts/tasks.py --get-context TASK-0123 --format json

# 2. Run validation commands with structured execution
python scripts/tasks.py --run-validation TASK-0123 --all

# 3. Compare to baseline (drift detection automatic)
```

#### Migration to Schema 1.1

**Required Updates**:
- `acceptance_criteria` MUST be non-empty
- `validation.pipeline` MUST be non-empty
- Plan step `outputs` cannot be empty arrays
- Standards references must cite verifiable anchor headings

**Migration Steps**:
1. Run `python scripts/tasks.py --lint tasks/<area>/TASK-XXXX.task.yaml`
2. Fix E001 errors (empty required fields) or add to exception ledger
3. Add `validation.pipeline` if missing (see `docs/templates/validation-section-examples.md`)
4. Test `--init-context` (should succeed without E001)

**See**: `docs/guides/task-cache-hardening-migration.md` for complete migration guide

#### Troubleshooting

**Error E001 - Required field empty**:
```
ValidationError: Required field 'acceptance_criteria' is empty
Fix: Populate acceptance_criteria or add to exception ledger temporarily
```

**Error E030 - Task quarantined**:
```
BlockerError: Task TASK-0123 is quarantined (reason: malformed_yaml)
Fix: Repair task file and release from quarantine
```

**Warning - Stale standards excerpt**:
```
Warning: Standards excerpt is stale (file modified)
Fix: python scripts/tasks.py --invalidate-excerpts TASK-0123
```

**JSON parse failures** (pre-hardening):
```
Fixed: Hardening v1.0 routes warnings to stderr, JSON to stdout (no interleaving)
```

**See**: `docs/troubleshooting.md` for complete error code reference and recovery procedures

## Task CLI Guardrails

The tasks CLI enforces code quality standards through static analysis guardrails defined in `scripts/tasks_cli/checks/module_limits.py`.

### Module LOC Limits

**Policy**: No CLI module may exceed 500 LOC to maintain single responsibility and reviewability.

**Enforcement**:
```bash
python scripts/tasks_cli/checks/module_limits.py          # Warn-only mode
python scripts/tasks_cli/checks/module_limits.py --hard-fail  # Fail on violations
```

**Exemptions**:
- `*/models.py` files: Pure dataclasses/schemas with no business logic (exempted due to declarative nature)
- Test files: Automatically excluded from LOC checks

**Rationale**: The modularization effort (see `docs/proposals/task-cli-modularization.md`) decomposed the original 3,671 LOC monolith into focused modules. LOC limits prevent regression to mega-files and enforce separation of concerns.

**When violations occur**:
1. Review the module for logical split points (see mitigation plan `docs/proposals/task-cli-modularization-mitigation-plan.md`)
2. Decompose into focused submodules (e.g., `commands/context.py` → `commands/context/*.py`)
3. If module is cohesive and cannot be split without harming design, request exemption with documented justification

## Keep the Template Authoritative
- Use a single canonical template: `docs/templates/TASK-0000-template.task.yaml`.
- If you find a gap, improve the canonical template and reference that change in your task/PR/ADR. Do not diverge per‑task.

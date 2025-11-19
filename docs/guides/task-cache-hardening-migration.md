# Task Context Cache Hardening: Migration Guide

**Version**: 1.0
**Last Updated**: 2025-11-19
**Target Audience**: Developers migrating existing tasks to hardened cache system

---

## Overview

This guide explains how to migrate existing tasks to use the hardened task context cache system (Schema 1.1), which provides embedded acceptance criteria, standards excerpts, QA artifact bundling, exception ledger, and clean JSON output.

**Benefits of Migration**:
- 80%+ reduction in file reads per agent
- 100% elimination of repeated warnings
- 100% QA artifact coverage
- 15-19% prompt size reduction
- Zero JSON parse failures

**Effort**: Low to moderate (5-15 minutes per task)

---

## Breaking Changes

### 1. Context Schema Updated to 1.1

**What Changed**:
- `acceptance_criteria` MUST be non-empty (previously allowed empty arrays)
- `validation.pipeline` MUST be non-empty (previously optional)
- Plan step `outputs` cannot be empty arrays
- Standards references must cite verifiable anchor headings

**Impact**: Tasks with empty required fields will fail `--init-context` with error code E001

### 2. New Required Fields in Task Files

**Schema 1.1 Requirements**:
- `acceptance_criteria`: Non-empty array (minimum 1 criterion)
- `scope.in`: Non-empty array (minimum 1 item)
- `plan`: Each step must have non-empty `outputs` array
- `deliverables`: Non-empty array
- `validation.pipeline`: Non-empty array with at least one command

**Validation**: Run `python scripts/tasks.py --lint <task-file>` to check compliance

### 3. New CLI Commands for Evidence Bundling

**New Commands**:
- `--attach-evidence`: Attach files/logs/summaries to task context
- `--record-qa`: Record QA command outputs with log parsing
- `--attach-standard`: Cache standards excerpts
- `--add-exception`: Add malformed task to exception ledger
- `--list-exceptions`: View exception ledger entries
- `--quarantine-task`: Isolate critically broken tasks

**See**: Command reference section below

---

## Migration Steps

### Step 1: Assess Current Task Status

Run the exception ledger check to see which tasks need attention:

```bash
# List all exceptions (malformed tasks, missing fields)
python scripts/tasks.py --list-exceptions --format json

# Check specific task compliance
python scripts/tasks.py --lint tasks/backend/TASK-0123-example.task.yaml
```

**Possible Results**:
- ✅ **Valid**: Task complies with schema 1.1, no action needed
- ⚠️ **Warnings**: Optional fields missing (scope.out, risks), task works but improve clarity
- ❌ **Errors**: Required fields empty, task will fail `--init-context`

### Step 2: Fix or Quarantine Broken Tasks

#### Option A: Fix Task File

**For tasks with empty acceptance_criteria**:

```yaml
# Before (schema 1.0)
acceptance_criteria: []

# After (schema 1.1)
acceptance_criteria:
  - "All modified files pass lint:fix with zero errors"
  - "TypeScript compilation succeeds with strict config"
  - "Unit test coverage ≥70% lines, ≥60% branches per standards/testing-standards.md"
```

**For tasks missing validation.pipeline**:

```yaml
# Before (schema 1.0)
validation:
  manual_checks:
    - "Review diff manually"

# After (schema 1.1)
validation:
  pipeline:
    - command: "pnpm turbo run lint:fix --filter=@photoeditor/backend"
      description: "Auto-fix linting issues"
    - command: "pnpm turbo run qa:static --filter=@photoeditor/backend"
      description: "Run static analysis (typecheck + lint)"
    - command: "pnpm turbo run test --filter=@photoeditor/backend"
      description: "Run unit tests"
  manual_checks:
    - "Review diff manually"
```

**See**: `docs/templates/validation-section-examples.md` for package-specific templates

#### Option B: Quarantine Task (Temporary)

If fixing immediately is not feasible:

```bash
# Quarantine task to prevent blocking other work
python scripts/tasks.py --quarantine-task TASK-0123 \
  --reason empty_acceptance_criteria \
  --error "acceptance_criteria array is empty (schema 1.1 violation)"

# Add to exception ledger (suppresses warnings)
python scripts/tasks.py --add-exception TASK-0123 \
  --type empty_acceptance_criteria \
  --error "Empty acceptance_criteria - fix before GA rollout"
```

**Quarantined tasks**:
- Will not appear in `--list` or `--pick` output
- Stored in `docs/compliance/quarantine/TASK-XXXX.quarantine.json`
- Can be released after repair: `python scripts/tasks.py --release-quarantine TASK-XXXX`

### Step 3: Update Task Files to Schema 1.1

**Required Updates**:

1. **Populate acceptance_criteria** (if empty):
   - Reference standards thresholds from `standards/testing-standards.md`
   - Include lint, typecheck, test, coverage criteria
   - Cite specific standards sections (e.g., `standards/backend-tier.md#handler-constraints`)

2. **Add validation.pipeline** (if missing):
   - Copy from `docs/templates/validation-section-examples.md`
   - Customize for package (backend, mobile, shared)
   - Include: lint:fix, qa:static, test (minimum)
   - Optional: test:contract, coverage, fitness functions

3. **Fix plan step outputs** (if empty):
   - List specific deliverable files
   - Or use inline comments to guide completion

4. **Verify standards citations**:
   - Use real anchor headings (e.g., `#analyzability`, not `#fake-heading`)
   - Run `python scripts/tasks.py --lint` to validate

**Example Migration**:

```yaml
# Before (schema 1.0)
id: TASK-0123
status: todo
acceptance_criteria: []
validation:
  manual_checks:
    - "Check code works"

# After (schema 1.1)
id: TASK-0123
status: todo
acceptance_criteria:
  - "Handler complexity ≤10 per standards/backend-tier.md#handler-constraints"
  - "All services have unit test coverage ≥80% lines per standards/testing-standards.md"
  - "Zero circular dependencies per tooling/dependency-rules.json"
validation:
  pipeline:
    - command: "pnpm turbo run lint:fix --filter=@photoeditor/backend"
      description: "Auto-fix linting issues"
    - command: "pnpm turbo run qa:static --filter=@photoeditor/backend"
      description: "Run static analysis"
    - command: "pnpm turbo run test --filter=@photoeditor/backend"
      description: "Run unit tests with coverage"
  manual_checks:
    - "Review handler layering (no direct AWS SDK imports)"
```

### Step 4: Exception Ledger Maintenance

The exception ledger tracks known broken tasks and suppresses repeated warnings:

```bash
# Add exception (idempotent - won't duplicate)
python scripts/tasks.py --add-exception TASK-0123 \
  --type malformed_yaml \
  --error "Invalid YAML: unexpected character at line 42"

# List exceptions with status filter
python scripts/tasks.py --list-exceptions --status open --format json

# Resolve exception after fixing
python scripts/tasks.py --resolve-exception TASK-0123 \
  --notes "Fixed YAML indentation in commit abc123"

# Clean up completed tasks (auto-removes exceptions)
python scripts/tasks.py --cleanup-exceptions --trigger task_completion
```

**Exception Types**:
- `malformed_yaml`: YAML parse errors
- `missing_standards`: No standards_tier or related_docs
- `empty_acceptance_criteria`: Empty acceptance_criteria array
- `invalid_schema`: Schema version mismatch or other validation failures

### Step 5: Validate Migration

After updating task files, verify schema compliance:

```bash
# Lint single task
python scripts/tasks.py --lint tasks/backend/TASK-0123-example.task.yaml

# Lint all tasks in area
find tasks/backend -name "*.task.yaml" -exec python scripts/tasks.py --lint {} \;

# Initialize context to trigger full validation
python scripts/tasks.py --init-context TASK-0123
# Expected: SUCCESS (no E001 errors)
# If errors: Fix task file or add to exception ledger
```

**Success Indicators**:
- ✅ `--lint` exits with code 0 (no errors)
- ✅ `--init-context` creates context without E001 errors
- ✅ `--list-exceptions` shows task is not in ledger (or status: resolved)

---

## Backward Compatibility

### Schema 1.0 Contexts Still Load

**Graceful Degradation**:
- Old contexts (schema 1.0) will load without errors
- Missing fields default to empty arrays or null
- Agents will see warnings but can proceed

**What You Miss** (if not migrated):
- Embedded acceptance criteria (agents must re-read task file)
- Standards excerpts caching (agents re-read standards files)
- QA artifact bundling (validators re-run commands)
- Warning suppression (repeated warnings logged)
- Prompt size savings (no token reduction)

**Recommendation**: Gradual migration - prioritize active tasks, defer completed tasks

### No Forced Cutover

**You can**:
- Mix schema 1.0 and 1.1 tasks in the same repository
- Migrate incrementally (task by task)
- Keep completed tasks in schema 1.0 (archival)

**You should**:
- Migrate all `status: todo` and `status: in_progress` tasks
- Add exception ledger entries for known broken tasks
- Fix or quarantine tasks with empty acceptance_criteria

---

## Command Reference

### Evidence Bundling

```bash
# Attach evidence during task work
python scripts/tasks.py --attach-evidence TASK-0123 \
  --type qa_output \
  --path .agent-output/TASK-0123/qa-static.log \
  --description "Static analysis output from implementer" \
  --metadata '{"command": "pnpm turbo run qa:static", "exit_code": 0, "duration_ms": 4523}'

# List attached evidence
python scripts/tasks.py --list-evidence TASK-0123 --format json

# Record QA command results (with log parsing)
python scripts/tasks.py --record-qa TASK-0123 \
  --command "pnpm turbo run test --filter=@photoeditor/backend" \
  --log-path .agent-output/TASK-0123/test-output.log \
  --command-type test
```

### Standards Excerpts

```bash
# Cache standards excerpt
python scripts/tasks.py --attach-standard standards/backend-tier.md \
  --section "Handler Constraints" \
  --task-id TASK-0123

# Verify excerpt freshness (detects stale excerpts)
python scripts/tasks.py --verify-excerpts TASK-0123

# Invalidate stale excerpts (re-extracts updated content)
python scripts/tasks.py --invalidate-excerpts TASK-0123
```

### Exception Ledger

```bash
# Add exception
python scripts/tasks.py --add-exception TASK-0123 \
  --type empty_acceptance_criteria \
  --error "Empty acceptance_criteria array (schema 1.1 violation)"

# List exceptions
python scripts/tasks.py --list-exceptions --format json
python scripts/tasks.py --list-exceptions --status open

# Resolve exception
python scripts/tasks.py --resolve-exception TASK-0123 \
  --notes "Fixed acceptance_criteria in commit abc123"

# Cleanup completed tasks
python scripts/tasks.py --cleanup-exceptions --trigger task_completion
```

### Quarantine

```bash
# Quarantine task
python scripts/tasks.py --quarantine-task TASK-0123 \
  --reason malformed_yaml \
  --error "Invalid YAML: unexpected character at line 42"

# List quarantined tasks
python scripts/tasks.py --list-quarantined --format json

# Release from quarantine
python scripts/tasks.py --release-quarantine TASK-0123 \
  --notes "Fixed YAML syntax in commit abc123"
```

### Context Lifecycle

```bash
# Initialize context (with validation)
python scripts/tasks.py --init-context TASK-0123
# Fails with E001 if acceptance_criteria empty
# Fails with E030 if task quarantined
# Fails with E050 if unexpected dirty tree changes

# Get context (cached, fast)
python scripts/tasks.py --get-context TASK-0123 --format json

# Verify working tree drift
python scripts/tasks.py --verify-worktree TASK-0123 --expected-agent reviewer
# Exits with code 20 if drift detected

# Purge context (clean slate)
python scripts/tasks.py --purge-context TASK-0123
```

### Validation

```bash
# Run validation command with pre-flight checks
python scripts/tasks.py --run-validation TASK-0123 --command-id val-001
# Checks blocker status, expected paths, exports env, switches cwd

# Run all validation commands
python scripts/tasks.py --run-validation TASK-0123 --all
```

### Metrics

```bash
# Collect task metrics
python scripts/tasks.py --collect-metrics TASK-0123

# Generate rollup dashboard
python scripts/tasks.py --generate-dashboard \
  --from 2025-11-01 \
  --to 2025-11-19 \
  --output docs/evidence/metrics/cache-hardening-dashboard.json

# Compare baseline to current
python scripts/tasks.py --compare-metrics \
  --baseline docs/evidence/metrics/pilot-baseline-backend.json \
  --current docs/evidence/metrics/pilot-hardening-backend.json
```

---

## Agent Workflow Updates

### Task-Runner

**Before** (schema 1.0):
```bash
python scripts/tasks.py --init-context TASK-0123
# No validation, missing acceptance criteria silently ignored
```

**After** (schema 1.1):
```bash
python scripts/tasks.py --init-context TASK-0123
# Validates acceptance_criteria non-empty
# Fails with E001 if required fields missing
# Creates task snapshot with embedded AC/plan/scope
# Caches standards excerpts
# Snapshots checklists
```

### Implementer

**Before** (schema 1.0):
```bash
# Read task file manually
# Read standards files manually
# Read checklists manually
# Run QA commands manually
# Upload logs separately
```

**After** (schema 1.1):
```bash
# Load embedded context (no file reads)
python scripts/tasks.py --get-context TASK-0123 --format json
# Run QA commands
pnpm turbo run qa:static --filter=@photoeditor/backend
# Record QA results (with log parsing)
python scripts/tasks.py --record-qa TASK-0123 \
  --command "pnpm turbo run qa:static --filter=@photoeditor/backend" \
  --log-path .agent-output/TASK-0123/qa-static.log
```

### Reviewer

**Before** (schema 1.0):
```bash
# Read task file manually
# Read implementer summary manually
# Re-read QA logs manually
```

**After** (schema 1.1):
```bash
# Load evidence from context (no file reads)
python scripts/tasks.py --get-context TASK-0123 --format json
python scripts/tasks.py --list-evidence TASK-0123
# QA baseline already in context
# Implementer summary attached as evidence
```

### Validator

**Before** (schema 1.0):
```bash
# Read task file manually
# Re-run all QA commands manually
# Parse logs manually
```

**After** (schema 1.1):
```bash
# Load QA baseline from context
python scripts/tasks.py --get-context TASK-0123 --format json
# Re-run QA commands with structured execution
python scripts/tasks.py --run-validation TASK-0123 --all
# Compare to baseline (drift detection automatic)
```

---

## Troubleshooting

### Error: E001 - Required field empty

**Symptom**:
```
ValidationError: Cannot initialize context for TASK-0123 due to validation errors:
  - acceptance_criteria: Required field 'Acceptance criteria' is empty
```

**Cause**: Schema 1.1 requires non-empty `acceptance_criteria`, `scope.in`, `plan`, `deliverables`, `validation.pipeline`

**Fix**:
1. Edit task file to populate required fields
2. Run `python scripts/tasks.py --lint tasks/.../TASK-0123.task.yaml`
3. Retry `--init-context`

**Temporary Workaround**:
Add to exception ledger (allows agents to proceed with warnings):
```bash
python scripts/tasks.py --add-exception TASK-0123 \
  --type empty_acceptance_criteria \
  --error "Empty acceptance_criteria - will fix before GA rollout"
```

### Error: E030 - Task quarantined

**Symptom**:
```
BlockerError: Task TASK-0123 is quarantined (reason: malformed_yaml)
```

**Cause**: Task is in quarantine due to fatal parse/validation errors

**Fix**:
1. Check quarantine entry: `python scripts/tasks.py --list-quarantined`
2. Fix underlying issue (YAML syntax, schema validation)
3. Release from quarantine:
   ```bash
   python scripts/tasks.py --release-quarantine TASK-0123 \
     --notes "Fixed YAML indentation"
   ```

### Warning: Stale standards excerpt

**Symptom**:
```
Warning: Standards excerpt 'backend-tier-handler-constraints' is stale (file modified)
```

**Cause**: Standards file changed after excerpt was cached

**Fix**:
Invalidate and re-extract:
```bash
python scripts/tasks.py --invalidate-excerpts TASK-0123
python scripts/tasks.py --attach-standard standards/backend-tier.md \
  --section "Handler Constraints" \
  --task-id TASK-0123
```

### JSON parse failures

**Symptom**:
```bash
$ python scripts/tasks.py --list --format json | jq
parse error: Invalid numeric literal at line 1, column 10
```

**Cause** (pre-hardening): YAML warnings interleaved with JSON output

**Fix**: Upgrade to hardening version (Session S11 output channel split)
- Warnings go to stderr (JSON mode)
- JSON goes to stdout only
- No interleaving possible

**Verification**:
```bash
# Test JSON output
python scripts/tasks.py --list --format json | jq .
# Should parse cleanly (no warnings in JSON stream)
```

---

## Migration Checklist

### Per-Task Migration

- [ ] Run `python scripts/tasks.py --lint <task-file>`
- [ ] Fix or add exception for E001 errors (empty required fields)
- [ ] Add `validation.pipeline` if missing
- [ ] Populate `acceptance_criteria` if empty
- [ ] Fix plan step `outputs` if empty
- [ ] Verify standards citations (real anchor headings)
- [ ] Test `--init-context` (should succeed without E001)

### Repository-Wide Migration

- [ ] List all exceptions: `python scripts/tasks.py --list-exceptions`
- [ ] Review quarantined tasks: `python scripts/tasks.py --list-quarantined`
- [ ] Fix or defer broken tasks (prioritize active tasks)
- [ ] Update agent prompts (implementer, reviewer, validator)
- [ ] Update task templates in `docs/templates/`
- [ ] Update `tasks/README.md` with schema 1.1 requirements
- [ ] Document known issues in exception ledger

### Post-Migration Validation

- [ ] Zero E001 errors on active tasks
- [ ] Exception ledger entries have resolution plans
- [ ] Quarantined tasks documented in `docs/compliance/`
- [ ] Agent workflows tested with new CLI commands
- [ ] Metrics dashboard generated and reviewed

---

## Support & Documentation

- **Proposal**: `docs/proposals/task-context-cache-hardening.md`
- **Schemas**: `docs/proposals/task-context-cache-hardening-schemas.md`
- **Pilot Report**: `docs/evidence/pilot-report.md`
- **Troubleshooting**: `docs/troubleshooting.md` (error code reference)
- **Testing Standards**: `standards/testing-standards.md`
- **QA Commands**: `standards/qa-commands-ssot.md`

**Questions?** Review documentation above or inspect implementation in `scripts/tasks_cli/`

---

**Migration Guide Version**: 1.0
**Last Updated**: 2025-11-19
**Status**: Ready for use

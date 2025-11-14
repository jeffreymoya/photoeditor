# Task Context Cache: Troubleshooting Guide

This guide covers common errors, recovery procedures, and debugging workflows for the task context cache system.

## Quick Reference

| Error | Likely Cause | Quick Fix |
|-------|-------------|-----------|
| `ContextExistsError` | Context already initialized | Use `--get-context` or `--purge-context` then re-init |
| `ContextNotFoundError` | Context not initialized | Run `--init-context TASK-XXXX` |
| `DriftError: Working tree drift detected` | Manual edits between agent handoffs | Re-snapshot or resolve drift via `--resolve-drift` |
| `DriftError: Base commit changed` | Premature commit or rebase | Re-init context with new base commit |
| `DriftError: Working tree is clean` | Premature commit or stash | Restore working tree state |
| `ValidationError: Potential secret detected` | Secret in context data | Remove secret or use `--force-secrets` |
| `Cannot calculate incremental diff` | Overlapping edits | Use cumulative diff (`--type from_base`) |

## Common Errors

### 1. Drift Detection Failures

#### Error: "Working tree drift detected"

**Symptom**: Validator fails with file checksum mismatch

**Cause**: Files were manually edited after implementer/reviewer snapshot

**Diagnosis**:
```bash
# Check which files drifted
python scripts/tasks.py --verify-worktree TASK-0824 --expected-agent reviewer
```

The error message lists exact files with mismatched checksums:
```
ERROR: Working tree drift detected after reviewer finished:
  mobile/src/store/settingsSlice.ts:
    Expected SHA: abc123def456
    Current SHA:  def456abc123
```

**Recovery Options**:

**Option A: Accept drift and re-snapshot** (if manual edits were intentional):
```bash
# Document the drift resolution
python scripts/tasks.py --resolve-drift TASK-0824 --agent reviewer --note "Manual fix applied for typo in comments"

# Re-snapshot current state
python scripts/tasks.py --snapshot-worktree TASK-0824 --agent reviewer
```

**Option B: Revert manual edits** (if edits were accidental):
```bash
# Check implementer's diff to see original state
python scripts/tasks.py --get-diff TASK-0824 --agent implementer --type from_base

# Manually revert the drifted files to match expected state
# Then verify drift is resolved
python scripts/tasks.py --verify-worktree TASK-0824 --expected-agent reviewer
```

**Option C: Restart from clean state**:
```bash
# Stash all changes
git stash

# Re-apply implementer's changes
python scripts/tasks.py --get-diff TASK-0824 --agent implementer --type from_base > /tmp/implementer.diff
git apply /tmp/implementer.diff

# Re-apply reviewer's changes
python scripts/tasks.py --get-diff TASK-0824 --agent reviewer --type from_base > /tmp/reviewer.diff
git apply /tmp/reviewer.diff

# Verify state matches
python scripts/tasks.py --verify-worktree TASK-0824 --expected-agent reviewer
```

#### Error: "Base commit changed"

**Symptom**: Validator fails with "Base commit changed from abc123 to def456"

**Cause**: Someone committed changes (or rebased) during task execution

**Diagnosis**:
```bash
# Check current HEAD
git rev-parse HEAD

# Check context's base commit
python scripts/tasks.py --get-context TASK-0824 --format json | jq -r '.git_head'

# Check if they differ
```

**Recovery**:
```bash
# If commit was intentional (e.g., parallel work merged to main):
# 1. Purge old context
python scripts/tasks.py --purge-context TASK-0824

# 2. Save current working tree changes
git stash

# 3. Re-initialize context with new base commit
NEW_BASE=$(git rev-parse HEAD)
python scripts/tasks.py --init-context TASK-0824 --base-commit $NEW_BASE

# 4. Restore working tree
git stash pop

# 5. Re-snapshot from implementer
python scripts/tasks.py --snapshot-worktree TASK-0824 --agent implementer
```

**Prevention**: Don't commit, rebase, or merge during active task execution. Context tracking assumes base commit stays stable throughout the agent workflow.

#### Error: "Working tree is clean"

**Symptom**: `verify_worktree_state` fails with "Working tree is clean (expected dirty)"

**Cause**: Someone committed the working tree changes or ran `git stash`

**Diagnosis**:
```bash
# Check if working tree is clean
git status

# Check if there are stashed changes
git stash list
```

**Recovery**:
```bash
# If changes were stashed:
git stash pop

# If changes were committed prematurely:
# 1. Soft reset to undo commit (keeps changes in working tree)
git reset --soft HEAD~1

# 2. Verify working tree is now dirty
git status

# 3. Verify drift resolved
python scripts/tasks.py --verify-worktree TASK-0824 --expected-agent reviewer
```

### 2. Incremental Diff Issues

#### Error: "Cannot calculate incremental diff: overlapping edits"

**Symptom**: Reviewer snapshot shows incremental diff error

**Cause**: Reviewer and implementer edited the same lines in same file

**Impact**: Non-fatal. Cumulative diff still available.

**Workaround**:
```bash
# Use cumulative diff instead of incremental
python scripts/tasks.py --get-diff TASK-0824 --agent reviewer --type from_base
```

**Explanation**: This is a known limitation per proposal Section 3.4. When both implementer and reviewer edit the same lines, the reverse-apply algorithm cannot cleanly separate the changes. The cumulative diff (all changes from base commit) always works.

#### Error: "No incremental changes detected"

**Symptom**: Reviewer snapshot shows "No incremental changes detected"

**Cause**: Reviewer made no additional changes on top of implementer

**Recovery**: This is informational, not an error. Reviewer approved implementer's work without edits. Proceed with validation.

### 3. Initialization Errors

#### Error: "ContextExistsError: Context already initialized"

**Symptom**: `--init-context` fails because context already exists

**Cause**: Task was already initialized (possibly from previous attempt)

**Recovery**:
```bash
# Option A: Use existing context
python scripts/tasks.py --get-context TASK-0824 --format json

# Option B: Re-initialize (purge first)
python scripts/tasks.py --purge-context TASK-0824
python scripts/tasks.py --init-context TASK-0824
```

#### Error: "ValidationError: description cannot be empty"

**Symptom**: `--init-context` fails schema validation

**Cause**: Task YAML has empty required fields

**Recovery**:
```bash
# Fix the task file (add description, citations, etc.)
vim tasks/backend/TASK-0824-fix-handler.task.yaml

# Re-run initialization
python scripts/tasks.py --init-context TASK-0824
```

### 4. Secret Scanning

#### Error: "ValidationError: Potential secret detected"

**Symptom**: Context initialization or update fails with secret pattern match

**Cause**: Task description or coordination data contains API keys, tokens, etc.

**Patterns Detected**:
- AWS access keys: `AKIA[0-9A-Z]{16}`
- Stripe live keys: `sk_live_[a-zA-Z0-9]{24,}`
- JWTs: `eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.`
- Private keys: `-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----`
- GitHub tokens: `gh[pousr]_[A-Za-z0-9]{36,}`
- GitLab tokens: `glpat-[A-Za-z0-9_-]{20,}`

**Recovery**:
```bash
# Option A: Remove the secret from task file
vim tasks/backend/TASK-0824.task.yaml  # Remove leaked key

# Option B: Use --force-secrets flag (for test data only)
python scripts/tasks.py --init-context TASK-0824 --force-secrets
```

**Warning**: Never commit real secrets. Use `--force-secrets` only for test fixtures with fake credentials.

### 5. Staleness Warnings

#### Warning: "Context created at abc123, current HEAD is def456. Context may be stale."

**Symptom**: `--get-context` shows staleness warning

**Cause**: Git HEAD changed since context was created (>48 hours ago or different commit)

**Impact**: Non-blocking warning. Context still usable but may reference outdated standards.

**Recovery**:
```bash
# Option A: Proceed with stale context (if standards haven't changed)
# No action needed - warning is informational

# Option B: Rebuild context from manifest
python scripts/tasks.py --rebuild-context TASK-0824

# Option C: Re-initialize context
python scripts/tasks.py --purge-context TASK-0824
python scripts/tasks.py --init-context TASK-0824
```

## Advanced Recovery Procedures

### Manual Context Inspection

If context appears corrupted or you need to debug:

```bash
# View raw context JSON
cat .agent-output/TASK-0824/context.json | jq .

# View specific fields
python scripts/tasks.py --get-context TASK-0824 --format json | jq '.immutable.standards_citations[]'

# View manifest (source files used)
cat .agent-output/TASK-0824/context.manifest | jq .

# View implementer's worktree snapshot
python scripts/tasks.py --get-context TASK-0824 --format json | jq '.coordination.implementer.worktree_snapshot'
```

### Manual Diff Inspection

```bash
# View cumulative diff from base commit
cat .agent-output/TASK-0824/implementer-from-base.diff

# View incremental diff (reviewer's changes only)
cat .agent-output/TASK-0824/reviewer-incremental.diff

# Compare checksums
python scripts/tasks.py --get-context TASK-0824 --format json | jq '.coordination.implementer.worktree_snapshot.files_changed[]'
```

### Force Context Rebuild

When context is corrupted or needs regeneration:

```bash
# 1. Backup current working tree
git stash

# 2. Purge existing context
python scripts/tasks.py --purge-context TASK-0824

# 3. Re-initialize with fresh data
python scripts/tasks.py --init-context TASK-0824

# 4. Restore working tree
git stash pop

# 5. Re-snapshot agents in order
python scripts/tasks.py --snapshot-worktree TASK-0824 --agent implementer
python scripts/tasks.py --snapshot-worktree TASK-0824 --agent reviewer --previous-agent implementer
```

## Debugging Workflows

### Check Context Health

```bash
# Verify context exists and is readable
python scripts/tasks.py --get-context TASK-0824 --format json

# Check for drift (should pass if no manual edits)
python scripts/tasks.py --verify-worktree TASK-0824 --expected-agent reviewer

# Verify diff files exist
ls -lh .agent-output/TASK-0824/*.diff
```

### Trace Agent Coordination

```bash
# View full coordination state
python scripts/tasks.py --get-context TASK-0824 --format json | jq '.coordination'

# Check each agent's status
python scripts/tasks.py --get-context TASK-0824 --format json | jq -r '.coordination.implementer.status'
python scripts/tasks.py --get-context TASK-0824 --format json | jq -r '.coordination.reviewer.status'

# View QA log paths
python scripts/tasks.py --get-context TASK-0824 --format json | jq -r '.coordination.implementer.qa_log_path'

# Check for blocking findings
python scripts/tasks.py --get-context TASK-0824 --format json | jq '.coordination.reviewer.blocking_findings[]'
```

### Verify Diff Determinism

Cross-platform verification (CRLF vs LF):

```bash
# On Windows: Check diff hash matches Linux/macOS
python scripts/tasks.py --get-context TASK-0824 --format json | jq -r '.coordination.implementer.worktree_snapshot.diff_sha'

# Manually verify normalization
cat .agent-output/TASK-0824/implementer-from-base.diff | python -c "import sys; content = sys.stdin.read(); print('CRLF found' if '\\r\\n' in content else 'LF only')"
```

## Prevention Best Practices

1. **Never edit files manually between agent handoffs** - All edits should go through agents
2. **Don't commit during active task** - Wait until validation passes
3. **Don't rebase/merge during task** - Keep base commit stable
4. **Don't stash working tree changes** - Context expects dirty tree throughout workflow
5. **Always call `--snapshot-worktree` after edits** - Required for delta tracking
6. **Always call `--verify-worktree` before validation** - Catches drift early
7. **Use `--resolve-drift` with clear notes** - Documents manual interventions

## When to Purge and Re-init

Purge context and re-initialize when:
- Base commit has changed (rebase/merge happened)
- Context is corrupted (malformed JSON, missing fields)
- Standards were updated mid-task (need fresh citations)
- Task scope changed significantly (repo_paths need refresh)
- Drift is too complex to resolve manually

**Warning**: Purging context loses all coordination state (QA logs, snapshots, agent status). Only use as last resort.

## Related Documentation

- Full specification: `docs/proposals/task-context-cache.md`
- CLI reference: `tasks/README.md` (Task Context Cache section)
- Standards governance: `standards/standards-governance-ssot.md`
- Agent integration: `.claude/agents/*.md` (task-implementer, implementation-reviewer, test-validation-*)

# Task Context Cache: Troubleshooting Guide

**Version**: 1.0
**Last Updated**: 2025-11-19
**Related**: `docs/proposals/task-context-cache-hardening.md`, `docs/proposals/task-context-cache-hardening-schemas.md`

---

## Error Code Reference

### Exit Code Ranges

| Range | Category | Description |
|-------|----------|-------------|
| 0 | Success | Operation completed successfully |
| 1-9 | Generic Errors | Unspecified failures |
| 10-19 | Validation Errors | Schema validation, missing fields |
| 20-29 | Drift Errors | Working tree drift, cache staleness |
| 30-39 | Blocker Errors | Task blocked, dependency not met |
| 40-49 | I/O Errors | File not found, permission denied |
| 50-59 | Context Errors | Context exists, not found, corrupted |
| 60-69 | Git Errors | Git operations failed |

### Detailed Error Codes

#### E001: VALIDATION_EMPTY_FIELD
**Message**: `Required field '{field}' is empty in {file}`
**Cause**: Schema 1.1 requires non-empty `acceptance_criteria`, `scope.in`, `plan`, `deliverables`, `validation.pipeline`
**Recovery**:
```bash
# Option 1: Fix task file
# Edit task YAML to populate required fields

# Option 2: Add to exception ledger (temporary)
python scripts/tasks.py --add-exception TASK-0123 \
  --type empty_acceptance_criteria \
  --error "Empty acceptance_criteria - fix before GA"
```

#### E010: SCHEMA_VALIDATION_FAILED
**Message**: `Schema validation failed: {details}`
**Cause**: Task file doesn't match schema 1.1 structure
**Recovery**:
```bash
# Validate task file
python scripts/tasks.py --lint tasks/backend/TASK-0123.task.yaml

# Fix validation errors in task YAML
# Or add to exception ledger if temporarily unfixable
```

#### E020: DRIFT_FILE_MODIFIED
**Message**: `File '{path}' modified outside agent workflow (expected SHA: {expected}, current: {actual})`
**Cause**: File changed between agent handoffs without snapshot update
**Recovery**:
```bash
# Option 1: Revert changes
git checkout {path}

# Option 2: Re-snapshot working tree
python scripts/tasks.py --snapshot-worktree TASK-0123 --agent {current-agent}
```

#### E030: BLOCKED_BY_TASK / Task Quarantined
**Message**: `Task blocked by {task_id}` or `Task TASK-XXXX is quarantined`
**Cause**: Task in quarantine due to fatal validation errors
**Recovery**:
```bash
# Check quarantine status
python scripts/tasks.py --list-quarantined

# Fix underlying issue (YAML, validation)
# Release from quarantine
python scripts/tasks.py --release-quarantine TASK-0123 \
  --notes "Fixed {issue} in commit {sha}"
```

#### E040: FILE_NOT_FOUND
**Message**: `File not found: {path}`
**Cause**: Referenced file doesn't exist
**Recovery**:
```bash
# Verify file exists
ls -la {path}

# Create missing file or update task reference
```

#### E050: CONTEXT_EXISTS
**Message**: `Context already initialized for {task_id}`
**Cause**: `--init-context` called on task with existing context
**Recovery**:
```bash
# Option 1: Purge and re-initialize
python scripts/tasks.py --purge-context TASK-0123
python scripts/tasks.py --init-context TASK-0123

# Option 2: Use existing context
python scripts/tasks.py --get-context TASK-0123
```

#### E051: CONTEXT_NOT_FOUND
**Message**: `No context found for {task_id}`
**Cause**: `--get-context` called before `--init-context`
**Recovery**:
```bash
# Initialize context first
python scripts/tasks.py --init-context TASK-0123
```

#### E060: GIT_DIRTY_TREE
**Message**: `Working tree has uncommitted changes`
**Cause**: Git working tree dirty when clean expected
**Recovery**:
```bash
# Option 1: Commit changes
git add {files}
git commit -m "message"

# Option 2: Allow dirty tree (if intentional)
python scripts/tasks.py --init-context TASK-0123 --allow-preexisting-dirty
```

---

## Common Issues

### Issue: JSON parse failures

**Symptoms**:
```bash
$ python scripts/tasks.py --list --format json | jq
parse error: Invalid numeric literal at line 1, column 10
```

**Cause** (pre-hardening): YAML warnings interleaved with JSON output

**Solution**: Upgrade to hardening v1.0
- Warnings route to stderr (JSON mode)
- JSON routes to stdout only
- No interleaving possible

**Verification**:
```bash
python scripts/tasks.py --list --format json | jq .
# Should parse cleanly
```

### Issue: Repeated warnings

**Symptoms**:
```
Warning: YAML parse error in TASK-0201
Warning: YAML parse error in TASK-0201
Warning: YAML parse error in TASK-0201
```

**Cause**: No exception ledger entry for broken task

**Solution**:
```bash
# Add to exception ledger (suppresses warnings)
python scripts/tasks.py --add-exception TASK-0201 \
  --type malformed_yaml \
  --error "Invalid YAML: {details}"

# Or quarantine if critically broken
python scripts/tasks.py --quarantine-task TASK-0201 \
  --reason malformed_yaml \
  --error "Invalid YAML: {details}"
```

### Issue: Stale standards excerpts

**Symptoms**:
```
Warning: Standards excerpt 'backend-tier-handler-constraints' is stale
```

**Cause**: Standards file modified after excerpt cached

**Solution**:
```bash
# Invalidate and re-extract
python scripts/tasks.py --invalidate-excerpts TASK-0123

# Re-attach standards excerpt
python scripts/tasks.py --attach-standard standards/backend-tier.md \
  --section "Handler Constraints" \
  --task-id TASK-0123
```

### Issue: Missing QA artifacts

**Symptoms**: Validator cannot find QA logs/results

**Cause**: Implementer didn't run `--record-qa` after QA commands

**Solution**:
```bash
# Record QA results after running commands
pnpm turbo run qa:static --filter=@photoeditor/backend > .agent-output/TASK-0123/qa-static.log

python scripts/tasks.py --record-qa TASK-0123 \
  --command "pnpm turbo run qa:static --filter=@photoeditor/backend" \
  --log-path .agent-output/TASK-0123/qa-static.log \
  --command-type lint
```

### Issue: EISDIR errors

**Symptoms**:
```
Error: EISDIR: illegal operation on a directory
```

**Cause**: Trying to read directory as file

**Solution** (hardening auto-fixes):
- Directories automatically compressed to `.tar.zst` archives
- Evidence attachments with type `directory` trigger compression
- Index JSON created with file listing

### Issue: Empty acceptance criteria blocking context init

**Symptoms**:
```
ValidationError: Required field 'Acceptance criteria' is empty
```

**Cause**: Schema 1.1 requires non-empty `acceptance_criteria`

**Solution**:
```bash
# Option 1: Fix task file
# Add acceptance criteria to task YAML

# Option 2: Temporary exception ledger entry
python scripts/tasks.py --add-exception TASK-0123 \
  --type empty_acceptance_criteria \
  --error "Empty AC - will fix before GA"

# Then task can proceed with warnings
```

---

## Recovery Procedures

### Procedure: Reset task context

```bash
# 1. Purge existing context
python scripts/tasks.py --purge-context TASK-0123

# 2. Clean up evidence directory
rm -rf .agent-output/TASK-0123

# 3. Re-initialize
python scripts/tasks.py --init-context TASK-0123
```

### Procedure: Fix quarantined task

```bash
# 1. Check quarantine entry
python scripts/tasks.py --list-quarantined

# 2. Review error details
cat docs/compliance/quarantine/TASK-0123.quarantine.json

# 3. Fix underlying issue (YAML, validation)
# Edit task file...

# 4. Validate fix
python scripts/tasks.py --lint tasks/.../TASK-0123.task.yaml

# 5. Release from quarantine
python scripts/tasks.py --release-quarantine TASK-0123 \
  --notes "Fixed YAML indentation in commit abc123"
```

### Procedure: Migrate task to schema 1.1

```bash
# 1. Lint task file
python scripts/tasks.py --lint tasks/.../TASK-0123.task.yaml

# 2. Fix validation errors
# - Populate acceptance_criteria if empty
# - Add validation.pipeline if missing
# - Fix plan step outputs if empty

# 3. Test context init
python scripts/tasks.py --init-context TASK-0123

# 4. Verify no E001 errors
echo $?  # Should be 0
```

### Procedure: Clean up exception ledger

```bash
# 1. List all exceptions
python scripts/tasks.py --list-exceptions --format json

# 2. Review status
# - open: Needs attention
# - in_progress: Being fixed
# - resolved: Fixed, ready for cleanup
# - wont_fix: Documented as unfixable

# 3. Cleanup completed tasks
python scripts/tasks.py --cleanup-exceptions --trigger task_completion

# 4. Resolve fixed exceptions
python scripts/tasks.py --resolve-exception TASK-0123 \
  --notes "Fixed in commit abc123"
```

---

## Diagnostic Commands

### Check task status
```bash
# List task with status
python scripts/tasks.py --list --format json | jq '.tasks[] | select(.id=="TASK-0123")'

# Check if quarantined
python scripts/tasks.py --list-quarantined | grep TASK-0123

# Check exception ledger
python scripts/tasks.py --list-exceptions | grep TASK-0123
```

### Verify context integrity
```bash
# Check context exists
ls -la .agent-output/TASK-0123/context.json

# Validate context JSON
python scripts/tasks.py --get-context TASK-0123 --format json | jq .

# Check evidence attachments
python scripts/tasks.py --list-evidence TASK-0123 --format json
```

### Verify standards excerpts freshness
```bash
# Check all excerpts for task
python scripts/tasks.py --verify-excerpts TASK-0123

# List cached excerpts
ls -la .agent-output/TASK-0123/evidence/standards/
cat .agent-output/TASK-0123/evidence/standards/index.json
```

### Check QA artifact coverage
```bash
# List evidence
python scripts/tasks.py --list-evidence TASK-0123 --format json | \
  jq '.evidence[] | select(.type=="qa_output")'

# Verify baseline exists
python scripts/tasks.py --get-context TASK-0123 --format json | \
  jq '.validation_baseline'
```

---

## Prevention Best Practices

1. **Always lint before transitioning to `todo`**:
   ```bash
   python scripts/tasks.py --lint tasks/.../TASK-XXXX.task.yaml
   ```

2. **Use exception ledger proactively**:
   - Add entries as soon as issues detected
   - Set remediation deadlines
   - Review and resolve regularly

3. **Record QA results immediately**:
   ```bash
   # After every QA command
   python scripts/tasks.py --record-qa TASK-0123 \
     --command "{command}" \
     --log-path {log-path}
   ```

4. **Verify context before agent handoff**:
   ```bash
   python scripts/tasks.py --verify-worktree TASK-0123 --expected-agent {agent}
   ```

5. **Use `--format json` for automation**:
   - JSON output clean (warnings to stderr)
   - Pipe to `jq` for parsing
   - Check exit codes for errors

6. **Monitor metrics dashboard**:
   ```bash
   python scripts/tasks.py --generate-dashboard \
     --from {date} \
     --to {date} \
     --output docs/evidence/metrics/dashboard.json
   ```

---

## Support Resources

- **Proposal**: `docs/proposals/task-context-cache-hardening.md`
- **Schemas**: `docs/proposals/task-context-cache-hardening-schemas.md`
- **Pilot Report**: `docs/evidence/pilot-report.md`
- **Migration Guide**: `docs/guides/task-cache-hardening-migration.md`
- **Tasks README**: `tasks/README.md` (CLI commands reference)
- **Testing Standards**: `standards/testing-standards.md`

---

**Troubleshooting Guide Version**: 1.0
**Last Updated**: 2025-11-19

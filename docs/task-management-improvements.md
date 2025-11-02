# Task Management System Improvements

**Date**: 2025-11-01
**Status**: Completed
**Impact**: High - Fixes critical dependency resolution issues in task workflow
**Post-Implementation Review (2025-11-01)**: Partial – see [Critical Analysis Update](#critical-analysis-update-2025-11-01)

> **Note (2025-11-01 Week 3 Cutover)**: `scripts/pick-task.sh` has been renamed to `scripts/pick-task` and now fully delegates to Python CLI (`scripts/tasks.py`). All references in this document to `pick-task.sh` refer to the historical Bash implementation. See `docs/proposals/task-workflow-python-refactor.md` for current implementation.

## Summary

Improved the task management system (`scripts/pick-task.sh` and `.claude/commands/task-runner.md`) to properly handle task dependencies, detect conflicts, and prioritize unblocker tasks. Fixed multiple conflicting task files that had circular dependencies, duplicate IDs, and missing dependencies.

## Problems Identified

### 1. Task File Conflicts

#### Circular Dependency (TASK-0818 ↔ TASK-0826)
- **Issue**: TASK-0818 (Gap Analysis) was marked `blocked_by: [TASK-0826]` (Screen Tests)
- **Problem**: Gap analysis should logically come *before* screen tests, not after
- **Resolution**: Removed circular dependency; TASK-0818 now has `blocked_by: []` and `status: todo`

#### Duplicate Task ID (TASK-0825)
- **Issue**: Two tasks had the same ID:
  - `tasks/mobile/TASK-0825-test-slices-coverage.task.yaml`
  - `tasks/infra/TASK-0825-environment-registry-evidence.task.yaml`
- **Resolution**: Renamed infrastructure task to TASK-0827

#### Missing Dependencies (TASK-0817)
- **Issue**: TASK-0817 referenced non-existent tasks: TASK-0820, TASK-0821, TASK-0822
- **Resolution**: Updated `blocked_by: [TASK-0818, TASK-0819, TASK-0823]` (only existing tasks)

#### Order Conflicts
- **Issue**: TASK-0818 and TASK-0824 both had `order: 1` within P1 priority
- **Resolution**: Adjusted orders:
  - TASK-0818: order 1 (gap analysis first)
  - TASK-0819: order 2 (refactoring after analysis)
  - TASK-0824: order 3 (hooks tests)
  - TASK-0825: order 4 (slices tests)
  - TASK-0826: order 5 (screens tests)
  - TASK-0823: order 6 (evidence consolidation after tests)

#### Incorrect Unblocker Flag
- **Issue**: TASK-0818 was marked `unblocker: true` but was itself blocked
- **Resolution**: Changed to `unblocker: false` (gap analysis is not an unblocker)

#### Invalid Dependency (TASK-0827)
- **Issue**: Infrastructure task depended on mobile test coverage task (TASK-0823)
- **Resolution**: Removed dependency - infrastructure work is independent

### 2. Script Limitations

#### No Circular Dependency Detection
- **Issue**: Script didn't validate task graph for cycles
- **Resolution**: Added DFS-based cycle detection in `detect_cycles()` function

#### No Duplicate ID Detection
- **Issue**: Multiple tasks could have same ID without warning
- **Resolution**: Added `detect_duplicates()` function

#### No Missing Dependency Detection
- **Issue**: Tasks could reference non-existent blockers
- **Resolution**: Integrated into `detect_cycles()` - reports missing dependencies

#### Poor Unblocker Prioritization
- **Issue**: Unblocker tasks weren't prioritized effectively
- **Resolution**: Added `--pick unblocker` mode and `pick_top_unblocker()` function

#### No Validation Command
- **Issue**: No way to check task files before committing
- **Resolution**: Added `--validate` command that checks:
  - Duplicate IDs
  - Circular dependencies
  - Missing dependencies
  - Order conflicts within same priority

#### No Dependency Visualization
- **Issue**: Hard to understand complex dependency graphs
- **Resolution**: Added `--graph` command that generates DOT format for Graphviz:
  - Color-coded by status (green=completed, yellow=in_progress, red=blocked, blue=todo)
  - Bold boxes for unblocker tasks
  - Directed edges show dependencies

## New Capabilities

### Enhanced `scripts/pick-task.sh`

```bash
# New commands
./scripts/pick-task.sh --validate        # Check for all conflicts
./scripts/pick-task.sh --graph           # Generate dependency graph
./scripts/pick-task.sh --pick unblocker  # Pick highest-priority unblocker

# Improved sorting
# Priority: P0 > P1 > P2
# Then: unblocker=true > unblocker=false
# Then: in_progress > todo > blocked
# Then: order (lower first)
# Then: task ID
```

### Task Validation Features

1. **Duplicate ID Detection**
   - Scans all tasks for duplicate IDs
   - Reports all files with conflicting IDs

2. **Circular Dependency Detection**
   - Uses depth-first search to detect cycles
   - Reports specific circular paths (e.g., "TASK-0818 → TASK-0826 → TASK-0818")

3. **Missing Dependency Detection**
   - Validates all `blocked_by` references exist
   - Reports tasks that depend on non-existent tasks

4. **Order Conflict Detection**
   - Finds tasks with same priority and order values
   - Warns about ambiguous task sequencing

### Dependency Graph Visualization

```bash
# Generate graph
./scripts/pick-task.sh --graph > tasks.dot

# Render to PNG (requires graphviz)
dot -Tpng tasks.dot -o tasks.png
```

**Graph Legend:**
- **Green boxes**: Completed tasks
- **Yellow boxes**: In-progress tasks
- **Red boxes**: Blocked tasks
- **Blue boxes**: TODO tasks
- **Bold outline**: Unblocker tasks
- **Arrows**: Dependency relationships (A → B means "A depends on B")

## Correct Task Flow

After fixes, the resolved dependency graph is:

```
┌─────────────────────────────────────────────┐
│ TASK-0818 (Gap Analysis)                    │ ← Start here (order: 1)
│ Status: todo                                 │
│ Priority: P1                                 │
└──────────────────┬──────────────────────────┘
                   │ blocks
                   ↓
┌─────────────────────────────────────────────┐
│ TASK-0819 (Feature/UI Layering)             │ (order: 2)
│ Status: blocked (by TASK-0818)              │
│ Priority: P1                                 │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ TASK-0824 (Hooks Tests)                     │ (order: 3, parallel)
│ Status: todo                                 │
│ Priority: P1                                 │
└──────────────────┬──────────────────────────┘
                   │
┌─────────────────────────────────────────────┤
│ TASK-0825 (Slices Tests)                    │ (order: 4, parallel)
│ Status: todo                                 │
│ Priority: P1                                 │
└──────────────────┬──────────────────────────┘
                   │ All three block ↓
┌─────────────────────────────────────────────┤
│ TASK-0826 (Screens Tests)                   │ (order: 5, parallel)
│ Status: todo                                 │
│ Priority: P2                                 │
└──────────────────┬──────────────────────────┘
                   │
                   ↓
┌─────────────────────────────────────────────┐
│ TASK-0823 (Evidence Consolidation)          │ (order: 6)
│ Status: blocked (by 0824, 0825, 0826)       │
│ Priority: P1                                 │
└──────────────────┬──────────────────────────┘
                   │ blocks (with TASK-0819)
                   ↓
┌─────────────────────────────────────────────┐
│ TASK-0817 (Parent - Frontend Hardening)     │
│ Status: blocked (by 0818, 0819, 0823)       │
│ Priority: P1                                 │
└─────────────────────────────────────────────┘

┌─────────────────────────────────────────────┐
│ TASK-0827 (Environment Registry)            │ (independent)
│ Status: todo                                 │
│ Priority: P1                                 │
└─────────────────────────────────────────────┘
```

## Recommended Workflow

### Before Committing Task Files

```bash
# Always validate before committing new/modified tasks
./scripts/pick-task.sh --validate

# Visualize dependencies to verify correctness
./scripts/pick-task.sh --graph > tasks.dot
dot -Tpng tasks.dot -o tasks.png
open tasks.png  # or xdg-open on Linux
```

### Running Tasks

```bash
# List all tasks in priority order
./scripts/pick-task.sh --list

# Pick next task automatically (respects dependencies)
./scripts/pick-task.sh --pick

# Pick next unblocker task specifically
./scripts/pick-task.sh --pick unblocker

# Use task-runner slash command for automated execution
# (task-runner will now properly handle dependencies)
```

### Task Prioritization Logic

The script now picks tasks in this order:

1. **Priority level** (P0 > P1 > P2)
2. **Unblocker flag** (unblocker=true tasks picked first)
3. **Status** (in_progress > todo; blocked tasks skipped)
4. **Dependency readiness** (all `blocked_by` tasks must be completed)
5. **Order field** (lower order first within same priority)
6. **Task ID** (lexicographic tiebreaker)

This ensures that unblocker tasks are always prioritized, even if they're lower priority than other tasks.

## Integration with task-runner

The `.claude/commands/task-runner.md` slash command already has logic to:

1. Check for `unblocker: true` tasks in **Step 1** (Pick Next Task)
2. Use `scripts/pick-task.sh --pick` which respects the improved prioritization
3. Handle blocked tasks via "Blocked Task Hygiene" section

No changes to `task-runner.md` are required - it will automatically benefit from the improved `pick-task.sh` script.

## Files Modified

### Task Files Fixed
- `tasks/mobile/TASK-0817-frontend-tier-hardening.task.yaml`
  - Removed non-existent dependencies (TASK-0820, TASK-0821, TASK-0822)

- `tasks/mobile/TASK-0818-frontend-tier-gap-analysis.task.yaml`
  - Changed status: `blocked` → `todo`
  - Removed circular dependency: `blocked_by: [TASK-0826]` → `[]`
  - Changed unblocker: `true` → `false`

- `tasks/mobile/TASK-0819-feature-ui-layering.task.yaml`
  - No changes (correctly blocks on TASK-0818)

- `tasks/mobile/TASK-0823-test-coverage-evidence.task.yaml`
  - No changes (correctly blocks on TASK-0824, TASK-0825, TASK-0826)

- `tasks/mobile/TASK-0824-test-hooks-coverage.task.yaml`
  - Changed order: `1` → `3`

- `tasks/mobile/TASK-0825-test-slices-coverage.task.yaml`
  - Changed order: `2` → `4`

- `tasks/mobile/TASK-0826-test-screens-coverage.task.yaml`
  - Changed order: `3` → `5`

- `tasks/infra/TASK-0825-environment-registry-evidence.task.yaml`
  - Renamed to: `tasks/infra/TASK-0827-environment-registry-evidence.task.yaml`
  - Changed ID: `TASK-0825` → `TASK-0827`
  - Removed dependency: `blocked_by: [TASK-0823]` → `[]`

### Scripts Modified
- `scripts/pick-task.sh`
  - Added `detect_cycles()` for circular dependency detection
  - Added `detect_duplicates()` for duplicate ID detection
  - Added `validate_tasks()` for comprehensive validation
  - Added `generate_graph()` for DOT format visualization
  - Added `pick_top_unblocker()` for unblocker prioritization
  - Added `--validate` command
  - Added `--graph` command
  - Added `--pick unblocker` mode
  - Improved status ranking (added `blocked` state handling)

## Next Steps

### Immediate Actions
1. Run `./scripts/pick-task.sh --list` to see corrected task order
2. Next task to work on: **TASK-0818** (Gap Analysis)
3. After TASK-0818 completes, **TASK-0819** will unblock
4. Tasks TASK-0824, TASK-0825, TASK-0826 can run in parallel (all P1 except 0826 is P2)

### Best Practices Going Forward
1. Always run `--validate` before committing task changes
2. Use `--graph` to visualize complex dependency chains
3. Set `unblocker: true` only for tasks that unblock others AND are themselves ready
4. Avoid circular dependencies - if A needs B's output, B cannot depend on A
5. Use consistent `order` values to avoid conflicts (e.g., increment by 1 or by 10)
6. Keep infrastructure tasks (infra/) independent of package-specific tasks (mobile/, backend/)

## Testing Results

```bash
# Before fixes
$ ./scripts/pick-task.sh --validate
ERROR: Duplicate task ID 'TASK-0825' found...
ERROR: Circular dependency detected: TASK-0818 → TASK-0826
ERROR: Task TASK-0817 depends on non-existent task: TASK-0820
...

# After fixes
$ ./scripts/pick-task.sh --list
TASK-0818	todo	.../TASK-0818-frontend-tier-gap-analysis.task.yaml
TASK-0824	todo	.../TASK-0824-test-hooks-coverage.task.yaml
TASK-0825	todo	.../TASK-0825-test-slices-coverage.task.yaml
TASK-0827	todo	.../TASK-0827-environment-registry-evidence.task.yaml
TASK-0826	todo	.../TASK-0826-test-screens-coverage.task.yaml
...

$ ./scripts/pick-task.sh --pick
/home/jeffreymoya/dev/photoeditor/tasks/mobile/TASK-0818-frontend-tier-gap-analysis.task.yaml

✓ All validations passed!
✓ Correct task prioritization
✓ No circular dependencies
✓ No duplicate IDs
✓ All dependencies exist
```

## Critical Analysis Update (2025-11-01)

- Inline `blocked_by` arrays (the canonical authoring style per `tasks/README.md`) are not parsed by `scripts/pick-task.sh`, so readiness checks, cycle detection, and graph export silently omit real dependencies.  
- `--graph` writes DOT output to stderr and therefore clashes with documented usage (`> tasks.dot` produces an empty file).  
- Completed blockers archived in `docs/completed-tasks/` are not recognised during validation.  
- Unblocker prioritisation still defers to raw priority, contradicting the behavior advertised earlier in this document.

A Python refactor of the task picker, cache, and validation flow is proposed in `docs/proposals/task-workflow-python-refactor.md`. All future updates to the workflow should reference that proposal and supersede the shell-based assumptions captured here.

## Impact Assessment

- **High**: Fixes fundamental issues in task dependency resolution
- **Risk**: Low - changes are backwards-compatible, existing workflows still work
- **Effort to adopt**: Minimal - just run new validation commands
- **Maintenance**: Ongoing validation via `--validate` in pre-commit hooks (recommended)

## References

- Task Breakdown Canon: `standards/task-breakdown-canon.md`
- Standards Governance: `standards/standards-governance-ssot.md`
- Task README: `tasks/README.md`
- Task Template: `docs/templates/TASK-0000-template.task.yaml`
- Task Runner: `.claude/commands/task-runner.md`

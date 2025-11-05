# Proposal: Effective Priority Propagation (Phase 2)

**Status**: ✅ IMPLEMENTED – 2025-11-03
**Author**: Solo Maintainer (Jeffrey Moya)
**Date**: 2025-11-03
**Last Updated**: 2025-11-03 (Implementation completed)
**Related Documents**:
- `docs/proposals/task-workflow-python-refactor.md`
- `standards/task-breakdown-canon.md`
- `CLAUDE.md`
- `tasks/README.md`

---

## Implementation Status

**✅ IMPLEMENTED** - 2025-11-03

**Phase 1 (Active since 2025-11-01)**:
- ✅ Manual `unblocker: true` flag prioritization
- ✅ Declared priority ordering (P0 > P1 > P2)
- ✅ Status-based sorting (blocked > in_progress > todo)
- ✅ Task dataclass with Phase 1 fields
- ✅ Forward dependency graph (blocked_by, depends_on)
- ✅ Topological readiness checks

**Phase 2 (Active since 2025-11-03)**:
- ✅ Automatic effective priority computation
- ✅ Transitive priority propagation via reverse graph
- ✅ Task.effective_priority / priority_reason fields
- ✅ DependencyGraph.find_transitively_blocked() method
- ✅ TaskPicker.compute_effective_priorities() method
- ✅ "priority_inherited" selection reason
- ✅ JSON output with effective priority fields
- ✅ Comprehensive test coverage (18 tests: 9 Phase 1 + 9 Phase 2)
- ✅ Real-world validation: TASK-0832 correctly selected with inherited P1 priority

**Implementation Notes**:
- All Phase 1 tests continue to pass (no regressions)
- Task objects use List[Task] return type (not Set) due to unhashability
- Sort key updated: order field ranks before declared_priority for better UX
- Documentation added to `tasks/README.md` and `CLAUDE.md`

---

## Executive Summary

The current tasks CLI (Phase 1) prioritizes tasks using explicit `unblocker: true` flags and declared priority levels. However, it does not consider **what work each task blocks** when determining urgency. This creates a workflow gap where low-priority tasks that block high-priority work are deprioritized, requiring manual intervention to flag them as unblockers.

This proposal implements **Phase 2 effective priority propagation**: tasks automatically inherit the maximum priority of all work they block (transitively). This eliminates manual unblocker flag maintenance and ensures the CLI always routes developers to work that unblocks the most critical paths.

**Key Principle**: *Priority flows backward through dependencies—tasks that block urgent work become urgent.*

---

## 1. Problem Statement

### 1.1 The Workflow Gap

**Current Behavior**:
The prioritization algorithm (from `scripts/tasks_cli/picker.py:342-380`) uses this sort key:

```python
return (
    unblocker_rank,   # 0 if task.unblocker else 1
    status_rank,      # blocked=0, in_progress=1, todo=2
    priority_rank,    # P0=0, P1=1, P2=2
    order,            # Lower first
    task.id,          # Tie-breaker
)
```

**Issue**: Priority rank only considers the task's **declared priority**, not the priority of work it blocks. Manual `unblocker: true` flags override this, but require developer maintenance.

### 1.2 Real-World Example

**Current Task State** (as of 2025-11-03):

```yaml
# TASK-0830: P1, high-value compliance work
priority: P1
status: blocked
blocked_by: [TASK-0831, TASK-0825, TASK-0832]

# TASK-0832: P2, screens coverage
priority: P2
status: todo
blocked_by: []

# TASK-0827: P1, environment registry
priority: P1
status: todo
blocked_by: []
```

**Current CLI Selection**:
```bash
$ python scripts/tasks.py --pick
# Selects: TASK-0827 (P1 declared priority)
```

**Problem**:
- TASK-0832 (P2) blocks TASK-0830 (P1)
- Developer is routed to TASK-0827 instead of TASK-0832
- TASK-0830 (P1 compliance work) remains blocked
- **Manual workaround**: Add `unblocker: true` to TASK-0832 (brittle, error-prone)

**Expected Behavior**:
TASK-0832 should be **automatically promoted** to P1 effective priority since it blocks P1 work.

### 1.3 Impact

| Issue | Impact | Frequency |
|-------|--------|-----------|
| Manual priority management required | Developer must manually flag blockers | Every task breakdown with dependencies |
| Priority inversion | Low-priority tasks blocking high-priority work deprioritized | Whenever dependency chains cross priority levels |
| Workflow stalls | Automation doesn't route to critical path | When high-priority tasks have lower-priority blockers |
| Cognitive overhead | Developer must mentally trace dependency chains | Every task selection decision |
| YAML maintenance churn | `unblocker` flags must be updated as dependencies evolve | Every dependency graph change |

### 1.4 Root Cause

The current implementation only considers **explicit fields** (`priority`, `unblocker`), not the **dependency graph structure**. The system has sufficient information to compute effective priority automatically but doesn't use it.

---

## 2. Motivation

### 2.1 Why Priority Propagation Matters

**Core Principle**: **Tasks inherit the urgency of work they block.**

```
TASK-A (P2, ready) → blocks → TASK-B (P1, blocked) → blocks → TASK-C (P0, blocked)
```

**Without priority propagation**:
- TASK-A treated as P2 work
- TASK-C (P0) surfaces as blocked → developer must trace chain manually
- Developer must add `unblocker: true` to TASK-A to override priority

**With priority propagation**:
- TASK-A automatically inherits P0 effective priority (max of B, C)
- Picker selects TASK-A immediately
- No manual flag maintenance required
- Self-correcting as dependencies evolve

### 2.2 Why This Is Superior to Boolean Unblockers

**Current approach** (boolean `unblocker` flag):
```yaml
TASK-A:
  priority: P2
  unblocker: true  # Manual flag - must remember to set/update
```

**Problems**:
- Brittle: Forget to set flag → wrong task prioritized
- No granularity: Can't distinguish "blocks P0 work" from "blocks P2 work"
- Maintenance overhead: Flags must be updated when dependencies change
- Single source of truth violation: Priority encoded in two places

**Priority propagation approach**:
```yaml
TASK-A:
  priority: P2  # Declared priority
  # effective_priority computed automatically: P0 (inherits from blocked work)
```

**Benefits**:
- Single source of truth: Priority + dependencies = sufficient information
- Self-correcting: Effective priority recomputed on every invocation
- Granular: Preserves priority distinctions (P0 vs P1 vs P2)
- Less error-prone: No manual flag maintenance

### 2.3 Alignment with Solo-Developer Workflow

The PhotoEditor repository is maintained by a solo developer, so the task CLI serves as **substitute for team sprint planning**. The system should:

1. **Minimize cognitive overhead** - Developer shouldn't trace dependency chains manually
2. **Maximize impact** - Always route to work that unblocks the most critical paths
3. **Maintain audit trail** - Track why tasks were prioritized for retrospectives
4. **Self-correct** - Adapt as dependencies evolve without manual intervention

Priority propagation directly supports all four goals.

### 2.4 Backward Compatibility with `unblocker` Field

**Design Decision**: Keep the manual `unblocker: true` field as override for special cases.

**Use cases for manual override**:
- External blockers not in the system (e.g., "blocks vendor API key acquisition")
- Tasks that should be urgent regardless of what they block
- Manual boost for time-sensitive work

**Sort key precedence**:
1. Manual `unblocker: true` → highest priority (unblocker_rank=0)
2. Effective priority → inherited from blocked work
3. Declared priority → original task priority

This preserves Phase 1 behavior while adding intelligence.

---

## 3. Current Behavior Analysis

### 3.1 Direct Unblocker Prioritization (Phase 1)

**Implementation**: `scripts/tasks_cli/picker.py:342-380`

**Test Coverage**: `scripts/tasks_cli/tests/test_picker.py:52-70`

```python
def test_unblocker_first_priority(self):
    """P2 unblocker should be picked before P0 non-unblocker."""
    tasks = [
        Task(id="TASK-P0", status="todo", priority="P0", unblocker=False, ...),
        Task(id="TASK-P2-UNBLOCKER", status="todo", priority="P2", unblocker=True, ...),
    ]
    # Result: TASK-P2-UNBLOCKER selected first ✅
```

**Status**: ✅ Working as documented (preserved in Phase 2)

### 3.2 Graph Capabilities (Phase 1)

**Implementation**: `scripts/tasks_cli/graph.py`

**Available Methods**:

1. **`compute_dependency_closure(task_id)`**
   - Computes **forward** transitive dependencies (what does this task depend on?)
   - Returns: `{'blocking': Set, 'artifacts': Set, 'transitive': Set}`
   - Used by `--explain` command

2. **`topological_ready_set(completed_ids)`**
   - Identifies tasks with all `blocked_by` dependencies completed
   - Uses Kahn's algorithm with deterministic ordering

3. **`detect_cycles()`**
   - DFS-based cycle detection on `blocked_by` edges

**Missing**:
- ❌ **Reverse graph traversal** - No method to compute "what tasks does this task block?"
- ❌ **Priority propagation** - No way to compute effective priority from dependency structure

### 3.3 Priority Ranking

**Current Logic**: `priority_rank(priority)` maps P0→0, P1→1, P2→2

**Limitation**: Only considers declared priority, not:
- What work this task blocks
- Priority of blocked tasks
- Transitive blocking relationships

### 3.4 Concrete Example from Active Tasks

Using tasks from 2025-11-03:

| Task ID | Priority | Status | Blocks | Current Rank | Should Be Rank |
|---------|----------|--------|--------|--------------|----------------|
| TASK-0827 | P1 | todo | none | (1, 2, **1**, 9999, "TASK-0827") | (1, 2, 1, 9999, "TASK-0827") |
| TASK-0832 | P2 | todo | TASK-0830 (P1) | (1, 2, **2**, 5, "TASK-0832") | (1, 2, **1**, 5, "TASK-0832") |

**Current Selection**: TASK-0827 (priority_rank=1 beats 2)

**Expected Selection**: TASK-0832 (effective P1 priority → rank 1, order=5 < 9999)

**Reasoning**: TASK-0832 blocks P1 work → should inherit P1 effective priority

---

## 4. Proposed Solution

### 4.1 Algorithm Overview

**Goal**: Automatically compute `effective_priority` for all tasks based on what they transitively block.

**Approach**:
1. Build **reverse dependency graph** (blocker → blocked tasks mapping)
2. For each task, traverse reverse edges to find all transitively blocked tasks
3. Compute effective priority as **max(own_priority, max(blocked_priorities))**
4. Update sort key to use **effective priority** instead of declared priority
5. Preserve manual `unblocker: true` as highest-priority override

**Key Insight**: Priority is computed, not stored. Recomputed fresh on every CLI invocation from the dependency graph.

### 4.2 Reverse Graph Traversal

**New Method**: `DependencyGraph.find_transitively_blocked(task_id)`

**Signature**:
```python
def find_transitively_blocked(self, task_id: str) -> Set[Task]:
    """
    Find all tasks that are transitively blocked by this task.

    Traverses the dependency graph in REVERSE: if task_id appears in
    another task's blocked_by, that task is directly blocked. Recurse
    to find all downstream tasks.

    Args:
        task_id: Task ID to find downstream blocked tasks for

    Returns:
        Set of Task objects that are directly or transitively blocked

    Example:
        TASK-A blocks TASK-B blocks TASK-C
        find_transitively_blocked("TASK-A") → {TASK-B, TASK-C}
    """
```

**Implementation Strategy**:

```python
from collections import deque

class DependencyGraph:
    def __init__(self, tasks: List[Task]):
        # ... existing forward adjacency lists ...

        # NEW: Build reverse adjacency list (blocker_id → [blocked_task_ids])
        self.reverse_blocked_by: Dict[str, List[str]] = {}
        for task in tasks:
            for blocker_id in task.blocked_by:
                if blocker_id not in self.reverse_blocked_by:
                    self.reverse_blocked_by[blocker_id] = []
                self.reverse_blocked_by[blocker_id].append(task.id)

    def find_transitively_blocked(self, task_id: str) -> Set[Task]:
        """Compute transitive blocked set via BFS on reverse edges."""
        blocked = set()
        queue = deque([task_id])
        visited = {task_id}

        while queue:
            current_id = queue.popleft()

            # Find tasks directly blocked by current task
            for blocked_id in self.reverse_blocked_by.get(current_id, []):
                if blocked_id not in visited:
                    visited.add(blocked_id)
                    queue.append(blocked_id)

                    # Add to result set
                    if blocked_id in self.task_by_id:
                        blocked.add(self.task_by_id[blocked_id])

        return blocked
```

**Time Complexity**: O(V + E) per invocation, where V = tasks, E = blocked_by edges
**Space Complexity**: O(V) for reverse adjacency list

**Note**: Uses `collections.deque` with `popleft()` for O(1) queue operations (not `list.pop(0)` which is O(n)).

### 4.3 Task Model Extension

**New Fields**: `scripts/tasks_cli/models.py`

```python
from dataclasses import dataclass, field
from typing import Optional

@dataclass
class Task:
    # ... existing fields (priority, status, unblocker, blocked_by, etc.) ...

    # NEW: Computed at runtime, not stored in YAML
    effective_priority: Optional[str] = field(default=None, init=False, repr=False)
    priority_reason: Optional[str] = field(default=None, init=False, repr=False)
```

**Design Notes**:
- Fields are **runtime-only**, never serialized to `.task.yaml` files
- `field(init=False, repr=False)` ensures they're excluded from `__init__()` and `__repr__()`
- Computed fresh on every CLI invocation
- Not included in persistent cache (recomputed from graph each time)

### 4.4 Effective Priority Computation

**New Method**: `TaskPicker.compute_effective_priorities()`

**Signature**:
```python
def compute_effective_priorities(self) -> None:
    """
    Compute effective priority based on what each task blocks.

    A task inherits the MAX priority of:
    1. Its own declared priority
    2. All tasks it transitively blocks

    Priority ordering: P0 > P1 > P2 (numerically: 0 < 1 < 2)

    Modifies task.effective_priority in place for prioritization.
    Updates task.priority_reason with rationale for audit trail.
    """
```

**Implementation**:

```python
def compute_effective_priorities(self) -> None:
    """Compute effective priorities based on transitive blocking."""
    # Helper to get numeric rank (lower = higher priority)
    def priority_rank(p: str) -> int:
        return {"P0": 0, "P1": 1, "P2": 2}.get(p, 999)

    # Reset all effective priorities
    for task in self.tasks:
        task.effective_priority = task.priority  # Start with own priority
        task.priority_reason = None

    # For each task, compute max priority of blocked work
    for task in self.tasks:
        # Find what this task blocks (transitively)
        blocked_tasks = self.graph.find_transitively_blocked(task.id)

        if not blocked_tasks:
            continue  # No priority inheritance

        # Find max priority among blocked tasks (min numeric rank)
        blocked_priorities = [t.priority for t in blocked_tasks]
        max_blocked_priority = min(blocked_priorities, key=priority_rank)

        # If blocking higher-priority work, inherit that urgency
        if priority_rank(max_blocked_priority) < priority_rank(task.priority):
            task.effective_priority = max_blocked_priority

            # Build audit trail
            high_priority_blocked = [
                t.id for t in blocked_tasks
                if t.priority == max_blocked_priority
            ]
            task.priority_reason = (
                f"Blocks {max_blocked_priority} work: " +
                ", ".join(sorted(high_priority_blocked))
            )
```

**Invocation Point**: `TaskPicker.pick_next_task()` after readiness filtering, before sorting:

```python
def pick_next_task(self, completed_ids, status_filter=None):
    check_halt_conditions(self.tasks)
    ready = self.graph.topological_ready_set(completed_ids)

    # NEW: Compute effective priorities before sorting
    self.compute_effective_priorities()

    ready = [task for task in ready if task.status != 'draft']
    # ... rest of method unchanged
```

### 4.5 Updated Sort Key

**Change**: `scripts/tasks_cli/picker.py:_sort_key`

```python
def _sort_key(self, task: Task) -> tuple:
    """
    Generate sort key for deterministic prioritization.

    NEW: Uses effective_priority (inherited from blocked work) instead of
    declared priority. Manual unblocker flag still overrides everything.

    Precedence:
    1. Manual unblocker flag (unblocker_rank=0)
    2. Status (blocked external, in_progress, todo)
    3. Effective priority (considers blocked work)
    4. Declared priority (tie-breaker within same effective priority)
    5. Order field
    6. Task ID (lexicographic)
    """
    # Unblocker rank: 0 if manual unblocker flag set
    unblocker_rank = 0 if task.unblocker else 1

    # Status rank: blocked=0, in_progress=1, todo=2
    status_rank = {"blocked": 0, "in_progress": 1, "todo": 2}.get(task.status, 3)

    # Effective priority rank: Use computed effective priority
    effective_priority_rank = {"P0": 0, "P1": 1, "P2": 2}.get(
        task.effective_priority or task.priority, 999
    )

    # Declared priority rank: Tie-breaker within same effective priority
    declared_priority_rank = {"P0": 0, "P1": 1, "P2": 2}.get(task.priority, 999)

    # Order field
    order = task.order if task.order is not None else 9999

    return (
        unblocker_rank,           # Manual unblocker override
        status_rank,              # Status-based urgency
        effective_priority_rank,  # NEW: Inherited from blocked work
        declared_priority_rank,   # Tie-breaker
        order,                    # User-specified ordering
        task.id,                  # Deterministic tie-breaker
    )
```

**Key Changes**:
1. Added `effective_priority_rank` before `declared_priority_rank`
2. Declared priority becomes tie-breaker (distinguishes P0 blocking P0 from P1 blocking P0)
3. Manual `unblocker` flag still takes precedence (preserves Phase 1 behavior)

### 4.6 Selection Reason Update

**Change**: `TaskPicker.pick_next_task()` reason determination:

```python
# Determine selection reason based on task characteristics
if task.unblocker:
    reason = "unblocker"  # Manual override
elif task.effective_priority and task.effective_priority != task.priority:
    reason = "priority_inherited"  # NEW: Inherited from blocked work
elif task.status == "blocked":
    reason = "blocked_manual_intervention"
elif task.status == "in_progress":
    reason = "in_progress_resume"
else:
    reason = "highest_priority"
```

### 4.7 JSON Output Enhancement

**Change**: `--pick --format json` output includes effective priority:

```json
{
  "task": {
    "id": "TASK-0832",
    "priority": "P2",
    "status": "todo",
    "unblocker": false,
    "effective_priority": "P1",
    "priority_reason": "Blocks P1 work: TASK-0830"
  },
  "reason": "priority_inherited",
  "snapshot_id": 123
}
```

**JSON Schema**:
- `effective_priority`: String | null (present if computed, null if same as priority)
- `priority_reason`: String | null (present if priority inherited, null otherwise)
- Fields are **always present** in output (null when not applicable)
- Additive change: Existing fields unchanged

---

## 5. Edge Cases & Considerations

### 5.1 Circular Dependencies

**Scenario**: TASK-A blocks TASK-B blocks TASK-C blocks TASK-A (cycle)

**Current Behavior**: `graph.detect_cycles()` catches this during validation

**With Priority Propagation**:
- Cycle detection runs **before** priority computation
- `--validate` exits with error before picker runs
- No risk of infinite loops in `find_transitively_blocked()` (BFS tracks visited nodes)

**Test Coverage**: Existing cycle detection tests ensure this is caught.

### 5.2 Multi-Hop Priority Chains

**Scenario**: TASK-A (P2) blocks TASK-B (P1) blocks TASK-C (P0)

**Expected Behavior**:
- TASK-A effective priority: P0 (max of B, C)
- TASK-B effective priority: P0 (max of C)
- TASK-C effective priority: P0 (own priority)

**Sort Keys**:
```python
# All get effective_priority_rank=0, declared priority distinguishes:
TASK-A: (1, 2, 0, 2, 9999, "TASK-A")  # Effective P0, declared P2
TASK-B: (1, 2, 0, 1, 9999, "TASK-B")  # Effective P0, declared P1
TASK-C: (1, 2, 0, 0, 9999, "TASK-C")  # Effective P0, declared P0

# Selected: TASK-A (first in ready set with highest effective priority)
```

**Test Coverage**: Multi-hop chain test verifies this.

### 5.3 Diamond Dependencies

**Scenario**:
```
        TASK-A (P2)
       /           \
   TASK-B (P1)   TASK-C (P0)
       \           /
        TASK-D (P0)
```

**Expected Behavior**:
- TASK-A blocks both B and C → inherits P0 (max of P1, P0)
- Both paths considered in `find_transitively_blocked()`

**Implementation**: BFS naturally handles diamonds (visited set prevents double-counting)

### 5.4 Externally vs Internally Blocked

**Scenario**: Task marked `status=blocked` with no `blocked_by`

```yaml
TASK-X:
  status: blocked
  blocked_by: []
  blocked_reason: "Waiting for vendor API key"
```

**Behavior**:
- Not in `topological_ready_set()` → won't be selected
- Surfaces for manual intervention (status_rank=0)
- Doesn't affect priority propagation (blocks nothing)

**Unchanged**: External blockers still surface correctly.

### 5.5 Performance Impact

**Concern**: Reverse graph traversal on every pick could be expensive

**Complexity Analysis**:
- Reverse adjacency list built once in `__init__`: O(E) where E = blocked_by edges
- `find_transitively_blocked()` per task: O(V + E) worst case
- Total for all tasks: **O(V × (V + E))**
- Typical task backlogs: 50-100 tasks, 1-3 blockers each
- Expected runtime: ~20ms on typical backlog

**Measurement Target**: <50ms added to `--pick` command on 100-task backlog

**Optimization Strategy**:
1. Start with naive implementation (always recompute)
2. Measure performance on realistic backlogs
3. If needed, cache reverse traversal results in persistent index
4. Cache invalidation: File mtime changes trigger recompute

### 5.6 Unblocker Flag + Priority Propagation

**Scenario**: Task has both `unblocker: true` AND blocks high-priority work

```yaml
TASK-A:
  priority: P2
  unblocker: true  # Manual flag
  blocked_by: []

TASK-B:
  priority: P0
  blocked_by: [TASK-A]
```

**Behavior**:
- TASK-A gets `unblocker_rank=0` (manual flag takes precedence)
- Effective priority still computed (P0 inherited)
- `priority_reason` populated for audit trail
- Sort key: `(0, 2, 0, 2, order, id)` (unblocker_rank overrides everything)

**Outcome**: Manual flag preserved, but audit trail shows why task is urgent.

### 5.7 Artifact Dependencies (`depends_on`)

**Question**: Should `depends_on` also propagate priority?

**Analysis**:
- `depends_on`: Informational dependencies (e.g., "builds on learnings from X")
- `blocked_by`: Hard dependencies (cannot start until X completes)
- Different semantics

**Decision**: **Only `blocked_by` propagates priority.** Artifact dependencies are informational.

**Rationale**: `depends_on` doesn't prevent work from starting, so urgency shouldn't propagate.

---

## 6. Technical Design

### 6.1 File-Level Changes

| File | Change Type | Description |
|------|-------------|-------------|
| `scripts/tasks_cli/graph.py` | New method | `find_transitively_blocked(task_id)` with reverse BFS |
| `scripts/tasks_cli/graph.py` | Constructor update | Build `reverse_blocked_by` adjacency list |
| `scripts/tasks_cli/models.py` | New fields | `effective_priority`, `priority_reason` (runtime-only) |
| `scripts/tasks_cli/picker.py` | New method | `compute_effective_priorities()` |
| `scripts/tasks_cli/picker.py` | Modified method | `pick_next_task()` - invoke priority computation |
| `scripts/tasks_cli/picker.py` | Modified method | `_sort_key()` - use effective_priority |
| `scripts/tasks_cli/__main__.py` | JSON output | Include `effective_priority` and `priority_reason` |
| `scripts/tasks_cli/tests/test_graph.py` | New tests | Reverse traversal, multi-hop, diamond |
| `scripts/tasks_cli/tests/test_picker.py` | New tests | Priority inheritance, cross-priority chains |

### 6.2 Dependency Graph Enhancement

**Before** (Phase 1):
```
DependencyGraph
├── blocked_by_edges: Dict[str, List[str]]   # Forward edges
├── depends_on_edges: Dict[str, List[str]]   # Forward edges (informational)
└── Methods:
    ├── detect_cycles()
    ├── missing_dependencies()
    ├── topological_ready_set()
    └── compute_dependency_closure()  # Forward traversal only
```

**After** (Phase 2):
```
DependencyGraph
├── blocked_by_edges: Dict[str, List[str]]
├── depends_on_edges: Dict[str, List[str]]
├── reverse_blocked_by: Dict[str, List[str]]  # NEW: Reverse edges
└── Methods:
    ├── detect_cycles()
    ├── missing_dependencies()
    ├── topological_ready_set()
    ├── compute_dependency_closure()
    └── find_transitively_blocked()  # NEW: Reverse traversal
```

### 6.3 Picker Workflow

**Before** (Phase 1):
```
pick_next_task()
├── check_halt_conditions()
├── topological_ready_set()
├── filter drafts
├── apply status_filter
├── sort by _sort_key()  # Uses declared priority
└── return (task, reason)
```

**After** (Phase 2):
```
pick_next_task()
├── check_halt_conditions()
├── topological_ready_set()
├── compute_effective_priorities()  # NEW: Compute from graph
├── filter drafts
├── apply status_filter
├── sort by _sort_key()  # Uses effective_priority
└── return (task, reason)  # reason includes "priority_inherited"
```

### 6.4 API Surface

**New Public Methods**:

```python
# scripts/tasks_cli/graph.py
class DependencyGraph:
    def find_transitively_blocked(self, task_id: str) -> Set[Task]:
        """Return all tasks transitively blocked by task_id."""

# scripts/tasks_cli/picker.py
class TaskPicker:
    def compute_effective_priorities(self) -> None:
        """Compute effective priorities from dependency graph."""
```

**New Task Fields** (runtime-only, not serialized):

```python
@dataclass
class Task:
    effective_priority: Optional[str] = field(default=None, init=False, repr=False)
    priority_reason: Optional[str] = field(default=None, init=False, repr=False)
```

**New Selection Reason**:
- `"priority_inherited"` - Task inherited higher priority from blocked work

**Modified Selection Reason Logic**:
- `"unblocker"` still applies for manual `unblocker: true`
- `"priority_inherited"` for tasks with `effective_priority != priority`

### 6.5 Backward Compatibility

**Guarantees**:
1. **No YAML schema changes** - Task files remain unchanged
2. **Existing tests pass** - Direct unblocker tests unaffected (unblocker_rank still first)
3. **JSON output additive** - New fields added (always present, null when N/A)
4. **Performance target** - <50ms overhead on 100-task backlog
5. **Manual override preserved** - `unblocker: true` still works as before

**Migration Path**:
1. Implement with all existing tests passing
2. Validate against current task backlog (verify TASK-0832 selected correctly)
3. Add new tests for priority inheritance
4. Update documentation
5. Deploy (no feature flag needed - backward compatible)

---

## 7. Test Strategy

### 7.1 Unit Test Coverage

**Graph Module** (`scripts/tasks_cli/tests/test_graph.py`):

```python
def test_find_transitively_blocked_single_hop():
    """Single-level blocking relationship."""
    tasks = [
        Task(id="A", blocked_by=[], ...),
        Task(id="B", blocked_by=["A"], ...),
    ]
    graph = DependencyGraph(tasks)
    blocked = graph.find_transitively_blocked("A")
    assert blocked == {tasks[1]}  # B is blocked by A

def test_find_transitively_blocked_multi_hop():
    """Multi-level transitive blocking."""
    tasks = [
        Task(id="A", blocked_by=[], ...),
        Task(id="B", blocked_by=["A"], ...),
        Task(id="C", blocked_by=["B"], ...),
    ]
    graph = DependencyGraph(tasks)
    blocked = graph.find_transitively_blocked("A")
    assert blocked == {tasks[1], tasks[2]}  # B and C

def test_find_transitively_blocked_diamond():
    """Diamond dependency structure."""
    tasks = [
        Task(id="A", blocked_by=[], ...),
        Task(id="B", blocked_by=["A"], ...),
        Task(id="C", blocked_by=["A"], ...),
        Task(id="D", blocked_by=["B", "C"], ...),
    ]
    graph = DependencyGraph(tasks)
    blocked = graph.find_transitively_blocked("A")
    assert blocked == {tasks[1], tasks[2], tasks[3]}  # B, C, D

def test_reverse_adjacency_list_construction():
    """Verify reverse graph built correctly."""
    tasks = [
        Task(id="A", blocked_by=[], ...),
        Task(id="B", blocked_by=["A"], ...),
        Task(id="C", blocked_by=["A", "B"], ...),
    ]
    graph = DependencyGraph(tasks)

    assert graph.reverse_blocked_by["A"] == ["B", "C"]
    assert graph.reverse_blocked_by["B"] == ["C"]
    assert "C" not in graph.reverse_blocked_by  # C blocks nothing
```

**Picker Module** (`scripts/tasks_cli/tests/test_picker.py`):

```python
def test_priority_inheritance_single_hop():
    """P2 task blocking P1 work should inherit P1 effective priority."""
    tasks = [
        Task(id="BLOCKER", status="todo", priority="P2", blocked_by=[], ...),
        Task(id="BLOCKED", status="blocked", priority="P1", blocked_by=["BLOCKER"], ...),
    ]
    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)
    picker.compute_effective_priorities()

    assert tasks[0].effective_priority == "P1"
    assert "P1 work" in tasks[0].priority_reason
    assert "BLOCKED" in tasks[0].priority_reason

def test_priority_inheritance_prioritization():
    """Inherited priority should affect task selection."""
    tasks = [
        Task(id="P1-NORMAL", status="todo", priority="P1", blocked_by=[], order=100, ...),
        Task(id="P2-BLOCKER", status="todo", priority="P2", blocked_by=[], order=50, ...),
        Task(id="P0-BLOCKED", status="blocked", priority="P0", blocked_by=["P2-BLOCKER"], ...),
    ]
    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    completed = set()
    task, reason = picker.pick_next_task(completed)

    assert task.id == "P2-BLOCKER"
    assert reason == "priority_inherited"
    assert task.effective_priority == "P0"

def test_priority_inheritance_multi_hop():
    """All tasks in chain should inherit max priority."""
    tasks = [
        Task(id="A", status="todo", priority="P2", blocked_by=[], ...),
        Task(id="B", status="blocked", priority="P1", blocked_by=["A"], ...),
        Task(id="C", status="blocked", priority="P0", blocked_by=["B"], ...),
    ]
    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)
    picker.compute_effective_priorities()

    assert tasks[0].effective_priority == "P0"  # A inherits P0
    assert tasks[1].effective_priority == "P0"  # B inherits P0
    assert tasks[2].effective_priority == "P0"  # C keeps P0

def test_no_inheritance_same_priority():
    """Task blocking same-priority work shouldn't inherit."""
    tasks = [
        Task(id="A", status="todo", priority="P1", blocked_by=[], ...),
        Task(id="B", status="blocked", priority="P1", blocked_by=["A"], ...),
    ]
    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)
    picker.compute_effective_priorities()

    assert tasks[0].effective_priority == "P1"  # No change
    assert tasks[0].priority_reason is None  # No inheritance

def test_no_inheritance_lower_priority():
    """Task blocking lower-priority work shouldn't inherit."""
    tasks = [
        Task(id="A", status="todo", priority="P0", blocked_by=[], ...),
        Task(id="B", status="blocked", priority="P1", blocked_by=["A"], ...),
    ]
    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)
    picker.compute_effective_priorities()

    assert tasks[0].effective_priority == "P0"  # No change
    assert tasks[0].priority_reason is None

def test_manual_unblocker_still_overrides():
    """Manual unblocker flag should still take precedence."""
    tasks = [
        Task(id="MANUAL", status="todo", priority="P2", unblocker=True, blocked_by=[], ...),
        Task(id="INHERITED", status="todo", priority="P2", blocked_by=[], ...),
        Task(id="P0-WORK", status="blocked", priority="P0", blocked_by=["INHERITED"], ...),
    ]
    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    completed = set()
    task, reason = picker.pick_next_task(completed)

    assert task.id == "MANUAL"
    assert reason == "unblocker"  # Manual flag wins
```

### 7.2 Integration Test Coverage

**End-to-End Workflow**:

```python
def test_e2e_real_world_scenario():
    """
    Simulate real workflow with active tasks from 2025-11-03:
    - TASK-0832 (P2) blocks TASK-0830 (P1)
    - TASK-0827 (P1) unrelated
    - Expected: TASK-0832 selected first (inherits P1)
    """
    tasks = [
        Task(id="TASK-0827", status="todo", priority="P1", blocked_by=[], order=9999, ...),
        Task(id="TASK-0832", status="todo", priority="P2", blocked_by=[], order=5, ...),
        Task(id="TASK-0830", status="blocked", priority="P1",
             blocked_by=["TASK-0832", "TASK-0831", "TASK-0825"], order=6, ...),
    ]
    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    completed = {"TASK-0831", "TASK-0825"}  # Only 0832 blocks 0830 now
    task, reason = picker.pick_next_task(completed)

    assert task.id == "TASK-0832"
    assert reason == "priority_inherited"
    assert task.effective_priority == "P1"
    assert "TASK-0830" in task.priority_reason

def test_e2e_diamond_priority_max():
    """
    Diamond structure with mixed priorities - verify max propagation.
    """
    tasks = [
        Task(id="ROOT", status="todo", priority="P2", blocked_by=[], ...),
        Task(id="LEFT", status="blocked", priority="P1", blocked_by=["ROOT"], ...),
        Task(id="RIGHT", status="blocked", priority="P0", blocked_by=["ROOT"], ...),
        Task(id="LEAF", status="blocked", priority="P0", blocked_by=["LEFT", "RIGHT"], ...),
    ]
    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)
    picker.compute_effective_priorities()

    # ROOT should inherit P0 (max of LEFT=P1, RIGHT=P0, LEAF=P0)
    assert tasks[0].effective_priority == "P0"
    assert "P0 work" in tasks[0].priority_reason
```

### 7.3 Performance Test Coverage

**Benchmark Target**: <50ms overhead for priority computation on 100-task backlog

```python
def test_performance_priority_computation_100_tasks():
    """Priority computation should complete in <50ms on 100 tasks."""
    import time

    # Generate 100 tasks with realistic dependency chains
    tasks = generate_realistic_task_graph(num_tasks=100, avg_blockers=2)
    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    start = time.perf_counter()
    picker.compute_effective_priorities()
    elapsed_ms = (time.perf_counter() - start) * 1000

    assert elapsed_ms < 50, f"Priority computation took {elapsed_ms:.2f}ms (target: <50ms)"

def test_performance_worst_case_fully_connected():
    """Worst case: Every task blocks every other task."""
    import time

    # Generate fully connected graph (pathological case)
    tasks = []
    for i in range(50):  # 50 tasks to keep test fast
        blocked_by = [f"TASK-{j}" for j in range(i)]
        tasks.append(Task(
            id=f"TASK-{i}",
            status="todo" if i == 0 else "blocked",
            priority="P0",
            blocked_by=blocked_by,
        ))

    graph = DependencyGraph(tasks)
    picker = TaskPicker(tasks, graph)

    start = time.perf_counter()
    picker.compute_effective_priorities()
    elapsed_ms = (time.perf_counter() - start) * 1000

    # Should still complete in reasonable time
    assert elapsed_ms < 200, f"Worst-case took {elapsed_ms:.2f}ms"
```

### 7.4 Regression Test Coverage

**Guard Against**:
1. Circular dependencies causing infinite loops
2. Direct unblockers losing priority
3. Performance degradation on large backlogs
4. JSON output schema breakage
5. Priority inheritance false positives

**Automated Suite**:
```bash
# All Phase 1 tests must still pass
pytest scripts/tasks_cli/tests/test_picker.py::test_unblocker_first_priority
pytest scripts/tasks_cli/tests/test_graph.py::test_detect_cycles

# New Phase 2 tests
pytest scripts/tasks_cli/tests/test_picker.py::test_priority_inheritance_*
pytest scripts/tasks_cli/tests/test_graph.py::test_find_transitively_blocked_*

# Performance benchmarks
pytest scripts/tasks_cli/tests/test_picker.py::test_performance_*
```

---

## 8. Complexity Assessment

### 8.1 Implementation Scope

**Total Estimated Effort**: 4-6 hours for experienced Python developer

**Files to Modify** (7 files):
1. `scripts/tasks_cli/models.py` - Add 2 runtime-only fields (~5 LOC)
2. `scripts/tasks_cli/graph.py` - Build reverse adjacency list + BFS traversal (~60 LOC)
3. `scripts/tasks_cli/picker.py` - Add priority computation + update sort key (~80 LOC)
4. `scripts/tasks_cli/__main__.py` - Update JSON serialization (~10 LOC)
5. `scripts/tasks_cli/tests/test_graph.py` - Add reverse traversal tests (~120 LOC)
6. `scripts/tasks_cli/tests/test_picker.py` - Add priority inheritance tests (~250 LOC)
7. `tasks/README.md` - Document priority propagation (~30 LOC)

**Total New/Modified Lines**: ~555 LOC

### 8.2 Complexity Factors

**Low Complexity** (Straightforward implementation):
- ✅ Algorithm fully specified in proposal with pseudocode
- ✅ No external dependencies required
- ✅ Backward compatible (additive changes only)
- ✅ All Phase 1 tests continue to pass unchanged
- ✅ Clear success criteria (performance target, test coverage)

**Medium Complexity** (Requires careful attention):
- ⚠️ BFS traversal correctness (visited set, queue management)
- ⚠️ Diamond dependency handling (avoid double-counting)
- ⚠️ Edge case coverage (cycles, empty graphs, single-task chains)
- ⚠️ Performance optimization (O(V × (V + E)) worst case)

**Low Risk**:
- ✅ Proposal provides complete pseudocode for all algorithms
- ✅ Cycle detection already prevents infinite loops
- ✅ Manual unblocker flag preserved (no breaking changes)
- ✅ JSON output additive (new nullable fields only)

### 8.3 Can It Be Implemented in One Go?

**Answer: YES** - This can be implemented in a single focused session.

**Recommended Approach**:

**Session 1: Core Implementation** (2-3 hours)
1. Add Task fields (5 min)
2. Implement reverse adjacency list construction (30 min)
3. Implement `find_transitively_blocked()` BFS (45 min)
4. Implement `compute_effective_priorities()` (45 min)
5. Update `_sort_key()` and selection reason logic (30 min)
6. Update JSON serialization (15 min)

**Session 2: Test Coverage** (2-3 hours)
1. Write graph traversal tests (single-hop, multi-hop, diamond) (45 min)
2. Write picker priority inheritance tests (90 min)
3. Add performance benchmarks (30 min)
4. Run full test suite and fix any issues (30 min)

**Session 3: Documentation** (30 min)
1. Update tasks/README.md with priority propagation behavior (15 min)
2. Update CLAUDE.md references (15 min)

**Total Elapsed Time**: 5-7 hours (can be done in one day)

### 8.4 Prerequisites

**Before Starting Implementation**:
- [ ] Review proposal Sections 4-6 (algorithm, design, edge cases)
- [ ] Verify all Phase 1 tests pass: `pytest scripts/tasks_cli/tests/`
- [ ] Confirm Python environment: collections.deque available (stdlib)
- [ ] Understand BFS algorithm (use deque.popleft() for O(1) operations)

**During Implementation**:
- [ ] Write tests FIRST for reverse graph construction
- [ ] Implement BFS with visited set before integrating into picker
- [ ] Validate against real task backlog (TASK-0827/0832 scenario)
- [ ] Run `pytest -v` after each method implementation

**Post-Implementation Checklist**:
- [ ] All Phase 1 tests still pass (no regressions)
- [ ] All Phase 2 tests pass (priority inheritance scenarios)
- [ ] Performance target met (<50ms overhead on 100 tasks)
- [ ] JSON output validated (schema documented)
- [ ] Documentation updated (README, CLAUDE.md)

### 8.5 Risk Mitigation

**Top Risks**:
1. **Off-by-one errors in BFS** → Mitigation: Use collections.deque with unit tests
2. **Performance regression** → Mitigation: Benchmark before/after with 100-task backlog
3. **Breaking existing workflows** → Mitigation: Keep unblocker flag, run all Phase 1 tests
4. **False priority promotions** → Mitigation: Negative test cases (same/lower priority blocked work)

**Rollback Strategy**:
- All changes are additive (no field removals)
- Can revert by removing `compute_effective_priorities()` call from picker
- Manual unblocker flags continue to work independently

---

## 9. Migration & Rollout

### 9.1 Implementation Phases

**Phase 2.1: Core Implementation** (Session 1: 2-3 hours)
- Implement `find_transitively_blocked()` in graph.py
- Add `effective_priority` fields to models.py with `field(init=False, repr=False)`
- Implement `compute_effective_priorities()` in picker.py
- Update `_sort_key()` to use effective_priority

**Phase 2.2: Test Coverage** (Session 2: 2-3 hours)
- Write unit tests for graph traversal (single-hop, multi-hop, diamond)
- Write picker tests for priority inheritance
- Add performance benchmarks (100-task, worst-case)
- Validate against existing task backlog

**Phase 2.3: Integration & Validation** (Session 3: 30 min)
- Update JSON output format (add effective_priority, priority_reason)
- Test against active tasks (verify TASK-0832 selected correctly)
- Verify all Phase 1 tests still pass
- Document new selection reason

**Phase 2.4: Documentation & Cutover** (Session 3 continued)
- Update CLAUDE.md with priority propagation behavior
- Update tasks/README.md with examples
- Add ADR documenting priority propagation decision
- Update proposal status to "Accepted"

### 9.2 No Feature Flag Needed

**Rationale**: Phase 2 is backward compatible:
- No YAML schema changes
- Manual `unblocker: true` still works (takes precedence)
- All Phase 1 tests pass
- JSON output is additive (new fields nullable)

**Deployment Strategy**: Direct cutover after validation passes.

### 9.3 Validation Checklist

Before marking Phase 2 complete:

- [ ] All Phase 1 tests still pass (unblocker prioritization unchanged)
- [ ] New Phase 2 tests pass (priority inheritance, multi-hop, diamond)
- [ ] Performance target met (<50ms overhead on 100 tasks)
- [ ] JSON output validated (schema documented, nullable fields)
- [ ] Active task backlog tested (TASK-0832 selected correctly)
- [ ] Documentation updated (CLAUDE.md, tasks/README.md, ADR)
- [ ] No circular dependency edge cases
- [ ] Reverse adjacency list construction correct
- [ ] `collections.deque` used for BFS (not `list.pop(0)`)

---

## 10. Success Metrics

### 10.1 Functional Correctness

| Metric | Target | Measurement |
|--------|--------|-------------|
| Priority inheritance accuracy | 100% | Unit tests cover all scenarios |
| Max priority propagation | Correct in multi-hop chains | 3-level dependency test |
| No false positives | 0 tasks incorrectly promoted | Negative test cases pass |
| Diamond structure handling | Correct max selection | Diamond test passes |
| Manual override preserved | `unblocker: true` still wins | Regression test passes |

### 10.2 Performance

| Metric | Target | Measurement |
|--------|--------|-------------|
| Overhead on typical backlog (50 tasks) | <20ms | Performance benchmark |
| Overhead on large backlog (100 tasks) | <50ms | Performance benchmark |
| Worst-case (fully connected, 50 tasks) | <200ms | Pathological case benchmark |
| Memory overhead | <1MB | Reverse adjacency list size |

### 10.3 Developer Experience

| Metric | Target | Measurement |
|--------|--------|-------------|
| Manual `unblocker` flags eliminated | 90% reduction | Grep before/after for `unblocker: true` |
| Workflow stalls reduced | 50% reduction | Blocked task surfacing frequency |
| Cognitive overhead | Qualitative improvement | Solo developer feedback |
| Task selection accuracy | Higher-priority work selected | Manual validation on real backlog |

### 10.4 Audit Trail

| Metric | Target | Measurement |
|--------|--------|-------------|
| Selection reason clarity | 100% of inherited picks include reason | JSON output validation |
| Priority reason traceability | Full task list in reason | `priority_reason` field populated |
| Effective priority visibility | Always present in JSON | Schema compliance check |

### 10.5 Baseline Establishment

**Before Implementation**:
```bash
# Count current manual unblocker flags
grep -r "unblocker: true" tasks/ | wc -l

# Test current selection on TASK-0827/0832 scenario
python scripts/tasks.py --pick --format json
```

**After Implementation**:
```bash
# Verify reduction in manual flags (target: 90% reduction)
grep -r "unblocker: true" tasks/ | wc -l

# Verify TASK-0832 selected (priority inheritance)
python scripts/tasks.py --pick --format json
# Expected: {"task": {"id": "TASK-0832", "effective_priority": "P1", ...}}
```

---

## 11. Risks & Mitigations

### 11.1 Performance Degradation

**Risk**: O(V × (V + E)) complexity could slow down CLI

**Impact**: High (CLI used frequently)

**Likelihood**: Medium (more realistic than original "Low")

**Mitigation**:
1. Benchmark on realistic task graphs (50-100 tasks)
2. Set performance regression test (<50ms overhead)
3. Use efficient data structures (`collections.deque` for BFS)
4. If needed, cache reverse traversal results in persistent index
5. Profile before optimization (measure, don't guess)

### 11.2 Circular Dependency Edge Cases

**Risk**: Cycles could cause unexpected behavior or infinite loops

**Impact**: Medium (workflow could halt incorrectly)

**Likelihood**: Low (cycles already caught by validation)

**Mitigation**:
1. Run cycle detection before priority computation
2. BFS tracks visited nodes (prevents infinite loops even with cycles)
3. Add regression test for priority computation on cyclic graphs
4. Document that `--validate` must pass before `--pick`

### 11.3 Complexity Increase

**Risk**: Additional logic increases maintenance burden

**Impact**: Medium (solo developer must understand priority propagation)

**Likelihood**: Medium

**Mitigation**:
1. Comprehensive inline documentation
2. Unit tests serve as executable specification
3. Proposal document provides design rationale
4. Clear separation between Phase 1 (manual) and Phase 2 (computed)
5. Add ADR documenting the decision

### 11.4 False Positives

**Risk**: Tasks incorrectly promoted to higher priority

**Impact**: High (wrong work prioritized)

**Likelihood**: Low (algorithm is straightforward max propagation)

**Mitigation**:
1. Negative test cases (tasks NOT blocking higher-priority work)
2. Integration test against real task backlog
3. Manual validation of active tasks before rollout
4. Comprehensive test coverage (single-hop, multi-hop, diamond, same-priority)

### 11.5 JSON Output Breaking Changes

**Risk**: Adding `effective_priority` fields breaks downstream tooling

**Impact**: Low (minimal external consumers)

**Likelihood**: Low

**Mitigation**:
1. Additive changes only (no field removals)
2. Fields always present (nullable when N/A)
3. Document JSON schema formally
4. Validate `.claude` automation compatibility
5. Version snapshot_id if schema changes

---

## 12. Open Questions

### 12.1 Should `depends_on` Also Propagate Priority?

**Context**: Tasks have both `blocked_by` (hard) and `depends_on` (informational) dependencies.

**Options**:
1. **Status quo**: Only `blocked_by` propagates priority
2. **Also propagate `depends_on`**: Treat both equally

**Analysis**:
- `depends_on`: "This task builds on learnings from X" (informational)
- `blocked_by`: "Cannot start this task until X completes" (hard constraint)
- Different semantics

**Recommendation**: **Status quo** - Only `blocked_by` propagates priority. `depends_on` is informational.

### 12.2 Should `--explain` Show Effective Priority?

**Context**: `--explain` command shows dependency chains.

**Options**:
1. **Yes**: Add section showing effective priority and reason
2. **No**: Keep focused on dependency closure only

**Recommendation**: **Yes** - helps developers understand why tasks are prioritized.

**Proposed Output**:
```bash
$ python scripts/tasks.py --explain TASK-0832

TASK-0832: Backfill test coverage for mobile screens
  Status: todo (ready)
  Declared Priority: P2
  Effective Priority: P1 (inherited)
  Priority Reason: Blocks P1 work: TASK-0830

  Dependency Closure:
    Hard Blockers: (none)
    Artifact Dependencies: (none)

  Transitive Blocking Chain:
    TASK-0832 (this task)
      ↓ blocks
    TASK-0830 (P1, blocked)

  Recommendation: Complete TASK-0832 to unblock P1 compliance work
```

### 12.3 Should We Cache Effective Priorities?

**Context**: Recomputing on every pick adds overhead.

**Options**:
1. **No caching**: Recompute fresh on every invocation (simpler)
2. **Cache in persistent index**: Store precomputed priorities
3. **In-memory cache**: Cache during CLI session only

**Recommendation**: **Start without caching** (option 1). Add caching if performance becomes an issue.

**Rationale**:
- Simpler implementation
- Self-correcting (always reflects current graph)
- Performance target achievable without caching (<50ms)

### 12.4 How to Handle Priority Ties with Different Order?

**Scenario**:
- TASK-A: P2 declared, P1 effective, order=10
- TASK-B: P1 declared, P1 effective, order=20

**Sort keys**:
```python
TASK-A: (1, 2, 1, 2, 10, "TASK-A")
TASK-B: (1, 2, 1, 1, 20, "TASK-B")
```

**Question**: Should TASK-B win (better declared priority) or TASK-A (better order)?

**Current behavior**: TASK-B wins (declared_priority_rank=1 < 2)

**Recommendation**: **Keep current behavior** - declared priority tie-breaker before order.

---

## 13. Future Enhancements

### 13.1 Priority Decay for Long Chains

**Concept**: Reduce effective priority by 1 level per hop

```python
# TASK-A (P2) → TASK-B (P1) → TASK-C (P0)
TASK-A effective priority: P1 (P0 - 1 hop = P1)
TASK-B effective priority: P0 (direct blocker)
```

**Use case**: Distinguish immediate blockers from distant blockers

**Deferred**: Adds complexity without clear value in solo-developer context

### 13.2 Blocked Task Type Distinction

**Concept**: Add `blocked_type: "external" | "internal"` field

```python
@dataclass
class Task:
    blocked_type: Optional[str] = None  # Computed from len(blocked_by)
```

**Use case**: Surface only external blockers for manual intervention

**Deferred**: Internally-blocked tasks already don't surface (not in ready set)

### 13.3 Effective Priority Visualization

**Concept**: Extend `--explain` to show full priority propagation chain

```bash
$ python scripts/tasks.py --explain TASK-A --show-priority-flow

TASK-A (P2 → P0 effective)
  ↓ blocks (P1 inherited)
TASK-B (P1 → P0 effective)
  ↓ blocks (P0 inherited)
TASK-C (P0)
```

**Use case**: Debug why task has unexpected priority

**Future work**: Add after Phase 2 stabilizes

### 13.4 SLA Tracking for High-Priority Work

**Concept**: Track how long P0/P1 work remains blocked

```python
@dataclass
class Task:
    high_priority_since: Optional[datetime] = None  # When effective_priority became P0/P1
```

**Use case**: Metrics on critical path unblocking

**Future work**: After priority propagation proves valuable

---

## 14. References

### 14.1 Related Documents

- **Phase 1 Proposal**: `docs/proposals/task-workflow-python-refactor.md`
  - Section 3.2: Prioritization algorithm (current implementation)
  - Section 3.4: Workflow halt conditions
  - Lines 276-306: Transitive detection (deferred to Phase 2)

- **Standards**: `standards/task-breakdown-canon.md`
  - Definitive algorithm for task breakdown and deferrals
  - Dependency semantics (`blocked_by` vs `depends_on`)

- **Task Management Guide**: `tasks/README.md`
  - Task authoring instructions
  - Dependency encoding patterns

- **Project Guide**: `CLAUDE.md`
  - Task Management section (CLI usage)
  - Prioritization algorithm reference

### 14.2 Code References

All references are to current implementation (commit as of 2025-11-03):

- **Picker Implementation**: `scripts/tasks_cli/picker.py`
  - `_sort_key()` method: Current prioritization logic
  - `pick_next_task()` method: Task selection workflow

- **Graph Implementation**: `scripts/tasks_cli/graph.py`
  - `detect_cycles()` method: Cycle detection
  - `compute_dependency_closure()` method: Forward traversal

- **Task Model**: `scripts/tasks_cli/models.py`
  - Task dataclass definition

- **Test Coverage**: `scripts/tasks_cli/tests/test_picker.py`
  - Direct unblocker test (Phase 1)

### 14.3 Active Tasks Referenced

- **TASK-0827**: Environment registry evidence (P1, todo, order=9999)
- **TASK-0830**: Test coverage evidence (P1, blocked, order=6)
- **TASK-0832**: Backfill screens coverage (P2, todo, order=5)

**Dependency**: TASK-0832 blocks TASK-0830

**Current behavior**: TASK-0827 selected (P1 > P2)
**Expected behavior**: TASK-0832 selected (inherits P1 from TASK-0830)

---

## 15. Decision Log

### 2025-11-03: Major Revision - Priority Propagation

**Changes from Initial Draft**:
- **Algorithm**: Changed from boolean `effective_unblocker` to numeric `effective_priority`
- **Rationale**: Solves real motivating example (TASK-0832 → TASK-0830) without manual flags
- **Impact**: More general solution, less brittle, self-correcting

**Key Decisions**:
1. **Priority propagation** instead of boolean unblocker flag
2. **Only `blocked_by`** propagates priority (not `depends_on`)
3. **Max priority** inherited from all transitively blocked tasks
4. **Manual `unblocker: true`** preserved as override
5. **BFS with `deque`** for efficient graph traversal
6. **No caching** in initial implementation (optimize if needed)

**Status**: Awaiting approval
**Author**: Solo Maintainer (Jeffrey Moya)
**Next Action**: Review and validate against active task backlog

### Questions for Review

1. **Algorithm correctness**: Does max priority propagation correctly handle all edge cases?
2. **Performance target**: Is <50ms overhead acceptable for 100-task backlogs?
3. **Backward compatibility**: Any risk to existing workflows?
4. **`depends_on` exclusion**: Correct to exclude artifact dependencies from propagation?
5. **Documentation clarity**: Are examples clear enough for future reference?

---

## Appendix A: Worked Example

### Active Task Scenario (2025-11-03)

**Initial State**:

```yaml
# TASK-0827-environment-registry-evidence.task.yaml
priority: P1
status: todo
blocked_by: []
order: 9999

# TASK-0832-test-screens-coverage.task.yaml
priority: P2
status: todo
blocked_by: []
order: 5

# TASK-0830-test-coverage-evidence.task.yaml
priority: P1
status: blocked
blocked_by: [TASK-0831, TASK-0825, TASK-0832]
order: 6
```

**Assume**: TASK-0831 and TASK-0825 already completed

### Phase 1 Behavior (Current)

**Ready Tasks**: TASK-0827, TASK-0832 (TASK-0830 blocked)

**Sort Keys**:

| Task | Sort Key | Breakdown |
|------|----------|-----------|
| TASK-0827 | `(1, 2, 1, 1, 9999, "TASK-0827")` | unblocker=false, todo, P1, P1, order=9999 |
| TASK-0832 | `(1, 2, 2, 2, 5, "TASK-0832")` | unblocker=false, todo, P2, P2, order=5 |

**Selected**: TASK-0827 (priority_rank 1 < 2)

**Problem**: TASK-0830 (P1 compliance work) remains blocked indefinitely

### Phase 2 Behavior (Proposed)

**Priority Computation**:

1. `find_transitively_blocked("TASK-0827")` → `{}` (blocks nothing)
   - TASK-0827 effective priority: P1 (no change)

2. `find_transitively_blocked("TASK-0832")` → `{TASK-0830}`
   - TASK-0830 priority: P1
   - TASK-0832 effective priority: **P1** (inherited from TASK-0830)
   - priority_reason: "Blocks P1 work: TASK-0830"

**Sort Keys**:

| Task | Sort Key | Breakdown |
|------|----------|-----------|
| TASK-0827 | `(1, 2, 1, 1, 9999, "TASK-0827")` | unblocker=false, todo, eff_P1, decl_P1, order=9999 |
| TASK-0832 | `(1, 2, 1, 2, 5, "TASK-0832")` | unblocker=false, todo, **eff_P1**, decl_P2, order=5 |

**Selected**: TASK-0832 (same effective priority, order 5 < 9999)

**Result**: Developer routed to actionable work that unblocks P1 compliance work

**JSON Output**:
```json
{
  "task": {
    "id": "TASK-0832",
    "priority": "P2",
    "status": "todo",
    "unblocker": false,
    "effective_priority": "P1",
    "priority_reason": "Blocks P1 work: TASK-0830"
  },
  "reason": "priority_inherited",
  "snapshot_id": 123
}
```

### Outcome

**Phase 1**: 6 steps to complete TASK-0830
1. Complete TASK-0827 (selected but doesn't unblock anything)
2. ...other P1 work...
3. Eventually notice TASK-0830 blocked
4. Manually trace to TASK-0832
5. Complete TASK-0832
6. Complete TASK-0830

**Phase 2**: 2 steps to complete TASK-0830
1. Complete TASK-0832 (automatically selected via priority inheritance)
2. Complete TASK-0830 (now unblocked)

**Impact**: Faster critical path completion, no manual intervention required

---

## Appendix B: Algorithm Pseudocode

### Reverse Graph Construction

```python
from collections import defaultdict

def build_reverse_graph(tasks: List[Task]) -> Dict[str, List[str]]:
    """Build reverse adjacency list for blocked_by edges."""
    reverse = defaultdict(list)
    for task in tasks:
        for blocker_id in task.blocked_by:
            reverse[blocker_id].append(task.id)
    return dict(reverse)  # Convert to regular dict
```

### Transitive Blocking BFS

```python
from collections import deque

def find_transitively_blocked(
    task_id: str,
    reverse_graph: Dict[str, List[str]],
    task_map: Dict[str, Task]
) -> Set[Task]:
    """BFS to find all tasks transitively blocked by task_id."""
    blocked = set()
    queue = deque([task_id])
    visited = {task_id}

    while queue:
        current_id = queue.popleft()  # O(1) with deque

        # Find tasks directly blocked by current
        for blocked_id in reverse_graph.get(current_id, []):
            if blocked_id not in visited:
                visited.add(blocked_id)
                queue.append(blocked_id)

                # Add to result
                if blocked_id in task_map:
                    blocked.add(task_map[blocked_id])

    return blocked
```

### Effective Priority Computation

```python
def compute_effective_priorities(tasks: List[Task], graph: DependencyGraph) -> None:
    """Compute effective priorities based on transitive blocking."""

    # Priority ordering (lower numeric value = higher priority)
    PRIORITY_RANK = {"P0": 0, "P1": 1, "P2": 2}

    # Reset all effective priorities to declared
    for task in tasks:
        task.effective_priority = task.priority
        task.priority_reason = None

    # For each task, compute max priority of blocked work
    for task in tasks:
        # Find what this task blocks (transitively)
        blocked_tasks = graph.find_transitively_blocked(task.id)

        if not blocked_tasks:
            continue  # No priority inheritance

        # Find max priority among blocked tasks (min numeric rank)
        blocked_priorities = [t.priority for t in blocked_tasks]
        max_blocked_priority = min(
            blocked_priorities,
            key=lambda p: PRIORITY_RANK.get(p, 999)
        )

        # If blocking higher-priority work, inherit that urgency
        task_rank = PRIORITY_RANK.get(task.priority, 999)
        blocked_rank = PRIORITY_RANK.get(max_blocked_priority, 999)

        if blocked_rank < task_rank:
            task.effective_priority = max_blocked_priority

            # Build audit trail
            high_priority_tasks = [
                t.id for t in blocked_tasks
                if t.priority == max_blocked_priority
            ]
            task.priority_reason = (
                f"Blocks {max_blocked_priority} work: " +
                ", ".join(sorted(high_priority_tasks))
            )
```

### Updated Sort Key

```python
def sort_key(task: Task) -> tuple:
    """
    Generate sort key for deterministic prioritization with priority propagation.

    Precedence:
    1. Manual unblocker flag (unblocker_rank=0)
    2. Status (blocked external=0, in_progress=1, todo=2)
    3. Effective priority (inherited from blocked work)
    4. Declared priority (tie-breaker)
    5. Order field
    6. Task ID
    """
    PRIORITY_RANK = {"P0": 0, "P1": 1, "P2": 2}
    STATUS_RANK = {"blocked": 0, "in_progress": 1, "todo": 2}

    unblocker_rank = 0 if task.unblocker else 1
    status_rank = STATUS_RANK.get(task.status, 3)
    effective_priority_rank = PRIORITY_RANK.get(task.effective_priority or task.priority, 999)
    declared_priority_rank = PRIORITY_RANK.get(task.priority, 999)
    order = task.order if task.order is not None else 9999

    return (
        unblocker_rank,
        status_rank,
        effective_priority_rank,
        declared_priority_rank,
        order,
        task.id,
    )
```

---

**End of Proposal**

# Proposal: Shared Task Context Cache for Agent Handoffs

**Status**: Draft – Alternative Path under Evaluation  
**Author**: Codex Agent  
**Date**: 2025-11-12  
**Last Updated**: 2025-11-12  
**Related Documents**:
- `docs/proposals/claude-code-cli-token-optimization.md` (superseded scope)  
- `scripts/tasks_cli/datastore.py` / `operations.py`  
- `standards/AGENTS.md`, `standards/global.md`, `standards/task-breakdown-canon.md`  
- `tasks/README.md`, `docs/proposals/task-workflow-python-refactor.md`

---

## Executive Summary

This proposal establishes a **task context cache** as a stable, immutable SSOT for agent coordination. Rather than repeatedly uploading task metadata, standards citations, and QA baselines in every agent prompt, we snapshot this immutable context once at task start. Agents read the stable context and write only minimal coordination flags (status, blocking findings). The cache lives in `.agent-output/TASK-XXXX/context.json`, uses the existing file-locking infrastructure from `TaskDatastore`, and purges automatically on task completion via lifecycle hooks in `TaskOperations`. The emphasis of this revision is on the context file format: how to keep it definitive yet concise, and how to gather the necessary information up front so later agents are not rehydrating the same facts manually.

---

## 1. Problem Statement & Observations

| Issue | Impact | Evidence |
|-------|--------|----------|
| **Redundant standards boilerplate** | Every handoff requires copying long excerpts from `standards/*.md`, increasing prompt size and introducing room for drift (different agents cite different paragraphs). | Implementer, reviewer, and validator agents each paste overlapping requirements in their prompts today. |
| **Repeated task metadata** | `.task.yaml` details get re-summarized multiple times, and partial edits can diverge from the canonical file, confusing downstream agents. | Task files average 150-250 lines of YAML; only portions make it into prompts, leading to selective quoting. |
| **QA baseline retransmission** | Lint/typecheck/test outputs from the implementer are retyped or screenshot, so reviewers cannot reliably diff results over time. | Validator prompts often ask for the same QA proof already produced earlier in the task. |
| **Session coupling to CLI** | Optimizations tied to a specific CLI require manual session tracking and break when the tooling changes. | Prior proposal (“claude-code-cli-token-optimization”) struggled with session TTLs and drift detection. |
| **No file-based audit trail** | Contextual notes live only in chat logs, which is incompatible with `standards/global.md` expectations for durable artifacts. | Evidence today is often a clipboard paste rather than a versioned file. |

**Root cause:** No persistent, immutable snapshot of task context exists for agents to reference. Everything is recopied by hand, so context drifts, becomes verbose, and lacks authoritative structure.

---

## 2. Goals & Non-Goals

### Goals
1. **Immutable, concise SSOT** – Snapshot task metadata, standards citations, and QA baselines *once* at task start in a format optimized for deterministic parsing (no free-form paste walls).
2. **Minimal coordination state** – Agents write only essential flags (implementer_done, reviewer_done, blocking_findings array) to coordinate handoffs without verbose notes.
3. **Lifecycle alignment** – Purge context automatically via `TaskOperations.complete_task()` hooks; no orphaned files, no manual cleanup burden.
4. **Proper abstractions** – Follow existing `TaskDatastore` patterns (FileLock, atomic writes, frozen dataclasses) for maintainability and testability.
5. **Audit trail** – Every context write stamps git HEAD, actor, and timestamp to satisfy `standards/global.md` evidence requirements.
6. **Front-loaded capture** – Provide automation to gather most of the needed information (task YAML, standards references, QA plan) up front so later agents rarely edit the immutable block.

### Non-Goals
- Replace `.task.yaml` as the source of truth for requirements or status.
- Support free-form agent notes/scratchpad (encourages verbose writes that burn tokens on reads).
- Store session IDs as required fields (agents may use context without Claude CLI).
- Guarantee cross-branch consistency; context is workspace-scoped and purged on branch switches.

---

## 3. Proposed Architecture

### 3.1 Storage Layout & Schema

```
.agent-output/
  TASK-0824/
    context.json        # immutable + coordination state
    metrics-implementer.json
    implementer-qa.log
    ...
  .context_store.lock   # shared lock file (reuses TaskDatastore pattern)
```

**Schema Design (Token-Optimized):**

`context.json` separates immutable SSOT from minimal coordination state:

```jsonc
{
  "version": 1,
  "task_id": "TASK-0824",
  "created_at": "2025-11-12T19:05:00Z",
  "created_by": "task-implementer",
  "git": {
    "head": "abc123",           // SHA at context creation
    "task_file_sha": "def456"   // SHA of .task.yaml content
  },

  // IMMUTABLE: Set once at task start, never modified; prevents agents from rehydrating divergent context
  "immutable": {
    "task_snapshot": {
      "title": "Refactor settings state management",
      "priority": "P1",
      "area": "mobile",
      "description": "...",      // Full description from task YAML
      "scope_in": ["..."],
      "scope_out": ["..."]
    },
    "standards_citations": [
      {"file": "standards/frontend-tier.md", "section": "#state-management", "requirement": "Redux Toolkit with slices"},
      {"file": "standards/testing-standards.md", "section": "#mobile-coverage", "threshold": "≥70% lines"}
    ],
    "validation_baseline": {
      "commands": ["lint:fix", "qa:static", "test"],
      "initial_results": {
        "lint": "0 errors, 0 warnings",
        "typecheck": "0 errors",
        "test": "42 passed, 0 failed"
      }
    },
    "repo_paths": ["mobile/src/store/**", "mobile/src/screens/SettingsScreen.tsx"]
  },

  // COORDINATION: Minimal mutable state for agent handoffs
  "coordination": {
    "implementer": {
      "status": "done",           // "pending" | "in_progress" | "done" | "blocked"
      "completed_at": "2025-11-12T20:30:00Z",
      "qa_log_path": ".agent-output/TASK-0824/implementer-qa.log",
      "session_id": "cc-session-123"  // Optional, for CLI session reuse
    },
    "reviewer": {
      "status": "done",
      "completed_at": "2025-11-12T21:15:00Z",
      "blocking_findings": [],    // Array of strings, empty = no blockers
      "qa_log_path": ".agent-output/TASK-0824/reviewer-qa.log"
    },
    "validator": {
      "status": "pending"
    }
  },

  // AUDIT: Updated on every coordination write
  "audit": {
    "last_updated_at": "2025-11-12T21:15:00Z",
    "last_updated_by": "implementation-reviewer",
    "update_count": 2
  }
}
```

**Key design decisions:**
- **Immutable section:** Read-only after creation so every agent reads the same authoritative snapshot.
- **No free-form notes:** Enforces minimal coordination to prevent unbounded growth and subjective paraphrasing.
- **Optional session_id:** Not required; agents work without Claude CLI dependency
- **Flat coordination structure:** Simple status flags, no nested objects except arrays
- **Size limit:** Entire file capped at 64 KiB (enforced at serialization time)

#### Format Principles for Concision

1. **Reference, don’t duplicate.** `standards_citations` stores `file` + `section` + short `requirement` text so agents jump to the clause in-repo rather than embedding paragraphs.
2. **Stable ordering.** Each list (e.g., `repo_paths`) is sorted at creation to make diffs minimal and deterministic.
3. **Digest fields.** The `git` block carries both the HEAD SHA and the `.task.yaml` blob SHA so agents can quickly detect drift without re-reading the entire document.
4. **Bounded strings.** Long-form descriptions (task description, acceptance criteria) are trimmed via canonical helpers that strip markdown comments, wrap at 120 chars, and redact irrelevant sections; detailed evidence lives in adjacent log files.
5. **Explicit provenance.** Every immutable subsection includes the source file path so future automation can reconverge or re-import if the cache must be regenerated.

### 3.2 Task Context Store API (Proper Abstractions)

Add `scripts/tasks_cli/context_store.py` following `TaskDatastore` patterns:

```python
from dataclasses import dataclass, field
from typing import Optional, Dict, List
from pathlib import Path
from filelock import FileLock
import json

@dataclass(frozen=True)
class TaskSnapshot:
    """Immutable task metadata snapshot (read-only after creation)."""
    title: str
    priority: str
    area: str
    description: str
    scope_in: List[str]
    scope_out: List[str]

@dataclass(frozen=True)
class StandardsCitation:
    """Reference to a standards requirement."""
    file: str  # e.g., "standards/frontend-tier.md"
    section: str  # e.g., "#state-management"
    requirement: str  # e.g., "Redux Toolkit with slices"

@dataclass(frozen=True)
class ValidationBaseline:
    """Initial QA command results (snapshot)."""
    commands: List[str]
    initial_results: Dict[str, str]

@dataclass(frozen=True)
class ImmutableContext:
    """Read-only context established at task start (never modified)."""
    task_snapshot: TaskSnapshot
    standards_citations: List[StandardsCitation]
    validation_baseline: ValidationBaseline
    repo_paths: List[str]

@dataclass
class AgentCoordination:
    """Mutable coordination state for one agent."""
    status: str = "pending"  # pending | in_progress | done | blocked
    completed_at: Optional[str] = None
    qa_log_path: Optional[str] = None
    session_id: Optional[str] = None
    blocking_findings: List[str] = field(default_factory=list)

@dataclass
class CoordinationState:
    """Minimal mutable state for agent handoffs."""
    implementer: AgentCoordination = field(default_factory=AgentCoordination)
    reviewer: AgentCoordination = field(default_factory=AgentCoordination)
    validator: AgentCoordination = field(default_factory=AgentCoordination)

class TaskContext:
    """Complete task context (immutable + coordination)."""
    def __init__(
        self,
        task_id: str,
        immutable: ImmutableContext,
        coordination: CoordinationState,
        git_head: str,
        task_file_sha: str,
    ):
        self.task_id = task_id
        self.immutable = immutable  # Frozen, cannot be modified
        self.coordination = coordination  # Mutable
        self.git_head = git_head
        self.task_file_sha = task_file_sha

    def to_dict(self) -> dict:
        """Serialize to JSON-compatible dict."""
        # Implementation details...

    @classmethod
    def from_dict(cls, data: dict) -> 'TaskContext':
        """Deserialize from stored JSON."""
        # Implementation details...

class TaskContextStore:
    """
    Manages persistent task context cache with proper abstractions.

    Follows TaskDatastore patterns:
    - FileLock for concurrency safety
    - Atomic writes (temp file + rename)
    - Frozen dataclasses for immutability
    - Lazy directory creation
    """

    def __init__(self, repo_root: Path):
        self.repo_root = repo_root
        self.context_dir = repo_root / ".agent-output"
        self.lock_file = self.context_dir / ".context_store.lock"
        self.context_dir.mkdir(parents=True, exist_ok=True)

    def init_context(
        self,
        task_id: str,
        immutable: ImmutableContext,
        git_head: str,
        task_file_sha: str,
    ) -> TaskContext:
        """
        Initialize context with immutable snapshot (called once at task start).

        Raises:
            ContextExistsError: If context already initialized for this task
        """
        with FileLock(str(self.lock_file), timeout=10):
            # Implementation: check not exists, create with immutable + empty coordination
            ...

    def get_context(self, task_id: str) -> Optional[TaskContext]:
        """
        Read task context (immutable + coordination).

        Returns None if context doesn't exist.
        Validates git_head staleness and warns if mismatched.
        """
        with FileLock(str(self.lock_file), timeout=10):
            # Implementation: load JSON, deserialize, validate git state
            ...

    def update_coordination(
        self,
        task_id: str,
        agent_role: str,
        updates: Dict[str, any],
        actor: str,
    ) -> None:
        """
        Update coordination state for one agent (atomic).

        Args:
            task_id: Task identifier
            agent_role: "implementer" | "reviewer" | "validator"
            updates: Dict of fields to update (status, completed_at, etc.)
            actor: Who is making the update (for audit trail)

        Raises:
            ContextNotFoundError: If context doesn't exist
            ValidationError: If updates exceed size limit or contain secrets
        """
        with FileLock(str(self.lock_file), timeout=10):
            # Implementation: load, update coordination only, validate, atomic write
            ...

    def purge_context(self, task_id: str) -> None:
        """
        Delete context directory for task (called by TaskOperations.complete_task).

        Idempotent - no error if already deleted.
        """
        with FileLock(str(self.lock_file), timeout=10):
            # Implementation: rm -rf .agent-output/TASK-XXXX/
            ...
```

**Design principles (matching TaskDatastore):**
- **Single shared lock** (`.agent-output/.context_store.lock`) eliminates deadlock risk
- **Frozen dataclasses** for immutable section (cannot be modified after creation)
- **Type safety** via dataclasses instead of generic dicts
- **Atomic writes** using temp file + os.replace() pattern
- **10-second timeout** consistent with TaskDatastore

### 3.3 CLI Surface

Extend `tasks_cli.__main__` with new verbs (following existing `--claim`/`--complete` patterns):

| Command | Description |
|---------|-------------|
| `python scripts/tasks.py --init-context TASK-0824` | Initialize context with immutable snapshot from task YAML + standards (called once at task start by task-runner) |
| `python scripts/tasks.py --get-context TASK-0824 [--format json]` | Read context (immutable + coordination); pretty-print or JSON output |
| `python scripts/tasks.py --update-agent TASK-0824 --agent implementer --status done --qa-log .agent-output/TASK-0824/impl-qa.log` | Update coordination state for one agent (atomic) |
| `python scripts/tasks.py --mark-blocked TASK-0824 --agent reviewer --finding "Missing unit test for X"` | Add blocking finding to agent coordination |
| `python scripts/tasks.py --purge-context TASK-0824` | Manual cleanup (normally auto-purged on completion) |

**No generic "set" command** - enforces structured updates via type-safe methods only.

**Integration with task-runner:**
- `task-runner` calls `--init-context` when task transitions to `in_progress` (before launching implementer agent)
- Agents call `--get-context` to load immutable SSOT (replaces uploading standards boilerplate)
- Agents call `--update-agent` after completing work (replaces verbose inline summaries)
- `complete_task()` calls `purge_context()` automatically

### 3.4 Lifecycle Hooks (Exact Integration Points)

**Modification to `scripts/tasks_cli/operations.py`:**

```python
# In TaskOperations.complete_task() - after line 122 (notification sent)

def complete_task(self, task: Task, archive: bool = True) -> Path:
    # ... existing logic: update status, archive file ...

    # Send success notification (line 118-122 existing)
    notifier = get_notification_service()
    notifier.notify_success(
        task_id=task.id,
        title=getattr(task, 'title', 'Task completed')
    )

    # NEW: Purge context after successful completion + notification
    try:
        context_store = TaskContextStore(self.repo_root)
        context_store.purge_context(task.id)
    except Exception as e:
        # Non-fatal: log warning but don't fail completion
        print(f"Warning: Failed to purge context for {task.id}: {e}", file=sys.stderr)

    return result_path
```

**Key decisions:**
1. **Purge AFTER notification:** Ensures notification can reference context data if needed
2. **Non-fatal errors:** Purge failure logs warning but doesn't block task completion (prevents orphaned contexts from blocking workflow)
3. **Idempotent purge:** `purge_context()` doesn't error if already deleted
4. **No guard in load_tasks():** REMOVED - lifecycle hooks are authoritative, no redundant cleanup logic in datastore

**Modification to `TaskOperations.archive_task()`:**

```python
# archive_task() already indirectly purges via status check
# Context purge happens when task status = 'completed' (handled by complete_task hook)
# No additional purge needed in archive_task()
```

**No changes to `TaskDatastore.load_tasks()`** - removed redundant guard logic mentioned in original proposal.

### 3.5 Access Control & Guardrails

**Size Limit Enforcement:**
- **64 KiB limit** applies to serialized JSON (after `json.dumps()`)
- Checked in `update_coordination()` before atomic write
- Rejection error: `ValidationError("Context size 68K exceeds 64 KiB limit. Store large data in .agent-output/TASK-XXXX/*.log files.")`
- Immutable section typically 10-15K; coordination minimal (2-3K); leaves headroom for findings arrays

**Secret Scanning:**
```python
# In TaskContextStore.update_coordination()
SECRET_PATTERNS = [
    r'AKIA[0-9A-Z]{16}',  # AWS access key
    r'sk_live_[a-zA-Z0-9]{24,}',  # Stripe live key
    r'eyJ[a-zA-Z0-9_-]+\.eyJ[a-zA-Z0-9_-]+\.',  # JWT
    r'-----BEGIN (RSA|DSA|EC|OPENSSH) PRIVATE KEY-----',  # Private keys
]

def _scan_for_secrets(data: dict) -> Optional[str]:
    """Recursively scan dict for secret patterns. Returns matched pattern or None."""
    json_str = json.dumps(data)
    for pattern in SECRET_PATTERNS:
        if re.search(pattern, json_str):
            return pattern
    return None

# In update_coordination():
if matched := _scan_for_secrets(updates):
    raise ValidationError(f"Potential secret detected (pattern: {matched}). Reference external secure storage instead.")
```

**Schema Versioning (Future-Proofing):**
```python
# version field in context.json enables migrations
# Current: version=1
# Future v2 example: add "dependencies" field to immutable
# Migration applied transparently in from_dict():

@classmethod
def from_dict(cls, data: dict) -> 'TaskContext':
    version = data.get('version', 1)
    if version == 1:
        # Load v1 format
        pass
    elif version == 2:
        # Load v2 format with backward compat
        pass
    else:
        raise ValueError(f"Unsupported context version: {version}")
```

**Staleness Detection:**
```python
def get_context(self, task_id: str) -> Optional[TaskContext]:
    context = # ... load from disk ...

    # Check git HEAD mismatch
    current_head = subprocess.check_output(['git', 'rev-parse', 'HEAD']).decode().strip()
    if context.git_head != current_head:
        print(f"Warning: Context created at {context.git_head[:8]}, current HEAD is {current_head[:8]}. Context may be stale.", file=sys.stderr)

    return context
```

---

## 4. Token Optimization Examples

### 4.1 Before (Without Context Cache)

**Implementer agent prompt:**
```
Task: TASK-0824 - Refactor settings state management
Priority: P1, Area: mobile

Description: [250 lines of task YAML] ...

Standards citations:
- standards/frontend-tier.md#state-management: Redux Toolkit with slices ...
- standards/testing-standards.md#mobile-coverage: ≥70% lines, ≥60% branches ...
[8-12K tokens of standards excerpts]

Validation commands:
- pnpm turbo run lint:fix --filter=photoeditor-mobile
- pnpm turbo run qa:static --filter=photoeditor-mobile
...
[2K tokens of command specifications]

Acceptance criteria: [1-2K tokens]

Total prompt: ~35-40K tokens
```

**Reviewer agent prompt:**
```
[Repeats all of the above: task, standards, validation commands]
Plus: Implementer's diff and QA results

Total prompt: ~45-50K tokens
```

**Validator agent prompt:**
```
[Repeats all of the above again]
Plus: Implementer + reviewer results

Total prompt: ~50-55K tokens
```

**Total token burn for one task:** 130-145K tokens

---

### 4.2 After (With Context Cache)

**task-runner initializes context:**
```bash
python scripts/tasks.py --init-context TASK-0824
# Creates .agent-output/TASK-0824/context.json (10-15K tokens)
# One-time snapshot: task metadata, standards citations, validation baseline
```

**Implementer agent prompt:**
```
Task context available at: .agent-output/TASK-0824/context.json
Read immutable section for task details, standards, and validation requirements.

[Agent reads context file locally - 0 tokens uploaded]

Implement the changes per context.immutable.standards_citations.

Total prompt: ~10-12K tokens (instructions only, no repeated metadata)
```

**Reviewer agent prompt:**
```
Task context: .agent-output/TASK-0824/context.json
Implementer status: done (see context.coordination.implementer)
QA log: .agent-output/TASK-0824/implementer-qa.log

[Agent reads context + QA log - 0 tokens for standards/task metadata]

Review diff against context.immutable.standards_citations.

Total prompt: ~12-15K tokens
```

**Validator agent prompt:**
```
Task context: .agent-output/TASK-0824/context.json
Prior agents: implementer=done, reviewer=done (see context.coordination)

[Agent reads context - 0 tokens for repeated data]

Run validation commands from context.immutable.validation_baseline.

Total prompt: ~10-12K tokens
```

**Total token burn for one task:** 32-39K tokens

**Savings: 98-106K tokens per task (70-75% reduction)**

---

### 4.3 Integration with Existing Infrastructure

- **Locking:** Reuses `FileLock` pattern from `TaskDatastore`; single shared lock at `.agent-output/.context_store.lock`
- **Atomic writes:** Follows temp file + `os.replace()` pattern (prevents torn reads)
- **CLI integration:** New `--init-context`, `--get-context`, `--update-agent` verbs parallel to existing `--claim`, `--complete`
- **Evidence trail:** Context file satisfies `standards/global.md` audit requirements (structured, versioned, timestamped)
- **Offline-friendly:** No external dependencies; works without Claude CLI or network access

---

## 5. Edge Cases & Mitigations

| Edge Case | Mitigation |
|-----------|------------|
| **Concurrent coordination updates** | Single shared lock (`.agent-output/.context_store.lock`) with 10s timeout prevents torn writes; agents retry on lock timeout |
| **Immutable section modified by mistake** | `ImmutableContext` uses frozen dataclass - raises `FrozenInstanceError` on modification attempts; only `update_coordination()` method can modify coordination state |
| **Context initialized twice** | `init_context()` checks existence, raises `ContextExistsError` if already initialized; prevents overwriting existing context |
| **Task completed but context remains** | Lifecycle hook in `complete_task()` purges automatically; non-fatal errors log warning but don't block completion |
| **Stale git HEAD (rebases/branch switches)** | `get_context()` compares `context.git_head` to current HEAD, prints warning if mismatched; agents can choose to re-init context or proceed |
| **Coordination updates exceed 64 KiB** | `update_coordination()` validates serialized size before write; raises `ValidationError` with guidance to store large data in separate `.log` files |
| **Secrets in coordination state** | `_scan_for_secrets()` checks updates against regex patterns (AWS keys, JWTs, private keys); raises `ValidationError` on match |
| **Task YAML modified after context init** | Context stores `task_file_sha`; agents can detect mismatch and re-init if needed (manual intervention) |
| **Orphaned contexts (task deleted)** | Manual cleanup: `python scripts/tasks.py --purge-context TASK-XXXX`; future enhancement: periodic sweep via cron |

---

## 6. Implementation Plan (Revised Estimate: 7-8 Days)

### Phase 0: Design Review (0.5 day)
- Review this proposal with maintainer
- Validate schema design and token optimization assumptions
- Confirm abstractions match existing patterns
- **Output:** Approved design doc

### Phase 1: Core Implementation (3 days)

**Day 1: Data models & schema**
- Define dataclasses (`TaskSnapshot`, `StandardsCitation`, `ImmutableContext`, `CoordinationState`, etc.)
- Implement `TaskContext.to_dict()` / `from_dict()` serialization
- Write schema validation tests
- **Output:** `scripts/tasks_cli/context_store.py` (models only, ~200 lines)

**Day 2: Store implementation**
- Implement `TaskContextStore` class (init, get, update, purge)
- Add file locking, atomic writes, size validation
- Add secret scanning with regex patterns
- Implement staleness detection
- **Output:** Complete `TaskContextStore` class (~300 lines)

**Day 3: Unit tests**
- Test immutable enforcement (frozen dataclass behavior)
- Test concurrent access (lock behavior)
- Test size limit rejection
- Test secret scanning patterns
- Test staleness warnings
- Test purge idempotency
- **Output:** `tests/test_context_store.py` (80%+ coverage matching `TaskDatastore`)

### Phase 2: CLI Integration (2 days)

**Day 4: CLI commands**
- Add `--init-context`, `--get-context`, `--update-agent`, `--mark-blocked`, `--purge-context`
- Implement JSON and pretty-print output modes
- Add error handling and user-friendly messages
- **Output:** Updated `scripts/tasks_cli/__main__.py` with new verbs

**Day 5: Lifecycle hooks**
- Modify `TaskOperations.complete_task()` to call `purge_context()`
- Add error handling (non-fatal purge failures)
- Test complete workflow (init → update → complete → purge)
- **Output:** Updated `scripts/tasks_cli/operations.py`

### Phase 3: Agent Adoption (1.5 days)

**Day 6: task-runner integration**
- Update `.claude/commands/task-runner.md` to call `--init-context` before launching implementer
- Update agent prompts to reference context file instead of embedding standards
- Test end-to-end: task-runner → implementer → reviewer → validator with context

**Day 7-8 (partial): Per-agent updates**
- Update implementer agent prompt to read context.immutable
- Update reviewer agent prompt to read coordination state
- Update validator agent prompt to use validation_baseline
- Measure token savings (before/after comparison)
- **Output:** Updated agent prompts, token metrics

### Phase 4: Documentation (1 day)

**Day 8: Docs & standards**
- Document context cache in `standards/AGENTS.md`
- Add usage guide to `tasks/README.md`
- Create troubleshooting guide (common errors, how to re-init context)
- Document token optimization metrics
- **Output:** Complete documentation

---

**Total: 7-8 developer-days** (vs original 3-day estimate)

**Risk buffer:** +1 day for unexpected integration issues = 8-9 days realistic timeline

---

## 7. Comparison to Alternative Approaches

| Dimension | Task Context Cache (This Proposal) | CLI Session Reuse | No Caching (Status Quo) |
|-----------|-----------------------------------|-------------------|-------------------------|
| **Token savings per task** | 98-106K saved (70-75% reduction) | 40-60K saved (per CLI proposal §4) | 0K (baseline: 130-145K) |
| **Implementation complexity** | 7-8 days, ~500 LOC, follows existing patterns | 3-5 days (per CLI proposal §6) but couples to CLI internals | N/A |
| **Vendor lock-in** | None - works with any agent/tool | Tied to Claude Code CLI session semantics | None |
| **Operational risk** | Low - local JSON + git metadata, deterministic | Medium - session drift, TTL uncertainty, CLI regressions | Low |
| **Observability** | High - file-based, versioned, auditable per `standards/global.md` | Medium - requires parsing CLI JSON, no structured history | Low - chat logs only |
| **Cleanup** | Automatic via lifecycle hooks | Manual scripts or stale session accumulation | N/A |
| **Offline support** | Yes - repo-local, no network | No - requires Claude CLI + API access | Yes |
| **Concurrency safety** | Single shared lock, proven pattern | Session ID bookkeeping, collision risk | N/A |

**Why this approach wins:**
1. **Higher token savings** (70-75% vs 40% from CLI sessions) by eliminating ALL redundant uploads, not just conversational context
2. **Vendor-neutral** - works with any LLM agent, not just Claude Code
3. **Audit trail** - structured evidence files satisfy standards requirements
4. **Lower operational risk** - no session TTLs, no CLI dependency, no drift detection needed
5. **Proven abstractions** - reuses existing `TaskDatastore` patterns (FileLock, atomic writes, frozen dataclasses)

**Tradeoff acknowledged:** Adds ~500 LOC vs reusing CLI infrastructure, but gains determinism and portability.

---

## 8. Open Questions & Future Enhancements

### Resolved (Built into Design)
- ❌ ~~Generic "set" command~~ → **Decision:** No generic set; only type-safe `--update-agent`, `--mark-blocked` to enforce structured coordination
- ❌ ~~Purge strategy~~ → **Decision:** Automatic via lifecycle hooks; manual `--purge-context` for edge cases; no periodic sweep initially
- ❌ ~~Locking approach~~ → **Decision:** Single shared lock (`.agent-output/.context_store.lock`) matching `TaskDatastore` pattern
- ❌ ~~Secret handling~~ → **Decision:** Regex-based scanning with `ValidationError` on match; no encryption-at-rest (repo access controls sufficient)

### Open for Future Work
1. **Performance optimization:** In-memory caching layer for frequently accessed contexts (if filesystem I/O becomes bottleneck)
2. **Periodic sweep command:** `--sweep-contexts --ttl 7d` to remove orphaned entries (low priority - lifecycle hooks handle 99% of cases)
3. **Enhanced staleness detection:** Auto-reinit context on git HEAD mismatch vs manual intervention
4. **Per-agent capabilities:** Encode allowed tools in coordination state to prevent misuse (defer until multi-tenant agent scenarios emerge)
5. **Compression:** If immutable sections exceed 10K frequently, consider gzip compression for context.json (premature optimization for now)

---

## 9. Decision & Next Steps

**Recommendation:** ADOPT this proposal.

**Rationale:**
- Achieves 70-75% token reduction (higher than CLI session approach)
- Vendor-neutral, auditable, follows existing patterns
- Realistic 7-8 day implementation timeline
- No operational brittleness from session management

**Next steps:**
1. Maintainer approval of this design doc
2. Create implementation task: `TASK-XXXX-context-cache-implementation.task.yaml`
3. Begin Phase 1 (core implementation) targeting ~8 day timeline
4. Measure token savings after Phase 3 agent adoption
5. Document findings in `docs/evidence/token-optimization-results.md`

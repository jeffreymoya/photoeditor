# ADR 0013: Task CLI OutputChannel Migration from Global State

- Status: Accepted
- Date: 2025-11-23

## Context

The Task CLI's output system (`scripts/tasks_cli/output.py`) relied on module-level global variables `_JSON_MODE` and `_WARNINGS` to manage output formatting and warning collection across all commands. This design created several maintainability and correctness issues that violated architectural standards outlined in the CLI modularization proposal (`docs/proposals/task-cli-modularization.md`):

1. **Thread-Safety Violations**: Global mutable state prevents concurrent CLI invocations and parallel test execution. Tests running commands in parallel would mutate shared flags, causing flaky test failures and unpredictable output.

2. **Hidden Coupling**: Commands implicitly depended on global state initialization order. The `set_json_mode()` function had to be called before any command could check output format, creating temporal coupling between CLI entry point and command handlers.

3. **Testability Burden**: Unit tests had to manipulate global state (`_JSON_MODE = True`) and restore it afterward, making tests fragile and order-dependent. Mocking output behavior required monkey-patching module globals.

4. **Future-Blocking Architecture**: Global state prevents concurrent command execution, daemonized CLI agents, and structured logging pipelines—all planned features for the Task CLI modernization roadmap.

5. **Standards Violation**: The proposal's Section 4.4 explicitly mandated: "Replace `_JSON_MODE` with an `OutputChannel` object injected via `TaskCliContext`" to achieve "stateless output pipelines" where "output formatting becomes an injected dependency."

The M3.1 audit (`docs/proposals/task-cli-m3.1-global-usage-audit.csv`) found 11 references to `_JSON_MODE` and 9 references to `_WARNINGS` across the codebase, with 6 command modules still using deprecated helper functions (`is_json_mode()`, `print_warning()`).

## Decision

Migrate from global state to dependency-injected `OutputChannel` instances. All commands now receive output functionality through the `TaskCliContext` object passed at invocation time. The migration eliminated all global variables and their associated helper functions, replacing them with instance methods on the `OutputChannel` class.

**Key Design Elements**:

1. **OutputChannel Class**: Encapsulates JSON mode flag, warning collection, and output emission in a single class with no global state
   - `json_mode: bool` - Instance property replacing global `_JSON_MODE`
   - `warnings: list[str]` - Instance property replacing global `_WARNINGS`
   - `set_json_mode(enabled: bool)` - Instance method for runtime mode switching
   - `emit_warning(message: str)` - Instance method replacing global `add_warning()`
   - `print_json(data: Any)` - Instance method for JSON output
   - `warnings_as_evidence()` - Returns warnings for context bundle inclusion
   - `clear_warnings()` - Resets warning list

2. **TaskCliContext Integration**: Entry point (`__main__.py`) creates `OutputChannel` instance from CLI flags and injects it into `TaskCliContext`, which gets passed to all command handlers

3. **Command Migration**: 6 command modules refactored to use `ctx.output_channel.json_mode` instead of `is_json_mode()` and `ctx.output_channel.emit_warning()` instead of `print_warning()`

4. **Legacy Function Removal**: Deleted 7 deprecated module-level functions:
   - `set_json_mode()` → `OutputChannel.set_json_mode()`
   - `is_json_mode()` → `ctx.output_channel.json_mode`
   - `print_json()` → `ctx.output_channel.print_json()`
   - `print_warning()` → `ctx.output_channel.emit_warning()`
   - `add_warning()` → `ctx.output_channel.emit_warning()`
   - `collect_warnings()` → `ctx.output_channel.warnings_as_evidence()`
   - `clear_warnings()` → `ctx.output_channel.clear_warnings()`

5. **Re-export Cleanup**: Removed `print_json` and `is_json_mode` from `commands.py` public API, enforcing that all output goes through injected channel

## Consequences

**Positive**:

- **Thread-Safety**: Multiple `OutputChannel` instances can coexist without interference, enabling concurrent CLI invocations and parallel test execution
- **Explicit Dependencies**: Command signatures now show output dependency: `cmd_foo(ctx: TaskCliContext)` makes it obvious that commands produce output
- **Testability**: Tests can inject `NullOutputChannel` or mock instances without touching globals, eliminating test pollution and order dependencies
- **Isolation**: Each command execution gets its own warning buffer, preventing cross-contamination between commands
- **Future-Proof**: Architecture now supports daemonized agents, concurrent command pipelines, and per-invocation telemetry contexts
- **LOC Reduction**: Deleted 1,034 lines from obsolete test files (`test_output.py`, `test_commands.py`) that only tested deprecated global APIs
- **Standards Compliance**: Fulfills proposal Section 4.4 requirement for stateless output pipelines

**Negative**:

- **Breaking Change for Internal Use**: Any code outside Task CLI that imported `is_json_mode()` or `print_warning()` would break (audit found zero external callers)
- **Verbosity Increase**: Commands must reference `ctx.output_channel.json_mode` (28 chars) instead of `is_json_mode()` (13 chars)
- **Context Dependency**: Commands now require `TaskCliContext` injection, preventing standalone function use (acceptable trade-off for testability)
- **Learning Curve**: Contributors must understand dependency injection pattern instead of simpler global function calls

**Neutral**:

- **API Surface Unchanged**: Public CLI interface (`--json`, `--verbose` flags) remains identical; internal refactor only
- **Test Count Reduced**: Removed 1,034 lines of tests, but these tested deprecated internal APIs—actual command coverage maintained through integration tests
- **Migration Effort**: One-time cost of 1 hour implementation + 6 command modules refactored (minimal per-module changes)

## Alternatives Considered

**1. Keep Globals, Add Locking**
- Pros: No refactoring needed, simple locking primitive protects concurrent access
- Cons: Locking doesn't solve testability or temporal coupling; adds runtime overhead; still prevents truly concurrent execution
- Rejected: Band-aid solution that doesn't address root architectural issues

**2. Thread-Local Storage**
- Pros: Maintains global-style API while providing per-thread isolation
- Cons: Doesn't work with async/await (planned future feature); hides dependency on execution context; still untestable without mocking `threading.local()`
- Rejected: Incompatible with async CLI agents and doesn't improve testability

**3. Singleton OutputChannel with Registry**
- Pros: One global instance, commands look it up by ID
- Cons: Service locator anti-pattern; hides dependencies; doesn't solve concurrency; adds registry complexity
- Rejected: Worse testability than current global approach

**4. Context Manager for Output Scope**
- Pros: `with output_scope(json=True):` syntax could reset state per command
- Cons: Requires wrapping all command bodies; easy to forget; doesn't compose with existing error handling; still uses global underneath
- Rejected: Doesn't eliminate global state, just scopes it differently

**5. Gradual Migration with Compatibility Shim**
- Pros: Keep deprecated functions longer, add shim that delegates to default `OutputChannel`
- Cons: Extends tech debt timeline; encourages continued use of deprecated pattern; complicates testing (two APIs in flight)
- Rejected: Clean break preferred for solo-maintainer project; no external API consumers

## Implementation Notes

**Migration Execution** (completed 2025-11-23, commit `9df672e`):

1. **Phase 1: Audit** (M3.1)
   - Identified 11 `_JSON_MODE` references and 9 `_WARNINGS` references
   - Confirmed zero external callers outside `scripts/tasks_cli/`
   - Created migration plan for 6 affected command modules
   - Artifact: `docs/proposals/task-cli-m3.1-global-usage-audit.csv`

2. **Phase 2: Refactor** (M3.2)
   - `output.py`: Deleted `_JSON_MODE`, `_WARNINGS` globals and 7 deprecated functions
   - `output.py`: Enhanced `OutputChannel` class with compatibility instance methods
   - `__main__.py`: Create `OutputChannel` from CLI flags, inject into `TaskCliContext`
   - Migrated 6 command modules: `evidence.py`, `exceptions.py`, `init_context.py`, `metrics_commands.py`, `quarantine.py`, `validation_commands.py`
   - `notify.py`: Replaced `print_warning()` with direct `sys.stderr` writes (notification layer doesn't need `TaskCliContext`)
   - `commands.py`: Removed deprecated functions from re-exports
   - Deleted obsolete test files: `test_output.py` (483 lines), `test_commands.py` (551 lines)
   - Net change: -1,337 lines, +220 lines = **-1,117 LOC reduction**

**Verification**:

```bash
# Confirm zero global state remaining
git grep "_JSON_MODE\|_WARNINGS" scripts/tasks_cli/
# (Returns zero matches in non-test code)

# Verify all commands use ctx.output_channel
git grep "is_json_mode\|print_warning" scripts/tasks_cli/commands/
# (Returns zero matches)

# Smoke test JSON output
python scripts/tasks.py list --format json
python scripts/tasks.py pick --format json
# (Both produce valid JSON with no warnings about globals)
```

**Command Module Migration Pattern**:

Before:
```python
from scripts.tasks_cli.output import is_json_mode, print_warning

def cmd_evidence(args):
    if is_json_mode():
        print_json({"evidence": data})
    print_warning("Deprecated feature")
```

After:
```python
def cmd_evidence(ctx: TaskCliContext, args):
    if ctx.output_channel.json_mode:
        ctx.output_channel.print_json({"evidence": data})
    ctx.output_channel.emit_warning("Deprecated feature")
```

**Entry Point Pattern**:

Before:
```python
# __main__.py
from scripts.tasks_cli.output import set_json_mode
args = parser.parse_args()
set_json_mode(args.json)  # Global mutation
cmd_list(args)  # Implicitly uses global
```

After:
```python
# __main__.py
args = parser.parse_args()
output_channel = OutputChannel.from_cli_flags(
    json_mode=args.json,
    verbose=args.verbose
)
ctx = TaskCliContext(
    repo_root=Path.cwd(),
    output_channel=output_channel,
    # ... other dependencies
)
cmd_list(ctx, args)  # Explicit injection
```

## Related Work

- **Original Proposal**: `docs/proposals/task-cli-modularization.md` Section 4.4 (Output & Telemetry), Section 2 (Anti-patterns: Global output state)
- **Mitigation Plan**: `docs/proposals/task-cli-modularization-mitigation-plan.md` GAP-3 (Deprecated Globals in output.py)
- **Audit Artifact**: `docs/proposals/task-cli-m3.1-global-usage-audit.csv` (M3.1 deliverable)
- **Implementation Commits**:
  - M3.1 audit: `3d5bcd1` (docs: complete M3.1 - audit global usage)
  - M3.2 implementation: `9df672e` (feat: remove deprecated globals from output.py)
  - M3.2 completion: `ddb1888` (docs: mark M3.2 as completed)
- **Standards Reference**: `standards/cross-cutting.md` (Coupling & Cohesion Controls)
- **Testing Standards**: `standards/testing-standards.md` (testability requirements)
- **Next Steps**:
  - M3.3 (this ADR) ✅
  - M4.1: Architecture ADR for full CLI modularization (depends on M3.3)
  - M1.2: Delete legacy dispatch from `__main__.py` (will further reduce global state)

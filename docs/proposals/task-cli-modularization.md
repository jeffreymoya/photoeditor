# Proposal: Task CLI Modularization & Maintainability Plan

**Status**: Draft – Ready for review  
**Author**: Codex Agent  
**Date**: 2025-11-20  
**Related Documents**:
- `tasks/README.md`
- `standards/cross-cutting.md`
- `docs/proposals/task-context-cache-hardening.md`
- `docs/proposals/task-deterministic-task-workflow.md`

---

## 1. Problem Statement

The Python Task CLI accreted 14k+ LOC across a handful of modules, with the entrypoint (`scripts/tasks_cli/__main__.py`) ballooning to 3,671 lines that mix argument parsing, datastore orchestration, and business rules. This violates the “single reason to change” expectation and coupling controls described in `standards/cross-cutting.md` (“Coupling & Cohesion Controls”), because changes to any command, serialization concern, or git interaction require touching the same mega-modules. The result is slow onboarding, brittle reviews, and duplicated logic (e.g., commands rehydrate dependency graphs even after `main()` has done the work).

---

## 2. Evidence & Anti-Patterns

| Anti-pattern | Evidence | Impact |
| --- | --- | --- |
| **Monolithic command dispatch** | `scripts/tasks_cli/__main__.py:215-392` defines `cmd_list`, `cmd_pick`, `cmd_validate`, etc., and the bottom of the file has a 200+ line `if/elif` chain that manually routes every flag instead of using sub-parsers. Even when `TaskPicker` and `DependencyGraph` are instantiated before dispatch, handlers such as `cmd_pick` immediately call `datastore.load_tasks()` and rebuild the graph (`scripts/tasks_cli/__main__.py:260-276`). | High risk of regressions when adding commands; wasted CPU from reloading state; reviewers cannot reason about a single responsibility per module as required by the standards deck. |
| **Legacy logic embedded in CLI entrypoint** | The supposedly superseded context initialization flow still lives inside the entrypoint (`scripts/tasks_cli/__main__.py:1472-1596`), performing git status calls, immutable snapshot building, and standards enrichment inline. | No clear seam between CLI UX and context cache services; hard to delete “legacy” behavior or reuse the logic elsewhere. |
| **Overloaded `TaskContextStore`** | `scripts/tasks_cli/context_store.py:1164-2635` mixes secret scanning, manifest writing, git delta tracking, untracked file classification, archive/QA evidence packaging, and compression fallbacks. | Any change to evidence handling, drift detection, or manifest schema touches the same 3,400-line class, violating the “single reason to change” policy and raising the Structural Debt Index. |
| **Duplication of platform/process calls** | Even though `git_utils` exists, both the entrypoint (`scripts/tasks_cli/__main__.py:1493-1523`) and context store (`scripts/tasks_cli/context_store.py:1651-1770`, `2528-2538`) shell out to git/tar directly with ad-hoc `subprocess.run` calls. | Scattershot error handling and timeout policies; impossible to mock these interactions in isolation tests; inconsistent recovery messaging. |
| **Command handlers instantiate heavy dependencies per call** | Every evidence/exception/quarantine command starts with `repo_root = Path.cwd()` and `TaskContextStore(repo_root)` (`scripts/tasks_cli/commands.py:381-446`, `449-520`, etc.). | Creates inconsistent repo-root resolution logic and makes the command layer untestable without touching the filesystem each time. |
| **Global output state** | `scripts/tasks_cli/output.py:36-155` uses module-level `_JSON_MODE` and `_WARNINGS`. Tests that run commands in parallel mutate global flags, and CLI invocations cannot stream results from multiple commands concurrently. | Hidden coupling forces serial execution and complicates future plans for daemonized agents or structured logging. |

---

## 3. Goals

1. **Single responsibility slices** – keep CLI wiring, orchestration services, git/process providers, and evidence/context storage in separate modules with clear contracts.
2. **Deterministic, testable command handlers** – handlers receive a `TaskCliContext` object (repo root, datastore, graph, context store, output adapter) so they do not perform global lookups or rehydrate expensive objects.
3. **Centralized process boundaries** – all git/tar/shell execution flows through audited provider classes with shared timeout, logging, and recovery guidance.
4. **Stateless output pipelines** – output formatting becomes an injected dependency so commands can stream structured responses without touching globals.

---

## 4. Proposed Architecture Changes

### 4.1 CLI Layering

- **Framework decision** – Standardize on `typer` for the rewritten CLI because it preserves existing `argparse`-style ergonomics, produces the shell completion scripts we already distribute via `tasks/README.md`, and keeps parity with other internal tools that rely on Typer’s callback model. `scripts/tasks_cli/app.py` becomes the single Typer `Typer()` instance; legacy `python -m scripts.tasks_cli` still works because `__main__.py` will import and execute the Typer app.
- **`TaskCliContext` contract** – Define a frozen `@dataclass` in `scripts/tasks_cli/context.py` with explicit fields (`repo_root: Path`, `datastore: TaskDataStore`, `graph: DependencyGraph`, `picker: TaskPicker`, `context_service: TaskContextService`, `process_provider: ProcessProvider`, `git_provider: GitProvider`, `output: OutputChannel`, `clock: Clock = SystemClock()`). The dataclass exposes helpers (`with_output(channel)`, `with_temp_graph(graph)`) that return copies for tests without mutating global state. All handlers accept `(ctx: TaskCliContext, args: CommandArgs)` and must be pure functions except for provider IO.
- **Handler modules** – Move implementations out of `__main__.py` into `scripts/tasks_cli/commands/` (one file per domain: `tasks.py`, `graph.py`, `context.py`, `evidence.py`, `exceptions.py`, etc.) and delete the 200-line manual dispatch block. Each module exports a `register(app: Typer)` function that wires Typer subcommands and documents required context slices.
- **Migration order** – Convert commands in three waves to keep diffs reviewable: (1) read-only commands (`list`, `show`, `validate`), (2) stateful but non-context commands (`pick`, `graph`, `templates`), (3) context/evidence/exception commands. After each wave we run `scripts/tasks_cli/tests/test_cli_integration_e2e.py` and `test_cli_smoke.py` plus manual regression noted in the driving task. Legacy `if/elif` dispatch stays until wave 2 ships, then gets deleted during wave 3.
- **Typer transition contract** – Maintain a CLI parity table (`docs/tasks_cli-typer-parity.md`) that maps every current flag/positional to its Typer equivalent, plus regenerated shell completion scripts for bash/zsh/fish. CI adds a smoke test that runs the legacy automation entrypoints (`make tasks-cli`, GitHub workflow helpers) against the Typer-backed binary before merging each wave so downstream scripts never break.
- **Dual-dispatch guardrails** – During waves 1-2, Typer routes through `TaskCliContext`, while the legacy dispatcher remains available behind a `TASKS_CLI_LEGACY_DISPATCH=1` env flag. A `dispatch_registry.yaml` manifest records which commands live where, and a lint check fails if a command appears in both registries. Once wave 2 ships, the legacy dispatcher loads only commands still listed in the manifest and logs deprecation warnings.

### 4.2 Context Store Decomposition

- Split the mega-class into focused modules:
  - `context_store/immutable.py` for snapshot + manifest building.
  - `context_store/delta_tracking.py` for worktree checksums/untracked file classification.
  - `context_store/evidence.py` for attachment/compression flows.
  - `context_store/qa.py` for QA baselines/log ingestion.
- Share dataclasses (e.g., `TaskContext`, `EvidenceAttachment`) via a new `context_store/models.py` so behaviours are explicit and typed.
- Provide a façade (`TaskContextService`) that composes these modules, keeping existing public API while allowing each slice to evolve independently.
- **Compatibility guarantees** – Introduce explicit manifest/evidence schema versions (stored inside each archive’s `manifest.json`) and add a backward-compat shim so older bundles can still be read. Any API that previously returned plain dicts now returns typed models but still exposes `.to_legacy_dict()` during transition. Concurrency-sensitive operations (snapshot locking, tmpdir management) move into a shared `context_store/runtime.py` helper so decomposed modules do not duplicate locking or logging. The façade is responsible for orchestrating retries and emitting deprecation warnings once legacy fields disappear.
- **Data migration plan** – Ship a `tasks context migrate --auto` command that scans cached bundles/S3 objects, rewrites manifests to the new schema version, and stores the legacy payload alongside a provenance footer for auditability. Regression suites cover round-trip conversions for every historical schema version, and CI backfills existing QA evidence fixtures to ensure drift detection comparisons remain identical after migration.

### 4.3 Process & Git Providers

- Expand `scripts/tasks_cli/git_utils.py` into a `providers` package:
  - `providers/git.py` exposes git operations with consistent timeouts, retries, and error classes.
  - `providers/process.py` wraps arbitrary shell commands (`tar`, `pnpm`) with structured logs and recovery hints.
- Command modules import these providers instead of calling `subprocess.run` directly. This brings git/tar behavior under a single policy surface and makes unit tests simple (mock the providers).
- **Interface sketch** – Both providers share a base `ProcessError` hierarchy (`CommandFailed`, `TimeoutExceeded`, `NonZeroExitWithStdErr`). `GitProvider` exposes methods like `status(repo_root, include_untracked: bool) -> GitStatus`, `ls_files(paths: list[str]) -> list[str]`, and `resolve_merge_base(branch: str) -> str`. `ProcessProvider` offers `run(cmd: list[str], *, cwd: Path | None = None, capture: bool = True, env: dict[str, str] | None = None, timeout: float = DEFAULT_TIMEOUT, redact: Sequence[str] = ()) -> CompletedProcess`. Both providers accept a `clock` and `logger` dependency so tests can fake timeouts and capture telemetry fields (`command`, `duration_ms`, `retry_count`, `stderr_preview`).
- **Adoption plan** – Phase 3 converts `context_store` first (because it shells out the most), then CLI commands, and finally helper scripts. During conversion we add a lint rule (`pnpm run lint:providers`) that rejects `subprocess.run` usage outside `providers/`.
- **Resilience & telemetry policy** – Providers centralize retry/backoff via Tenacity (`stop_after_attempt(3)`, `wait_exponential(min=0.5, max=8.0)`), emit OpenTelemetry spans (`cli.provider.git`, `cli.provider.process`), and funnel redacted stderr/stdout to the injected `OutputChannel` when `--verbose` is set. Secrets that cross provider boundaries must be tagged in the call site so `redact` scrubs them before logging.

### 4.4 Output & Telemetry

- Replace `_JSON_MODE` with an `OutputChannel` object injected via `TaskCliContext`. The object exposes `emit_json`, `emit_warning`, and `collect_warnings`.
- Allow handlers to attach progress events (e.g., pre/post git calls) so we can later pipe them to telemetry without reworking each command.
- **Flag compatibility** – `OutputChannel` implements `from_cli_flags(json_mode: bool, verbose: bool)` to preserve current `--json`/`--verbose` semantics. The class buffers warnings per command run, exposes `warnings_as_evidence()` so context bundles keep capturing them, and supports concurrent invocations by holding per-instance state only. Telemetry events adopt the `{event, command, phase, duration_ms, warning_count}` envelope so downstream log processing can chart regressions.
- **Testing hooks** – Provide `NullOutputChannel` and `BufferingOutputChannel` implementations so CLI tests can assert exact JSON/text output without mutating globals. A dedicated `test_output_channel.py` suite verifies that simultaneous channels don’t bleed warnings across commands.

### 4.5 Library Opportunities to Cut Boilerplate

- **Pluggy-driven command registration** – Treat each module under `scripts/tasks_cli/commands/` as a Pluggy plugin that exposes a `register_commands(hookspec)` hook. Qualitative metric: per-command scaffolding shrinks to hook declarations while Typer wiring stays centralized, so handler files only contain business logic (no import gymnastics or manual subcommand wiring) and can be inspected for SRP compliance at a glance.
- **Rich-powered OutputChannel** – Back the future `OutputChannel` with Rich (or `rich-click`) renderables so formatting, progress bars, and JSON pretty-print support come from a maintained library instead of bespoke helpers. Qualitative metric: CLI handlers exclusively emit domain events, and reviewers can diff UX changes inside a single formatter file rather than across multiple commands.
- **Schema libraries for models** – Adopt `pydantic` v2 or `attrs` for `TaskCliContext`, manifest/evidence models, and QA payloads. Qualitative metric: serialization/validation logic lives in declarative schema definitions, eliminating ad-hoc `to_dict`/`validate_*` helpers and reducing each model to a dozen lines without sacrificing type guarantees.
- **Tenacity-backed providers** – Use `tenacity` decorators for retry/backoff policies inside `providers/process.py` and `providers/git.py`. Qualitative metric: retry behavior becomes a shared annotation (e.g., `@retry(stop=stop_after_attempt(3))`), so provider methods focus on intent, and resilience posture can be reviewed centrally.
- **Native Git bindings** – Replace raw `subprocess.run(["git", ...])` calls with `GitPython` or `pygit2`, letting providers rely on typed return values instead of parsing stdout. Qualitative metric: git interactions collapse to simple Python method calls, shrinking the LOC needed for error handling and making unit tests pure-mock scenarios without process management boilerplate.

---

## 5. Implementation Plan

1. **Metrics & Guardrails (Day 0)**  
   - Add `pnpm run cli-guardrails` (wrapper around `python scripts/tasks_cli/checks/module_limits.py`) that fails CI when any CLI module exceeds 500 LOC or when `subprocess.run` appears outside provider modules. Wire the script into `pnpm turbo run qa:static --parallel` and `make backend-build`. The check starts as warning-only for the first milestone (tracked in the driving task) and flips to hard failure once Phase 2 lands.

2. **CLI Refactor (Phase 1)**  
   - Build `TaskCliContext`, move dispatcher to `app.py`, and convert the wave-1 commands (`list`, `show`, `validate`) to Typer subcommands.  
   - Keep the legacy dispatcher in place until wave 2 finishes; parity is enforced via CLI integration tests + a new fixture that snapshots `--json` output for each command.

3. **Context Store Extraction (Phase 2)**  
   - Carve out `delta_tracking`, `evidence`, and `immutable` modules from `context_store.py`.  
   - Update callers (commands + tests) to use the façade service while keeping serialized formats stable by versioning manifests and adding regression tests for bundle round-trips.  
   - Document new module ownership in `docs/` and add targeted unit tests for each slice, including concurrency/locking scenarios in `tests/context_store/test_runtime.py`.

4. **Process Provider Adoption (Phase 3)**  
   - Implement `providers/git.py` + `providers/process.py`, refactor `context_store` and CLI commands to depend on them, and remove direct `subprocess.run` usage.  
   - Extend the provider tests to simulate failures/timeouts, verify telemetry payloads, and ensure retry/backoff policies comply with `standards/cross-cutting.md` error-handling rules.

5. **Output Channel (Phase 4)**  
   - Introduce `OutputChannel`, refactor `output.py` to export the class instead of globals, and update commands/tests accordingly.  
   - Wire warnings into the context store so evidence bundles capture them without global state, and add load tests to confirm two CLI invocations can stream output concurrently without collision.

6. **Follow-up Cleanups (Phase 5)**  
   - Delete the legacy `cmd_init_context_legacy` path once the new service-backed command ships, and remove the `TaskCliContext` backward-compat helpers at the same time.  
   - Document the architecture in `docs/proposals/` and link the change from the driving task/ADR, including a final LOC guardrail report attached to the ADR.

---

## 6. Risks & Mitigations

| Risk | Mitigation |
| --- | --- |
| Behavior regressions while commands move | Keep `scripts/tasks_cli/tests/test_cli_integration_e2e.py` and `test_cli_smoke.py` in the loop; add golden fixtures for JSON/text outputs before refactor. |
| LOC guardblocks productivity until refactor completes | Start with warning-only checks for modules still in flight and flip to failures once each slice lands. |
| Provider abstraction hides useful stdout/stderr during debugging | Log raw command + stderr to the warning channel (behind `--verbose`) so diagnostics stay available. |
| Legacy callers import the old globals | Export backward-compatible shims (`from .output import get_default_channel`) during a short transition window and delete once consumers migrate. |

---

## 7. Success Metrics

- No CLI module exceeds 500 LOC, and `context_store.py` shrinks below 400 LOC with the remainder in dedicated submodules.
- `subprocess.run` usage is confined to `providers/git.py` and `providers/process.py`, verified by `pnpm run cli-guardrails` in CI.
- Integration tests demonstrate that command handlers no longer mutate global output state (parallel test execution passes without interference), and the new OutputChannel tests prove concurrent invocations keep warnings isolated.
- Task CLI onboarding docs cite the new module map, and future tasks reference specific slices instead of the monolith; the ADR links to telemetry dashboards showing provider error rates and Typer command adoption.
- CI’s Typer parity suite passes for every release (legacy automation entrypoints + shell completions), and telemetry shows >=95% of invocations flowing through the Typer dispatcher within two weeks of rollout.
- Cold start time for `tasks --help` stays under 400 ms on the reference M3 dev machine, and provider spans land in the shared OpenTelemetry collector with <1% error rate.

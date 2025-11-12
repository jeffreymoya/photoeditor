# Claude Code CLI Token Optimization Initiative

- **Author:** Codex Agent
- **Date:** 2025-11-11
- **Status:** Draft
- **Related Standards:** `standards/AGENTS.md`, `standards/global.md`, `standards/cross-cutting.md`, `standards/task-breakdown-canon.md`
- **Related Docs:** `.claude/agents/*.md`, `.claude/commands/*.md`, `CLAUDE.md`, `docs/proposals/deterministic-agent-automation.md`, `docs/prompts/draft-task-groomer-prompt.md`, `Claude Code CLI references` (see References)

## 1. Background & Problem Statement

The current `.claude` workflow issues long-form prompts to multiple agents (`task-implementer`, `implementation-reviewer`, and the three validation agents) regardless of scope. Each invocation re-sends the task YAML, diff audit checklist, standards citations, QA command logs, and reporting templates. Because both implementer and reviewer run on `sonnet`, and validation agents independently reload the same situational context, average token burn per task keeps climbing even for single-file changes. The `groom-drafts` command further amplifies usage by restating evidence and question lists each user turn.

Meanwhile, Claude Code CLI offers affordances to stream structured contexts, reuse sessions, and constrain file ingestion without the extra conversational ceremony our prompts currently require. None of those capabilities are wired into `.claude/commands/task-runner.md`, so agent orchestration ignores model/session-level levers that could reduce total tokens by 30–50% while improving determinism.

## 2. Relevant Claude Code CLI Capabilities

1. **Prompt-only (`-p`) plus session continuation (`-c`, `-r/--resume`) flags** — enable scripted runs that feed a precompiled prompt and optionally append follow-up instructions to the same session; `-c` only resumes the most recent conversation in the working directory, while `-r` reattaches to an explicit `session_id` (snapshot behavior not explicitly documented but inferred to avoid full re-upload). [1]
2. **Structured outputs (`--output-format json` / `stream-json`)** — allow headless parsing of command status, cost, and completion metadata so `task-runner` can cache results and skip regenerating long textual summaries. [1][2]
3. **Headless automation flags (still the `claude` binary)** — non-interactive runs rely on `claude -p` with `--allowedTools`, `--permission-mode`, and `--output-format json/stream-json`; there is no separate `claude headless` subcommand or `claude.config.ts`, so automation must wrap the existing CLI directly. [2]
4. **Scoped filesystem & MCP access (`--add-dir`, `claude mcp …`)** — `--add-dir` only adds extra directories for the current run; real scoping requires launching the CLI from trimmed working trees and optionally exposing read-only MCP servers so the model only ingests what we mount. [1][2]
5. **Model/context budgeting (200K standard, 1M beta on Sonnet 4/4.5)** — while 1M-token contexts exist, they require the Sonnet 4/4.5 aliases plus the current beta header; Haiku 4.5 standard context is 200K (official docs do not confirm 1M beta support for Haiku, unlike Sonnet 4/4.5), so we must explicitly downshift or escalate models per task. [3]

## 3. Proposal Overview

We will build a Claude Code CLI-aware orchestration layer that sits between `task-runner` and `.claude/agents`, providing cached prompt capsules, scoped file ingestion, and automated token reporting. The initiative rolls out in three phases:

### Phase 1 — Prompt Capsule & Session Cache (Weeks 1–2)
- Generate compact “prompt capsules” per agent (implementer, reviewer, groomer, validators) that embed only role-specific deltas. Capsules live under `.claude/prompts/*.md` and are passed to the CLI via `claude -p --output-format json` from lightweight wrapper scripts.
- Task-runner maintains a session cache keyed by `{task_id}:{agent}`; first invocation streams the task YAML + capsule, later retries reuse the returned `session_id` via `claude -r {session_id} --message …` because `-c/--continue` only attaches to the most recent conversation in the working directory.
- Record token usage (cost/duration) from `--output-format json` for every run, back-calculate approximate tokens via the published per-model pricing table, and write the result to `.agent-output/{task_id}-{agent}-metrics.json`. Use the metrics to set guardrails (alert at >1.5x budget). 

### Phase 2 — Scoped Context & Model Right-Sizing (Weeks 3–4)
- Launch each agent from a trimmed working tree (git sparse-checkout or temp copy) so the CLI's default ingestion already matches `context.repo_paths`; fall back to `--add-dir` only when we must mount additional folders. Note: `--add-dir` is documented to add directories but cannot shrink the baseline snapshot (inferred from absence of shrinking capability in official docs).
- Add a model selection heuristic: default to the `haiku` alias (Claude 4.5 Haiku, 200K context) for documentation-only and single-file refactors; escalate to the `sonnet` alias (Claude 4/4.5 Sonnet, with optional 1M beta context) only when `context.repo_paths` spans ≥3 packages or QA evidence flags complex diffs. Task-runner records the decision and whether the 1M context header was requested.
- Update `.claude/commands/task-runner.md` to skip spawning validation agents whose packages were untouched, relying on the CLI metrics and recorded `session_id` footprints to verify zero-touch scopes.

### Phase 3 — Headless Automation & Deterministic Outputs (Weeks 5–6)
- Author lightweight wrapper scripts (Node CLI or Bash) for each agent that invoke `claude -p --output-format json --allowedTools ...`, load the capsule, run required repo commands, and emit artifacts into `.agent-output/`.
- Replace the conversational `groom-drafts` loop with a scripted checklist runner that consumes/produces structured JSON (via the CLI output) to keep outstanding questions synchronized without free-form summaries.
- Extend `docs/agents/common-validation-guidelines.md` and `CLAUDE.md` with these wrapper expectations and failure modes so future standards changes flow through a single switch.

## 4. Expected Impact & Metrics

- **Token Reduction:** Target 40% lower median tokens per task by gating Sonnet usage and reusing sessions. Success when three-task rolling median drops below 65K tokens vs current ~110K.
- **Runtime:** Shrink average agent turnaround by 25% because cached sessions skip repo re-uploads.
- **Determinism:** Automation wrappers + structured outputs reduce variability in summaries and make it easier to diff check agent conclusions against CLI metrics.
- **Observability:** `.agent-output/*-metrics.json` plus the wrapper logs provide auditable proof for each standards citation, aligning with `standards/global.md` evidence requirements.

## 5. Risks & Mitigations

- **Session cache drift & collisions:** If task files change mid-run or multiple agents share a working directory, cached `session_id`s can serve stale context; include git `HEAD` and `task_sha` in the cache key and prefer `-r/--resume {session_id}` instead of `-c` so concurrent sessions stay isolated.
- **Model misclassification:** Automatic Haiku (4.5) selection might miss complex deltas. Mitigation: allow an override flag in the task YAML (`force_sonnet: true`) and log all automatic downgrades for manual review, especially when 1M contexts are required.
- **Haiku context overflow:** If Haiku tasks approach 200K context limit without 1M beta support, they may fail mid-execution. Mitigation: monitor context size and auto-escalate to Sonnet when Haiku context exceeds 180K (90% threshold), logging the escalation reason in metrics.
- **Session staleness & cleanup:** Sessions may persist indefinitely or expire without clear TTL documentation. Mitigation: implement explicit session cleanup after task completion via wrapper scripts, handle "session not found" errors gracefully, and add manual cleanup command for stale sessions.
- **Validation skipping false negatives:** Auto-skipping validation for "untouched" packages may miss shared dependency changes (e.g., `shared/` contract updates affecting multiple packages). Mitigation: use conservative heuristics—only skip when task explicitly declares single-package scope and git diff confirms zero changes in shared dependencies.
- **1M context account tier requirements:** 1M beta context requires usage tier 4 or custom rate limits; solo developer accounts may not qualify. Mitigation: verify account tier during Phase 1 setup, document fallback to 200K Sonnet if 1M unavailable, and include tier verification in implementation checklist.
- **CLI regressions:** Upstream CLI changes could break the wrapper scripts. Mitigation: track CLI versions via `claude --version` in `docs/agents/tooling.md`, pin via package manager (npm/homebrew) or Docker images, add smoke tests to CI, and keep a fallback interactive path.
- **Operational overhead:** Building capsules and wrappers requires initial effort. Mitigation: re-use content from existing `.claude/agents/*.md`, keep capsules under 400 tokens, and document maintenance ownership in `standards/AGENTS.md`.
- **Pricing drift:** Token alerts depend on translating `total_cost_usd` via the public pricing table; schedule a quarterly check so budgets stay accurate when Anthropic updates rates. 

## 6. Implementation Checklist

### Phase 0 — Pre-Implementation Verification
1. **Verify 1M context access:** Check account usage tier via Anthropic Console; document tier level and whether 1M beta context is available. If unavailable, adjust Phase 2 model selection to cap Sonnet at 200K.
2. **Baseline token audit:** Run current agent workflow on 3-5 representative tasks (simple/medium/complex), record token counts from interactive sessions, establish baseline for comparison.

### Phase 1 — Prompt Capsules & Session Cache
3. Inventory current agent prompts (`.claude/agents/*.md`), extract role-specific deltas, and publish capsules under `.claude/prompts/` (target ≤400 tokens each).
4. Enhance `scripts/tasks_cli` to launch agents via `claude -p --output-format json`, capture `session_id`, and log metrics in `.agent-output/{task_id}-{agent}-metrics.json`.
5. **Pilot single task:** Run one medium-complexity backend task through capsule workflow end-to-end (implementer → reviewer → validator); record token savings, errors, and session reuse success rate in `docs/evidence/tasks/TASK-XXXX-phase1-pilot.md`.
6. Implement session cache with `{task_id}:{agent}:{git_HEAD}:{task_sha}` keys; add `-r/--resume` logic for retries.
7. Build token alert system (>1.5x budget threshold); validate against baseline audit from step 2.

### Phase 2 — Scoped Context & Model Right-Sizing
8. Prototype scoped context ingestion via sparse-checkout for one backend task; record before/after token counts and compare to Phase 1 pilot.
9. Implement model selection heuristic with Haiku default, Sonnet escalation rules, and `force_sonnet: true` override in task YAML schema.
10. Add Haiku context overflow detection (180K threshold) with auto-escalation to Sonnet; log escalation events to metrics.
11. Update `.claude/commands/task-runner.md` with validation skipping logic (conservative heuristic: single-package scope + zero shared changes).

### Phase 3 — Headless Automation & Deterministic Outputs
12. Draft CLI wrapper scripts (Node/Bash) for task implementer and reviewer with `--allowedTools` and `--permission-mode`; test permission isolation.
13. Expand wrappers to validators once pattern is stable; document tool filtering strategy per agent type.
14. Replace conversational `groom-drafts` loop with scripted JSON-based checklist runner.
15. Implement session cleanup logic in wrappers (post-task completion) and manual cleanup command for stale sessions.
16. Update `docs/agents/common-validation-guidelines.md` and `.claude/commands/*.md` with CLI-backed workflow, failure modes, and overrides.

### Phase 4 — Documentation & Standards CR
17. Document session TTL handling strategy and "session not found" error recovery in `docs/agents/tooling.md`.
18. Add CLI version tracking (`claude --version`) and pinning strategy (npm/homebrew/Docker) to `docs/agents/tooling.md`.
19. File a Standards CR documenting the new automation expectations, token budgets, and model selection heuristics.

## 7. Open Questions

1. Should we allow the automation wrappers to auto-commit lint fixes, or keep changes manual for transparency?
2. How should token budgets vary by task priority (e.g., P0 incidents vs routine chores)?
3. Do we need per-agent MCP servers (e.g., read-only vs read/write) to further isolate data exposure?
4. Should validation skipping use conservative heuristics (explicit single-package declarations) or aggressive heuristics (automatic git diff analysis with shared dependency tracking)?
5. What is the practical session TTL based on testing, and should we implement proactive refresh vs reactive cleanup?

---

**References**

1. Claude Code CLI reference — commands, prompts, `--output-format json`, `--add-dir`, `--allowedTools`, and session controls (`-p`, `-c`, `-r/--resume`).
2. Claude Code CLI automation guide — using `claude -p` with `--permission-mode`, `--allowedTools`, and structured outputs for headless workflows.
3. Claude models & context window overview — Sonnet 4/4.5 (1M beta context), Haiku 4.5 (200K context), alias behavior, and pricing guidance.

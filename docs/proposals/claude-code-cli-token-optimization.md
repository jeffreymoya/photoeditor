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

1. **Prompt-only (`-p`) and conversation continuation (`-c`, `-r`) flags** — enable scripted runs that feed a precompiled prompt and optionally stitch follow-up messages into the same session without re-uploading the repository snapshot, cutting redundant context streaming. [1]
2. **Structured outputs (`--output-format json`)** — allow headless parsing of command status, token usage, and completion metadata so `task-runner` can cache results and skip regenerating long textual summaries. [1]
3. **Headless mode (`claude headless`)** — runs scripts defined in `claude.config.ts`, supports `--allowedTools`, `--concurrency`, `--output-dir`, and integrates with Claude Workbench/Projects to execute deterministic workflows without an interactive shell. [2]
4. **Scoped filesystem ingestion (`claude --add-dir`, `claude mcp configure`)** — points the CLI at a limited set of directories or MCP servers so the model only pays to read what is relevant (for example, a single Lambda or task YAML). [1][2]
5. **Long-context budgeting (1M tokens on Claude 3.5 Sonnet, 200K on Haiku)** — while massive contexts are available, they are expensive; the CLI exposes them per run so we can downshift small tasks to Haiku or short contexts and reserve Sonnet+1M only when the diff demands it. [3]

## 3. Proposal Overview

We will build a Claude Code CLI-aware orchestration layer that sits between `task-runner` and `.claude/agents`, providing cached prompt capsules, scoped file ingestion, and automated token reporting. The initiative rolls out in three phases:

### Phase 1 — Prompt Capsule & Session Cache (Weeks 1–2)
- Generate compact “prompt capsules” per agent (implementer, reviewer, groomer, validators) that embed only role-specific deltas. Capsules live under `.claude/prompts/*.md` and are passed to the CLI via `claude -p` or `claude headless run capsule-{agent}`.
- Task-runner maintains a session cache keyed by `{task_id}:{agent}`; first invocation streams the task YAML + capsule, later retries leverage `claude -c {session}` (continue) or `claude -r {session} --message` to append new info instead of replaying everything.
- Record token usage from `--output-format json` for every run and write to `.agent-output/{task_id}-{agent}-metrics.json`. Use the metrics to set guardrails (alert at >1.5x budget). 

### Phase 2 — Scoped Context & Model Right-Sizing (Weeks 3–4)
- Integrate `--add-dir` and MCP configs so each agent only mounts the files specified in `context.repo_paths` within the task YAML. This avoids uploading the entire monorepo for narrowly scoped fixes.
- Add a model selection heuristic: default to `claude-3.5-haiku` for documentation-only and single-file refactors; escalate to `claude-3.5-sonnet` only when `context.repo_paths` spans ≥3 packages or QA evidence flags complex diffs. Task-runner records the decision in the agent summary.
- Update `.claude/commands/task-runner.md` to skip spawning validation agents whose packages were untouched, relying on the CLI metrics to verify zero-touch scopes.

### Phase 3 — Headless Automation & Deterministic Outputs (Weeks 5–6)
- Author `claude.config.ts` headless scripts for each agent; scripts load the capsule, run required repo commands (lint/typecheck/tests) via `--allowedTools`, and emit structured artifacts into `.agent-output/`.
- Replace the conversational `groom-drafts` loop with a headless checklist runner that updates the outstanding questions table via structured JSON patches instead of free-form summaries.
- Extend `docs/agents/common-validation-guidelines.md` and `CLAUDE.md` with the CLI guardrails, referencing the new automation so future standards changes flow through a single switch.

## 4. Expected Impact & Metrics

- **Token Reduction:** Target 40% lower median tokens per task by gating Sonnet usage and reusing sessions. Success when three-task rolling median drops below 65K tokens vs current ~110K.
- **Runtime:** Shrink average agent turnaround by 25% because cached sessions skip repo re-uploads.
- **Determinism:** Headless scripts + structured outputs reduce variability in summaries and make it easier to diff check agent conclusions against CLI metrics.
- **Observability:** `.agent-output/*-metrics.json` plus the headless logs provide auditable proof for each standards citation, aligning with `standards/global.md` evidence requirements.

## 5. Risks & Mitigations

- **Session cache drift:** If task files change mid-run, cache invalidation could cause stale context. Mitigation: include git `HEAD` and `task_sha` in the session key; invalidate when either changes.
- **Model misclassification:** Automatic Haiku selection might miss complex deltas. Mitigation: allow override flag in task YAML (`force_sonnet: true`) and log all automatic downgrades for manual review.
- **CLI regressions:** Upstream CLI changes could break headless scripts. Mitigation: pin CLI versions via `claude update --version` records in `docs/agents/tooling.md`, add smoke tests to CI, and keep a fallback interactive path.
- **Operational overhead:** Building capsules and headless scripts requires initial effort. Mitigation: re-use content from existing `.claude/agents/*.md`, keep capsules under 400 tokens, and document maintenance ownership in `standards/AGENTS.md`.

## 6. Implementation Checklist

1. Inventory current agent prompts, extract role-specific deltas, and publish capsules under `.claude/prompts/`.
2. Enhance `scripts/tasks_cli` to launch agents via `claude -p` / `-c` with `--output-format json`, logging metrics in `.agent-output/`.
3. Prototype scoped context ingestion for one backend task; record before/after token counts in `docs/evidence/tasks/TASK-XXXX-token-study.md`.
4. Draft `claude.config.ts` headless scripts for task implementer and reviewer; expand to validators once the pattern is stable.
5. Update `docs/agents/common-validation-guidelines.md` and `.claude/commands/*.md` with the CLI-backed workflow, including failure modes and overrides.
6. File a Standards CR documenting the new automation expectations and token budgets.

## 7. Open Questions

1. Should we allow headless scripts to auto-commit lint fixes, or keep changes manual for transparency?
2. How should token budgets vary by task priority (e.g., P0 incidents vs routine chores)?
3. Do we need per-agent MCP servers (e.g., read-only vs read/write) to further isolate data exposure?

---

**References**

1. Claude Code CLI reference — commands, prompts, `--output-format json`, `--add-dir`, and session controls (`-p`, `-c`, `-r`).
2. Claude Code CLI headless mode guide — `claude headless`, configuration file structure, and automation flags.
3. Claude 3.5 model/context window overview — Sonnet 3.5 (1M context), Haiku 3.5 (200K context) and intended use cases.

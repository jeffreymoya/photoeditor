# Common Validation Agent Guidelines

Shared expectations for `test-validation-backend`, `test-validation-mobile`, and `test-validation-shared`. Whenever you update this file, review the individual agent prompts for conflicts.

## Core Checklist
1. Load context: task YAML, latest implementation summary, current git status.
2. Run the static/fitness commands enumerated in `standards/qa-commands-ssot.md` and capture real exit codes.
3. Execute the tier’s unit/contract test suite with coverage enabled.
4. If something fails, attempt up to **two** rounds of narrowly scoped fixes (lint autofix, import wiring, mocks, dependency violations, schema typos). After each round, rerun **all** validation commands.
5. Decide status strictly from command results (PASS, FAIL, or BLOCKED).
6. Write the dated validation report under `docs/tests/reports/`.
7. Produce the final status line expected by task-runner.

## Hard-Fail Guardrails
- Never mute or downgrade tests to achieve green runs (no `it.skip`, watered-down assertions, or coverage threshold edits). Follow `standards/testing-standards.md`.
- Never relax lint/TypeScript settings (`@ts-ignore`, `eslint-disable`, tsconfig downgrades). Standards changes must go through a Standards CR per `standards/standards-governance-ssot.md`.
- If the proper fix exceeds the “simple issue” scope, stop after the second attempt and return BLOCKED with notes.

## Scope for Quick Fixes
- Lint autofixes, dependency graph cleanups, import resolution.
- Mock wiring and configuration for frameworks (e.g., Expo modules, AWS SDK clients).
- Straightforward type or schema corrections that do not change public contracts.

## When to Defer
- Business logic bugs, feature gaps, and architectural refactors.
- Breaking API or schema changes that require version bumps (see ADR-0005).
- Coverage deficits that stem from missing tests rather than failing infrastructure.
- Issues that imply new or updated standards—open a Standards CR instead.

## Reporting Expectations
- Reference standards by ID plus a short paraphrase (no full quote blocks).
- Note every command executed and whether it was rerun after fixes in the report.
- Highlight residual risks or follow-up work so the solo maintainer can act quickly.

# Common Validation Agent Guidelines

Shared expectations for `test-validation-backend`, `test-validation-mobile`, and `test-validation-shared`. Whenever you update this file, review the individual agent prompts for conflicts.

## Core Checklist
1. Load context: task YAML, latest implementation summary, current git status.
2. Reference infrastructure environment registry at `docs/infra/environment-registry.json` for deployed resource identifiers when validating infrastructure-related changes (per `standards/infrastructure-tier.md` L12 and `standards/cross-cutting.md` L121-133).
3. Run the static/fitness commands from `standards/qa-commands-ssot.md` that remain in validation scope (everything other than lint/typecheck) and capture real exit codes.
4. Execute the tier's unit/contract test suite with coverage enabled.
5. If something fails, attempt up to **two** rounds of narrowly scoped fixes (import cleanup, dependency wiring, mocks, schema typos). After each round, rerun every validation command still in scope. Surface unexpected lint/typecheck regressions back to implementer/reviewer unless the fix is truly trivial—document the handoff in your report.
6. Decide status strictly from command results (PASS, FAIL, or BLOCKED).
7. Write the dated validation report under `docs/tests/reports/`.
8. Produce the final status line expected by task-runner.

## Hard-Fail Guardrails
- Never mute or downgrade tests to achieve green runs (no `it.skip`, watered-down assertions, or coverage threshold edits). Follow `standards/testing-standards.md`.
- Never relax lint/TypeScript settings (`@ts-ignore`, `eslint-disable`, tsconfig downgrades). Standards changes must go through a Standards CR per `standards/standards-governance-ssot.md`.
- If the proper fix exceeds the “simple issue” scope, stop after the second attempt and return BLOCKED with notes.

## Scope for Quick Fixes
- Dependency graph cleanups, import resolution, or other light edits required by the remaining static/fitness commands.
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

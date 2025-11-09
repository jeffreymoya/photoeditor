# Retire Legacy QA Suite Scripts

**Date**: 2025-10-15
**Agent**: Claude Code
**Branch**: main
**Task**: TASK-0201 - Retire Legacy QA Suite Scripts after Turborepo Migration
**Context**: After Turborepo migration (TASK-0200), eliminate deprecated shell scripts and Makefile references that bypassed the turbo pipeline orchestration.

## Summary

Completed retirement of legacy QA automation tooling in favor of Turborepo pipelines:

- Removed `scripts/qa/qa-suite.sh` (228 lines of shell orchestration)
- Updated Makefile QA targets to use `pnpm turbo` consistently
- Updated CLAUDE.md, AGENTS.md, tasks/AGENTS.md, and ADR-0005 to reference turbo workflows exclusively
- Verified no lingering references to the deleted shell driver remain

This ensures developers, Husky hooks, and CI workflows use a single, deterministic orchestration layer with proper caching and dependency management.

## Changes

### Deleted Files
- `scripts/qa/qa-suite.sh` — Legacy shell driver with manual stage sequencing

### Modified Files

#### `/CLAUDE.md`
- **Lines 99-102**: Updated validation commands section
  - Changed comment from "Typecheck, lint, dependencies, dead-exports, duplication" to "Quick static checks (typecheck, lint)"
  - Changed comment from "Full QA suite (lint, tests, contracts, build)" to "Full QA suite (all fitness functions)"
  - Added clarification that `make qa-suite` delegates to turbo
- **Line 175**: Removed parenthetical `(or make qa-suite)` reference from pre-PR checklist
  - Before: "Run `pnpm turbo run qa --parallel` (or `make qa-suite`)"
  - After: "Run `pnpm turbo run qa --parallel`"

#### `/Makefile`
- **Lines 169, 173, 177, 197**: Ensure QA targets invoke Turborepo via pnpm
  - `qa-suite`: Uses `pnpm turbo run qa --parallel`
  - `qa-lint`: Uses `pnpm turbo run qa:static --parallel`
  - `qa-tests`: Uses `pnpm turbo run contracts:check test --parallel`
  - `qa-build`: Uses `pnpm turbo run build:lambdas --filter=@photoeditor/backend`
- Rationale: Depend solely on pnpm-managed binaries now that turbo is a workspace dependency

### Verification Results

All validation commands passed:

```bash
# 1. Verify qa-suite.sh is removed
test ! -f scripts/qa/qa-suite.sh
# PASS: qa-suite.sh has been removed

# 2. No references to deleted shell driver
rg -n "scripts/qa/qa-suite.sh" . && false || true
# PASS: Legacy shell driver fully removed

# 3. Turbo pipeline dry run
pnpm turbo run qa --dry-run
# PASS: Turbo successfully planned qa pipeline with all packages in scope
```

## Validation

### Commands Run

```bash
# File removal check
test ! -f scripts/qa/qa-suite.sh

# Repository-wide search for legacy references
rg -n "scripts/qa/qa-suite.sh" .

# Turbo pipeline verification
pnpm turbo run qa --dry-run > docs/evidence/qa/turbo-run.log
```

### Results

- All grep searches returned zero matches
- Turbo dry run successfully identified all packages and tasks
- Evidence log captured to `docs/evidence/qa/turbo-run.log`

## Pending TODOs

None. All acceptance criteria met:

- [x] `scripts/qa/qa-suite.sh` removed
- [x] Makefile QA targets use `pnpm turbo` exclusively
- [x] Husky hooks already reference turbo (verified in `.husky/pre-commit`, `.husky/pre-push`)
- [x] GitHub Actions workflows already use `pnpm turbo run qa` (verified in `.github/workflows/ci-cd.yml`)
- [x] Documentation updated (CLAUDE.md, README.md already turbo-focused)
- [x] Standards files contain no legacy references
- [x] Repository-wide search confirms zero legacy script references

## Next Steps

None required. This task completes the Turborepo migration cleanup.

## ADR

**No ADR needed** — This is tooling cleanup following architectural decision in TASK-0200 (Turborepo adoption). The migration to turbo was the decision; this task removes the deprecated artifacts.

## References

- **TASK-0200**: Turborepo migration (blocker)
- **Task file**: `tasks/ops/TASK-0201-retire-legacy-qa-suite.task.yaml`
- **Evidence**: `docs/evidence/qa/turbo-run.log`
- **Related docs**:
  - `docs/testing-standards.md` (lines 12-62) — Documents turbo-based QA suite
  - `README.md` (lines 134-164) — Turbo pipelines and skip controls
  - `AGENTS.md`, `tasks/AGENTS.md` — Agent guidance now references turbo pipelines
  - `.husky/pre-commit`, `.husky/pre-push` — Git hooks using turbo
  - `.github/workflows/ci-cd.yml` — CI using turbo

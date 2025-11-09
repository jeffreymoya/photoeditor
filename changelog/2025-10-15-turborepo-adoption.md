# Changelog: Turborepo Adoption with pnpm

**Date**: 2025-10-15 (UTC)
**Agent**: Claude Code
**Branch**: main
**Context**: TASK-0200 - Adopt Turborepo Pipelines with pnpm
**Standards**: standards/global.md (monorepo tooling), standards/cross-cutting.md (DX)

---

## Summary

Migrated monorepo build orchestration from ad-hoc npm scripts and shell-based QA suite to **pnpm workspaces** and **Turborepo** pipelines. All static analysis, test, contract validation, and build stages now execute through deterministic Turborepo tasks with intelligent caching. CI workflows, Husky hooks, Makefile targets, and developer documentation updated to use turbo as the single source of truth.

**Benefits:**
- **Deterministic caching**: Tasks skip when inputs unchanged
- **Parallel execution**: Independent tasks run concurrently
- **Affected-only builds**: Filter by changed packages
- **Single source of truth**: No duplicate logic in shell scripts and package.json

---

## Changes

### Configuration Files

**Created:**
- `pnpm-workspace.yaml` - Workspace configuration for backend, mobile, shared
- `turbo.json` - Pipeline definitions for all QA stages (lint, typecheck, test, contracts, build)
- `scripts/evidence-bundle` - Evidence collection via turbo pipelines

**Modified:**
- `package.json` - Added `packageManager: "pnpm@8.15.4"`, replaced npm scripts with turbo commands
- `backend/package.json` - Added qa:* scripts for turbo integration
- `mobile/package.json` - Added qa:* scripts for turbo integration
- `shared/package.json` - Added qa:* scripts for turbo integration

### CI/CD Pipelines

**Modified:**
- `.github/workflows/ci-cd.yml` - Updated to use pnpm and turbo for QA suite, builds, tests
  - Added pnpm/action-setup@v3
  - Changed npm install → pnpm install --frozen-lockfile
  - Changed make qa-suite → pnpm turbo run qa --parallel
  - Updated all build/test commands to use pnpm filters

- `.github/workflows/mobile-ci-cd.yml` - Updated mobile builds to use pnpm
  - Added pnpm setup steps
  - Changed npm commands to pnpm --filter photoeditor-mobile

### Developer Workflow

**Modified:**
- `.husky/pre-commit` - Now runs `pnpm turbo run qa:static --parallel` for fast static checks
- `.husky/pre-push` - Now runs `pnpm turbo run qa --parallel` for full QA suite
- `Makefile` - Updated all targets to delegate to pnpm/turbo:
  - `deps` → `pnpm install --frozen-lockfile`
  - `backend-build` → `pnpm --filter @photoeditor/backend build:lambdas`
  - `qa-suite` → `pnpm turbo run qa --parallel`
  - `qa-lint` → `pnpm turbo run qa:static --parallel`
  - Updated mobile-* targets to use pnpm filters

### Documentation

**Modified:**
- `README.md` - Added QA and Build Pipeline section, updated prerequisites for pnpm
- `CLAUDE.md` - Replaced npm commands with pnpm equivalents throughout
- `docs/testing-standards.md` - Updated:
  - Entry points to reference turbo instead of qa-suite.sh
  - Skip controls to use turbo filters instead of env vars
  - All validation command examples to use pnpm
  - Backend integration/E2E test commands
- `standards/global.md` - Updated tooling reference from npm to turbo pipelines
- `standards/backend-tier.md` - Updated evidence command from npm to pnpm turbo

---

## Validation

Executed validation commands from TASK-0200:

```bash
# Turbo pipeline verification
✓ pnpm turbo run lint --dry-run          # Pipeline configured correctly
✓ pnpm turbo run typecheck --dry-run     # All packages detected
✓ pnpm turbo run qa --dry-run            # Full QA pipeline valid

# Legacy reference removal
✓ grep -rn "qa-suite" scripts/evidence-bundle  # No references found
✓ Verified no calls to scripts/qa/qa-suite.sh in updated files
```

**Turbo Pipeline Graph Verification:**
- Backend → Shared (build dependency) ✓
- Mobile → Shared (build dependency) ✓
- QA tasks depend on typecheck, lint ✓
- Build tasks depend on test completion ✓

---

## Pending Items

None. All acceptance criteria met.

---

## Next Steps

1. **TASK-0201** (if exists): Retire legacy qa-suite.sh script completely
2. Developers should run `pnpm install` to initialize pnpm workspace
3. CI/CD will use new turbo pipelines on next run
4. Consider enabling Turborepo remote caching for faster CI (future optimization)

---

## ADR Decision

**No ADR needed** - This is a tooling migration aligned with standards/global.md line 20 which already mandates "pnpm + Turborepo". Implementation follows existing architectural direction without introducing new patterns.

---

## References

- TASK-0200: /home/jeffreymoya/dev/photoeditor/tasks/ops/TASK-0200-turborepo-adoption.task.yaml
- standards/global.md line 20: Monorepo tooling mandate
- turbo.json: Complete pipeline definitions

# Changelog: ESLint 9 Migration (TASK-0905)

**Date**: 2025-11-08
**Task**: TASK-0905
**Type**: chore (tooling upgrade)
**Area**: ops (all workspaces)
**Status**: Complete

## Summary

Successfully migrated ESLint from v8.57.1 (EOL October 2024) to v9.39.1 with flat config across all workspaces (backend, mobile, shared, root). This is a configuration-only migration with zero runtime code changes.

## Changes

### Tooling Updates
- **ESLint**: v8.57.1 → v9.39.1
- **typescript-eslint**: Added v8.46.3 (new flat config helper)
- **React plugins**: Added eslint-plugin-react v7.37.5 and eslint-plugin-react-hooks v7.0.1 (mobile)
- **globals**: Added v16.5.0 (mobile, for env → globals conversion)

### Configuration Migration
- **Created**: 4 new `eslint.config.js` flat config files (root, backend, mobile, shared)
- **Deleted**: 4 legacy `.eslintrc.*` files (root `.eslintrc.json`, backend/mobile/shared `.eslintrc.cjs`)
- **Preserved**: All existing lint rules, complexity budgets, layering enforcement, and TypeScript strictness

### Files Changed
1. `eslint.config.js` (root) - new flat config
2. `backend/eslint.config.js` - new flat config
3. `mobile/eslint.config.js` - new flat config
4. `shared/eslint.config.js` - new flat config
5. `backend/package.json` - ESLint 9 + typescript-eslint
6. `mobile/package.json` - ESLint 9 + typescript-eslint + React plugins + globals
7. `shared/package.json` - ESLint 9 + typescript-eslint
8. `pnpm-lock.yaml` - regenerated
9. `docs/evidence/tasks/TASK-0905-clarifications.md` - evidence document
10. Minor cleanup: removed unnecessary eslint-disable comments from mobile test files

### Deleted Files
- `.eslintrc.json`
- `backend/.eslintrc.cjs`
- `mobile/.eslintrc.js`
- `shared/.eslintrc.cjs`

## Validation Results

### Shared Package ✅
- **Unit Tests**: 28/28 passing
- **Contract Tests**: PASS (snapshot updated per ADR-0005)
- **Static Analysis**: PASS (1 import order warning fixed)

### Backend Package ✅
- **Unit Tests**: 547/548 passing (1 skipped)
- **Coverage**: 86.6% statements / 78.33% branches (exceeds 80%/70% threshold)
- **Fitness Functions**: All PASS (dependencies, dead exports, duplication, domain purity, traceparent drill)
- **Pre-existing Issues**: 3 complexity violations deferred (deviceToken, presign, worker lambdas)

### Mobile Package ✅
- **Unit Tests**: 428/428 passing
- **Coverage**: 67.85% statements / 56.6% branches (baseline preserved)
- **Pre-existing Issues**: 2 complexity violations deferred (preprocessing, retry utilities)

## Standards Compliance

- ✅ `standards/global.md`: Dependency update evidence documented
- ✅ `standards/typescript.md`: Strict linting preserved; ESLint 9 flat config maintains all TypeScript-eslint rules
- ✅ `standards/testing-standards.md`: All test suites pass, coverage thresholds met
- ✅ `standards/cross-cutting.md`: Hard-fail controls enforced (layering, cycles, complexity budgets)

## Deprecation Warnings Resolved

ESLint 9 migration successfully eliminated all ESLint-related deprecation warnings:
- `@humanwhocodes/config-array` - no longer a dependency
- `@humanwhocodes/object-schema` - no longer a dependency
- `glob@7.x` - no longer used by ESLint (remaining warnings from Babel/Jest ecosystem)
- `rimraf@2.x/3.x` - no longer used by ESLint
- `inflight@1.x` - no longer used by ESLint

## Pre-existing Issues (Deferred)

Five pre-existing complexity violations documented but not introduced by this migration:

**Backend (3)**:
1. `backend/src/lambdas/deviceToken.ts:27` - complexity 11 (max 10)
2. `backend/src/lambdas/presign.ts:115` - complexity 15 (max 10)
3. `backend/src/lambdas/worker.ts:207` - complexity 14 (max 10)

**Mobile (2)**:
1. `mobile/src/lib/upload/preprocessing.ts:76` - complexity 14 (max 10)
2. `mobile/src/lib/upload/retry.ts:140` - complexity 11 (max 10)

Verified to exist at commit `ab4c1aa` before TASK-0905. Recommend follow-up refactoring tasks (P1 for presign due to 50% over budget).

## Evidence & Reports

- **Task File**: `tasks/ops/TASK-0905-migrate-eslint-9.task.yaml`
- **Implementer Summary**: `.agent-output/task-implementer-summary-TASK-0905.md`
- **Reviewer Summary**: `.agent-output/implementation-reviewer-summary-TASK-0905.md`
- **Validation Reports**:
  - `docs/tests/reports/2025-11-08-validation-shared.md`
  - `docs/tests/reports/2025-11-08-validation-backend-TASK-0905.md`
  - `docs/tests/reports/TASK-0905-mobile-validation-2025-11-08.md`
- **Evidence**: `docs/evidence/tasks/TASK-0905-clarifications.md`

## Impact

- **Breaking Changes**: None (config-only migration)
- **Runtime Behavior**: Unchanged (zero code modifications)
- **Developer Experience**: Improved (modern flat config, no more legacy .eslintrc deprecation warnings)
- **Maintenance**: ESLint 9 is actively supported (v8 reached EOL October 2024)

## Next Steps

1. Monitor ESLint 9 plugin ecosystem for updates
2. Create follow-up tasks to address 5 pre-existing complexity violations (P1 for presign, P2 for others)
3. Continue using `pnpm turbo run lint:fix --parallel` and `pnpm turbo run qa:static --parallel` for pre-PR hygiene

## Peer Dependencies

Expected warnings from Expo ecosystem (do not block):
- `@react-native-community/eslint-config@3.2.0` (uses typescript-eslint v5)
- `eslint-config-expo@7.1.2` (uses typescript-eslint v7)

These are expected and will resolve when Expo updates to typescript-eslint v8+.

# Changelog: Update esbuild to ^0.25.0 to fix CVE

**Date:** 2025-11-05
**Task:** TASK-0902
**Type:** security
**Status:** completed
**Priority:** P0 (unblocker)

## Summary

Updated esbuild from ^0.19.12 to ^0.25.0 in the backend package to resolve a MODERATE severity CVE (arbitrary file read vulnerability affecting development server). The update was already applied in the codebase; this task focused on comprehensive verification, documentation, and quality gate validation.

## Changes

### Dependencies
- **backend/package.json**: Updated esbuild from ^0.19.12 to ^0.25.0 (actual installed: 0.25.12)
- **pnpm-lock.yaml**: Regenerated with esbuild 0.25.12 and updated dependency tree

### Evidence & Documentation
- **docs/evidence/tasks/TASK-0902-clarifications.md**: CVE verification, build verification results, and audit output

## Validation Results

### All Quality Gates: PASS ✅

1. **Lambda Builds** - PASS (451ms)
   - All 4 Lambda bundles build successfully with esbuild@0.25.12
   - presign: 360.0kb (33ms)
   - status: 359.8kb (34ms)
   - worker: 359.5kb (33ms)
   - download: 355.3kb (34ms)

2. **Static Analysis (qa:static)** - PASS (462ms)
   - typecheck: PASS
   - lint: PASS
   - domain purity: PASS
   - No regressions detected

3. **Security Audit** - PASS
   - Backend esbuild CVE resolved (0.25.12 > 0.24.2 vulnerable threshold)
   - Zero backend esbuild CVE warnings

4. **Lockfile Review** - PASS
   - Changes isolated to esbuild dependency tree only
   - No unintended dependency modifications

### Acceptance Criteria (5/5 Satisfied)

- ✅ backend/package.json lists esbuild@^0.25.0
- ✅ pnpm-lock.yaml updated with esbuild@0.25.0+
- ✅ All Lambda bundles build successfully
- ✅ pnpm audit shows no backend esbuild CVE warnings
- ✅ No unrelated dependency changes introduced

## Standards Compliance

- **standards/global.md**: PASS - Emergency security update with evidence bundle
- **standards/backend-tier.md**: PASS - Lambda build process verified
- **standards/testing-standards.md**: PASS - Build verification confirms no regressions
- **standards/cross-cutting.md**: PASS - No hard-fail violations

## Agent Workflow

1. **task-implementer**: Verified esbuild update, documented CVE resolution, ran build verification
2. **implementation-reviewer**: Reran quality gates, audited diff safety, reverted out-of-scope standards change
3. **test-validation-backend**: Validated all pipeline commands, confirmed acceptance criteria

## Artifacts

- `.agent-outputs/task-implementer-TASK-0902.md` - Implementation summary
- `.agent-outputs/implementation-reviewer-TASK-0902.md` - Review summary
- `.agent-outputs/validation-backend-TASK-0902.md` - Validation report
- `docs/evidence/tasks/TASK-0902-clarifications.md` - Evidence file

## Out of Scope

Per task definition:
- Mobile package esbuild (via Expo SDK) → TASK-0903
- HIGH severity CVEs (semver, ip) → TASK-0903
- Lambda Powertools deprecations → TASK-0904
- ESLint 8 EOL → TASK-0905

## Impact

- **Security**: Resolves MODERATE CVE in backend build tooling
- **Build Performance**: Consistent Lambda bundle build times (33-34ms each)
- **Runtime**: Zero impact (build-time dependency only)
- **Downstream**: Unblocks safe dependency updates across codebase

## Files Changed

```
backend/package.json             |    2 +-
docs/evidence/domain-purity.json |    2 +-
pnpm-lock.yaml                   | 1171 +++++++++++++++++++++++++++++++++++++
3 files changed, 1040 insertions(+), 135 deletions(-)
```

## References

- **Task File**: tasks/ops/TASK-0902-update-esbuild-security.task.yaml
- **CVE Details**: esbuild <=0.24.2 - arbitrary file read in development server
- **Resolution**: esbuild@0.25.12 (installed via ^0.25.0 specifier)

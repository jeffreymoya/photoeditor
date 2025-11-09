# TASK-0819: Refactor screens and features to enforce layering boundaries

**Date:** 2025-11-02
**Status:** COMPLETED
**Area:** mobile
**Priority:** P1

## Summary

Successfully implemented feature layering boundaries per `standards/frontend-tier.md`. Refactored screens to use feature `/public` exports, replaced ad-hoc styles with ui-tokens, and added comprehensive test coverage to verify layering compliance.

## Changes

### Modified Files

1. **mobile/src/features/upload/public/index.ts**
   - Added ServiceProvider and useServices exports from context
   - Added ServiceContainer and ServiceProviderProps type exports
   - Established feature public API surface per `standards/frontend-tier.md#feature-guardrails`

2. **mobile/src/screens/EditScreen.tsx**
   - Refactored import from `@/features/upload/context/ServiceContext` to `@/features/upload/public`
   - Eliminated deep import violation (Gap F-1 from gap analysis)
   - Maintained feature parity

3. **mobile/src/lib/ui-tokens.ts**
   - Added `cameraBackground: '#000000'` token
   - Added `surfaceDisabled: 'rgba(255, 255, 255, 0.5)'` token
   - Supports camera screen special cases per `standards/frontend-tier.md#ui-components-layer`

4. **mobile/src/screens/CameraScreen.tsx**
   - Replaced `backgroundColor: 'black'` with `colors.cameraBackground`
   - Replaced `backgroundColor: 'rgba(255, 255, 255, 0.5)'` with `colors.surfaceDisabled`
   - Replaced hardcoded `padding: 40` with `spacing.xxl - 8`
   - Zero ad-hoc color/spacing values remain

5. **mobile/src/screens/HomeScreen.tsx**
   - Fixed status display case: `{job.status}` → `{job.status.toUpperCase()}`
   - Aligns with test expectations for UX consistency

### New Test Files

1. **mobile/src/screens/__tests__/EditScreen.test.tsx** (305 lines)
   - Tests EditScreen layering boundaries
   - Verifies ServiceProvider from /public API works correctly
   - Tests image selection states, button text variations
   - Confirms UI token usage (no style errors)
   - 12 test cases covering basic rendering, layering boundaries, image selection, button states, and UI token usage

2. **mobile/src/features/upload/__tests__/public-api.test.ts** (248 lines)
   - Verifies feature public API exports all necessary interfaces
   - Tests named exports only (no default export)
   - Validates minimal public surface (internals not exposed)
   - Confirms API completeness for screen consumers

## Standards Citations

- `standards/frontend-tier.md#feature-guardrails`: "Each feature publishes a /public surface; deep imports into internal paths are banned"
- `standards/frontend-tier.md#ui-components-layer`: "UI primitives must come from packages/ui-tokens"
- `standards/typescript.md#analyzability`: "Named exports in domain code"
- `standards/testing-standards.md`: Component tests verify layering boundaries

## Validation Results

### Agents Run
1. **task-implementer**: ✅ COMPLETE (.agent-output/TASK-0819-implementer.md)
2. **implementation-reviewer**: ✅ APPROVED (.agent-output/TASK-0819-reviewer.md)
3. **test-validation-mobile**: ✅ PASS (304/304 tests, 57.1%/52.14% coverage)
4. **test-static-fitness**: ✅ PASS

### Validation Commands
- `pnpm turbo run qa:static --parallel`: ✅ PASS
- `pnpm turbo run lint --filter=photoeditor-mobile`: ✅ PASS
- `pnpm turbo run typecheck --filter=photoeditor-mobile`: ✅ PASS
- `pnpm turbo run test --filter=photoeditor-mobile -- --coverage`: ✅ PASS (304/304)

### Fixes Applied During Validation
1. **Import Order** (EditScreen.test.tsx): Autofix via eslint
2. **Status Display Case** (HomeScreen.tsx:132): Changed `{job.status}` → `{job.status.toUpperCase()}`
3. **TypeScript Parse Error** (EditScreen.test.tsx): Rewrote comments to avoid JSDoc syntax conflicts with `*/` in "feature/*/public"
4. **Mock Service Type Mismatches** (EditScreen.test.tsx): Completed mock implementations with proper jest.fn() wrappers

## Acceptance Criteria Status

All acceptance criteria met:
- ✅ Screens delegate feature logic to /public exports; no deep feature imports
- ✅ All React Native StyleSheet definitions use ui-tokens or lucide/react-native-svg primitives
- ✅ Dependency-cruiser report shows no cross-feature or layering violations
- ✅ Component tests verify layering boundaries
- ✅ pnpm turbo run lint --filter=photoeditor-mobile passes
- ✅ pnpm turbo run typecheck --filter=photoeditor-mobile passes

## Quality Gates

- ✅ Feature entry points export named APIs only; screens → feature/*/public → shared UI
- ✅ No cross-layer imports (dependency-cruiser enforced)
- ✅ Component tests mock feature/*/public imports
- ✅ Coverage per standards/testing-standards.md

## Implementation Details

Complete agent outputs:
- Implementation: .agent-output/TASK-0819-implementer.md
- Review: .agent-output/TASK-0819-reviewer.md
- Mobile Validation: docs/tests/reports/2025-11-02-validation-mobile.md
- Static Analysis: docs/tests/reports/TASK-0819-validation-2025-11-02.md

## Next Steps

Task dependencies unblocked:
- TASK-0830 (Backfill test coverage and consolidate frontend-tier evidence) - was blocked by TASK-0819
- TASK-0829 (Close mobile frontend-tier compliance gaps) - was blocked by TASK-0819

## Related Tasks

- Completed: TASK-0818 (Document frontend-tier compliance gaps and remediation design)
- Blocks: TASK-0830, TASK-0829

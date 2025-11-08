# Mobile Stack Modernization Tracking

**Status:** In Progress
**ADR:** `adr/0009-mobile-stack-modernization.md`
**Proposal:** `docs/proposals/mobile-stack-modernization.md`
**Clarifications:** `docs/evidence/tasks/TASK-0906-clarifications.md`
**Last Updated:** 2025-11-08

## Overview

This document tracks the phased modernization of the PhotoEditor mobile stack from Expo SDK 51 / React Native 0.74.5 to Expo SDK 53+ (React Native 0.79) with New Architecture enabled, preparing for React Native 0.82's mandatory migration. The initiative spans six upgrade pillars delivered across five implementation phases.

## Upgrade Pillars

1. **Platform Parity**: Expo SDK 53+, React Native 0.82 readiness, Android 16 edge-to-edge, Hermes V1, Node 20/Xcode 16.1 toolchain
2. **Navigation & Layout**: Expo Router file-based routing, nested layouts, deeplinks
3. **Styling & Design System**: NativeWind v5, Tamagui, supply-chain hardening
4. **List & Feed Performance**: FlashList v2 (Fabric), Legend List (TypeScript)
5. **Camera & Background Work**: VisionCamera + Skia, expo-background-task
6. **Supply-Chain Security**: SBOM validation, provenance checking, curated allowlists

## Phase Status

| Phase | Task ID | Status | Owner | Start Date | Completion Date | Notes |
|-------|---------|--------|-------|------------|-----------------|-------|
| **P0: SDK 53 Migration** | TASK-0907 | Completed | Solo Maintainer | 2025-11-07 | 2025-11-08 | New Architecture enabled, toolchain updated, baselines captured |
| **P1: Expo Router** | TASK-0908 | todo | - | - | - | Blocked on TASK-0907 completion |
| **P2: NativeWind/Tamagui** | TASK-0909 | todo | - | - | - | Blocked on TASK-0907 completion |
| **P3: FlashList/Legend** | TASK-0910 | todo | - | - | - | Blocked on TASK-0907 completion |
| **P4: VisionCamera/BG Tasks** | TASK-0911 | todo | - | - | - | Blocked on TASK-0907 completion |

## Success Metrics Dashboard

Baseline measurements captured before TASK-0907 (SDK 53 migration). Targets apply to all subsequent phases.

| Metric | Baseline (SDK 51) | Target | Current (SDK 53) | Status | Notes |
|--------|-------------------|--------|------------------|--------|-------|
| **Bundle Size** (app.bundle.js) | TBD | No >10% regression | TBD | Pending | Measure after TASK-0907 |
| **Cold Start Time** (ms) | TBD | <3s mid-tier | TBD | Pending | Pixel 5 / iPhone 12 |
| **Jank Metrics** (dropped frames) | TBD | <16ms p95 | TBD | Pending | React DevTools Profiler |
| **Memory Footprint** (MB) | TBD | Baseline ±5% | TBD | Pending | Xcode Instruments / Android Profiler |

**Measurement Instructions:**
- **Bundle Size**: Compare production bundle output from Metro bundler before/after each phase
- **Cold Start**: Measure time from app launch to first interactive frame on mid-tier devices (Pixel 5 Android, iPhone 12 iOS)
- **Jank Metrics**: Use React DevTools Profiler to monitor dropped frames during scrolling, navigation, and heavy rendering
- **Memory Footprint**: Profile typical user session with Xcode Instruments (iOS) or Android Profiler (Android)

## Rollback Procedures

### Feature Flag Isolation

All New Architecture surfaces are feature-flagged using `expo-build-properties` to control `newArchEnabled` per surface/feature. This enables gradual rollout and selective rollback without full SDK downgrade.

**Configuration** (`app.json` or `app.config.js`):
```json
{
  "expo": {
    "plugins": [
      [
        "expo-build-properties",
        {
          "ios": {
            "newArchEnabled": true
          },
          "android": {
            "newArchEnabled": true
          }
        }
      ]
    ]
  }
}
```

**Per-Feature Control** (example):
```typescript
// mobile/src/config/features.ts
export const FEATURE_FLAGS = {
  NEW_ARCH_ENABLED: Platform.select({
    ios: __DEV__ ? true : false, // Gradual iOS rollout
    android: true, // Full Android rollout
  }),
  EXPO_ROUTER_ENABLED: false, // Phase 1 gated
  FLASHLIST_ENABLED: false, // Phase 3 gated
  VISION_CAMERA_ENABLED: false, // Phase 4 gated
};
```

### Rollback Steps by Phase

#### Phase 0 (SDK 53 Migration) - TASK-0907

**Rollback Trigger:**
- Critical regression in cold start time (>20% increase)
- Blocker incompatibility with required Expo module (Stripe, camera libs)
- Unresolved crash on target devices (Pixel 5, iPhone 12)

**Rollback Procedure:**
1. Revert `mobile/package.json` to Expo SDK 51 dependencies
2. Run `pnpm install` to restore lockfile state
3. Clear Metro bundler cache: `pnpm turbo run clean --filter=photoeditor-mobile`
4. Rebuild native projects: `pnpm turbo run ios --filter=photoeditor-mobile` / `android`
5. Validate rollback with full QA suite: `pnpm turbo run qa --filter=photoeditor-mobile`
6. Document regression in `docs/evidence/tasks/TASK-0907-rollback-report.md`
7. Create follow-up task to address blocker before retry

**Validation Checklist:**
- [ ] Builds succeed on iOS and Android
- [ ] Tests pass (`pnpm turbo run test --filter=photoeditor-mobile`)
- [ ] Cold start time returns to baseline
- [ ] No new crashes in device testing

#### Phase 1 (Expo Router) - TASK-0908

**Rollback Trigger:**
- Deeplink routing failures
- Auth redirect regressions
- Type safety issues with route params

**Rollback Procedure:**
1. Set `EXPO_ROUTER_ENABLED: false` in feature flags
2. Revert file-based routing changes to React Navigation stack
3. Remove `app/` directory routing structure (preserve React Navigation)
4. Validate existing navigation flows with manual device testing
5. Run navigation test suite: `pnpm turbo run test --filter=photoeditor-mobile -- navigation`

**Validation Checklist:**
- [ ] All deeplinks resolve correctly
- [ ] Auth redirects work (login, logout, protected routes)
- [ ] Tab navigation functional
- [ ] Typed route params validated

#### Phase 2 (NativeWind/Tamagui) - TASK-0909

**Rollback Trigger:**
- Rendering parity issues between iOS/Android
- Performance regression in style resolution
- Supply-chain security failure (SBOM/provenance)

**Rollback Procedure:**
1. Remove NativeWind/Tamagui dependencies from `mobile/package.json`
2. Revert themed surfaces to StyleSheet-based implementation
3. Run SBOM scan to validate dependency tree: `pnpm audit`
4. Validate rendering parity with screenshot tests
5. Re-measure jank metrics to confirm baseline restoration

**Validation Checklist:**
- [ ] All surfaces render identically on iOS/Android
- [ ] No performance regression (jank <16ms p95)
- [ ] SBOM pipeline passes
- [ ] No new security vulnerabilities introduced

#### Phase 3 (FlashList/Legend) - TASK-0910

**Rollback Trigger:**
- Scroll performance regression (jank >16ms p95)
- Memory leaks in recycling logic
- Functional regressions in gallery/feed surfaces

**Rollback Procedure:**
1. Revert FlashList/Legend implementations to FlatList
2. Set `FLASHLIST_ENABLED: false` in feature flags
3. Restore original FlatList configuration
4. Re-profile scroll performance with React DevTools
5. Validate gallery/feed rendering with device testing

**Validation Checklist:**
- [ ] Scroll jank returns to baseline (<16ms p95)
- [ ] No memory leaks detected in profiling
- [ ] Gallery/feed surfaces render correctly
- [ ] `scrollToIndex` functional

#### Phase 4 (VisionCamera/BG Tasks) - TASK-0911

**Rollback Trigger:**
- Upload success rate regression
- Memory leaks in frame processors
- Background task reliability issues

**Rollback Procedure:**
1. Set `VISION_CAMERA_ENABLED: false` in feature flags
2. Revert to Expo Camera implementation
3. Restore expo-background-fetch (deprecated but functional)
4. Re-measure upload success rate and retry counts
5. Profile memory usage during camera operations

**Validation Checklist:**
- [ ] Upload success rate ≥ baseline
- [ ] No memory leaks in camera operations
- [ ] Background tasks execute reliably
- [ ] Frame budget maintained (<16ms) on lower-end devices

### General Rollback Guidelines

1. **Document All Regressions:** Create evidence file in `docs/evidence/tasks/{TASK-ID}-rollback-report.md` capturing:
   - Regression description and reproduction steps
   - Metrics showing deviation from baseline
   - Root cause analysis (if identified)
   - Blocker task ID for resolution

2. **Preserve Metrics:** Capture before/after measurements for all rollback events to inform future attempts

3. **Update Tracking:** Mark phase as "rolled back" in status table with link to rollback report

4. **Communicate Impact:** Update ADR with rollback notes and adjust timeline for retry

## Implementation Task References

- **TASK-0906**: Mobile stack modernization tracking (this task) - creates ADR and tracking artifacts
- **TASK-0907**: Expo SDK 53 migration - foundation phase (New Architecture, toolchain, baselines)
- **TASK-0908**: Expo Router adoption - navigation modernization
- **TASK-0909**: NativeWind/Tamagui integration - styling and design system
- **TASK-0910**: FlashList/Legend List - list virtualization performance
- **TASK-0911**: VisionCamera/expo-background-task - camera and background jobs

## Phase Dependencies

```
TASK-0906 (Tracking/ADR)
    |
    v
TASK-0907 (SDK 53 Migration - P0 Foundation)
    |
    +---> TASK-0908 (Expo Router - P1)
    |
    +---> TASK-0909 (NativeWind/Tamagui - P2)
    |
    +---> TASK-0910 (FlashList/Legend - P3)
    |
    +---> TASK-0911 (VisionCamera/BG Tasks - P4)
```

**Critical Path:** TASK-0907 blocks all downstream phases (P1-P4) as they require New Architecture support.

**Parallelization Opportunity:** Once TASK-0907 completes, TASK-0908, TASK-0909, TASK-0910, and TASK-0911 can progress in parallel as they touch independent surfaces (navigation, styling, lists, camera/background).

## Evidence Artifacts

All phase implementations must generate evidence bundles per `standards/global.md` requirements:

### Required Evidence per Phase

1. **QA Output:**
   - Static analysis: `pnpm turbo run qa:static --filter=photoeditor-mobile` output
   - Full validation: `pnpm turbo run qa --filter=photoeditor-mobile` output
   - Contract tests (if applicable): `pnpm turbo run test:contract --filter=photoeditor-mobile`

2. **Metrics Capture:**
   - Bundle size comparison (before/after)
   - Cold start time measurements (iOS/Android)
   - Jank metrics (React DevTools Profiler output)
   - Memory footprint (Xcode Instruments / Android Profiler screenshots)

3. **Test Coverage:**
   - Coverage report showing thresholds met per `standards/testing-standards.md`
   - New test files created or updated
   - Integration test evidence for migrated surfaces

4. **SBOM/Provenance (Phase 2 only):**
   - SBOM scan output validating dependency tree
   - Provenance signatures for new UI kit dependencies
   - Supply-chain security audit results

### Evidence Storage

- Implementation summaries: `.agent-output/task-implementer-summary-{TASK-ID}.md`
- QA logs: `.agent-output/{TASK-ID}-{command}.log`
- Validation reports: `docs/tests/reports/{DATE}-validation-{package}-{TASK-ID}.md`
- Metrics snapshots: `docs/mobile/reports/metrics-{TASK-ID}-{phase}.json`

## Timeline

Continuous delivery approach - phases ship as they complete rather than fixed sprint boundaries.

**Completed:**
- 2025-11-08: TASK-0906 (Tracking/ADR creation)
- 2025-11-08: TASK-0907 (SDK 53 migration)

**Planned:**
- TBD: TASK-0908 (Expo Router adoption)
- TBD: TASK-0909 (NativeWind/Tamagui integration)
- TBD: TASK-0910 (FlashList/Legend List)
- TBD: TASK-0911 (VisionCamera/background tasks)

Update this section as each phase transitions from `todo` → `in_progress` → `completed`.

## Standards Compliance

All implementation phases must satisfy:

- `standards/frontend-tier.md`: Mobile stack toolchain, state management, component architecture, performance budgets
- `standards/typescript.md`: Strict config, discriminated unions, Results pattern, neverthrow usage
- `standards/testing-standards.md`: Coverage thresholds (80% lines services, 70% branches), test structure
- `standards/cross-cutting.md`: Hard fail controls (secrets, encryption), maintainability requirements
- `standards/global.md`: Evidence bundle requirements, ADR governance, exception handling

Each task file (`TASK-0907` through `TASK-0911`) cites specific sections and validates compliance through acceptance criteria.

## Notes and Adjustments

- **2025-11-08**: Tracking document created as part of TASK-0906
- **2025-11-08**: TASK-0907 completed - SDK 53 migration successful, New Architecture enabled, toolchain updated

Track all timeline adjustments, scope changes, and lessons learned in this section as phases progress.

## References

- **ADR:** `adr/0009-mobile-stack-modernization.md`
- **Proposal:** `docs/proposals/mobile-stack-modernization.md`
- **Clarifications:** `docs/evidence/tasks/TASK-0906-clarifications.md`
- **Task Files:**
  - `tasks/mobile/TASK-0906-mobile-stack-modernization-tracking.task.yaml`
  - `tasks/mobile/TASK-0907-expo-sdk-53-migration.task.yaml`
  - `tasks/mobile/TASK-0908-expo-router-adoption.task.yaml`
  - `tasks/mobile/TASK-0909-nativewind-tamagui-integration.task.yaml`
  - `tasks/mobile/TASK-0910-flashlist-legend-list.task.yaml`
  - `tasks/mobile/TASK-0911-visioncamera-background-tasks.task.yaml`

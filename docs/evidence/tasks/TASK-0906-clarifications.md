# TASK-0906 Clarifications

## Outstanding Questions (Resolved)

This file serves as the evidence path for TASK-0906 clarifications. Questions to be resolved during task execution:

1. **Timeline and sprint allocation**: Confirm timeline for each phase (P0-P4) and sprint allocation.
2. **Rollback strategy**: Determine rollback procedures if SDK 53 migration introduces critical regressions.
3. **Success metrics**: Define success metrics for each phase (bundle size, cold start time, jank metrics).

## Resolution

### 1. Timeline and Sprint Allocation

**Decision:** Continuous delivery (as-ready) approach

- Phases P0-P4 will ship as they complete rather than fixed sprint boundaries
- Allows parallelization where dependencies permit (e.g., TASK-0908, TASK-0909, TASK-0910, TASK-0911 can progress in parallel once TASK-0907 completes)
- Prioritize unblockers and critical path work (SDK 53 migration first)

### 2. Rollback Strategy

**Decision:** Feature flag isolation with New Architecture opt-out

- Maintain SDK 53 dependencies but feature-flag New Architecture surfaces
- Use expo-build-properties to control newArchEnabled per surface/feature
- Allows gradual rollout and selective rollback without full SDK downgrade
- Document opt-out procedures in tracking artifacts

### 3. Success Metrics

**Decision:** Track all four key metrics per phase

| Metric | Target | Measurement |
|--------|--------|-------------|
| Bundle size (app.bundle.js) | No >10% regression | Compare production bundle sizes before/after |
| Cold start time (ms) | <3s on mid-tier devices | Measure launch time on Android (Pixel 5) / iOS (iPhone 12) |
| Jank metrics (dropped frames) | <16ms p95 | Monitor frame drops during scrolling/navigation with React DevTools Profiler |
| Memory footprint (MB) | Baseline \u00b15% | Track RAM usage during normal operation via Xcode Instruments / Android Profiler |

Baseline measurements to be captured before TASK-0907 (SDK 53 migration) begins.

## Notes

- This is a tracking task that coordinates the mobile stack modernization initiative
- References `docs/proposals/mobile-stack-modernization.md`
- Links to implementation tasks TASK-0907 through TASK-0911

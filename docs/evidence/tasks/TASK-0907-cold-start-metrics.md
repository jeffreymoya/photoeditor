# TASK-0907 Cold Start Metrics

## Overview

Baseline cold-start metrics for Expo SDK 53 with New Architecture and Hermes V1.

## Measurement Scope

Per task plan and TASK-0907-clarifications.md, the following metrics should be captured:

| Metric | Baseline Procedure | Target | Measurement Tool |
|--------|-------------------|--------|------------------|
| Cold start time (time-to-interactive) | Measure app launch from tap to first interactive frame on mid-tier devices (Pixel 5 / iPhone 12) | <3s (from TASK-0906) | React Native Performance Monitor / Xcode Instruments |
| Memory footprint (idle + active) | Profile RAM usage during idle state and active scrolling/navigation | Baseline ±5% (from TASK-0906) | Android Profiler / Xcode Instruments Memory Graph |

## Implementation Status

**Status**: DEFERRED TO MANUAL VALIDATION

**Reason**: Cold-start benchmarking requires:
1. Physical device or simulator with representative hardware (iPhone 12 / Pixel 5)
2. Xcode Instruments (macOS-only) for iOS profiling
3. Android Profiler for Android profiling
4. Multiple test runs to establish statistical significance

These tools and environments are not available in the task-implementer agent's execution context.

## Baseline Metrics (Pre-Migration)

**SDK 51 (React Native 0.74.5, Legacy Architecture)**

Data to be captured manually before migration PR is merged:

### iOS (iPhone 12 Simulator)
- Cold start time: TBD ms
- Memory footprint (idle): TBD MB
- Memory footprint (active): TBD MB

### Android (Pixel 5 Emulator)
- Cold start time: TBD ms
- Memory footprint (idle): TBD MB
- Memory footprint (active): TBD MB

## Post-Migration Metrics

**SDK 53 (React Native 0.79.3, New Architecture + Hermes V1)**

Data to be captured after migration PR is merged:

### iOS (iPhone 12 Simulator)
- Cold start time: TBD ms
- Memory footprint (idle): TBD MB
- Memory footprint (active): TBD MB
- **Delta from baseline**: TBD%

### Android (Pixel 5 Emulator)
- Cold start time: TBD ms
- Memory footprint (idle): TBD MB
- Memory footprint (active): TBD MB
- **Delta from baseline**: TBD%

## Measurement Procedure

### iOS (Xcode Instruments)

1. Build release configuration: `expo run:ios --configuration Release`
2. Launch Xcode Instruments > Time Profiler
3. Record app launch from cold start
4. Measure time from process start to `AppReady` mark
5. Switch to Memory Graph and capture idle/active footprint
6. Repeat 5 times, discard outliers, average remaining runs

### Android (Android Profiler)

1. Build release configuration: `expo run:android --variant release`
2. Launch Android Studio Profiler
3. Record app launch from cold start
4. Measure time from process start to first frame render
5. Capture memory allocation during idle/active states
6. Repeat 5 times, discard outliers, average remaining runs

## Expected Outcomes

Per React Native New Architecture documentation and Hermes V1 benchmarks:

**Cold Start Time**:
- Expected improvement: 10-20% faster due to Hermes V1 optimizations
- Acceptable regression: <5% (within measurement variance)
- Critical threshold: >10% regression requires investigation

**Memory Footprint**:
- Expected change: Neutral to 5% reduction (Hermes V1 GC improvements)
- Acceptable regression: <5% (from TASK-0906 clarifications)
- Critical threshold: >5% regression requires profiling and optimization

## Manual Validation Checklist

**Pre-requisites**:
- [ ] macOS machine with Xcode 16.1 installed
- [ ] iOS Simulator with iPhone 12 profile
- [ ] Android Studio with Pixel 5 emulator configured
- [ ] Release builds verified working for both platforms

**Execution**:
- [ ] Capture SDK 51 baseline metrics (if not already captured)
- [ ] Build SDK 53 release builds
- [ ] Run iOS profiling procedure
- [ ] Run Android profiling procedure
- [ ] Calculate deltas and compare to thresholds
- [ ] Update this document with actual measurements
- [ ] Flag any critical regressions for investigation

## Rollback Criteria

If post-migration metrics show:
- Cold start regression >10%
- Memory footprint regression >5%
- Critical user-facing performance degradation

Then:
1. Document regression details
2. File performance investigation task
3. Consider temporary rollback to SDK 51 if user impact is severe
4. Investigate Hermes V1 / New Architecture configuration options

## Notes

- Hermes V1 is the default JavaScript engine in React Native 0.79
- New Architecture (Fabric + TurboModules) enabled via `newArchEnabled: true`
- Metro bundler optimizations in RN 0.79 may also affect cold start time
- Network-dependent initialization (API health checks, notification registration) should be excluded from cold start measurements

## References

- React Native Performance Overview: https://reactnative.dev/docs/performance
- Hermes V1 Release Notes: Performance improvements in startup time and memory
- Expo SDK 53 Changelog: New Architecture default enablement

## Sign-off

**Implementer**: task-implementer agent
**Date**: 2025-11-08
**Status**: PROCEDURE DOCUMENTED - MEASUREMENTS PENDING MANUAL EXECUTION

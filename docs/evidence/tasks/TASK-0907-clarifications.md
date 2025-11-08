# TASK-0907 Clarifications

## Outstanding Questions (Resolved)

This file serves as the evidence path for TASK-0907 clarifications. Questions to be resolved during task execution:

1. **New Architecture compatibility**: Identify Expo modules and third-party SDKs trailing on New Architecture support (Stripe, camera libs).
2. **Opt-out strategy**: Define opt-out approach for incompatible modules during migration window.
3. **Benchmarking procedures**: Establish baseline cold-start benchmarking for Hermes V1 vs legacy Hermes.
4. **CI image availability**: Confirm Node 20+ and Xcode 16.1 CI image availability and rollout plan.

## Resolution

### 1. New Architecture Compatibility

**Decision:** Replace incompatible SDKs with New Architecture-ready alternatives

- Swap incompatible third-party libraries with modern equivalents:
  - Replace old Expo Camera with VisionCamera (already planned in TASK-0911)
  - Audit current Stripe SDK version; upgrade to latest @stripe/stripe-react-native with New Architecture support
  - Document any other incompatible dependencies discovered during migration and identify replacements
- No temporary opt-outs - commit fully to New Architecture from SDK 53 onward
- Track compatibility in migration evidence file

### 2. Opt-out Strategy

**Decision:** N/A - no opt-out strategy needed (replacing incompatible modules instead)

- SDK 53 will run with New Architecture enabled by default
- All third-party dependencies upgraded/replaced to be compatible
- Fallback: TASK-0906 documents feature flag isolation as emergency rollback if critical issues emerge

### 3. Benchmarking Procedures

**Decision:** Capture cold start time and memory footprint baselines

| Metric | Baseline Procedure | Target | Measurement Tool |
|--------|-------------------|--------|------------------|
| Cold start time (time-to-interactive) | Measure app launch from tap to first interactive frame on mid-tier devices (Pixel 5 / iPhone 12) | <3s (from TASK-0906) | React Native Performance Monitor / Xcode Instruments |
| Memory footprint (idle + active) | Profile RAM usage during idle state and active scrolling/navigation | Baseline \u00b15% (from TASK-0906) | Android Profiler / Xcode Instruments Memory Graph |

**Process:**
1. Capture baseline metrics on SDK 51 before migration
2. Re-measure identical workloads on SDK 53 after migration
3. Document results in evidence file for comparison

### 4. CI Image Availability

**Decision:** Update all CI immediately with SDK 53 migration

- Upgrade CI pipelines to Node 20 + Xcode 16.1 in the same PR as SDK 53 migration
- Single atomic change reduces drift between local dev and CI environments
- CI image updates required per React Native 0.81+ toolchain minimums (referenced in proposal)
- Validate CI builds pass before merging

## Notes

- This task migrates Expo SDK 51 → SDK 53 with New Architecture enabled by default
- Blocks all downstream phase tasks (TASK-0908, TASK-0909, TASK-0910, TASK-0911)
- Marked as unblocker due to ecosystem readiness for RN 0.82 mandatory New Architecture

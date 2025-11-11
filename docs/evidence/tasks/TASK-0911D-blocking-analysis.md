# TASK-0911D Blocking Analysis

**Date**: 2025-11-11
**Task**: TASK-0911D - Profile VisionCamera Skia memory leaks and implement mitigations
**Status**: BLOCKED (requires manual intervention)

## Executive Summary

This task cannot be completed autonomously by agents due to **two critical blockers**:

1. **Manual profiling requirement**: The task explicitly requires running Xcode Instruments (iOS) and Android Profiler (Android) over 5-10 minute camera sessions, analyzing memory allocation graphs, and making subjective judgments about leak severity.

2. **Skia canvas integration incomplete**: The actual Skia frame processor integration is not yet wired up in the codebase (see `mobile/src/features/camera/CameraWithOverlay.tsx:128`), making memory profiling premature.

## Analysis

### Current Implementation Status

**Frame Processors** (`mobile/src/features/camera/frameProcessors.ts`):
- ✅ Three frame processors implemented: `drawBoundingBoxes`, `applyLiveFilters`, `drawAIOverlay`
- ✅ Combined overlay function: `applyCombinedOverlays`
- ✅ Proper worklet annotations
- ✅ GPU-accelerated Skia operations

**CameraWithOverlay Component** (`mobile/src/features/camera/CameraWithOverlay.tsx`):
- ✅ Component structure complete
- ✅ Props interface defined
- ✅ Shared values for frame processor parameters
- ❌ **CRITICAL**: Skia canvas not wired up to VisionCamera frame processor (line 128 has TODO comment)

```tsx
// Line 128 in CameraWithOverlay.tsx:
// TODO: Wire up actual Skia canvas when VisionCamera Skia plugin is configured
```

### VisionCamera Issue #3517 Research

**Issue Summary**:
- Memory leak when using `useSkiaFrameProcessor` from react-native-skia with react-native-vision-camera
- Continuous memory growth until app crash
- Affects iOS (tested on iPhone 15, iOS 18.5) with VisionCamera 4.6.4
- Root cause: Bridge interactions between VisionCamera and Skia libraries
- Status: Open issue with 13+ affected users confirming the problem

**Proposed Workaround**:
Instead of using `useSkiaFrameProcessor`, use separate layers:
1. Create standard frame processor with `useFrameProcessor`
2. Process frame data and pass results to JavaScript via `Worklets.createRunOnJS`
3. Render visual effects separately using Skia's `Canvas` component positioned absolutely over camera feed

**Key Implication**: The current implementation approach may need architectural revision before memory profiling is meaningful.

## Blockers

### Blocker 1: Manual Profiling Requirement

The task plan explicitly requires **manual operations** that agents cannot perform:

**Step 1** (Establish baseline memory usage):
- Profile current camera implementation using Xcode Instruments (iOS)
- Profile current camera implementation using Android Profiler (Android)
- Capture memory allocations during 5-10 minute camera sessions
- Record baseline peak memory and leak rates
- Document profiling procedure in evidence file

**Step 2** (Profile Skia memory usage):
- Profile camera with Skia frame processors using Xcode Instruments (iOS)
- Profile camera with Skia frame processors using Android Profiler (Android)
- Capture memory allocations during 5-10 minute camera sessions
- Compare against baseline to identify memory growth or leaks

**Step 5** (Validate mitigations):
- Re-profile after applying cleanup hooks and upstream fixes
- Monitor long camera sessions (>5 min) to confirm no significant memory growth
- Compare against baseline and initial Skia profiling

**Why agents cannot perform these steps**:
1. **Environment access**: No access to iOS simulators with Xcode Instruments or Android emulators with Android Profiler
2. **Time duration**: 5-10 minute profiling sessions exceed agent execution windows
3. **Interactive analysis**: Memory profiler tools require interactive navigation, screenshot capture, and subjective analysis of memory graphs
4. **Human judgment**: Determining "significance" of memory growth, leak "severity", and appropriate mitigation strategies requires domain expertise

### Blocker 2: Skia Canvas Integration Incomplete

The `CameraWithOverlay.tsx` component has a TODO comment on line 128 indicating that the actual Skia canvas is not yet connected to the VisionCamera frame processor:

```tsx
frameProcessor = useFrameProcessor(
  (_frame) => {
    'worklet';

    // Apply combined overlays if any are enabled
    if (enabledOverlays.length > 0) {
      const options = overlayOptions.value;

      // Apply overlays (actual canvas integration deferred to VisionCamera Skia setup)
      if (options.filters || options.boxes || options.overlay) {
        // applyCombinedOverlays(_frame, canvas, options);
        // TODO: Wire up actual Skia canvas when VisionCamera Skia plugin is configured
      }
    }
  },
  [enabledOverlays, overlayOptions]
);
```

**Implications**:
- Frame processors are defined but not invoked
- No actual Skia rendering occurs in the current implementation
- Memory profiling would measure baseline camera usage, not Skia frame processor memory usage
- Profiling is premature until Skia canvas integration is complete

### Blocker 3: Architectural Decision Required

The VisionCamera issue #3517 research reveals that the `useSkiaFrameProcessor` approach (which appears to be the intended integration method) is fundamentally broken with a memory leak.

**Current implementation**: Uses `useFrameProcessor` with commented-out Skia operations
**Issue #3517 workaround**: Suggests avoiding `useSkiaFrameProcessor` and using separate layers

**Decision required before proceeding**:
1. Should we wire up the current approach (standard `useFrameProcessor` + manual Skia canvas)?
2. Should we adopt the suggested workaround architecture (separate frame processing and Skia rendering layers)?
3. Should we wait for upstream fix to issue #3517 before proceeding?

This architectural decision impacts what should be profiled and what cleanup patterns are appropriate.

## Recommendations

### Option 1: Defer Task (RECOMMENDED)

**Status**: Change task to `blocked` with `blocked_reason: "Requires manual profiling and Skia integration completion"`

**Rationale**:
- Manual profiling cannot be automated
- Skia canvas integration must be completed first (prerequisite work)
- Architectural decision about integration approach needed (issue #3517 workaround vs. current approach)

**Next steps**:
1. Create prerequisite task: "Wire up Skia canvas to VisionCamera frame processor" (architectural decision + integration)
2. Document manual profiling procedures for human execution
3. Re-evaluate this task after Skia integration is complete and manual profiling results are available

### Option 2: Implement Cleanup Hooks Only (PARTIAL)

**Status**: Reduce task scope to step 3 (cleanup hooks implementation)

**Work that can be completed autonomously**:
- Implement `useEffect` cleanup hooks in `CameraWithOverlay.tsx`
- Add resource disposal for Skia objects (Paint, ColorFilter, etc.)
- Document cleanup patterns based on React best practices and issue #3517 recommendations

**Limitations**:
- No way to validate cleanup hooks actually prevent leaks (requires profiling)
- Cleanup hooks may be ineffective if architecture changes per issue #3517 workaround
- Incomplete task outcome (profiling and validation steps remain blocked)

### Option 3: Document Profiling Procedures (ALTERNATIVE)

**Status**: Convert task to documentation-only

**Work that can be completed autonomously**:
- Create comprehensive profiling procedure guide (step-by-step Xcode Instruments + Android Profiler usage)
- Document baseline vs. Skia comparison methodology
- Template evidence file structure for human to fill in with profiling results
- Checklist for validating cleanup hooks and mitigations

**Limitations**:
- Does not complete original task outcome (memory profiling and mitigation implementation)
- Human must still perform actual profiling work
- Skia integration must still be completed first

## Conclusion

**TASK-0911D is blocked and requires manual intervention**. The task cannot proceed autonomously due to:

1. **Manual profiling requirement** (Xcode Instruments, Android Profiler, 5-10 min sessions)
2. **Incomplete Skia canvas integration** (prerequisite work)
3. **Architectural decision required** (issue #3517 workaround vs. current approach)

**Recommended action**: Change task status to `blocked` with reason "Requires manual profiling and Skia integration completion". Create prerequisite task for Skia canvas wiring. Document profiling procedures for human execution.

---

## Appendix: Manual Profiling Procedure Draft

For future reference when Skia integration is complete, here is the profiling procedure outline:

### iOS Profiling (Xcode Instruments)

1. **Setup**:
   - Open Xcode project in `mobile/ios/`
   - Select iPhone 15 or similar device/simulator
   - Product → Profile (⌘I) → Allocations template

2. **Baseline profiling**:
   - Launch app and navigate to camera screen
   - Start recording allocations
   - Run camera for 5-10 minutes
   - Capture screenshots of memory graph (peak usage, growth rate)
   - Export allocation timeline data

3. **Skia profiling**:
   - Enable Skia frame processors (enable overlays in UI)
   - Start recording allocations
   - Run camera with overlays for 5-10 minutes
   - Capture screenshots of memory graph
   - Export allocation timeline data

4. **Analysis**:
   - Compare peak memory: Skia vs. baseline
   - Calculate memory growth rate per minute
   - Identify leak patterns (objects not released)
   - Document findings in evidence file

### Android Profiling (Android Profiler)

1. **Setup**:
   - Open Android Studio
   - Connect device or emulator
   - View → Tool Windows → Profiler
   - Select Memory profiler

2. **Baseline profiling**:
   - Launch app and navigate to camera screen
   - Start memory recording
   - Run camera for 5-10 minutes
   - Capture heap dump and screenshots
   - Export memory timeline data

3. **Skia profiling**:
   - Enable Skia frame processors (enable overlays in UI)
   - Start memory recording
   - Run camera with overlays for 5-10 minutes
   - Capture heap dump and screenshots
   - Export memory timeline data

4. **Analysis**:
   - Compare heap growth: Skia vs. baseline
   - Identify unreleased objects (native allocations)
   - Calculate memory growth rate per minute
   - Document findings in evidence file

### Success Criteria

Per acceptance criteria in task file:

- Baseline memory usage established for iOS and Android
- Skia frame processor memory usage profiled for iOS and Android
- Memory growth rate during Skia sessions ≤ 10% above baseline
- No critical memory leaks detected by profilers
- Cleanup hooks properly release resources on unmount
- Profiling procedures documented in evidence file

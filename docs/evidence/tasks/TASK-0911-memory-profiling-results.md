# TASK-0911 Memory Profiling Evidence

**Status:** DEFERRED (Formal profiling), BASIC VALIDATION ONLY (Android pilot)
**Date:** 2025-11-11
**Related Tasks:** TASK-0911 (parent), TASK-0911G (canvas integration), TASK-0911D (validation), TASK-0911E (feature flags)
**Related ADRs:** ADR-0011 (Android-first pilot), ADR-0012 (VisionCamera Skia integration)

---

## Executive Summary

Formal memory profiling (Xcode Instruments for iOS, Android Studio Profiler for Android) has been **deferred** for the Android pilot phase per user preference and risk tolerance. Basic validation using React DevTools component profiler is used instead for Android pilot. iOS testing is explicitly deferred to post-pilot phase per ADR-0011 (Android-first pilot strategy).

### Key Decisions

1. **Formal Profiling Deferred**: User preference for pilot; acceptable risk given feature flags and pilot scope
2. **Android-First Strategy**: Pilot on Android only; iOS deferred per ADR-0011
3. **Basic Validation Approach**: React DevTools + 2-3 min visual testing instead of formal profiling
4. **Architecture Decision**: Complete current Skia integration for Android (ADR-0012); defer iOS workaround evaluation

---

## Deferral Rationale

### User Preference
- **Pilot risk tolerance**: User explicitly chose to skip formal profiling for pilot phase
- **Feature flags as mitigation**: User toggle + frame budget telemetry provide safety net
- **Time savings**: Formal profiling requires 30-40 min human time (5-10 min sessions × 2 platforms × baseline + Skia)

### Android-First Pilot Strategy (ADR-0011)
- **Industry precedent**: Shopify engineering uses Android-first rollout for risk mitigation
- **Rollout control**: Google Play staged rollout provides instant stop capability
- **Market alignment**: Android dominates global market share (>70%)
- **Resource efficiency**: Solo developer can focus deeply on one platform at a time

### VisionCamera Issue #3517 Context
- **iOS-specific memory leak**: `useSkiaFrameProcessor` memory leak reported on iOS 18.5, iPhone 15
- **Android status unknown**: No reports of leak on Android; basic validation will surface obvious issues
- **Community workaround exists**: Separation architecture (separate processing + rendering) documented in ADR-0012 for future iOS implementation if needed

### Architectural Decision (ADR-0012)
- **Current approach for Android**: Complete canvas wiring at CameraWithOverlay.tsx:128
- **Platform-specific strategy**: Add iOS workaround only if testing reveals issue
- **Frame processors platform-agnostic**: Already implemented correctly in frameProcessors.ts; shared across platforms

---

## Alternative Validation Approach (Android Pilot)

### Validation Method
**Tool**: React DevTools component profiler (development builds)
**Duration**: 2-3 minute camera sessions with overlays enabled
**Scope**: Android emulator + pilot tester devices (API 29+, 4GB+ RAM)

### Test Scenarios
1. **Bounding box overlays**: Enable `drawBoundingBoxes` frame processor
2. **Live filter overlays**: Enable `applyLiveFilters` (grayscale, sepia, blur)
3. **AI overlay graphics**: Enable `drawAIOverlay` frame processor
4. **Combined overlays**: All three enabled simultaneously
5. **Component lifecycle**: Unmount and remount to verify cleanup hooks

### Success Criteria
- ✅ No obvious memory growth over 2-3 minute sessions (visual inspection)
- ✅ React DevTools component profiler shows acceptable memory patterns
- ✅ No severe frame drops or UI thread starvation
- ✅ Cleanup hooks properly release resources on unmount

### Monitoring Strategy
- **Feature flags**: User toggle allows quick disable if issues arise (TASK-0911E)
- **Frame budget telemetry**: Log >16ms violations with device model (TASK-0911E)
- **Pilot scope**: Limited initial exposure to pilot testers only
- **User feedback**: Gather reports from pilot testers on performance issues

---

## Android Validation Results

> **Note**: Canvas integration completed in TASK-0911G. Basic validation pending in TASK-0911D.

### Canvas Integration (TASK-0911G)
**Status:** COMPLETED (2025-11-11)
**Deliverables:**
- Canvas wiring completed at `mobile/src/features/camera/CameraWithOverlay.tsx` (lines 115-136)
- Cleanup hooks implemented via useEffect (lines 138-145)
- Static analysis passes (typecheck + lint)
- Implementation documented in `docs/evidence/tasks/TASK-0911G-implementation-notes.md`

**Validation Checklist:**
- [x] Canvas connected to `applyCombinedOverlays` via `useSkiaFrameProcessor`
- [x] useEffect cleanup hook implemented for Skia resource disposal on unmount
- [x] DrawableFrame pattern implemented (frame extends both Frame and SkCanvas)
- [x] `frame.render()` call added to render camera feed before overlays
- [x] QA static passes (typecheck + lint)
- [ ] Bounding box overlays render correctly (TASK-0911D)
- [ ] Live filter overlays render correctly (TASK-0911D)
- [ ] AI overlay graphics render correctly (TASK-0911D)
- [ ] No obvious visual glitches or frame drops (TASK-0911D)

**Implementation Summary:**
- Used `useSkiaFrameProcessor` hook from `react-native-vision-camera`
- DrawableFrame extends both Frame and SkCanvas - passed twice to `applyCombinedOverlays`
- Cleanup hook provides extension point for future resource management
- Worklet-scoped resources (Paint, Color, etc.) are automatically garbage collected
- Android-first approach per ADR-0011 and ADR-0012

### Basic Memory Validation (TASK-0911D)
**Status:** PENDING (blocked by TASK-0911G)
**Tool:** React DevTools component profiler

**Test Results:** (To be filled after TASK-0911D completion)

| Test Scenario | Duration | Memory Pattern | Frame Drops | Issues |
|--------------|----------|----------------|-------------|--------|
| Bounding boxes only | 2-3 min | TBD | TBD | TBD |
| Live filters only | 2-3 min | TBD | TBD | TBD |
| AI overlays only | 2-3 min | TBD | TBD | TBD |
| All overlays combined | 2-3 min | TBD | TBD | TBD |
| Component remount test | N/A | TBD | N/A | TBD |

**Observations:** (To be documented after testing)

**Conclusion:** (To be determined after testing)

---

## iOS Status: EXPLICITLY DEFERRED

### Deferral Scope
- **iOS testing**: Deferred to post-pilot phase per ADR-0011
- **iOS memory leak workaround**: Separation architecture documented in ADR-0012; implementation deferred
- **iOS device allowlist**: Deferred to iOS pilot phase (TASK-0911E scope)
- **iOS formal profiling**: Deferred until iOS support added

### When to Resume iOS Work

**Triggers for iOS Pilot Phase:**
1. ✅ Android pilot completes successfully (no critical issues)
2. ✅ Business validation confirms market fit
3. ✅ User feedback from Android pilot is positive
4. ✅ Development capacity available for iOS work

**iOS Implementation Path** (ADR-0012):
1. Test current architecture on iOS simulator
2. Reproduce/validate VisionCamera issue #3517 status
3. **If leak exists**: Implement separation architecture (create `CameraWithOverlay.ios.tsx`)
4. **If no leak**: Ship with shared codebase
5. Create iOS-specific validation tasks (TASK-0911-iOS series)

### VisionCamera Issue #3517 Details

**GitHub Issue**: https://github.com/mrousavy/react-native-vision-camera/issues/3517
**Status**: Open (as of November 2025)
**Platform**: iOS-specific (iPhone 15, iOS 18.5, VisionCamera 4.6.4)
**Symptom**: Continuous memory growth → app crash after minutes
**Root Cause**: Bridge interaction between VisionCamera and Skia libraries
**Community Workaround**: Separation architecture (ADR-0012 Section "Separation Architecture")

**Workaround Implementation** (if needed):
- Use standard `useFrameProcessor` (not `useSkiaFrameProcessor`)
- Process frame data in worklet
- Pass results to React state via `Worklets.createRunOnJS`
- Render overlays separately using Skia `Canvas` component (absolute positioned)
- Benefit: Avoids leaky bridge interaction entirely

---

## Formal Profiling: When to Revisit

### Conditions for Formal Profiling

Formal profiling (Xcode Instruments / Android Studio Profiler) should be revisited if:

1. **Specific Memory Issues Observed**:
   - Basic validation reveals obvious memory growth
   - Pilot testers report app crashes or performance degradation
   - Frame budget telemetry shows consistent violations

2. **Wide Device Rollout Preparation**:
   - Expanding beyond pilot testers to general availability
   - Need baseline data for device allowlist expansion
   - Regulatory/compliance requirements for performance documentation

3. **iOS Support Phase**:
   - Adding iOS support requires profiling to validate issue #3517 status
   - Baseline comparison needed if iOS workaround implemented
   - iOS-specific memory patterns need documentation

4. **Post-Pilot Optimization**:
   - After pilot success, optimize for broader device range
   - Lower allowlist criteria (e.g., API 26+, 3GB+ RAM)
   - Need data to support lower-end device decisions

### Formal Profiling Procedure (Future Reference)

**Tools:**
- iOS: Xcode Instruments → Allocations template
- Android: Android Studio Profiler → Memory profiler

**Baseline Profiling** (5-10 min sessions):
1. Disable Skia frame processors
2. Run camera for 5-10 minutes
3. Record peak memory, allocation rate, leak patterns

**Skia Profiling** (5-10 min sessions):
1. Enable Skia frame processors (all overlays)
2. Run camera for 5-10 minutes
3. Record peak memory, allocation rate, leak patterns

**Comparison Analysis**:
- Peak memory: Skia vs. baseline (target: ≤10% increase)
- Memory growth rate: Skia vs. baseline (target: ≤10% increase)
- Leak detection: Identify unreleased resources
- Device model correlation: Which devices meet budget

**Documentation**:
- Screenshot profiler graphs (memory over time)
- Export allocation data (CSV or profiler native format)
- Document procedure for reproducibility
- Link to VisionCamera issue #3517 findings

---

## Feature Flags and Mitigation (TASK-0911E)

### Pilot-Friendly Defaults
- **Default behavior**: Frame processors **enabled** by default for Android pilot
- **Rationale**: Maximize pilot tester exposure to feature
- **Safety net**: User toggle provides easy opt-out if issues arise

### User Toggle in Settings
- **Location**: Settings screen
- **Behavior**: Toggle to disable frame processors if performance issues
- **Warning**: Performance warning displayed when enabling on non-allowlist devices
- **Persistence**: AsyncStorage or Redux state persists across app restarts

### Device Allowlist (Android)
**Criteria**: API 29+, 4GB+ RAM (conservative)
**Examples**: Pixel 4+, Samsung Galaxy S10+, modern mid-range devices
**iOS**: Explicitly deferred to iOS pilot phase

### Frame Budget Telemetry
- **Monitor**: Frame processing times (target: <16ms for 60 FPS)
- **Log**: Violations with device model, OS version, frame processor type
- **Purpose**: Identify devices for allowlist expansion
- **Tool**: Custom monitor in `mobile/src/features/camera/frameBudgetMonitor.ts`

---

## References

### ADRs
- [ADR-0011: Android-First Pilot Rollout Strategy](/home/jeffreymoya/dev/photoeditor/adr/0011-android-first-pilot-strategy.md)
- [ADR-0012: VisionCamera Skia Integration Architecture](/home/jeffreymoya/dev/photoeditor/adr/0012-visioncamera-skia-integration.md)

### Tasks
- [TASK-0911: VisionCamera + Background Task Pilot (Parent)](/home/jeffreymoya/dev/photoeditor/tasks/mobile/TASK-0911-visioncamera-background-task-pilot.task.yaml)
- [TASK-0911G: Complete Skia Canvas Integration (Android)](/home/jeffreymoya/dev/photoeditor/tasks/mobile/TASK-0911G-complete-skia-canvas-integration-android.task.yaml)
- [TASK-0911D: Validate Memory Usage (Android Pilot)](/home/jeffreymoya/dev/photoeditor/tasks/mobile/TASK-0911D-memory-profiling-mitigations.task.yaml)
- [TASK-0911E: Feature Flags and Guardrails (Android Pilot)](/home/jeffreymoya/dev/photoeditor/tasks/mobile/TASK-0911E-feature-flags-guardrails.task.yaml)

### External Resources
- [VisionCamera Issue #3517: Memory Leak in useSkiaFrameProcessor](https://github.com/mrousavy/react-native-vision-camera/issues/3517)
- [VisionCamera Frame Processors Documentation](https://react-native-vision-camera.com/docs/guides/frame-processors)
- [VisionCamera Skia Integration Guide](https://react-native-vision-camera.com/docs/guides/skia-frame-processors)
- [VisionCamera Performance Best Practices](https://react-native-vision-camera.com/docs/guides/performance)
- [Shopify: Migrating to React Native's New Architecture](https://shopify.engineering/react-native-new-architecture) - Android-first rollout precedent
- [React Native: Platform-Specific Code](https://reactnative.dev/docs/platform-specific-code) - Official guidance

### Pilot Document
- [VisionCamera + Background Task Pilot Outcomes](/home/jeffreymoya/dev/photoeditor/docs/mobile/visioncamera-background-task-pilot.md)

---

## Change Log

| Date | Author | Change |
|------|--------|--------|
| 2025-11-11 | Claude Code | Initial evidence file created with deferral rationale and Android pilot scope |
| TBD | Agent/Human | Update with Android validation results after TASK-0911G and TASK-0911D |
| TBD | Agent/Human | Update with iOS evaluation results when iOS pilot phase begins |

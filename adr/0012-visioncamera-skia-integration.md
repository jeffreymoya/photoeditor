# ADR-0012: VisionCamera Skia Integration Architecture

**Status:** Accepted
**Date:** 2025-11-11
**Deciders:** Solo developer
**Related:** ADR-0009 (Mobile Stack Modernization), ADR-0011 (Android-First Pilot Strategy), TASK-0911

---

## Context

PhotoEditor's camera feature requires real-time overlay rendering for:
1. **Bounding boxes** - AI-detected object regions
2. **Live filters** - Real-time image effects (grayscale, sepia, blur)
3. **AI overlays** - Custom graphics and annotations

The VisionCamera v4 library provides frame processor capabilities with optional Skia integration for GPU-accelerated rendering. Two architectural approaches are available:

### Approach A: Direct Skia Frame Processor (`useSkiaFrameProcessor`)
- Uses `useSkiaFrameProcessor` hook from `react-native-skia`
- Renders directly on camera frames within frame processor worklet
- Single integrated processing + rendering pipeline
- **Issue**: VisionCamera #3517 reports memory leak on iOS causing app crashes

### Approach B: Separated Frame Processing + Rendering
- Uses standard `useFrameProcessor` for frame processing
- Extracts frame data and passes to React state via `Worklets.createRunOnJS`
- Renders overlays separately using Skia `Canvas` component (absolute positioned)
- **Benefit**: Avoids leaky bridge interaction between VisionCamera and Skia

### Current Implementation Status
- **Frame processors**: Fully implemented in `mobile/src/features/camera/frameProcessors.ts`
  - `drawBoundingBoxes`, `applyLiveFilters`, `drawAIOverlay`
  - `applyCombinedOverlays` orchestration function
  - All use `'worklet'` directive and Skia Rect/RRect/ImageFilter APIs
- **Camera component**: `mobile/src/features/camera/CameraWithOverlay.tsx`
  - `useFrameProcessor` hook configured
  - Canvas wiring commented out (line 128) with TODO
  - Shared values set up for passing parameters to frame processors

### VisionCamera Issue #3517 Details
- **Status**: Open (as of Nov 2025)
- **Platform**: iOS-specific (iPhone 15, iOS 18.5, VisionCamera 4.6.4)
- **Symptom**: Continuous memory growth → app crash after minutes
- **Root cause**: Bridge interaction between VisionCamera and Skia libraries
- **Workaround**: Community-validated separation architecture (Approach B)
- **Android status**: Unknown, no reports of leak on Android

### Project Context
- **Platform strategy**: Android-first pilot (ADR-0011)
- **Pilot scope**: Android validation only initially
- **Resource constraints**: Solo developer, limited capacity for dual-platform debugging
- **Risk tolerance**: Skip formal profiling for pilot, rely on basic validation + feature flags

---

## Decision

**For Android pilot: Complete current architecture (Approach A) with canvas wiring**

**For iOS (future): Evaluate platform-specific workaround based on testing**

### Android Pilot Implementation

1. **Complete canvas wiring** at `CameraWithOverlay.tsx:128`
   - Uncomment `applyCombinedOverlays` call
   - Wire up Skia canvas to frame processor
   - Validate overlays render correctly on Android emulator and test devices

2. **Add resource cleanup hooks**
   - Implement `useEffect` cleanup for Skia resources
   - Dispose frame processor on component unmount
   - Follow VisionCamera performance best practices (keep Camera mounted, toggle `isActive`)

3. **Basic validation only** (no formal profiling)
   - Visual testing: overlays render correctly
   - Performance testing: 2-3 min sessions, no obvious memory growth
   - React DevTools component profiler for render performance
   - Frame drop monitoring via VisionCamera logging

4. **Android-first focus**
   - Frame processors are platform-agnostic (already implemented correctly)
   - Camera component wiring targets Android initially
   - iOS support deferred to post-pilot phase

### iOS Future Evaluation Path

**When adding iOS support** (post-Android pilot):

**Step 1**: Test current architecture on iOS simulator
- Run Android implementation on iOS
- Monitor for memory leak symptoms (Xcode Instruments if issues suspected)
- Reproduce/validate VisionCamera #3517 status

**Step 2**: Decision based on test results

**If no memory leak observed**:
- ✅ Ship with shared codebase (current architecture)
- No platform-specific files needed
- Maintain code simplicity

**If issue #3517 reproduced**:
- ❌ Implement platform-specific workaround (Approach B - Separation Architecture)
- Create `CameraWithOverlay.ios.tsx` with separated rendering
- Keep `frameProcessors.ts` shared (platform-agnostic)
- Document platform differences in code comments

### Separation Architecture (iOS Workaround, if needed)

**File structure**:
```
mobile/src/features/camera/
├── frameProcessors.ts           # Shared (worklets)
├── CameraWithOverlay.tsx        # Android (current approach)
└── CameraWithOverlay.ios.tsx    # iOS (separated rendering)
```

**iOS implementation approach** (if workaround needed):
1. Use standard `useFrameProcessor` (not `useSkiaFrameProcessor`)
2. Process frame and extract overlay data in worklet
3. Pass data to React state via `Worklets.createRunOnJS`
4. Render Skia overlays in separate `<Canvas>` component positioned absolutely
5. Add proper cleanup hooks for Skia resources

**Benefits of deferred decision**:
- Don't add complexity until proven necessary
- Industry best practice: avoid premature platform-specific splits
- React Native guidance: maximize shared code

---

## Consequences

### Positive

1. **Simpler Android pilot path**: Complete existing architecture, no workaround complexity
2. **Faster time-to-pilot**: Uncomment one line vs. architectural refactoring
3. **Platform best practices**: Defer iOS-specific work until iOS support needed
4. **Code simplicity**: Shared codebase unless platform issues force split
5. **Risk mitigation**: Android-first reduces exposure if iOS leak exists
6. **Future flexibility**: Can adopt either approach for iOS based on testing

### Negative

1. **Potential iOS rework**: If leak reproduced, must implement separation architecture
2. **Unknown Android status**: Issue #3517 status on Android unclear (mitigated by feature flags + basic validation)
3. **Deferred iOS certainty**: Won't know iOS path until post-pilot testing

### Neutral

1. **Frame processors already correct**: Platform-agnostic worklets remain shared regardless of iOS approach
2. **Cleanup hooks required**: Both approaches need proper resource disposal
3. **Performance requirements unchanged**: 16ms frame budget applies to both approaches

---

## Technical Details

### Resource Cleanup Requirements

**Must implement** (both Android and iOS, both approaches):

```typescript
useEffect(() => {
  // Frame processor setup
  return () => {
    // Cleanup on unmount:
    // 1. Dispose Skia resources (if allocated)
    // 2. Cancel any pending worklets
    // 3. Release frame processor references
  };
}, [dependencies]);
```

### VisionCamera Best Practices Applied

1. **Camera lifecycle**: Keep `<Camera>` mounted, toggle `isActive` prop
   - Faster resume, keeps session warm
   - Reduces setup/teardown overhead

2. **Frame format selection**: Use appropriate resolution for use case
   - Don't request 4K if only need 1080p
   - Balance quality vs. processing cost

3. **Native processing preference**: Frame processors are native worklets
   - GPU-accelerated Skia operations
   - Minimal JS bridge crossing

4. **Performance monitoring**: Frame budget tracking (16ms = 60 FPS)
   - Log violations via VisionCamera logging
   - Feature flag allows quick disable if issues

### Frame Processor Implementation Notes

**Current implementation (`frameProcessors.ts`)** already follows best practices:
- ✅ `'worklet'` directive on all functions
- ✅ GPU-accelerated Skia APIs (Rect, RRect, ImageFilter, Paint)
- ✅ Pure functions where possible (TypeScript standards)
- ✅ Platform-agnostic (no iOS/Android-specific code)
- ✅ Composition pattern (`applyCombinedOverlays` orchestrates three processors)

**No changes needed** for iOS support - frame processors work on both platforms.

### Canvas Wiring Details

**Current state** (`CameraWithOverlay.tsx:128`):
```typescript
// Apply overlays (actual canvas integration deferred to VisionCamera Skia setup)
if (options.filters || options.boxes || options.overlay) {
  // applyCombinedOverlays(_frame, canvas, options);
  // TODO: Wire up actual Skia canvas when VisionCamera Skia plugin is configured
}
```

**Android pilot implementation** (TASK-0911G):
```typescript
// Apply overlays to camera frame
if (options.filters || options.boxes || options.overlay) {
  applyCombinedOverlays(_frame, canvas, options);
}
```

**iOS workaround** (if needed, separate file):
```typescript
// iOS: Separate rendering due to VisionCamera issue #3517
useFrameProcessor((frame) => {
  const overlayData = extractOverlayData(frame, options);
  runOnJS(setOverlayState)(overlayData); // Pass to React state
}, [options]);

// Separate Canvas component renders overlays
<Canvas style={StyleSheet.absoluteFill}>
  <RenderOverlays data={overlayState} />
</Canvas>
```

---

## Alternatives Considered

### Alternative 1: Implement Separation Architecture for Both Platforms Now
**Rejected because**:
- Violates platform-specific code best practices (React Native guidance)
- Adds complexity before proving it's necessary
- Android may not have memory leak (issue #3517 iOS-specific)
- Slower path to pilot validation
- Code split maintenance burden without confirmed benefit

### Alternative 2: Wait for Upstream Fix
**Rejected because**:
- Issue #3517 has no fix timeline
- Blocks entire camera feature indefinitely
- Android pilot can proceed with current approach
- Can still adopt workaround later if needed

### Alternative 3: Use Different Camera Library
**Rejected because**:
- VisionCamera is industry-standard React Native camera library
- Issue #3517 is iOS-specific, not fundamental library problem
- Community workaround is validated
- Already invested in VisionCamera integration (ADR-0009)

### Alternative 4: Disable Skia Overlays Entirely
**Rejected because**:
- Overlays are core feature requirement (bounding boxes, filters, AI annotations)
- Would require alternative UI approach (inferior UX)
- Skia frame processors are performant solution when working correctly
- Feature flags provide per-device control without removing capability

---

## Implementation Plan

### Phase 1: Android Pilot (TASK-0911G)
1. Uncomment canvas wiring at line 128
2. Validate overlay rendering on Android emulator
3. Test on Android pilot devices
4. Add cleanup hooks (useEffect unmount)
5. Basic memory validation (2-3 min visual testing)
6. Document Android validation results

**Success Criteria**:
- Overlays render correctly (bounding boxes, filters, AI graphics)
- No obvious memory growth over 2-3 min sessions
- Frame processing consistently <16ms
- Component unmount cleans up resources

### Phase 2: iOS Evaluation (Post-Pilot)
1. Test Android implementation on iOS simulator
2. Run 2-3 min sessions, monitor for memory growth
3. If issues suspected: Run Xcode Instruments (Allocations)

**Decision Point**:
- **No leak** → Ship with shared code
- **Leak reproduced** → Proceed to Phase 3

### Phase 3: iOS Workaround (If Needed)
1. Create `CameraWithOverlay.ios.tsx`
2. Implement separation architecture (Approach B)
3. Keep `frameProcessors.ts` shared
4. Add iOS-specific tests
5. Document platform differences
6. Update this ADR with final iOS approach

---

## Monitoring and Rollback

### Feature Flag Protection
TASK-0911E implements feature flags:
- **Device allowlist**: Restrict to known-good devices
- **User toggle**: Settings UI to disable overlays if issues
- **Frame budget telemetry**: Log >16ms violations
- **Pilot-friendly defaults**: Enabled for pilot testers, easy to toggle off

### Rollback Strategy
1. **Immediate**: User toggle in Settings disables frame processors
2. **Fast**: Remove device from allowlist (server-side control if implemented)
3. **Safe**: Feature flag prevents wide exposure before validation

### Memory Monitoring
- React DevTools component profiler (dev builds)
- VisionCamera frame drop logging (all builds)
- User feedback from pilot testers
- Optional: Android Studio profiler if specific issues arise

---

## References

- [VisionCamera Documentation](https://react-native-vision-camera.com/)
- [VisionCamera Frame Processors](https://react-native-vision-camera.com/docs/guides/frame-processors)
- [VisionCamera Skia Integration](https://react-native-vision-camera.com/docs/guides/skia-frame-processors)
- [VisionCamera Issue #3517](https://github.com/mrousavy/react-native-vision-camera/issues/3517) - iOS memory leak
- [React Native Platform-Specific Code](https://reactnative.dev/docs/platform-specific-code) - Official guidance
- [Shopify React Native New Architecture](https://shopify.engineering/react-native-new-architecture) - Rollout strategy reference
- ADR-0009: Mobile Stack Modernization
- ADR-0011: Android-First Pilot Rollout Strategy
- TASK-0911: VisionCamera + Background Task Pilot
- TASK-0911G: Complete Skia Canvas Integration (Android)

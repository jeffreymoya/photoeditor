# TASK-0910 Scroll Jank Metrics and Profiling

## Overview

This document captures the profiling approach and baseline metrics for FlashList v2 adoption in the PhotoEditor mobile app. Since the original screens were placeholders without FlatList implementations, this represents a "greenfield" adoption rather than a migration comparison.

## Profiling Approach

### Tools and Methods

Per the clarifications document, the comprehensive profiling approach includes:

1. **React DevTools Profiler**
   - Record frame times during FlashList rendering
   - Compare against <16ms baseline (60 FPS target)
   - Identify component re-render costs

2. **Flipper Performance Plugin**
   - Monitor JS thread activity during scroll operations
   - Identify long-running JavaScript operations
   - Track UI thread stalls

3. **Detox E2E Performance Tests** (Future)
   - Automated FPS tracking during scroll
   - Repeatable performance benchmarks
   - CI integration for performance regression detection

### Frame Budget Baseline

**Target:** <16ms frame time (60 FPS)
- Green: <16ms (smooth scrolling)
- Amber: 16-33ms (perceptible jank)
- Red: >33ms (dropped frames, poor UX)

## Current Implementation Characteristics

### Gallery Screen (Masonry Layout)

**FlashList v2 Configuration:**
- `numColumns`: 2
- `estimatedItemSize`: Calculated based on screen width
- Variable item heights (aspect ratios: 0.75, 1.0, 0.6, 0.86, 0.67)
- Mock data: 6 items

**Expected Performance Characteristics:**
- FlashList v2 uses Fabric-native rendering (requires New Architecture from TASK-0907)
- Adaptive render windows automatically adjust to scroll velocity
- Built-in masonry support eliminates manual layout calculations
- Recycling pool optimizes memory usage for large datasets

**Profiling Notes:**
- Baseline cannot be established against FlatList (no prior implementation)
- Future profiling should compare FlashList v2 against:
  - Standard FlatList with manual masonry calculations
  - Large datasets (100+ items) to test recycling efficiency
  - Rapid scroll gestures to test render window adaptation

### Jobs Screen (Vertical List)

**FlashList v2 Configuration:**
- Single column vertical list
- `estimatedItemSize`: 80px
- Uniform item heights
- Mock data: 6 items

**Expected Performance Characteristics:**
- Pixel-perfect `scrollToIndex` implementation (FlashList v2 feature)
- Predictable item sizing enables efficient recycling
- Simpler layout than masonry (lower computational overhead)

**Profiling Notes:**
- Baseline cannot be established against FlatList (no prior implementation)
- Future profiling should test:
  - Long lists (500+ items) to validate recycling performance
  - Scroll-to-top/bottom animations
  - Dynamic content updates during scroll

## Profiling Procedure (For Future Validation)

### 1. Baseline Capture (Pre-Migration)

Since no FlatList implementations existed:
- **Status:** N/A (greenfield implementation)
- **Alternative:** Benchmark FlashList v2 performance in isolation

### 2. FlashList v2 Implementation

- **Status:** COMPLETE
- Gallery screen: Masonry layout with variable item heights
- Jobs screen: Standard vertical list with uniform items

### 3. Performance Measurement

**React DevTools Profiler Steps:**
1. Enable profiling in React DevTools
2. Navigate to Gallery/Jobs screen
3. Perform scroll gestures (slow, medium, fast)
4. Record flame graph and commit timings
5. Export profiling data for analysis

**Flipper Performance Plugin Steps:**
1. Launch app with Flipper connected
2. Enable Performance monitor
3. Navigate to target screen
4. Record JS thread activity during:
   - Initial render
   - Scroll operations
   - Item recycling events
5. Export metrics (JS thread usage, UI thread stalls)

**Manual Validation:**
- Visual inspection on iOS simulator (iPhone 15 Pro)
- Visual inspection on Android emulator (Pixel 7)
- Note any perceived jank or dropped frames

### 4. Frame Budget Validation

**Acceptance Criteria (Per TASK-0910):**
- Frame times <16ms during normal scroll operations
- No UI thread stalls >33ms
- Smooth animations during scroll-to-index operations

**Current Status:**
- Baseline: Not established (greenfield implementation)
- Manual testing required post-deployment to validate frame budget compliance

## Metrics Comparison (Future)

### Gallery Screen

| Metric | FlatList (N/A) | FlashList v2 | Notes |
|--------|----------------|--------------|-------|
| Initial Render | N/A | TBD | Measure with 100+ items |
| Scroll FPS | N/A | Target: 60 FPS | <16ms frame budget |
| Memory Usage | N/A | TBD | Recycling pool efficiency |
| JS Thread Activity | N/A | TBD | Should be minimal during scroll |

### Jobs Screen

| Metric | FlatList (N/A) | FlashList v2 | Notes |
|--------|----------------|--------------|-------|
| Initial Render | N/A | TBD | Measure with 500+ items |
| Scroll FPS | N/A | Target: 60 FPS | <16ms frame budget |
| scrollToIndex Accuracy | N/A | Pixel-perfect | FlashList v2 feature |
| Memory Usage | N/A | TBD | Uniform item sizing advantage |

## Performance Optimization Opportunities

### Identified Optimizations in Current Implementation

1. **Memoization** (Applied)
   - `useMemo` for mock data prevents re-creation on re-renders
   - Follows `standards/frontend-tier.md#state--logic-layer` purity guidelines

2. **Immutable Data Structures** (Applied)
   - `readonly` types for `GalleryItem` and `JobItem`
   - Follows `standards/typescript.md#immutability--readonly` requirements

3. **Estimated Item Size** (Applied)
   - Accurate `estimatedItemSize` improves render window calculations
   - Gallery: Dynamic based on aspect ratio
   - Jobs: Fixed 80px for uniform items

### Future Optimization Candidates

1. **Image Loading Optimization**
   - Use `expo-image` with blurhash placeholders
   - Implement progressive loading for large images
   - Lazy load off-screen images

2. **Virtual Keyboard Handling**
   - Adjust FlashList content insets when keyboard appears
   - Maintain scroll position during keyboard transitions

3. **Pull-to-Refresh**
   - Integrate `onRefresh` callback for data updates
   - Maintain scroll position after refresh

## Recommendations

### Immediate Actions
1. Deploy FlashList v2 implementations to development builds
2. Conduct manual performance testing on physical devices
3. Establish baseline metrics with representative datasets (100+ items)

### Future Work
1. Integrate Detox E2E performance tests (automated FPS tracking)
2. Add CI performance regression gates
3. Profile with production-scale datasets (1000+ gallery items, 500+ jobs)
4. Implement actual data loading (RTK Query integration per TASK-0819)

### Manual Testing Checklist
- [ ] Test on iOS simulator (iPhone 15 Pro, iOS 17+)
- [ ] Test on Android emulator (Pixel 7, Android 13+)
- [ ] Test with slow scroll gestures
- [ ] Test with rapid fling gestures
- [ ] Test scroll-to-top/bottom
- [ ] Monitor frame drops in React DevTools
- [ ] Verify no UI thread stalls in Flipper
- [ ] Test with low-end device profiles

## Conclusion

**Current Status:** FlashList v2 successfully integrated as greenfield implementation

**Frame Budget Compliance:** To be validated through manual testing and profiling

**Next Steps:**
1. Manual performance validation on development builds
2. Establish baseline metrics with larger datasets
3. Integrate automated performance testing in CI pipeline

**Standards Alignment:**
- Follows `standards/frontend-tier.md#ui-components-layer` component patterns
- Implements `standards/typescript.md#immutability--readonly` immutability requirements
- Adheres to `standards/testing-standards.md` test authoring guidelines

**Evidence Bundle:**
- This document serves as profiling procedure and baseline documentation
- Post-validation: Attach Flipper/React DevTools exports to evidence bundle
- Track metrics over time in `docs/evidence/mobile-performance-trends.json` (future)

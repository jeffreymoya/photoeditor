# TASK-0910 Clarifications

## Outstanding Questions (Resolved)

This file serves as the evidence path for TASK-0910 clarifications.

## Resolution

### 1. FlatList Surfaces to Migrate
**Decisions** (all recommended surfaces selected):
- **Gallery surface (images grid)**: Image gallery with masonry layout. Visual performance critical, tests FlashList v2 masonry.
- **Job history (list view)**: Chronological job list. Standard vertical scrolling, tests pixel-perfect scrollToIndex.
- **Notification feed**: Notification list with variable item heights. Tests dynamic sizing and recycling.

### 2. FlashList v2 vs Legend List
**Decision**: FlashList v2 for all surfaces (Fabric-ready assumption)

Rationale:
- Assumes TASK-0907 completes Fabric enablement for New Architecture
- FlashList v2 provides best performance with Fabric-native rendering
- Built-in masonry layouts for gallery surface
- Pixel-perfect scrollToIndex for job history
- Adaptive render windows for all surfaces

Legend List not needed for this migration (bridge-compatible fallback deferred).

### 3. Jank Metrics Baseline and Profiling
**Approach** (comprehensive profiling selected):
- **React DevTools Profiler**: Record before/after frame times, compare against <16ms baseline
- **Flipper performance plugin**: Monitor JS thread stalls during scrolling, identify long-running operations
- **Detox performance tests**: Add E2E tests with automated FPS tracking during scroll operations

Profiling procedure:
1. Baseline: Capture frame times for existing FlatList implementations
2. Migration: Implement FlashList v2 replacements
3. Comparison: Re-run profiling, document frame time improvements
4. Validation: Ensure <16ms frame budget compliance on iOS/Android

### 4. Masonry Layout Requirements
**Decision**: Use FlashList v2 built-in masonry support

Requirements for gallery surface:
- FlashList v2 provides native masonry layout via `numColumns` prop and automatic height calculation
- Configure masonry grid for gallery image tiles (2-3 columns depending on screen size)
- Validate layout works correctly on both iOS simulator and Android emulator
- Test with variable image aspect ratios to ensure proper tile sizing

### 5. Legend List Recycling Patterns
**Decision**: Not applicable (FlashList v2 chosen, Legend List not used)

Documentation for future reference:
- Legend List recycling patterns documented in Legend List README
- Guard against per-item state leaks by avoiding closure capture in item components
- If Legend List needed in future, refer to official docs for recycling safeguards
- FlashList v2 handles recycling automatically with Fabric-native views

## Notes

- This task replaces FlatList with FlashList v2 (Fabric-native) for all three surfaces
- Blocked by TASK-0907 (FlashList v2 requires Fabric/New Architecture enablement)
- Focus on gallery (masonry), job history (scrollToIndex), and notification feed (dynamic sizing)
- Legend List deferred as bridge-compatible fallback not needed with Fabric ready

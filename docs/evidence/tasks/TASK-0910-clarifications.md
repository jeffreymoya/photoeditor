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

## Implementation Findings (2025-11-10)

**Current State Audit:**
- GalleryScreen.tsx: Placeholder screen with no list implementation
- JobsScreen.tsx: Placeholder screen with no list implementation
- No notification feed screen currently exists
- No existing FlatList usage found in mobile/src/screens/ or mobile/src/components/

**Revised Approach:**
Given no existing FlatList implementations exist, this task will:
1. Install FlashList v2 as planned
2. Implement representative examples in Gallery and Jobs screens demonstrating:
   - Masonry layout pattern (Gallery)
   - Standard vertical list pattern (Jobs)
   - Proper TypeScript typing for FlashList v2
   - Performance characteristics documentation
3. Create usage pattern documentation for future feature implementations
4. Defer notification feed implementation (no screen exists yet)

**Scope Adjustment:**
This is effectively a "greenfield" FlashList v2 adoption task rather than a migration task. The deliverable is proof-of-concept implementations and usage patterns that future feature work can reference.

## Notes

- This task adopts FlashList v2 (Fabric-native) for placeholder screens
- Blocked by TASK-0907 (FlashList v2 requires Fabric/New Architecture enablement)
- Focus on gallery (masonry pattern demo) and jobs (standard list pattern demo)
- Legend List deferred as bridge-compatible fallback not needed with Fabric ready
- Notification feed implementation deferred (screen doesn't exist yet)

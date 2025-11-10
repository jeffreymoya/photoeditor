# FlashList v2 and Legend List Migration Guide

## Overview

This document captures the FlashList v2 adoption outcomes, usage patterns, and best practices for the PhotoEditor mobile app. Completed as part of TASK-0910, this represents a greenfield implementation of FlashList v2 on Fabric-enabled surfaces.

**Status:** FlashList v2 adopted for Gallery and Jobs screens
**Date:** 2025-11-10
**Scope:** Proof-of-concept implementations demonstrating masonry and vertical list patterns

## Migration Context

### Original Intent vs. Actual Scope

**Planned Scope (TASK-0910 Description):**
- Replace existing FlatList implementations with FlashList v2
- Migrate gallery, job history, and notification feed surfaces
- Profile scroll jank improvements before/after migration

**Actual Scope (Adjusted):**
- **No existing FlatList implementations** found in codebase
- Screens were placeholders with no list components
- Implemented **greenfield FlashList v2 adoption** as proof-of-concept
- Notification feed deferred (screen doesn't exist yet)

**Rationale:**
This is effectively a "FlashList v2 adoption" task rather than a migration task. The deliverable is usage pattern documentation and reference implementations for future feature work.

## Technology Selection

### FlashList v2 vs Legend List

**Decision:** FlashList v2 for all surfaces (Legend List not adopted)

**Rationale:**
- TASK-0907 (Expo SDK 53) completes Fabric enablement for New Architecture
- FlashList v2 requires Fabric (drops legacy architecture support)
- Built-in masonry layouts, pixel-perfect scrollToIndex, adaptive render windows
- Legend List deferred as bridge-compatible fallback not needed

**Dependencies:**
- `@shopify/flash-list`: ^2.0.0 (Fabric-native)
- Requires Expo SDK 53+ (New Architecture enabled)
- Blocked by: TASK-0907 (completed)

## Implementation Patterns

### Gallery Screen - Masonry Layout

**File:** `mobile/src/screens/GalleryScreen.tsx`

**Pattern: Multi-Column Masonry with Variable Heights**

```typescript
import { FlashList } from '@shopify/flash-list';

type GalleryItem = {
  readonly id: string;
  readonly uri: string;
  readonly aspectRatio: number;
};

const NUM_COLUMNS = 2;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_WIDTH = (SCREEN_WIDTH - (NUM_COLUMNS + 1) * COLUMN_GAP) / NUM_COLUMNS;

export const GalleryScreen = () => {
  const items = useMemo(() => MOCK_GALLERY_ITEMS, []);

  const renderItem = ({ item }: { readonly item: GalleryItem }) => {
    const itemHeight = ITEM_WIDTH / item.aspectRatio;
    return (
      <View style={{ width: ITEM_WIDTH, height: itemHeight }}>
        {/* Image content */}
      </View>
    );
  };

  return (
    <FlashList
      data={items}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
      numColumns={NUM_COLUMNS}
    />
  );
};
```

**Key Characteristics:**
- `numColumns={2}` enables multi-column layout
- Dynamic item heights based on `aspectRatio` (masonry effect)
- FlashList v2 handles size estimation automatically with adaptive render windows
- `useMemo` for items array prevents re-creation on re-renders

**Performance Considerations:**
- FlashList v2 handles variable heights efficiently with adaptive render windows
- Aspect ratio calculations happen in render (pure function, fast)
- Recycling pool optimizes memory for large image galleries

### Jobs Screen - Standard Vertical List

**File:** `mobile/src/screens/JobsScreen.tsx`

**Pattern: Single-Column List with Uniform Item Heights**

```typescript
import { FlashList } from '@shopify/flash-list';

type JobItem = {
  readonly id: string;
  readonly name: string;
  readonly status: JobStatus;
  readonly timestamp: string;
};

export const JobsScreen = () => {
  const items = useMemo(() => MOCK_JOB_ITEMS, []);

  const renderItem = ({ item }: { readonly item: JobItem }) => {
    return (
      <View style={styles.jobCard}>
        <Text>{item.name}</Text>
        <Badge status={item.status} />
        <Text>{item.timestamp}</Text>
      </View>
    );
  };

  return (
    <FlashList
      data={items}
      renderItem={renderItem}
      keyExtractor={(item) => item.id}
    />
  );
};
```

**Key Characteristics:**
- Single column (default, no `numColumns` prop)
- FlashList v2 automatically estimates item sizes with adaptive render windows
- Discriminated union for `JobStatus` type (type-safe status badges)
- `readonly` types for immutability

**Performance Considerations:**
- Uniform item heights enable optimal recycling efficiency
- FlashList v2's adaptive render windows automatically optimize layout
- Pixel-perfect `scrollToIndex` support (future feature)

## Usage Patterns and Best Practices

### 1. Type Safety (TypeScript Standards)

**Per `standards/typescript.md#immutability--readonly`:**
- Use `readonly` for item types and data arrays
- Discriminated unions for status/type fields
- Explicit type annotations on render callbacks

```typescript
// Good: Immutable item types
type GalleryItem = {
  readonly id: string;
  readonly uri: string;
  readonly aspectRatio: number;
};

const ITEMS: readonly GalleryItem[] = [...];

// Good: Typed render callback
const renderItem = ({ item }: { readonly item: GalleryItem }) => { ... };
```

**Standards Alignment:**
- `standards/typescript.md#discriminated-unions--exhaustiveness` for status types
- `standards/frontend-tier.md#purity--immutability-in-state-management` for memoization

### 2. Performance Optimization

**Per `standards/frontend-tier.md#state--logic-layer`:**
- Memoize data arrays with `useMemo` to prevent re-creation
- Keep `renderItem` pure (no side effects, same input → same output)
- FlashList v2 automatically handles size estimation with adaptive render windows

```typescript
// Good: Memoized items prevent unnecessary re-renders
const items = useMemo(() => MOCK_GALLERY_ITEMS, []);

// Good: Pure render function
const renderItem = ({ item }: { readonly item: GalleryItem }) => {
  const itemHeight = ITEM_WIDTH / item.aspectRatio; // Pure calculation
  return <View style={{ height: itemHeight }}>{/* ... */}</View>;
};
```

**Avoid:**
- Creating new arrays/objects in render
- Inline functions that change reference on re-render
- Side effects in `renderItem` (logging, state updates)

### 3. Adaptive Render Windows

**FlashList v2 Automatic Size Estimation:**
- FlashList v2 automatically calculates render windows using adaptive algorithms
- No manual `estimatedItemSize` prop needed (not part of FlashList v2 API)
- Render windows adjust dynamically based on scroll velocity and measured layouts
- Reduces blank space during scroll without manual tuning

**Note:** Unlike FlatList or FlashList v1, FlashList v2 handles size estimation internally, eliminating the need for manual configuration.

### 4. Key Extractor

**Per `standards/typescript.md#analyzability`:**
- Always provide `keyExtractor` for stable item identity
- Use unique, stable IDs (not array indices)
- Enables efficient recycling and updates

```typescript
// Good: Stable unique keys
keyExtractor={(item) => item.id}

// Bad: Array indices (breaks recycling on reorder)
keyExtractor={(item, index) => index.toString()}
```

## Masonry Layout Implementation Notes

### FlashList v2 Masonry Support

**Built-in Features:**
- `numColumns` prop enables multi-column layout
- Variable item heights automatically handled
- No manual layout calculations required

**Implementation Pattern:**

```typescript
// 1. Calculate column width from screen dimensions
const COLUMN_GAP = spacing.sm;
const NUM_COLUMNS = 2;
const SCREEN_WIDTH = Dimensions.get('window').width;
const ITEM_WIDTH = (SCREEN_WIDTH - (NUM_COLUMNS + 1) * COLUMN_GAP) / NUM_COLUMNS;

// 2. Calculate item height based on aspect ratio
const renderItem = ({ item }: { readonly item: GalleryItem }) => {
  const itemHeight = ITEM_WIDTH / item.aspectRatio;
  return <View style={{ width: ITEM_WIDTH, height: itemHeight }}>...</View>;
};

// 3. Configure FlashList with numColumns
<FlashList
  data={items}
  renderItem={renderItem}
  numColumns={NUM_COLUMNS}
/>
```

**Adaptive Columns (Responsive):**

For responsive layouts that adjust columns based on screen size:

```typescript
import { useWindowDimensions } from 'react-native';

const { width } = useWindowDimensions();
const numColumns = width > 768 ? 3 : 2; // Tablet vs phone

// Note: Changing numColumns requires remounting FlashList
// Use key prop to force remount on column change
<FlashList
  key={`columns-${numColumns}`}
  numColumns={numColumns}
  // ...
/>
```

## Testing Strategy

### Component Tests

**Per `standards/testing-standards.md#react-component-testing`:**
- Test component renders without crashing
- Verify mock data appears in output
- Assert FlashList integration (not implementation details)

**Example:** `mobile/src/screens/__tests__/GalleryScreen.test.tsx`

```typescript
describe('GalleryScreen', () => {
  it('renders mock gallery items', () => {
    render(<GalleryScreen />);

    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('6')).toBeTruthy();
  });

  it('demonstrates masonry layout pattern', () => {
    render(<GalleryScreen />);

    // FlashList renders items with varying aspect ratios
    expect(screen.getByText('1')).toBeTruthy();
    expect(screen.getByText('5')).toBeTruthy();
  });
});
```

**Coverage:**
- Gallery screen: 4 tests (basic rendering, FlashList integration, mock data, E2E candidates)
- Jobs screen: 5 tests (basic rendering, FlashList integration, mock data, status badges, timestamps)

### Performance Testing

**Manual Testing Checklist:**
- [ ] Test on iOS simulator (smooth scrolling, no frame drops)
- [ ] Test on Android emulator (smooth scrolling, no UI thread stalls)
- [ ] Profile with React DevTools (frame times <16ms)
- [ ] Monitor with Flipper Performance plugin (JS thread activity)

**Future: Automated E2E Performance Tests**
- Detox integration with FPS tracking
- CI performance regression gates
- Representative datasets (100+ items for gallery, 500+ for jobs)

## Legend List (Not Adopted)

### Deferred Rationale

**Originally Planned:**
- Use Legend List as bridge-compatible fallback
- Guard against per-item state leaks with recycling patterns
- Unit tests for recycling safeguards

**Decision:** Not adopted in this task

**Reasoning:**
1. FlashList v2 meets all current requirements with Fabric enabled
2. No bridge-compatibility needs (New Architecture deployed)
3. Legend List recycling complexity not needed for current scope

**Future Consideration:**
If bridge-compatible fallback needed (e.g., partial Fabric rollback):
- Install `@legendapp/list`
- Follow Legend List recycling patterns from official docs
- Guard against closure capture in item components
- Add unit tests for state leak prevention

## Standards Alignment

### Frontend Tier (`standards/frontend-tier.md`)

**UI Components Layer:**
- ✅ Use design tokens from `@/lib/ui-tokens` (no ad-hoc colors)
- ✅ SafeAreaView with edge configuration
- ✅ Consistent spacing and typography

**State & Logic Layer:**
- ✅ Memoization with `useMemo` prevents re-renders
- ✅ Pure render functions (analyzability)
- ✅ Immutable data structures (`readonly` types)

**Services & Integration Layer:**
- 🔄 Future: RTK Query integration for data fetching (TASK-0819)
- 🔄 Future: XState for batch upload orchestration

### TypeScript Standards (`standards/typescript.md`)

**Immutability & Readonly:**
- ✅ `readonly` item types and data arrays
- ✅ Pure functions in render callbacks
- ✅ No parameter mutation

**Analyzability:**
- ✅ Strong typing for all FlashList props
- ✅ Discriminated unions for status types
- ✅ Explicit type annotations on callbacks

**Testability:**
- ✅ Pure render logic testable without mocks
- ✅ Component tests verify observable behavior
- ✅ No implementation detail testing

### Testing Standards (`standards/testing-standards.md`)

**React Component Testing:**
- ✅ Query via text that mirrors end-user language
- ✅ Behavioral tests (assert rendered output)
- ✅ No snapshot-only tests (prefer explicit assertions)

**Coverage Expectations:**
- ✅ Gallery screen: 4 tests covering rendering and integration
- ✅ Jobs screen: 5 tests covering rendering, data, and status display
- Target: ≥70% line coverage, ≥60% branch coverage (per testing standards)

## Migration Outcomes

### Successfully Delivered

1. ✅ **FlashList v2 installed** in `mobile/package.json`
2. ✅ **Gallery screen** with masonry layout demonstration
3. ✅ **Jobs screen** with standard vertical list demonstration
4. ✅ **Unit tests** updated for FlashList integration
5. ✅ **Profiling documentation** with approach and baseline framework
6. ✅ **Usage patterns** codified in this document

### Deferred Items

1. ❌ **Notification feed** (screen doesn't exist yet)
2. ❌ **Legend List adoption** (not needed with Fabric enabled)
3. ❌ **FlatList removal** (none existed to remove)
4. ❌ **Performance baseline comparison** (no prior FlatList implementation)

### Future Work

1. **Real Data Integration**
   - Connect Gallery to backend API (RTK Query per TASK-0819)
   - Load actual job history from backend
   - Implement pagination/infinite scroll

2. **Advanced Features**
   - Pull-to-refresh for data updates
   - Optimistic updates during mutations
   - Scroll-to-top button for long lists

3. **Performance Validation**
   - Profile with production-scale datasets (1000+ items)
   - Establish baseline metrics with React DevTools/Flipper
   - Add Detox E2E performance tests with FPS tracking

4. **Notification Feed**
   - Create notification screen
   - Apply FlashList v2 vertical list pattern
   - Dynamic item heights for rich notification content

## Common Patterns Reference

### Pattern: Simple Vertical List

```typescript
<FlashList
  data={items}
  renderItem={renderItem}
  keyExtractor={(item) => item.id}
/>
```

### Pattern: Multi-Column Grid

```typescript
<FlashList
  data={items}
  renderItem={renderItem}
  keyExtractor={(item) => item.id}
  numColumns={2}
/>
```

### Pattern: Variable Height Masonry

```typescript
const renderItem = ({ item }) => {
  const height = calculateDynamicHeight(item);
  return <View style={{ height }}>{/* content */}</View>;
};

<FlashList
  data={items}
  renderItem={renderItem}
  keyExtractor={(item) => item.id}
  numColumns={2}
/>
```

### Pattern: Empty State

```typescript
<FlashList
  data={items}
  renderItem={renderItem}
  keyExtractor={(item) => item.id}
  ListEmptyComponent={() => (
    <View style={styles.emptyState}>
      <Text>No items to display</Text>
    </View>
  )}
/>
```

## Troubleshooting

### Common Issues

**Issue: Blank spaces during scroll**
- **Cause:** Complex layouts or extremely variable item sizes
- **Fix:** FlashList v2 handles size estimation automatically; ensure items render consistently

**Issue: Performance degradation with large lists**
- **Cause:** Non-memoized data or impure render functions
- **Fix:** Apply `useMemo` to data array, ensure `renderItem` is pure

**Issue: Items not recycling**
- **Cause:** Unstable keys (using array indices)
- **Fix:** Use stable unique IDs in `keyExtractor`

**Issue: Type errors with FlashList props**
- **Cause:** Missing or incorrect type annotations
- **Fix:** Explicitly type `renderItem` callback parameter

## Conclusion

FlashList v2 successfully adopted for Gallery and Jobs screens as proof-of-concept implementations. This greenfield adoption establishes usage patterns and best practices for future list-based features in the PhotoEditor mobile app.

**Key Takeaways:**
1. FlashList v2 requires Fabric (New Architecture) - dependency on TASK-0907
2. Masonry layout supported natively with `numColumns` and variable heights
3. Performance optimization through memoization and pure render functions
4. Type safety enforced with `readonly` types and discriminated unions
5. Testing focuses on observable behavior, not implementation details

**Next Steps:**
1. Deploy to development builds for manual performance validation
2. Integrate real data sources (RTK Query per TASK-0819)
3. Establish performance baselines with production-scale datasets
4. Extend pattern to future list-based features (notifications, settings, search results)

**Standards Compliance:**
- ✅ `standards/frontend-tier.md` - UI components, state management, services patterns
- ✅ `standards/typescript.md` - Immutability, analyzability, type safety
- ✅ `standards/testing-standards.md` - Component testing, coverage expectations
- ✅ `standards/cross-cutting.md` - Purity, maintainability, evidence requirements

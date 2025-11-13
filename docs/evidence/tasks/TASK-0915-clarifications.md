# TASK-0915 Clarifications: Feature-Flag Timing Gap Analysis

**Date**: 2025-11-13
**Agent**: task-implementer
**Status**: Step 1 Complete

---

## Objective

Document how the mocked `getDeviceCapability` promise leaves `featureFlags` null during initial render, causing CameraWithOverlay tests to fail with "No instances found with node type: Camera" errors.

---

## Validation Report Context

Per `docs/tests/reports/2025-11-12-validation-mobile-revalidation.md` (Section "Root-Cause Analysis", items 2-5):

- **Evidence**: Four CameraWithOverlay specs fail with `No instances found with node type: "Camera"`
- **Failing specs**:
  1. `CameraWithOverlay › Rendering › should render camera when device is available` (line 120)
  2. `CameraWithOverlay › Rendering › should apply custom style` (line 149)
  3. `CameraWithOverlay › Error Handling › should call onError when camera error occurs` (line 278)
  4. `CameraWithOverlay › Error Handling › should log error to console when onError not provided` (line 293)

- **Root cause**: Tests immediately query for `Camera` via `UNSAFE_getByType('Camera')` without waiting for the async `getDeviceCapability()` call to resolve, leaving `featureFlags` null and triggering the early return at line 214 in `CameraWithOverlay.tsx`.

---

## Component Guard Logic Analysis

**File**: `mobile/src/features/camera/CameraWithOverlay.tsx`

### Feature Flag Initialization (Lines 100-122)

```typescript
// Feature flags state
const [featureFlags, setFeatureFlags] = useState<FrameProcessorFeatureFlags | null>(null);

// Initialize feature flags on mount
useEffect(() => {
  const initFeatureFlags = async () => {
    const deviceCapability = await getDeviceCapability();
    const flags = shouldEnableFrameProcessors(userFrameProcessorEnabled, deviceCapability);
    setFeatureFlags(flags);
    // ... logging
  };

  void initFeatureFlags();
}, [userFrameProcessorEnabled]);
```

**Standards reference**: `standards/frontend-tier.md#feature-guardrails` - feature modules implement async device capability checks via React hooks with state guards.

### Early Return Guards (Lines 208-216)

```typescript
// No device available
if (!device) {
  return null;
}

// Feature flags not yet initialized
if (!featureFlags) {
  return null;
}
```

**Guard semantics**:
- Line 209-211: Returns `null` if VisionCamera device is unavailable (synchronous guard)
- Line 213-216: Returns `null` if `featureFlags` is still `null` (async guard)

**Standards reference**: `standards/frontend-tier.md#state--logic-layer` - components guard rendering on async state readiness to prevent runtime errors from incomplete initialization.

---

## Test Mock Analysis

**File**: `mobile/src/features/camera/__tests__/CameraWithOverlay.test.tsx`

### Current Mock Setup (Lines 69-82)

```typescript
// Mock feature flags
jest.mock('@/utils/featureFlags', () => ({
  getDeviceCapability: jest.fn(() => Promise.resolve({
    platform: 'ios',
    deviceModel: null,
    isCapable: false,
    reason: 'iOS support deferred to post-pilot phase (ADR-0011)',
  })),
  shouldEnableFrameProcessors: jest.fn((userEnabled, capability) => ({
    isEnabled: false,
    isDeviceCapable: false,
    isUserEnabled: userEnabled,
    deviceCapability: capability,
  })),
}));
```

**Timing issue**:
- `getDeviceCapability` returns `Promise.resolve(...)`, which resolves on the next microtask tick
- `renderWithRedux(<CameraWithOverlay />)` completes synchronously
- Immediate query `UNSAFE_getByType('Camera')` executes before the promise resolves
- Component guard at line 214 sees `featureFlags === null` and returns `null`
- No `Camera` node is rendered, causing `No instances found` error

### Failing Test Pattern (Lines 120-126)

```typescript
it('should render camera when device is available', () => {
  const { UNSAFE_getByType } = renderWithRedux(<CameraWithOverlay />);

  expect(mockUseCameraDevice).toHaveBeenCalledWith('back');
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  expect(UNSAFE_getByType('Camera' as any)).toBeDefined(); // FAILS HERE - Camera not rendered yet
});
```

**Timing gap**:
1. `renderWithRedux` mounts component
2. `useEffect` hook schedules async `initFeatureFlags()`
3. Synchronous test code continues, querying for `Camera` immediately
4. `featureFlags` is still `null`, component returns `null`
5. `UNSAFE_getByType` throws because no `Camera` node exists

---

## Standards Alignment for Async Test Patterns

**Reference**: `standards/testing-standards.md#react-component-testing`

Key patterns for async UI states:
- "Use `findBy*` queries for async UI states and combine with fake timers or `waitFor` to de-flake animations and delayed effects."

**Applicable patterns**:
1. **`waitFor` with query**: `await waitFor(() => expect(UNSAFE_getByType('Camera')).toBeDefined())`
2. **`findByType` query**: `await screen.findByType('Camera')` (note: Testing Library doesn't provide `findByType`, so `waitFor` is required)
3. **Mock flush**: Convert mock to resolve synchronously OR flush microtasks with `await act(async () => { await Promise.resolve(); })`

---

## Scope Confirmation

All four failing specs in `CameraWithOverlay.test.tsx` follow the same pattern:
- Lines 120-126: `should render camera when device is available`
- Lines 149-156: `should apply custom style`
- Lines 278-290: `should call onError when camera error occurs`
- Lines 293-309: `should log error to console when onError not provided`

**Common characteristic**: Each spec renders the component and immediately queries for the `Camera` node without awaiting async readiness.

---

## Recommended Fix Pattern

Per validation report recommendation and `standards/testing-standards.md#react-component-testing`:

1. **Await readiness in each spec**:
   ```typescript
   it('should render camera when device is available', async () => {
     const { UNSAFE_getByType } = renderWithRedux(<CameraWithOverlay />);

     // Wait for feature flags to initialize
     await waitFor(() => {
       expect(UNSAFE_getByType('Camera' as any)).toBeDefined();
     });

     expect(mockUseCameraDevice).toHaveBeenCalledWith('back');
   });
   ```

2. **Create deterministic mock helper** in `mobile/src/utils/__mocks__/featureFlags.ts`:
   - Provide explicit helpers for device capability overrides
   - Document mock behavior with code comments
   - Enable specs to control async timing

---

## Evidence Summary

**Standards citations**:
- `standards/frontend-tier.md#feature-guardrails`: Async device capability pattern
- `standards/frontend-tier.md#state--logic-layer`: State guard semantics
- `standards/testing-standards.md#react-component-testing`: Async test patterns with `waitFor/findBy*`

**Files analyzed**:
- `mobile/src/features/camera/CameraWithOverlay.tsx` (lines 100-122, 208-216)
- `mobile/src/features/camera/__tests__/CameraWithOverlay.test.tsx` (lines 69-82, 120-309)
- `docs/tests/reports/2025-11-12-validation-mobile-revalidation.md` (RCA section)

**Next step**: Apply the async readiness pattern to all four failing specs plus the frame processor rerender spec (Step 2).

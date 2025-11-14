# TASK-0916 Clarifications: Redux Provider Rerender Helper

**Task**: TASK-0916 - Preserve Redux provider on CameraWithOverlay rerender
**Date**: 2025-11-14
**Author**: task-implementer

## Problem Statement

### Context from Validation Report

Per `docs/tests/reports/2025-11-12-validation-mobile-revalidation.md` (RCA #6), the CameraWithOverlay frame processor rerender spec fails with:

```
could not find react-redux context value; please ensure the component is wrapped in a <Provider>
```

**Root cause**: React Testing Library's `rerender` function replaces the root element with whatever component you pass, stripping away the Redux `<Provider>` wrapper that was present during the initial render.

**Code path**:
- `CameraWithOverlay` calls `useSelector(...)` (mobile/src/features/camera/CameraWithOverlay.tsx:95-99)
- Every render must be inside a Redux `Provider` to access the store
- Test at `mobile/src/features/camera/__tests__/CameraWithOverlay.test.tsx:319-333` destructures `const { rerender } = renderWithRedux(...)` and calls `rerender(<CameraWithOverlay ... />)` without re-wrapping in Provider
- Second render loses Redux context → error

### Existing Solutions

**TASK-0917** created `renderCameraWithRedux` helper in `mobile/src/test-utils/cameraRenderHelper.tsx` that solves this for camera tests:

```typescript
return {
  ...renderResult,
  // Override rerender to maintain Redux Provider context
  rerender: (newComponent: React.ReactElement) => {
    renderResult.rerender(<Provider store={mockStore}>{newComponent}</Provider>);
  },
};
```

This pattern is **camera-specific** and includes async feature flag readiness waiting. The validation report (line 64-65) recommends:

> "Provide a custom `rerenderWithRedux` that re-wraps the component in `<Provider store={store}>...</Provider>`"

### Requirements for General Helper

Per `standards/frontend-tier.md#state--logic-layer`:
- Redux provider layering must be preserved across rerenders
- State management wiring must stay compliant with Redux Toolkit patterns

Per `standards/testing-standards.md#react-component-testing`:
- Helper signatures must be typed and side-effect free
- Provider setup must mirror React Redux requirements
- Rerender behavior must be deterministic for parallel Jest runs

Per `standards/typescript.md#maintainability-pillars--concrete-heuristics`:
- Keep helper signatures typed with explicit return types
- Document inline with TSDoc for discoverability
- Avoid hidden state; helper should accept optional store configuration

### Proposed Approach

**Option 1 (Selected)**: Create general `renderWithRedux` helper in `mobile/src/__tests__/test-utils.tsx`

**Rationale**:
- Camera helper already demonstrates the rerender pattern successfully
- General helper can serve SettingsScreen and future Redux-connected components
- Existing helper location (`test-utils.tsx`) already exports shared utilities
- Maintains separation: camera-specific logic stays in `cameraRenderHelper.tsx`, general Redux wiring goes in `test-utils.tsx`

**Implementation**:
```typescript
export type RenderWithReduxOptions = Omit<RenderOptions, 'wrapper'> & {
  store?: ReturnType<typeof configureStore>;
};

export type RenderWithReduxResult = RenderResult & {
  rerender: (component: React.ReactElement) => void;
  store: ReturnType<typeof configureStore>;
};

export function renderWithRedux(
  component: React.ReactElement,
  options?: RenderWithReduxOptions
): RenderWithReduxResult {
  const mockStore = options?.store ?? createMockStore();
  const renderResult = render(<Provider store={mockStore}>{component}</Provider>, options);

  return {
    ...renderResult,
    store: mockStore,
    rerender: (newComponent: React.ReactElement) => {
      renderResult.rerender(<Provider store={mockStore}>{newComponent}</Provider>);
    },
  };
}
```

**Option 2 (Rejected)**: Extend camera helper to be general-purpose

**Rejection rationale**: Camera helper includes async feature flag waiting logic that's specific to CameraWithOverlay. Mixing general Redux rendering with camera-specific async boundaries would violate single responsibility principle (`standards/typescript.md#modularity`).

## Standards Alignment

### Frontend Tier State Management

Per `standards/frontend-tier.md#state--logic-layer`:
- "Redux Toolkit + RTK Query (normalize server-state; RTK Query mandated for network calls)"
- "Selector-first (reselect) for analyzability & performance"

The helper preserves Redux Provider context so components can use `useSelector` hooks across rerenders, maintaining the selector-first pattern.

### React Component Testing

Per `standards/testing-standards.md#react-component-testing`:
- "Exercise mobile React components with @testing-library/react-native and query via labels, roles, or text"
- "Stub network or native modules at the boundaries so tests run deterministically in CI"
- "Prefer test IDs only when no accessible label exists and document their intent inline"

The Redux-aware rerender helper ensures Redux state remains accessible during multi-render test scenarios (e.g., prop changes, overlay toggling), keeping tests deterministic.

### TypeScript Analyzability

Per `standards/typescript.md#analyzability`:
- "Strong typing everywhere: avoid `any`; prefer `unknown` + refinements"
- "Use TSDoc on exported APIs; documentation coverage thresholds are defined in standards/cross-cutting.md"

Helper exports include:
- Typed options interface (`RenderWithReduxOptions`) extending RTL's `RenderOptions`
- Typed result interface (`RenderWithReduxResult`) with explicit `rerender` and `store` signatures
- TSDoc comments explaining async boundary handling and usage examples

## Scope Impact

**Files to modify**:
1. `mobile/src/__tests__/test-utils.tsx` - Add `renderWithRedux` helper with Redux-aware rerender
2. `mobile/src/features/camera/__tests__/CameraWithOverlay.test.tsx` - Document helper pattern in existing comment

**Files NOT modified**:
- `mobile/src/test-utils/cameraRenderHelper.tsx` - Camera-specific helper remains unchanged
- `mobile/src/screens/__tests__/SettingsScreen.test.tsx` - Optional future migration (out of scope for TASK-0916)

**Helper opt-in strategy**: Keep helper available for explicit import. Components that don't use Redux (or use camera-specific helper) are unaffected. Document when to use general vs. camera-specific helper in TSDoc.

## Risk Mitigation

**Risk**: Helper may mask missing providers in other specs if misused

**Mitigation** (per task risk section):
- Keep helper opt-in with explicit import path
- Document when to prefer local wrappers vs. shared helper
- TSDoc includes usage guidance and standards citations

**Risk**: Helper introduces global state affecting parallel Jest runs

**Mitigation** (per acceptance criteria quality gates):
- Each helper invocation creates a fresh store via `createMockStore()`
- Store instance scoped to render call, not shared across tests
- No module-level state; helper remains pure function

## Next Steps

1. Implement `renderWithRedux` in `mobile/src/__tests__/test-utils.tsx`
2. Add `createMockStore` factory function for default Redux configuration
3. Export types and helper from test-utils.tsx
4. Update CameraWithOverlay test comment to reference the general pattern
5. Run validation pipeline and capture evidence

## References

- Validation report: `docs/tests/reports/2025-11-12-validation-mobile-revalidation.md` (RCA #6)
- Camera helper: `mobile/src/test-utils/cameraRenderHelper.tsx` (TASK-0917)
- Standards: `standards/frontend-tier.md#state--logic-layer`, `standards/testing-standards.md#react-component-testing`, `standards/typescript.md#analyzability`

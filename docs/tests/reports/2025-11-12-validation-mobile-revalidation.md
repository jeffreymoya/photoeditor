# Mobile Validation Re-Run Report: TASK-0911

**Date**: 2025-11-12 (rerun)
**Task**: TASK-0911 – Pilot VisionCamera + expo-background-task for uploads (Android pilot)
**Agent**: validation-mobile-rerun
**Status**: FAILED – 6 tests still red (async harness gaps)

---

## Scope & Objectives
- Re-execute the mobile validation suite after the red-team rejection on 2025-11-12.
- Capture auditable evidence for lint/typecheck and Jest.
- Perform a fresh RCA rooted in observed code paths rather than prior assumptions.

---

## Commands & Evidence

| Step | Command | Result | Log |
|------|---------|--------|-----|
| QA Static | `pnpm turbo run qa:static --filter=photoeditor-mobile` | PASS with 4 pre-existing ESLint warnings | `.agent-output/2025-11-12-mobile-validation-rerun-qa-static.log` |
| Unit Tests | `pnpm turbo run test --filter=photoeditor-mobile` | FAIL – 2 suites / 6 tests failing | `.agent-output/2025-11-12-mobile-validation-rerun-tests.log` |

Notes:
- QA static warnings are identical to the 2025-11-12 AM run (console usage + `import/no-named-as-default`), confirming no new lint debt was introduced.
- Jest output is stored in full; excerpts are cited below for each failing spec.

---

## Current Test Status
- **Suites**: 31 total, 29 pass, 2 fail.
- **Tests**: 566 total, 560 pass, 6 fail.
- **Snapshots**: 2/2 pass.
- **Failed specs**:
  1. `SettingsScreen › Basic Rendering › renders subtitle`
  2. `CameraWithOverlay › Rendering › should render camera when device is available`
  3. `CameraWithOverlay › Rendering › should apply custom style`
  4. `CameraWithOverlay › Error Handling › should call onError when camera error occurs`
  5. `CameraWithOverlay › Error Handling › should log error to console when onError not provided`
  6. `CameraWithOverlay › Frame Processor › should update frame processor when overlays change`

---

## Root-Cause Analysis (RCA)

### 1. SettingsScreen subtitle test never waits for async device capability
- **Evidence**: Jest logs show `An update to SettingsScreen inside a test was not wrapped in act(...)` and the assertion fails because only the loading copy is present (`Loading device information...`). (`.agent-output/2025-11-12-mobile-validation-rerun-tests.log`, lines ~20-115 & tail).
- **Code path**: `SettingsScreen` issues an async `getDeviceCapability()` inside `useEffect` and renders loading UI until `deviceCapability` is set (mobile/src/screens/SettingsScreen.tsx:34-88).
- **Test gap**: `mobile/src/screens/__tests__/SettingsScreen.test.tsx:42-46` performs a synchronous `getByText('Configure your app preferences')` without awaiting the async effect or mocking the feature flag call to resolve synchronously.
- **Fix direction**: Either `await waitFor(() => expect(screen.getByText(...)))` or mock `getDeviceCapability` with a resolved value and await microtasks inside the test. Also wrap the render call in `await act(async () => ...)` to satisfy React 19 requirements.

### 2-5. CameraWithOverlay rendering/error specs assume feature flags resolve before assertions
- **Evidence**: All four specs fail with `No instances found with node type: "Camera"` because the component returns `null` while `featureFlags` is still `null`. (See `.agent-output/2025-11-12-mobile-validation-rerun-tests.log`, tail section for the four stack traces.)
- **Code path**: `CameraWithOverlay` initializes feature flags asynchronously (`useEffect` calling `getDeviceCapability` + `shouldEnableFrameProcessors`) and returns early if either the VisionCamera device or `featureFlags` are falsy (mobile/src/features/camera/CameraWithOverlay.tsx:92-216).
- **Mocks already in place**: The spec does `jest.mock('@/utils/featureFlags', ...)` but still returns a Promise, so the effect completes on the next tick.
- **Test gap**: Specs at `mobile/src/features/camera/__tests__/CameraWithOverlay.test.tsx:119-306` call `renderWithRedux()` and immediately search for `Camera` nodes via `UNSAFE_getByType`, never waiting for `featureFlags` to populate. Because `featureFlags` remains `null` during the first render, the component short-circuits and nothing is rendered.
- **Fix direction**:
  - Use `await waitFor(() => expect(UNSAFE_getByType('Camera')).toBeDefined())` or `findByType` to wait for post-effect render.
  - Alternatively, mock `getDeviceCapability` to return `Promise.resolve(...)` *and* flush microtasks (`await act(async () => { jest.runAllTimers(); })`) or convert the mock to a synchronous resolved value via `mockResolvedValue` + `await waitFor`.

### 6. CameraWithOverlay frame processor rerender loses Redux Provider
- **Evidence**: The `Frame Processor › should update frame processor when overlays change` spec fails with `could not find react-redux context value; please ensure the component is wrapped in a <Provider>` (log tail).
- **Code path**: `CameraWithOverlay` calls `useSelector(...)` (mobile/src/features/camera/CameraWithOverlay.tsx:95-99), so every render must be inside a Redux `Provider`.
- **Test gap**: The test at `mobile/src/features/camera/__tests__/CameraWithOverlay.test.tsx:319-333` destructures `const { rerender } = renderWithRedux(...)` and then calls `rerender(<CameraWithOverlay ... />)` **without** the Provider. React Testing Library’s `rerender` replaces the root element with whatever you pass, so the Redux context disappears on the second call, triggering the error.
- **Fix direction**: Provide a custom `rerenderWithRedux` that re-wraps the component in `<Provider store={store}>...</Provider>` or re-render using the helper again (e.g., `const utils = renderWithRedux(...); utils.unmount(); renderWithRedux(...)`).

---

## Scope Sweep: Where the Async Device-Capability Pattern Appears
- **`mobile/src/screens/SettingsScreen.tsx:31-124`** is the only screen that calls `getDeviceCapability`, stores it in local state, and blocks rendering (`return` loading UI) until the async call completes. Every SettingsScreen spec in `mobile/src/screens/__tests__/SettingsScreen.test.tsx:35-52` therefore needs to either mock the capability synchronously or wait for the async effect.
- **`mobile/src/features/camera/CameraWithOverlay.tsx:92-241`** also uses `getDeviceCapability` inside `useEffect` and guards rendering with `if (!featureFlags) return null;`. All CameraWithOverlay specs in `mobile/src/features/camera/__tests__/CameraWithOverlay.test.tsx` inherit the same requirement to await feature-flag readiness, plus the Redux provider constraint during rerenders.
- **Shared utilities**: `mobile/src/utils/featureFlags.ts:300-370` provides both `getDeviceCapability` and `shouldEnableFrameProcessors`. Unit tests for this module (`mobile/src/utils/__tests__/featureFlags.test.ts`) already mock the async call and do not surface the issue.
- **Search result**: No other components in `mobile/src` reference `getDeviceCapability` or guard on `featureFlags`, so the async-loading/test-wait pattern affects only SettingsScreen and CameraWithOverlay today. Future features that import these helpers must include the same async-awareness to stay compliant.

---

## Recommended Fix Plan
1. **Async readiness helper**: Introduce a shared test utility (e.g., `await waitForFeatureFlagsReady(renderResult)`) that waits until `screen.queryByText('Loading device information...')` is gone or until `featureFlags` mock resolves. Document it in `mobile/src/services/__tests__/testUtils.ts` to avoid repeated boilerplate.
2. **Synchronous mocks for feature flags**: Update the jest mock to use `mockResolvedValue` + `await waitFor` in each spec, or inject a fake `deviceCapability` via props/context to avoid real async boundaries.
3. **Redux-aware rerender**: Expose a helper returning `{ rerender: (node) => rtlRerender(<Provider store={store}>{node}</Provider>) }` so no spec loses context when toggling props.
4. **Re-run Jest** after applying the above fixes and attach updated logs to TASK-0911 before closing the validation.

---

## Evidence Attachments
- `.agent-output/2025-11-12-mobile-validation-rerun-qa-static.log`
- `.agent-output/2025-11-12-mobile-validation-rerun-tests.log`

All references use repository paths for reproducibility (see file sections cited above).

# TASK-0918 Clarifications

## Resolved (2025-11-14)

All clarifications have been addressed per product guidance:

- [x] **UX copy and accessibility:**
  - Copy: "Loading camera settings..." (mirrors SettingsScreen precedent from TASK-0914)
  - Accessibility attributes (all three):
    1. `accessibilityRole="progressbar"` per standards/frontend-tier.md#async-state-handling
    2. Deterministic `testID="camera-loading-sentinel"` for test assertions
    3. `ActivityIndicator` visual spinner for improved UX feedback
  - Reference: mobile/src/screens/SettingsScreen.tsx:85-86

- [x] **Telemetry approach:**
  - Extend existing `monitorFrameProcessing` hooks for unified camera metrics pipeline
  - Emit lifecycle events (entry/exit) with dwell time for product analytics
  - Avoids creating new logger infrastructure; integrates with existing telemetry

## Implementation Notes

The loading sentinel will render until `featureFlags` state is populated, ensuring:
- Tests can wait for the sentinel to disappear before asserting camera rendering (eliminates timing races)
- Users receive clear feedback during async device capability checks
- Telemetry tracks sentinel visibility duration across device types for performance insights

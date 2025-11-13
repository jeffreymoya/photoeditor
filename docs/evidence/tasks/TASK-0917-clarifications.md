# TASK-0917 Clarifications

- [ ] Decide final location for the new act-aware helper (candidates: `mobile/src/test-utils` vs co-located next to CameraWithOverlay specs) per standards/frontend-tier.md#test-utilities.
- [ ] Confirm whether `flushMicrotasksQueue` from `@testing-library/react-native` is sufficient or if an explicit `await act(async () => Promise.resolve())` block is required to hush React 19 warnings.

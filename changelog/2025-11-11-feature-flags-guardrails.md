# Changelog: Feature Flags and Frame Budget Guardrails (Android Pilot)

**Date:** 2025-11-11
**Task:** TASK-0911E
**Type:** feat(mobile)
**Scope:** Android pilot - VisionCamera Skia frame processors

## Summary

Implemented feature flags and frame budget guardrails for VisionCamera Skia frame processors in the Android pilot. Provides device allowlist, user toggle in Settings, frame budget monitoring, and pilot-friendly defaults.

## Changes

### New Features

1. **Android Device Allowlist** (`mobile/src/utils/featureFlags.ts`)
   - Conservative allowlist with 100+ modern Android devices
   - Criteria: API 29+, 4GB+ RAM
   - Includes: Pixel 4+, Galaxy S10+, OnePlus 7+, Xiaomi Mi 9+
   - iOS support explicitly deferred per ADR-0011

2. **Frame Budget Monitoring** (`mobile/src/features/camera/frameBudgetMonitor.ts`)
   - Monitors frame processing times against 16ms budget (60 FPS)
   - Logs violations with device model for telemetry
   - Statistics calculation for performance tracking

3. **User Toggle in Settings** (`mobile/src/screens/SettingsScreen.tsx`)
   - Camera overlays toggle with device capability display
   - Performance warning Alert for non-allowlist devices
   - Redux state persistence via settingsSlice

4. **Pilot-Friendly Defaults**
   - Frame processors enabled by default for allowlist devices
   - Easy opt-out via Settings toggle
   - Clear warnings for non-recommended devices

### Modified Files

- `mobile/src/features/camera/CameraWithOverlay.tsx` - Feature flag integration, frame budget monitoring
- `mobile/src/screens/SettingsScreen.tsx` - User toggle UI
- `mobile/src/store/slices/settingsSlice.ts` - Camera settings state + actions

### Testing

- **New Tests:** 46 tests (23 featureFlags + 23 frameBudgetMonitor)
- **Coverage:** 80.43%-100% lines, 64.7%-92.3% branches (exceeds ≥70%/≥60% thresholds)
- **Fixed Tests:** Added Redux Provider to CameraWithOverlay and SettingsScreen tests

## Validation

- ✅ `pnpm turbo run qa:static --filter=photoeditor-mobile` - PASS
- ✅ Unit tests: 46/46 new tests pass
- ✅ Coverage thresholds met per standards/testing-standards.md
- ✅ Standards compliance verified (frontend-tier, typescript, testing)

## Architecture

- **ADR-0011:** Android-first pilot strategy (iOS deferred)
- **ADR-0012:** VisionCamera Skia integration with frame budget monitoring

## Evidence

- Implementation summary: `.agent-output/task-implementer-summary-TASK-0911E.md`
- Review summary: `.agent-output/implementation-reviewer-summary-TASK-0911E.md`
- Validation report: `docs/tests/reports/2025-11-11-validation-mobile-TASK-0911E.md`

## Next Steps

- Manual validation per task acceptance criteria (Android emulator testing)
- Pilot deployment to test devices
- Monitor frame budget violations for allowlist expansion

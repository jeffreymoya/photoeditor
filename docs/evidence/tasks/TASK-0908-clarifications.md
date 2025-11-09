# TASK-0908 Clarifications

## Outstanding Questions (Resolved)

This file serves as the evidence path for TASK-0908 clarifications.

## Resolution

### 1. Feature Slice Selection
**Decision**: Jobs surface (recommended)
- Jobs feature selected as pilot for Expo Router file-based routing
- Good complexity balance: job list + detail views with clear boundaries
- Aligns with mobile-stack-modernization.md proposal recommendations

### 2. Migration Strategy
**Decision**: Full Expo Router adoption app-wide, Jobs surface first
- Replace React Navigation entirely with Expo Router as the single navigation system
- Expo Router built on React Navigation internally, no bridging needed
- Jobs surface implements file-based routing in `app/(jobs)/` directory
- Other surfaces remain in `app/` with traditional screen files until migrated
- Incremental surface-by-surface migration approach
- No need to maintain two separate navigation systems simultaneously

### 3. Lint/TS Rules
**Decisions** (all selected):
- **Enforce typed route params**: Use Expo Router's generated types for type safety (href, useLocalSearchParams)
- **Validate directory naming conventions**: Lint rule to ensure proper naming ((group), [id], _layout.tsx patterns)
- **Prevent direct React Navigation imports**: Block @react-navigation imports in app/ directory
- **Require co-located layouts**: Enforce every (group) has corresponding _layout.tsx file

### 4. Deeplink/Auth Compatibility
**Approach** (comprehensive verification):
- **Manual testing**: Test app://photoeditor/jobs/123 style URLs on iOS/Android
- **Automated E2E tests**: Add Detox or Maestro tests for auth flows and redirect verification
- **Document limitations early**: Research Expo Router deeplink docs, identify edge cases, document workarounds upfront

## Notes

- This task introduces Expo Router file-based routing for Jobs surface as first pilot
- Blocked by TASK-0907 (requires Expo SDK 53 stable)
- Full Expo Router adoption eliminates need for mixed navigation period
- Remaining surfaces migrate incrementally using same file-based routing patterns

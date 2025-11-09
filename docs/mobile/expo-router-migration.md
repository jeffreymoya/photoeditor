# Expo Router Migration Strategy

## Overview

This document outlines the incremental migration strategy for adopting Expo Router file-based routing across all mobile surfaces. The migration follows the pilot implementation in the Jobs surface (TASK-0908) and extends the same patterns to remaining screens.

## Migration Outcomes (TASK-0908)

### Completed Implementation

The Jobs surface has been successfully migrated to Expo Router file-based routing:

1. **Directory Structure**: `app/(jobs)/` with proper grouping convention
2. **Co-located Layout**: `app/(jobs)/_layout.tsx` configures navigation stack
3. **File-based Routes**:
   - `index.tsx` - Jobs list view
   - `[id].tsx` - Job detail view with dynamic route parameter
4. **Root Layout**: `app/_layout.tsx` integrates Expo Router with Redux providers
5. **TypeScript Config**: Extends `expo/tsconfig.base` for auto-generated route types
6. **Lint Rules**: Updated ESLint to support `app/**` directory with boundaries plugin

### Configuration Changes

**package.json**:
- Added `expo-router@~4.0.0` dependency

**app.json**:
- Added `scheme: "photoeditor"` for deeplink support
- Added `"expo-router"` to plugins array

**tsconfig.json**:
- No changes required (extends `expo/tsconfig.base` which includes Expo Router types)

**eslint.config.js**:
- Added `routes` boundary element type for `app/**` pattern
- Added ESLint ignore for `.expo-router` generated directory
- Configured boundary rules to allow routes to import from features, shared UI, hooks, lib, services, store, utils

**.gitignore**:
- Added `mobile/.expo-router/` to ignore Expo Router generated files

## Directory Conventions

Expo Router uses file-based routing with the following conventions:

### Route Files

- `app/_layout.tsx` - Root layout (wraps entire app)
- `app/(group)/_layout.tsx` - Group layout (configures navigation for feature group)
- `app/(group)/index.tsx` - Index route (e.g., `/jobs`)
- `app/(group)/[param].tsx` - Dynamic route (e.g., `/jobs/:id`)
- `app/+not-found.tsx` - 404 fallback (future implementation)

### Naming Conventions

- `(group)` - Parentheses indicate a route group (not part of URL path)
- `[param]` - Brackets indicate dynamic route parameter
- `_layout` - Underscore prefix for special files (layout, not-found)
- `index` - Default route for a directory

### Example Structure

```
app/
├── _layout.tsx              # Root layout with providers
├── (jobs)/
│   ├── _layout.tsx          # Jobs navigation stack
│   ├── index.tsx            # /jobs
│   └── [id].tsx             # /jobs/:id
├── (gallery)/               # Future: Gallery surface
│   ├── _layout.tsx
│   ├── index.tsx            # /gallery
│   └── [id].tsx             # /gallery/:id
└── (settings)/              # Future: Settings surface
    ├── _layout.tsx
    └── index.tsx            # /settings
```

## TypeScript Integration

Expo Router automatically generates route types based on the `app/` directory structure:

### Auto-generated Types

- `expo-router` generates TypeScript types in `.expo-router/` directory
- Types include route paths, params, and navigation helpers
- `tsconfig.json` extends `expo/tsconfig.base` to include generated types

### Typed Route Parameters

Use `useLocalSearchParams<T>()` for type-safe route parameters:

```typescript
import { useLocalSearchParams } from 'expo-router';

const { id } = useLocalSearchParams<{ id: string }>();
```

### Typed Navigation Links

Use `Link` component or `router.push()` with type-safe hrefs:

```typescript
import { Link } from 'expo-router';

// Type-safe link
<Link href="/jobs/123">View Job</Link>

// Programmatic navigation
import { router } from 'expo-router';
router.push('/jobs/123');
```

## Lint Rules for File-based Routing

### ESLint Configuration

The `eslint.config.js` has been updated to support Expo Router conventions:

1. **Ignore generated files**: `.expo-router` directory excluded from linting
2. **Boundary element**: `routes` type for `app/**` pattern
3. **Import rules**: Routes can import from features, shared UI, hooks, lib, services, store, utils
4. **Directory naming**: Follows Expo Router conventions (parentheses, brackets, underscores)

### Required Lint Rules (TASK-0908 Clarifications)

The following lint rules should be enforced:

1. **Enforce typed route params**: Use Expo Router's generated types for type safety
   - Status: Verified via TypeScript config
   - Implementation: `useLocalSearchParams<T>()` enforces types

2. **Validate directory naming conventions**: Ensure proper naming patterns
   - Status: Manual code review required
   - Convention: `(group)`, `[param]`, `_layout` patterns

3. **Prevent direct React Navigation imports**: Block `@react-navigation` imports in `app/` directory
   - Status: Not enforced yet (mixed navigation period)
   - Future: Add ESLint rule to block React Navigation imports in `app/**`

4. **Require co-located layouts**: Enforce every `(group)` has corresponding `_layout.tsx`
   - Status: Manual code review required
   - Future: Custom ESLint rule or pre-commit hook

## Incremental Migration Strategy

### Phase 1: Jobs Surface (COMPLETED - TASK-0908)

- **Status**: Complete
- **Routes**: `/jobs`, `/jobs/:id`
- **Files**:
  - `app/_layout.tsx`
  - `app/(jobs)/_layout.tsx`
  - `app/(jobs)/index.tsx`
  - `app/(jobs)/[id].tsx`

### Phase 2: Gallery Surface (PLANNED)

- **Routes**: `/gallery`, `/gallery/:id`
- **Files**:
  - `app/(gallery)/_layout.tsx`
  - `app/(gallery)/index.tsx`
  - `app/(gallery)/[id].tsx`
- **Dependencies**: None (independent surface)

### Phase 3: Settings Surface (PLANNED)

- **Routes**: `/settings`, `/settings/:section`
- **Files**:
  - `app/(settings)/_layout.tsx`
  - `app/(settings)/index.tsx`
  - `app/(settings)/[section].tsx`
- **Dependencies**: None (independent surface)

### Phase 4: Home/Camera Surfaces (PLANNED)

- **Routes**: `/`, `/camera`
- **Files**:
  - `app/(home)/_layout.tsx`
  - `app/(home)/index.tsx`
  - `app/(camera)/_layout.tsx`
  - `app/(camera)/index.tsx`
- **Dependencies**: May require auth flow integration

### Phase 5: React Navigation Removal (PLANNED)

- **Prerequisites**: All surfaces migrated to Expo Router
- **Tasks**:
  - Remove `@react-navigation/*` dependencies
  - Remove legacy screen files in `src/screens/`
  - Update navigation references throughout codebase
  - Add ESLint rule to block React Navigation imports

## Mixed Navigation Period

During the incremental migration, both navigation systems coexist:

### Legacy React Navigation

- **Location**: `src/screens/`
- **Surfaces**: Home, Gallery, Camera, Settings (until migrated)
- **Navigation**: Stack and Tab navigators

### Expo Router

- **Location**: `app/`
- **Surfaces**: Jobs (complete), others (planned)
- **Navigation**: File-based routing with Stack

### Integration Points

- **Root Layout**: `app/_layout.tsx` wraps entire app with Redux providers
- **Legacy Entry**: Existing navigation setup in `src/navigation/` (if any) continues to work
- **No Conflicts**: The two systems are isolated by directory structure

## Deeplink Configuration

### Current Setup

**app.json**:
```json
{
  "expo": {
    "scheme": "photoeditor"
  }
}
```

### Deeplink Patterns

- **Jobs List**: `photoeditor://jobs`
- **Job Detail**: `photoeditor://jobs/:id`

### Testing Deeplinks

**iOS Simulator**:
```bash
xcrun simctl openurl booted photoeditor://jobs
xcrun simctl openurl booted photoeditor://jobs/test-job-456
```

**Android Emulator**:
```bash
adb shell am start -W -a android.intent.action.VIEW -d "photoeditor://jobs"
adb shell am start -W -a android.intent.action.VIEW -d "photoeditor://jobs/test-job-456"
```

## Known Issues and Workarounds

### Peer Dependency Warnings

Several peer dependency warnings appear after installing `expo-router@~4.0.0`:

1. **expo-constants version mismatch**: Expected `~17.0.8`, found `16.0.2`
   - **Impact**: None; Expo SDK 53 ships with 16.0.2
   - **Workaround**: Accept warning; app functions correctly

2. **React 19 peer dependency warnings**: Multiple packages expect React 18
   - **Impact**: None; React 19 is compatible despite version range warnings
   - **Workaround**: Accept warnings; React 19 works correctly

3. **react-native-screens version**: Expected `>= 4.0.0`, found `3.31.1`
   - **Impact**: None; version 3.31.1 is stable
   - **Workaround**: Accept warning; navigation works correctly

**Mitigation**: Monitor Expo Router updates and upgrade when peer dependencies align with Expo SDK 53.

### Mixed Navigation Conflicts

No known conflicts during mixed navigation period. If issues arise:

1. **Navigation State Conflicts**: Isolate state management per navigation system
2. **Deeplink Conflicts**: Ensure Expo Router handles its routes, React Navigation handles legacy routes
3. **Provider Duplication**: Ensure providers are only instantiated once in `app/_layout.tsx`

## Standards Compliance

This migration adheres to the following standards:

### standards/frontend-tier.md

- **Feature Guardrails**: File-based routing follows directory conventions
- **Component Organization**: Co-located layouts reduce global re-render cost
- **Navigation Patterns**: Expo Router built on React Navigation (no architectural conflict)

### standards/typescript.md

- **Strict TypeScript**: All route files use strict mode
- **Type Safety**: `useLocalSearchParams<T>()` provides typed route parameters
- **Named Exports**: Component exports follow naming conventions

### standards/testing-standards.md

- **Component Tests**: Route components should be tested with React Testing Library
- **Coverage**: ≥70% line coverage, ≥60% branch coverage for route logic

## Migration Checklist Template

Use this checklist for each surface migration:

- [ ] Create `app/(surface)/` directory
- [ ] Implement `app/(surface)/_layout.tsx` with navigation config
- [ ] Implement `app/(surface)/index.tsx` for list/main view
- [ ] Implement `app/(surface)/[id].tsx` for detail view (if applicable)
- [ ] Update ESLint config if new boundary rules needed
- [ ] Test navigation on iOS Simulator
- [ ] Test navigation on Android Emulator
- [ ] Test deeplinks for surface routes
- [ ] Update this migration strategy document
- [ ] Remove legacy screen files from `src/screens/` (after migration complete)

## References

- Expo Router Introduction: https://docs.expo.dev/router/introduction/
- Expo Router File-based Routing: https://docs.expo.dev/router/create-pages/
- Expo Router Layouts: https://docs.expo.dev/router/layouts/
- Expo Router URL Parameters: https://docs.expo.dev/router/reference/url-parameters/
- Task File: `/home/jeffreymoya/dev/photoeditor/tasks/mobile/TASK-0908-expo-router-adoption.task.yaml`
- Clarifications: `/home/jeffreymoya/dev/photoeditor/docs/evidence/tasks/TASK-0908-clarifications.md`
- Test Results: `/home/jeffreymoya/dev/photoeditor/docs/evidence/tasks/TASK-0908-mixed-navigation-test-results.md`

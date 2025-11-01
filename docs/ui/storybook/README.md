# Storybook for Mobile Component Library

This directory contains Storybook configuration, stories, and coverage reports for the PhotoEditor mobile component library. Storybook provides isolated component development, visual regression testing via Chromatic, and accessibility validation per `standards/frontend-tier.md#ui-components-layer`.

## Standards Alignment

This Storybook setup enforces:

- **Story coverage ≥ 85% of atoms/molecules** (per `standards/frontend-tier.md#ui-components-layer`)
- **Chromatic no-change gate** for visual regression testing
- **Axe accessibility checks** (hard fail on violations per `standards/frontend-tier.md#ui-components-layer`)
- **addon-a11y and addon-interactions** enabled for component testing
- **Evidence bundle requirements** per `standards/testing-standards.md#evidence-expectations`

## Directory Structure

```
mobile/
├── .storybook/              # Storybook configuration
│   └── main.js             # Main config with addon setup
├── storybook/              # React Native Storybook entry
│   ├── index.js           # Storybook UI root
│   └── storybook.requires.js  # Auto-generated story imports
├── src/
│   ├── components/
│   │   ├── ErrorBoundary.tsx
│   │   ├── ErrorBoundary.stories.tsx
│   │   └── __tests__/
│   │       └── ErrorBoundary.test.tsx
│   └── features/upload/components/
│       ├── UploadButton.tsx
│       ├── UploadButton.stories.tsx
│       └── __tests__/
│           └── UploadButton.test.tsx

docs/ui/storybook/
├── README.md               # This file
└── coverage-report.json    # Story coverage metrics
```

## Local Development

### Running Storybook in React Native

Start Storybook in the Expo development environment:

```bash
cd mobile
pnpm run storybook
```

This will:
1. Generate story imports (`sb-rn-get-stories`)
2. Start the Metro bundler
3. Open Storybook UI in your Expo app

You can then use the Expo Go app or a development build to view stories on a device or simulator.

### Running Storybook Web (for Chromatic)

Build and run Storybook for web-based visual testing:

```bash
cd mobile
pnpm run storybook:web
```

This starts Storybook at `http://localhost:6006` for browser-based component viewing and Chromatic snapshots.

### Regenerating Story Imports

After adding or modifying story files, regenerate the story registry:

```bash
cd mobile
pnpm run storybook:generate
```

This updates `mobile/storybook/storybook.requires.js` with the latest story imports.

## Writing Stories

Stories follow the CSF (Component Story Format) 3.0 and are colocated with components:

```typescript
// Example: mobile/src/components/Button.stories.tsx
import React from 'react';
import type { Meta, StoryObj } from '@storybook/react-native';
import { Button } from './Button';

const meta = {
  title: 'Components/Button',
  component: Button,
  tags: ['autodocs'],
  argTypes: {
    // Define controls for interactive props
  },
} satisfies Meta<typeof Button>;

export default meta;

type Story = StoryObj<typeof meta>;

export const Default: Story = {
  args: {
    text: 'Click Me',
    onPress: () => console.log('Pressed'),
  },
};
```

### Story Naming Conventions

- Use descriptive names for each variant: `Idle`, `Loading`, `Error`, `Success`
- Include edge cases: `Disabled`, `WithLongText`, `Empty`
- Tag stories with component category: atom, molecule, organism

### Accessibility Metadata

All stories should include accessible labels and roles for axe testing:

```typescript
export const Example: Story = {
  args: { ... },
  parameters: {
    docs: {
      description: {
        story: 'Describes the story variant and accessibility considerations',
      },
    },
  },
};
```

## Chromatic Integration

Chromatic is configured for visual regression testing via CI workflow at `.github/workflows/chromatic.yml`.

### Running Chromatic Locally

```bash
cd mobile
export CHROMATIC_PROJECT_TOKEN=your_token_here
pnpm run chromatic
```

This will:
1. Build Storybook for web
2. Upload snapshots to Chromatic
3. Compare against baseline
4. Exit with zero even if changes detected (`--exit-zero-on-changes`)

### CI Workflow

The Chromatic workflow runs on:
- Every push to `main`
- Every pull request

**Workflow steps:**
1. Install dependencies
2. Generate story files
3. Run Chromatic with project token from secrets
4. Upload Chromatic results as artifacts
5. Check accessibility with axe (automatic via Chromatic)

**References:**
- `standards/frontend-tier.md#ui-components-layer` - Chromatic no-change gate requirement
- `standards/testing-standards.md#evidence-expectations` - Evidence capture requirements

### Reviewing Chromatic Results

1. Visit Chromatic dashboard (link in CI logs)
2. Review visual diffs for each story
3. Accept or reject changes
4. Verify axe accessibility violations (should be zero per `standards/frontend-tier.md#ui-components-layer`)

## Coverage Reports

Story coverage is tracked in `coverage-report.json` and should be regenerated when components or stories change.

### Current Coverage

See `coverage-report.json` for:
- Total components vs. components with stories
- Coverage percentage (target: ≥85%)
- Story count per component
- Accessibility test status

### Regenerating Coverage Report

Manual regeneration process (until automated):

1. List all components in scope:
   ```bash
   find mobile/src/components -name '*.tsx' -not -name '*.stories.tsx' -not -name '*.test.tsx'
   find mobile/src/features/*/components -name '*.tsx' -not -name '*.stories.tsx' -not -name '*.test.tsx'
   ```

2. List all story files:
   ```bash
   find mobile/src -name '*.stories.tsx'
   ```

3. Update `coverage-report.json` with:
   - Total component count
   - Components with stories
   - Coverage percentage
   - Story details per component

4. Commit the updated report with the corresponding component changes

**Reference:** `standards/frontend-tier.md#ui-components-layer` - Story coverage ≥ 85% requirement

## Component Test Alignment

Component tests complement Storybook stories by providing behavioral validation:

- **Storybook stories** - Visual states, accessibility, interaction flows
- **Jest tests** - Business logic, edge cases, error handling

All components with stories should also have:
- Unit tests in `__tests__/` subdirectory
- Coverage ≥70% lines, ≥60% branches per `standards/testing-standards.md#coverage-expectations`

Test coverage summary is appended below for evidence bundles per `standards/frontend-tier.md#feature-guardrails`.

### Test Coverage Summary

**ErrorBoundary:**
- Test file: `mobile/src/components/__tests__/ErrorBoundary.test.tsx`
- Coverage: normal operation, error handling, restart functionality, dev mode behavior, accessibility
- Key scenarios: error catching, error display, state reset, dev vs production mode

**UploadButton:**
- Test file: `mobile/src/features/upload/components/__tests__/UploadButton.test.tsx`
- Coverage: all upload states (idle, preprocessing, uploading, paused, success, error), progress display, button interactions
- Key scenarios: state transitions, progress updates, disabled states, accessibility across all states

Run tests with coverage:
```bash
cd mobile
pnpm run test -- --coverage
```

**References:**
- `standards/testing-standards.md#coverage-expectations` - Coverage thresholds
- `standards/frontend-tier.md#feature-guardrails` - Feature testing requirements

## Evidence Bundle Integration

For release evidence bundles per `standards/testing-standards.md#evidence-expectations`:

1. **Storybook coverage report** - `docs/ui/storybook/coverage-report.json`
2. **Chromatic gate status** - CI workflow artifact or dashboard screenshot saved to `docs/ui/storybook/chromatic-summary.png`
3. **Test coverage summary** - Jest coverage output for story-backed components

Include these artifacts in release PRs and evidence bundles.

## Troubleshooting

### Stories not appearing

If stories don't show up after creation:
1. Run `pnpm run storybook:generate` to update story imports
2. Restart Metro bundler
3. Verify story file matches pattern in `.storybook/main.js`

### Chromatic build failures

If Chromatic fails in CI:
1. Check CHROMATIC_PROJECT_TOKEN is set in GitHub secrets
2. Verify Storybook web build runs locally: `pnpm run storybook:web`
3. Review Chromatic logs for specific errors
4. Ensure all story dependencies are installed

### Accessibility violations

If axe reports violations:
1. Review Chromatic dashboard for specific violations
2. Fix component accessibility issues (labels, roles, contrast)
3. Rerun Chromatic to verify fixes
4. Hard fail on violations per `standards/frontend-tier.md#ui-components-layer`

### React Native vs Web compatibility

Storybook for React Native and Storybook for Web have different capabilities:
- Use `@storybook/addon-react-native-web` for web compatibility
- Some React Native components may need web equivalents for Chromatic
- Test both environments when adding new stories

## Configuration Choices

Per `standards/frontend-tier.md#ui-components-layer`:

- **addon-a11y** - Automatic axe accessibility checks on all stories
- **addon-interactions** - Test user interactions within stories
- **addon-react-native-web** - Enables web-based Chromatic snapshots for RN components
- **Chromatic exit-zero-on-changes** - Local runs don't fail on visual changes (report only)
- **CSF 3.0 format** - Latest Storybook component story format with TypeScript support

## References

- `standards/frontend-tier.md#ui-components-layer` - UI components layer requirements
- `standards/testing-standards.md#evidence-expectations` - Evidence capture requirements
- `standards/typescript.md` - TypeScript standards for story files
- `.github/workflows/chromatic.yml` - CI workflow configuration
- `mobile/.storybook/main.js` - Storybook configuration

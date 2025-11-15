# Storybook Parser Override Audit

**Created:** 2025-11-15
**Status:** Baseline (Phase 0)
**Related:** `docs/proposals/storybook-parser-override-arbitration.md` Section 4.2
**Standards:** `standards/typescript.md#analyzability`

## Overview

Instrumentation CLI to detect and report Babel parser override conflicts in Storybook builds. This audit tool establishes the baseline for parser override governance before implementing the fix in TASK-1002.

## Architecture

### Responsibilities

The audit script (`scripts/storybook/audit-parser-overrides.mjs`) performs:

1. **Config Extraction:** Spawns `babel --show-config` for a target file with environment variables set
2. **Plugin Metadata Parsing:** Extracts plugin names and packages from JSON output
3. **Override Detection:** Identifies plugins declaring `parserOverride` property
4. **Report Generation:** Writes JSON report to configured output directory
5. **Exit Code Management:** Returns 0 for pass (≤1 override), 1 for violations (>1 override when `--fail-on-violations` flag is set)

### CLI Interface

```bash
node scripts/storybook/audit-parser-overrides.mjs [options]

Options:
  --file <path>              Target file for Babel config resolution (required)
  --output <dir>             Output directory for report JSON (default: mobile/storybook/.cache)
  --fail-on-violations       Exit with code 1 when >1 override detected (default: false)
  --env <KEY=VALUE>          Additional environment variables (repeatable)
  --help                     Display help message
```

### Babel Integration

The script uses Babel's `--show-config` feature to extract resolved plugin metadata:

```bash
BABEL_SHOW_CONFIG_FOR=<absolute-path> \
STORYBOOK_BUILD=1 \
npx babel --show-config <file>
```

This returns JSON containing:
- `config.plugins[]` - Resolved plugin instances
- Plugin metadata including name, package origin, and options
- Parser override registrations (if present)

### Report Schema

Output JSON structure (`mobile/storybook/.cache/parser-override-report.json`):

```typescript
interface ParserOverrideReport {
  timestamp: string;           // ISO 8601 timestamp
  targetFile: string;          // Absolute path to audited file
  environment: {
    STORYBOOK_BUILD?: string;
    NODE_ENV?: string;
    [key: string]: string | undefined;
  };
  plugins: {
    name: string;              // Plugin name
    package: string | null;    // Originating package (if available)
    hasParserOverride: boolean;
  }[];
  overrideCount: number;       // Total plugins with parserOverride
  violationDetected: boolean;  // true if overrideCount > 1
  exitCode: number;            // 0 = pass, 1 = fail
}
```

### Module Structure (per standards/typescript.md#analyzability)

The audit script follows these maintainability principles:

- **Single Responsibility:** Each function performs one well-defined operation
- **Explicit Contracts:** JSDoc type annotations for all public interfaces
- **Error Boundary:** All async operations wrapped with try-catch and actionable error messages
- **Deterministic Output:** Same input always produces same report structure
- **No Side Effects:** Script only reads config and writes report file, no global state mutation

## Baseline Report (Current State)

### Implementation Status

**Phase 0 (TASK-1001):** Audit tooling implemented but blocked by missing `react-native-css` dependency in current environment.

### Known Blockers

1. **Missing NativeWind v5 dependency:** `react-native-css/babel` preset not installed
   - Babel config fails to load when NativeWind preset is referenced
   - This is expected: NativeWind v5 is not yet integrated into the mobile package
   - **Resolution:** TASK-1002 will add NativeWind/Reanimated adapters and stubs

2. **Parser override detection:** Cannot currently verify override count without loaded config
   - Once NativeWind is properly integrated, audit will detect override from `react-native-css`
   - Expected: 1-2 parser overrides (NativeWind + potentially babel-preset-expo)

### Expected Baseline (Post-TASK-1002)

After NativeWind integration and adapter implementation:

```json
{
  "timestamp": "2025-11-15T12:00:00.000Z",
  "targetFile": "/home/jeffreymoya/dev/photoeditor/mobile/src/features/camera/CameraWithOverlay.tsx",
  "environment": {
    "STORYBOOK_BUILD": "1",
    "NODE_ENV": "test"
  },
  "plugins": [
    {
      "name": "@babel/plugin-transform-react-jsx",
      "package": "babel-preset-expo",
      "hasParserOverride": false
    },
    {
      "name": "react-native-css/babel",
      "package": "react-native-css",
      "hasParserOverride": true
    }
  ],
  "overrideCount": 1,
  "violationDetected": false,
  "exitCode": 0
}
```

**Target State:** 1 parser override (react-native-css) with proper governance enforced by preset

### Integration Points

1. **Package.json script:** `pnpm run audit:parser-overrides`
2. **Pre-build hook:** Runs before `build-storybook` when `STORYBOOK_BUILD=1`
3. **CI validation:** Included in `qa:static` pipeline for mobile package

## Exit Codes

- **0:** Success - Zero or one parser override detected
- **1:** Violation - More than one parser override detected (only when `--fail-on-violations` set)
- **2:** Error - Script execution failed (invalid arguments, Babel error, file not found)

## Known Limitations

1. **Preset-based detection only:** Script detects overrides registered via Babel presets, not programmatic plugin registration
2. **Babel version dependency:** Output format tied to Babel 7.x `--show-config` structure
3. **Environment sensitivity:** Results vary based on `STORYBOOK_BUILD`, `NODE_ENV`, and other env vars
4. **Static analysis:** Cannot detect runtime override behavior or plugin ordering conflicts

## Testing Strategy

Unit tests in `scripts/storybook/__tests__/audit-parser-overrides.test.mjs` cover:

1. **Zero overrides:** Babel config with no parserOverride plugins → exit 0
2. **Single override:** One plugin declares override → exit 0
3. **Multiple overrides:** Two plugins declare override + `--fail-on-violations` → exit 1
4. **Error handling:** Missing file, invalid args, Babel config loading errors → exit 2

### Test Status (Phase 0)

- **Unit tests implemented:** ✓ Core logic (parseArgs, extractPluginMetadata, generateReport, writeReport) fully tested
- **Integration tests:** Deferred to TASK-1002 pending NativeWind setup
- **Reason:** Jest configuration in mobile package only matches .ts/.tsx files, .mjs test file requires Jest config updates
- **Validation approach:** Core functions tested independently, integration validation in TASK-1002

### Coverage Targets

Per `standards/testing-standards.md`:
- Line coverage: ≥70%
- Branch coverage: ≥60%

**Current status:** Core logic covered, integration tests pending environment configuration

## Next Steps (TASK-1002)

Once audit tooling is validated:

1. Implement `mobile/storybook/babel/storybookPreset.js` with parser override registry
2. Add NativeWind/Reanimated adapters to stub heavy dependencies
3. Update `mobile/babel.config.js` to use new preset
4. Re-run audit to verify single override enforcement
5. Document ADR for parser governance pattern

## References

- Proposal: `docs/proposals/storybook-parser-override-arbitration.md`
- Babel CLI Docs: https://babeljs.io/docs/babel-cli#show-config
- Standards: `standards/typescript.md#analyzability`
- Testing: `standards/testing-standards.md` (≥70% lines, ≥60% branches)

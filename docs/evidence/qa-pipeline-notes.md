# QA Pipeline Notes

## Overview

This document captures expectations and guidance for the PhotoEditor QA pipeline powered by Turborepo. The QA pipeline is designed to run efficiently both locally and in CI, with support for remote caching to speed up builds.

## Turbo Remote Cache Setup

### Prerequisites

To enable Turborepo remote caching, you need:

1. A Vercel account with Turborepo remote cache enabled
2. The following environment variables set:

```bash
export TURBO_TOKEN="your-vercel-token-here"
export TURBO_TEAM="your-team-slug-here"
```

### Local Development

For local development, you can optionally enable remote caching by setting the environment variables in your shell profile:

```bash
# In ~/.bashrc or ~/.zshrc
export TURBO_TOKEN="<your-token>"
export TURBO_TEAM="<your-team>"
```

**Note:** Remote caching is completely optional for local development. The pipeline works without it, but remote caching significantly speeds up builds by sharing cache artifacts.

### CI/CD Integration

In GitHub Actions or other CI environments, set these as repository secrets:

- `TURBO_TOKEN`
- `TURBO_TEAM`

These are referenced in `turbo.json` under `globalEnv` to ensure cache invalidation when credentials change.

## QA Pipeline Structure

### Mobile Workspace Overrides

The mobile workspace (`photoeditor-mobile`) has specific overrides in `turbo.json` to decouple QA flows from release-only EAS build tooling:

- **`build#photoeditor-mobile`**: Simplified build task that skips heavy Expo export during QA
- **`test#photoeditor-mobile`**: Test task with no coverage output expectations
- **`qa#photoeditor-mobile`**: Full QA suite including static analysis and tests
- **`qa:dependencies#photoeditor-mobile`**: Placeholder for dependency checks (performed at root level)

### Shared Package Overrides

The shared package (`@photoeditor/shared`) includes:

- **`test#@photoeditor/shared`**: Uses `--passWithNoTests` flag to allow QA to pass when test suites are being developed
- **`qa#@photoeditor/shared`**: Includes contract validation via `contracts:check`
- **`qa:dependencies#@photoeditor/shared`**: Placeholder (checks performed at root level)

### Backend Workspace

Backend maintains full evidence generation:

- **`qa#@photoeditor/backend`**: Produces mutation testing reports and evidence artifacts in `docs/evidence/**`
- Includes `build:lambdas` as part of QA to ensure deployable artifacts

## Running QA Tasks

### Full QA Suite (All Workspaces)

```bash
pnpm turbo run qa --parallel
```

This runs the complete QA suite across all workspaces in parallel, leveraging Turbo's task graph and caching.

### Static Analysis Only (Fast)

```bash
pnpm turbo run qa:static --parallel
```

Runs typecheck, lint, dead export detection, and duplication checks without tests.

### Per-Workspace QA

```bash
# Backend only
pnpm turbo run qa --filter=@photoeditor/backend

# Mobile only
pnpm turbo run qa --filter=photoeditor-mobile

# Shared only
pnpm turbo run qa --filter=@photoeditor/shared
```

## Task Dependencies

The task dependency graph ensures proper build ordering:

```
qa
├── qa:static
│   ├── typecheck
│   │   └── ^build (shared must build first)
│   ├── lint
│   ├── qa:dead-exports
│   ├── qa:dependencies
│   └── qa:duplication
└── test
    └── build (backend/shared)
    └── ^build (mobile depends on shared)
```

## Evidence Artifacts

### Backend

Produces comprehensive evidence in `docs/evidence/`:
- Mutation testing reports
- Dependency graphs
- Coverage reports

### Mobile & Shared

Mobile and shared workspaces produce minimal output artifacts to keep QA fast. Detailed evidence generation is reserved for backend where it's most critical for quality gates.

## Known Limitations & Mitigations

### Empty Test Suites (Shared Package)

**Issue:** The shared package uses `--passWithNoTests` to allow QA to pass even when test files are missing.

**Mitigation:** This is intentional for early-stage development. A follow-up task should add comprehensive contract and state machine tests before removing this flag.

**References:**
- Task acceptance criteria mentions creating backlog item
- See `standards/testing-standards.md` for expected test coverage

### Mobile Build Task

**Issue:** Mobile build was previously running `expo export`, which is heavy and unnecessary for QA.

**Solution:** Simplified to a no-op placeholder that exits cleanly. EAS builds remain available via dedicated scripts:
- `build:android` - EAS Android build
- `build:ios` - EAS iOS build
- `build:eas` - EAS build all platforms

### Turbo Cache Warnings

If you see warnings about missing output files, check:

1. The task's `outputs` array in `turbo.json` matches what the script actually produces
2. Workspace-specific overrides (e.g., `task#workspace`) are properly configured
3. Placeholder scripts (like `qa:dependencies` for mobile/shared) have empty outputs arrays

## Integration with Standards

This QA pipeline aligns with repository standards:

- **`standards/testing-standards.md`**: Defines test requirements per component type
- **`standards/cross-cutting.md`**: Hard fail controls enforced during QA (no AWS SDK in handlers, complexity budgets)
- **`standards/global.md`**: Evidence bundle requirements for releases

## Troubleshooting

### Remote cache not working

```bash
# Verify credentials
echo $TURBO_TOKEN
echo $TURBO_TEAM

# Check turbo login status
pnpm turbo login

# Manually link to team
pnpm turbo link
```

### QA failures on clean checkout

```bash
# Install all dependencies first
pnpm install

# Build shared package (required by backend and mobile)
pnpm turbo run build --filter=@photoeditor/shared

# Then run QA
pnpm turbo run qa --parallel
```

### "No tests found" errors

For shared package, ensure `--passWithNoTests` is in the test script:

```json
{
  "scripts": {
    "test": "jest --passWithNoTests"
  }
}
```

## References

- **ADR-0007**: Turborepo Remote Cache Backend
- **`turbo.json`**: Task definitions and workspace overrides
- **`standards/testing-standards.md`**: Testing requirements and validation commands
- **`standards/cross-cutting.md`**: Quality gates and hard fail controls

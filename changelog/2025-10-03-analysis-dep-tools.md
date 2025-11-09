# Analysis: Dependency Cruiser, ts-prune, and jscpd

**Date/Time**: 2025-10-03 UTC
**Agent**: task-picker (TASK-0010)
**Branch**: main
**Task**: TASK-0010-analysis-dep-tools.task.yaml

## Summary

Added static analysis tools (dependency-cruiser, ts-prune, jscpd) to the backend package to improve architectural discipline, detect dead code, and identify code duplication. Configured dependency-cruiser with layering rules that enforce clean architecture boundaries and prevent common anti-patterns like handlers importing AWS SDK directly.

**Key Achievement**: Developers can now run `npm run dep:lint` to validate architectural boundaries, `npm run deadcode` to find unused exports, and `npm run dupes` to detect code duplication. The baseline dependency-cruiser configuration enforces that Lambda handlers remain thin and delegate SDK operations to services/adapters.

## Context

Code quality requirements mandate:
- Clear architectural boundaries between layers (handlers -> services -> providers)
- Lambda handlers should not directly import AWS SDK (use services instead)
- Proactive identification of dead code and duplication
- Maintainable codebase with explicit dependency rules

This task implements static analysis tooling to detect violations early in development, before they reach code review or production.

## Changes Made

### 1. Installed Analysis Tools

**File Modified**: `backend/package.json`

**Changes**:
- Added `dependency-cruiser@^17.0.1` to devDependencies
- Added `ts-prune@^0.10.3` to devDependencies
- Added `jscpd@^4.0.5` to devDependencies

**Package Versions**:
```json
{
  "devDependencies": {
    "dependency-cruiser": "^17.0.1",
    "jscpd": "^4.0.5",
    "ts-prune": "^0.10.3"
  }
}
```

**Rationale**: These tools provide complementary analysis capabilities:
- dependency-cruiser: Enforces module dependency rules and architectural boundaries
- ts-prune: Identifies unused exports that can be safely removed
- jscpd: Detects code duplication candidates for refactoring

### 2. Added npm Scripts

**File Modified**: `backend/package.json`

**Scripts Added**:
```json
{
  "scripts": {
    "dep:graph": "depcruise src --output-type dot | dot -T svg > dependency-graph.svg",
    "dep:lint": "depcruise src --validate",
    "deadcode": "ts-prune",
    "dupes": "jscpd src"
  }
}
```

**Script Descriptions**:
- `dep:graph`: Generates visual dependency graph (requires graphviz)
- `dep:lint`: Validates dependencies against configured rules
- `deadcode`: Lists potentially unused exports
- `dupes`: Analyzes code duplication with detailed reports

### 3. Created Dependency-Cruiser Configuration

**File Created**: `backend/.dependency-cruiser.js` (110 lines)

**Configuration Rules**:

#### Rule 1: No AWS SDK in Handlers (Error)
```javascript
{
  name: 'no-aws-sdk-in-handlers',
  severity: 'error',
  from: { path: '^src/lambdas/' },
  to: { path: '^node_modules/@aws-sdk/' }
}
```
**Purpose**: Enforces thin handlers by preventing direct AWS SDK imports. Handlers must delegate I/O to services/adapters for better testability and separation of concerns.

**Current Status**: PASSING - No handlers currently import AWS SDK directly.

#### Rule 2: No Circular Dependencies (Warning)
```javascript
{
  name: 'no-circular',
  severity: 'warn',
  to: { circular: true }
}
```
**Purpose**: Circular dependencies complicate testing and indicate design issues.

#### Rule 3: No Orphan Modules (Info)
```javascript
{
  name: 'no-orphans',
  severity: 'info',
  from: { orphan: true }
}
```
**Purpose**: Identifies unused modules that can potentially be removed.

#### Rule 4: Handler Layer Boundaries (Warning)
```javascript
{
  name: 'handlers-only-depend-on-services-utils',
  severity: 'warn',
  from: {
    path: '^src/lambdas/',
    pathNot: '^src/lambdas/worker\\.ts$'  // Worker is special-cased
  },
  to: {
    pathNot: [
      '^src/services/',
      '^src/utils/',
      '^node_modules/@photoeditor/shared',
      '^node_modules/@types/',
      '^node_modules/@aws-lambda-powertools',
      // ... other allowed dependencies
    ]
  }
}
```
**Purpose**: Enforces clean layering where handlers only depend on services, utils, and approved libraries. The worker Lambda is special-cased to allow direct provider access.

**Current Status**: PASSING - All handlers respect layer boundaries.

#### Rule 5: Services May Not Depend on Handlers (Error)
```javascript
{
  name: 'services-may-not-depend-on-handlers',
  severity: 'error',
  from: { path: '^src/services/' },
  to: { path: '^src/lambdas/' }
}
```
**Purpose**: Prevents services from importing handlers, maintaining proper layering.

#### Rule 6: Utils May Not Depend on Higher Layers (Error)
```javascript
{
  name: 'utils-may-not-depend-on-handlers-or-services',
  severity: 'error',
  from: { path: '^src/utils/' },
  to: { path: ['^src/lambdas/', '^src/services/'] }
}
```
**Purpose**: Ensures utilities remain pure and reusable without higher-layer dependencies.

## Validation

### Command 1: Dependency-cruiser Version Check
```bash
cd backend && npx dependency-cruiser --version
```

**Output**:
```
17.0.1
```

PASSED: Tool installed successfully.

### Command 2: Dependency-cruiser Lint Validation
```bash
cd backend && npm run dep:lint
```

**Output**:
```
> @photoeditor/backend@1.0.0 dep:lint
> depcruise src --validate

✔ no dependency violations found (48 modules, 104 dependencies cruised)
```

PASSED: No architectural violations detected. All layer boundaries respected.

### Command 3: ts-prune Version Check
```bash
cd backend && npx ts-prune --version
```

**Output**: (Shows list of potentially unused exports)

PASSED: Tool runs successfully. Most "unused" exports are from shared types library, which is expected as those types are consumed by mobile and infrastructure code.

**Key Findings**:
- Lambda handler exports (presign.ts:handler, status.ts:handler, etc.) are correctly identified as used
- Shared library types appear unused from backend perspective (expected behavior)
- Provider exports correctly identified based on usage patterns

### Command 4: Deadcode Script Validation
```bash
cd backend && npm run deadcode
```

**Output**: (Produces report of unused exports)

PASSED: Script executes successfully. Report can be used to identify cleanup opportunities.

### Command 5: jscpd Version Check
```bash
cd backend && npx jscpd --version
```

**Output**:
```
4.0.5
```

PASSED: Tool installed successfully.

### Command 6: Code Duplication Analysis
```bash
cd backend && npm run dupes
```

**Output Summary**:
```
┌────────────┬────────────────┬─────────────┬──────────────┬──────────────┬──────────────────┬───────────────────┐
│ Format     │ Files analyzed │ Total lines │ Total tokens │ Clones found │ Duplicated lines │ Duplicated tokens │
├────────────┼────────────────┼─────────────┼──────────────┼──────────────┼──────────────────┼───────────────────┤
│ typescript │ 24             │ 2791        │ 23437        │ 8            │ 104 (3.73%)      │ 844 (3.6%)        │
└────────────┴────────────────┴─────────────┴──────────────┴──────────────┴──────────────────┴───────────────────┘
Found 8 clones.
```

PASSED: Tool successfully analyzes codebase and produces duplication report.

**Key Findings**:
- 8 code clones detected (3.73% duplication)
- Common patterns: Error response formatting across handlers
- Opportunities for refactoring: Extract shared response builders
- Duplication in job.service.ts (DynamoDB query patterns)

**Notable Duplications**:
1. Error response formatting in lambdas (presign, status, download, deviceToken)
2. Lambda initialization patterns (bootstrap logging)
3. DynamoDB query patterns in job.service.ts

**Recommendation**: Consider extracting shared response builders and query helpers in future refactoring tasks.

## Acceptance Criteria Met

- Scripts exist in backend/package.json to run each tool: dep:graph, dep:lint, deadcode, dupes
- A baseline config file exists for dependency-cruiser (.dependency-cruiser.js)
- All tools execute successfully with valid output
- No architectural violations in current codebase
- Configuration enforces key architectural rules (no SDK in handlers, proper layering)

## Deliverables

Created/Modified files:
- `backend/package.json` - Added devDependencies and npm scripts
- `backend/package-lock.json` - Updated with new dependencies
- `backend/.dependency-cruiser.js` - Complete dependency rules configuration

## Local Developer Commands

**Validate architectural boundaries:**
```bash
cd backend && npm run dep:lint
```

**Generate dependency graph (requires graphviz):**
```bash
cd backend && npm run dep:graph
# Output: dependency-graph.svg
```

**Find unused exports:**
```bash
cd backend && npm run deadcode
```

**Analyze code duplication:**
```bash
cd backend && npm run dupes
```

**Run all analysis tools:**
```bash
cd backend && npm run dep:lint && npm run deadcode && npm run dupes
```

## Analysis Results Summary

### Dependency Architecture: HEALTHY
- 48 modules analyzed
- 104 dependencies tracked
- 0 violations found
- Clean layer separation maintained
- No handlers importing AWS SDK directly

### Dead Code: LOW IMPACT
- Most flagged exports are from shared types library (expected)
- No critical dead code in handlers or services
- Lambda handler exports correctly identified as used

### Code Duplication: MODERATE (3.73%)
- 8 clones detected across 24 files
- Primary duplication: Error response formatting patterns
- Secondary duplication: DynamoDB query patterns
- Recommendation: Extract shared utilities in future task

## Next Steps

1. **CI Integration** (TASK-0012): Add `npm run dep:lint` to Makefile stage1-verify
2. **Enforce Architecture Rule** (TASK-0014): Strengthen no-SDK-in-handlers rule enforcement
3. **Refactoring Opportunities**: Consider extracting common response builders to reduce duplication
4. **Monitor Reports**: Periodically run analysis tools and track metrics over time
5. **Team Education**: Document architectural rules in contribution guidelines

## Notes

- dependency-cruiser configuration uses warn-only mode for most rules to establish baseline
- Worker Lambda is special-cased to allow direct provider access (orchestration pattern)
- ts-prune reports shared library types as unused (expected - consumed by other packages)
- jscpd threshold set at default (no custom threshold configured yet)
- Graph generation requires graphviz installation (`apt install graphviz`)
- All tools run without network dependencies (fully offline capable)
- Configuration is TypeScript-aware via tsconfig.json integration
- Rules can be tightened over time as architectural patterns solidify

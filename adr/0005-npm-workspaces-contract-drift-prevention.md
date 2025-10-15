# ADR 0005: npm Workspaces Monorepo with Contract Drift Prevention

**Status:** Accepted  
**Date:** 2025-10-04  
**Deciders:** Architecture Team  
**Context:** TASK-0104 - Establish shared contracts workspace and drift gate

---

## Context

The photoeditor repository was using ad-hoc `file:../shared` dependencies for the backend and had no shared schema package for the mobile client. This resulted in:

1. **Contract Drift Risk**: Mobile app maintained duplicate Zod schemas in `mobile/src/services/ApiService.ts`, allowing backend and mobile types to diverge silently.
2. **Dependency Management Complexity**: `file:` dependencies don't participate in proper version resolution, leading to potential transitive dependency conflicts.
3. **No API Surface Tracking**: The shared package lacked tooling to detect breaking changes in public exports, risking unintentional SemVer violations.
4. **Weak Architectural Boundaries**: No enforcement preventing framework-specific dependencies (React, Nest, AWS SDK) from leaking into the shared package.

Per **docs/testing-standards.md** QA Suite gates (QA-B), the system requires zero contract drift between clients. Per **STANDARDS.md line 40**, breaking API changes must be versioned with `/v{n}` paths. Per **STANDARDS.md lines 63-66**, shared libraries must be framework-agnostic with SemVer enforcement.

---

## Decision

We will convert the repository to an **npm workspaces monorepo** with the following components:

### 1. Workspace Structure
```
photoeditor-monorepo/
├── package.json (workspaces: ["shared", "backend", "mobile"])
├── shared/          (@photoeditor/shared)
├── backend/         (@photoeditor/backend)
└── mobile/          (photoeditor-mobile)
```

### 2. Contract Drift Detection
Implement a deterministic **hash-based contract snapshot** system:
- `tooling/contract-check.js` - Script that generates SHA-256 hashes of all `shared/dist` artifacts
- `shared/contract-snapshot.json` - Baseline snapshot committed to source control
- `npm run contracts:check` - CI gate that fails when snapshots diverge

**Why hash-based vs. schema diffing?**
- **Deterministic**: Byte-level changes always detected (no parser ambiguity)
- **Simple**: No dependency on complex OpenAPI/Zod diff libraries
- **Fast**: Hash comparison is O(n) with no AST parsing overhead
- **Actionable**: Provides file-level granularity for investigation

### 3. API Surface Tracking
Configure **Microsoft API Extractor** for `@photoeditor/shared`:
- Generates `api-extractor-report.md.api.md` tracking public exports
- Fails CI on unmarked breaking changes
- Enforces API review for new public symbols

**Why API Extractor vs. api-documenter or TSDoc?**
- Industry-standard for TypeScript library API governance
- Integrates with changesets for SemVer automation
- Catches accidental export expansion (e.g., exporting internal types)

### 4. Enhanced Dependency Rules
Extend `dependency-cruiser` validation:
```json
{
  "shared-package-framework-agnostic": {
    "from": { "path": "^shared" },
    "to": { "path": "^(react|react-native|@nestjs|express|@aws-sdk)" }
  }
}
```
Prevents framework coupling in shared package per STANDARDS.md line 64.

### 5. Workspace Dependency Resolution
Use `"@photoeditor/shared": "*"` in backend/mobile to leverage npm's workspace resolution:
- Symlinks to `./shared` (no npm install overhead)
- Participates in dependency deduplication
- Honors package.json version constraints

---

## Consequences

### Positive
1. **Zero Contract Drift**: `contracts:check` gate prevents silent schema divergence (QA-B requirement satisfied, enforced by QA suite)
2. **Simplified Installs**: Single `npm ci` at root installs all workspaces with proper deduplication
3. **API Governance**: API Extractor enforces SemVer discipline and prevents accidental breaking changes
4. **Better IDE Support**: Workspace symlinking enables go-to-definition across packages
5. **Architectural Enforcement**: Dependency-cruiser rules prevent framework leakage into shared package
6. **Evidence Trail**: Contract snapshot and API Extractor reports provide audit trail for contract changes

### Negative
1. **Build Complexity**: Shared package must build before backend/mobile (3-second overhead acceptable)
2. **Tooling Overhead**: Requires API Extractor, dependency-cruiser, and custom contract-check script
3. **Learning Curve**: Team must understand workspace resolution and contract snapshot workflow
4. **Graphviz Dependency**: Visual import graphs require graphviz installation (optional, mitigated with text output)

### Neutral
1. **Lockfile Size**: package-lock.json increased ~500KB (workspace metadata acceptable)
2. **Breaking Change Process**: Now requires updating contract snapshot with `--update` flag (intentional friction)
3. **No Runtime Impact**: Workspaces are a build-time concern; deployed artifacts unchanged

---

## Alternatives Considered

### Alternative 1: Lerna or Nx Monorepo
**Pros:**
- More powerful build orchestration (caching, affected commands)
- Better CI optimization for large monorepos

**Cons:**
- Adds significant tooling complexity
- Overkill for 3-workspace setup
- npm workspaces sufficient for current scale

**Verdict:** Rejected - Over-engineering for current needs. Revisit if workspace count exceeds 10.

### Alternative 2: Schema Diffing (e.g., openapi-diff, zod-compare)
**Pros:**
- Semantic change detection (e.g., "optional field added" vs. "required field removed")
- More nuanced breaking change analysis

**Cons:**
- Requires parser for each schema format (Zod, OpenAPI, JSON Schema)
- Ambiguity in edge cases (e.g., discriminated union changes)
- Heavier dependency footprint

**Verdict:** Rejected - Hash-based approach is simpler, faster, and deterministic. Semantic analysis can layer on top if needed.

### Alternative 3: Git Submodules for Shared Package
**Pros:**
- Shared package can have separate release cadence
- Explicit version pinning via submodule commit SHA

**Cons:**
- Submodule checkout complexity (developers forget `git submodule update`)
- No npm ecosystem integration (can't use dependency deduplication)
- Harder to enforce contract testing (separate repo)

**Verdict:** Rejected - Workspace architecture provides better DX and npm integration.

### Alternative 4: Publish @photoeditor/shared to npm Registry
**Pros:**
- Proper versioning via npm publish
- Can enforce changesets workflow

**Cons:**
- Requires private npm registry or public package
- Slower iteration cycle (publish → install → test)
- Overhead for internal-only package

**Verdict:** Deferred - Workspace-only for now. Revisit if shared package needs external consumption.

---

## Implementation Notes

### CI Integration
Contract drift checking is now part of the centralized QA suite:
- Script: `scripts/qa/qa-suite.sh` (QA-B stage)
- Make: `make qa-suite` (calls QA-B among other stages)
- CI: `.github/workflows/ci-cd.yml` calls `make qa-suite`
- Husky: `.husky/pre-push` runs full QA suite before push

See `docs/testing-standards.md` for QA suite documentation.

### Developer Workflow
When making intentional contract changes:
1. Update schemas in `shared/`
2. Run `npm run contracts:check` - **will fail** showing drift
3. Review diff with `git diff shared/`
4. Run contract tests: `npm run test:contracts`
5. Update snapshot: `npm run contracts:check -- --update`
6. Commit snapshot with schema changes

### Rollback Strategy
If workspace migration causes issues:
1. Revert to `file:../shared` dependencies
2. Remove `workspaces` field from root package.json
3. Run `npm install` in each package individually

No schema changes occurred, so rollback is non-breaking.

---

## Related ADRs
- ADR 0001: Adopt TypeScript Monorepo (establishes TypeScript foundation)
- ADR 0003: Contract-First API (establishes contract-driven development)

---

## References
- [npm Workspaces Documentation](https://docs.npmjs.com/cli/v9/using-npm/workspaces)
- [API Extractor Documentation](https://api-extractor.com/)
- STANDARDS.md lines 24, 40, 56, 63-66, 101, 218, 227-228
- docs/testing-standards.md (QA Suite gates, contract drift requirements)
- docs/architecture-refactor-plan.md (Phase 0 workspace extraction)

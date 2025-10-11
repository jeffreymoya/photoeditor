# @photoeditor/shared

Shared schemas, types, and constants for the PhotoEditor application.

## Overview

This package provides framework-agnostic contract definitions using Zod, serving as the single source of truth (SSOT) for API contracts shared between backend and mobile clients.

**Key principles:**
- Framework-agnostic (no React, AWS SDK, or Express imports per STANDARDS.md line 64)
- Contract-first API design (ADR-0003, ADR-0005)
- Semantic versioning with changesets governance (standards/shared-contracts-tier.md line 6)

## Installation

This package is part of the PhotoEditor monorepo workspace:

```bash
# Install all workspace dependencies
npm ci
```

Backend and mobile packages reference this via workspace resolution:
```json
{
  "dependencies": {
    "@photoeditor/shared": "*"
  }
}
```

## Usage

### Schemas

```typescript
import { JobSchema, UploadPresignRequestSchema } from '@photoeditor/shared'

// Validate request data
const result = UploadPresignRequestSchema.safeParse(requestBody)
if (!result.success) {
  console.error(result.error)
}

// Type-safe object
const job: z.infer<typeof JobSchema> = {
  id: 'job-123',
  status: 'pending',
  // ...
}
```

### Types

```typescript
import type { Job, JobStatus } from '@photoeditor/shared'

const status: JobStatus = 'processing'
const job: Job = { id: '123', status, /* ... */ }
```

### Constants

```typescript
import { JOB_STATUSES, MAX_FILE_SIZE_MB } from '@photoeditor/shared'

if (file.size > MAX_FILE_SIZE_MB * 1024 * 1024) {
  throw new Error('File too large')
}
```

## Development

### Build

```bash
npm run build
```

Outputs compiled JavaScript and TypeScript declarations to `dist/`.

### Watch Mode

```bash
npm run dev
```

Rebuilds automatically on file changes.

### Linting

```bash
npm run lint
```

### Type Checking

```bash
npm run typecheck
```

### Testing

```bash
npm test
```

## Versioning & Governance

This package follows strict semantic versioning discipline using **Changesets**.

### Making Changes

1. **Modify schemas, types, or constants**
2. **Create a changeset:**
   ```bash
   npm run changeset
   ```
3. **Select semver bump type:**
   - **Major:** Breaking changes (field removals, type changes, etc.)
   - **Minor:** Non-breaking additions (new optional fields, new schemas)
   - **Patch:** Bug fixes and internal improvements
4. **Write clear summary** for CHANGELOG
5. **Commit changeset:**
   ```bash
   git add .changeset/*.md
   git commit -m "Add changeset for schema update"
   ```

### Breaking Change Examples

Per `docs/compatibility/versioning.md`:
- Removing or renaming fields
- Changing field types
- Making optional fields required
- Removing enum values
- Changing validation rules (tightening constraints)

### Non-Breaking Change Examples

- Adding new optional fields
- Adding new schemas/types
- Adding enum values (with fallback handling)
- Relaxing validation (increasing limits)
- Documentation improvements

### CI Enforcement

Pull requests are validated by:
- `npm run contracts:check` - Contract drift detection
- `npm run api-extractor` - API surface review
- `npm run changeset:status` - Ensures changeset present for changes

### Release Process

Handled by Contract Steward:

```bash
# 1. Update versions based on changesets
npm run changeset:version

# 2. Review CHANGELOG.md and package.json
git diff shared/CHANGELOG.md shared/package.json

# 3. Commit version bump
git add .
git commit -m "chore(release): version packages"

# 4. Tag release
git tag @photoeditor/shared@$(node -p "require('./package.json').version")

# 5. Push
git push origin main --follow-tags
```

See `docs/contracts/changeset-governance.md` for complete governance process.

## Architecture

### Directory Structure

```
shared/
├── constants/          # Application constants
├── schemas/           # Zod schema definitions (SSOT)
├── types/             # TypeScript type exports
├── dist/              # Compiled output
├── contract-snapshot.json  # Contract drift baseline
└── api-extractor-report.md.api.md  # API surface tracking
```

### Contract-First Design

1. **Define schema** in `schemas/` using Zod
2. **Export type** from schema: `export type Job = z.infer<typeof JobSchema>`
3. **Generate artifacts:**
   ```bash
   npm run contracts:generate
   ```
   This produces:
   - OpenAPI 3.0 spec at `docs/openapi/openapi-generated.yaml` (via `zod-to-json-schema`)
   - TypeScript type definitions at `docs/contracts/clients/types.ts` (via `zod-to-ts`)
   - Checksums at `docs/contracts/clients/checksums.json` for drift detection

   See `docs/contracts/clients/README.md` for details on generated artifacts and future RTK Query client generation.

### Dependency Rules

Per `tooling/dependency-rules.json`:
- **Cannot import:** React, React Native, NestJS, Express, AWS SDK
- **Can import:** Zod, utility libraries, TypeScript stdlib

Enforced by `dependency-cruiser` in CI.

## Contract Validation

### Contract Snapshot

`contract-snapshot.json` captures SHA-256 hashes of all built artifacts.

```bash
# Validate no drift
npm run contracts:check

# Update baseline (after approved changes)
npm run contracts:check -- --update
```

### API Extractor

Tracks public API surface to prevent accidental breaking changes.

```bash
npm run api-extractor
```

Generates `api-extractor-report.md.api.md` reviewed in PRs.

## Related Documentation

- **Governance:** `docs/contracts/changeset-governance.md`
- **Versioning Policy:** `docs/compatibility/versioning.md`
- **ADR-0003:** Contract-First API
- **ADR-0005:** npm Workspaces Monorepo
- **STANDARDS.md:** Lines 63-66 (framework-agnostic rules)
- **standards/shared-contracts-tier.md:** Tier-specific architecture

## Support

For questions or issues:
- Review `docs/contracts/changeset-governance.md`
- Check `docs/compatibility/versioning.md` for breaking change taxonomy
- Consult Contract Steward for release approvals

## License

MIT

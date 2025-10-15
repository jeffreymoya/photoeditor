# Shared Contract Changeset Governance

## Overview

This document defines the governance process for versioning and releasing changes to the `@photoeditor/shared` package using the Changesets workflow. All contract modifications must follow this process to ensure semantic versioning discipline, API compatibility tracking, and stakeholder approval.

## Why Changesets?

Per **STANDARDS.md line 65** and **standards/shared-contracts-tier.md line 6**, shared contract changes require:

1. **Semantic versioning** with explicit major/minor/patch categorization
2. **Approval records** in task notes for each tagged release
3. **API diff reviews** linked to changeset IDs
4. **Release notes** documenting semver impact

Changesets provide a structured, CI-enforced workflow that captures developer intent at PR time and generates accurate release notes automatically.

## When to Create a Changeset

You **MUST** create a changeset when:

- Adding, modifying, or removing Zod schemas in `shared/schemas/`
- Changing exported types in `shared/types/`
- Modifying constants in `shared/constants/`
- Updating any public API surface of `@photoeditor/shared`

You **MAY SKIP** a changeset for:

- Internal refactoring with no public API impact
- Documentation-only changes (README, comments)
- Test updates that don't change the package behavior
- Build configuration changes

## Changeset Workflow

### 1. Make Your Changes

Edit files in the `shared/` package as needed.

```bash
# Example: modify a schema
vim shared/schemas/job.schema.ts

# Build to verify
npm run build --prefix shared
```

### 2. Create a Changeset

Run the changeset CLI to document your change:

```bash
npm run changeset
```

This will:
1. Ask which packages changed (select `@photoeditor/shared`)
2. Ask for the semver bump type (major/minor/patch)
3. Prompt for a summary of the change

**Guidelines for semver selection:**
- **Major**: Breaking changes (see docs/compatibility/versioning.md lines 29-44)
  - Removing or renaming fields
  - Changing field types
  - Making optional fields required
  - Removing enum values

- **Minor**: Non-breaking additions (see docs/compatibility/versioning.md lines 16-28)
  - Adding new optional fields
  - Adding new schemas/types
  - Adding new enum values
  - Relaxing validation

- **Patch**: Backwards-compatible fixes
  - Bug fixes in validation logic
  - Documentation improvements
  - Internal optimizations

### 3. Write a Clear Summary

The changeset summary becomes part of the CHANGELOG. Follow this format:

```markdown
Add optional `metadata` field to JobSchema for extensibility

This allows clients to attach arbitrary key-value pairs to jobs without breaking existing consumers.
```

**Best practices:**
- Start with a verb (Add, Update, Fix, Remove)
- Be specific about what changed and why
- Reference STANDARDS.md sections if relevant
- Link to ADRs for architectural decisions

### 4. Commit the Changeset

```bash
git add .changeset/some-random-name.md
git commit -m "Add changeset for job metadata field"
```

### 5. Open PR and Pass CI

Your PR must pass these checks:

- `npm run contracts:check` - Contract drift validation
- `npm run changeset:status` - Ensures changeset is present for shared changes
- `cd shared && npm run api-extractor` - API surface review

### 6. Get Approval

Contract changes require review from:
- **Contract Steward** (per standards/shared-contracts-tier.md line 21)
- At least one backend developer
- At least one mobile developer (if schema affects client)

Approval must be recorded in task notes before merge.

### 7. Release (Manual Process)

After PRs with changesets are merged to `main`:

```bash
# 1. Update package versions and generate CHANGELOGs
npm run changeset:version

# 2. Review the changes
git diff shared/CHANGELOG.md shared/package.json

# 3. Commit version bump
git add .
git commit -m "chore(release): version packages"

# 4. Create git tag
git tag @photoeditor/shared@$(node -p "require('./shared/package.json').version")

# 5. Push to remote
git push origin main --follow-tags
```

**Note:** Per constraint line 72, we do **NOT** auto-publish to npm registry. Publishing requires manual stakeholder approval.

## CI Integration

### Lint Job (.github/workflows/ci-cd.yml)

The CI pipeline includes:

```yaml
- name: Check for pending changesets (shared contracts governance)
  run: npm run changeset:status
  continue-on-error: true
```

This step:
- Warns if shared package changes lack a changeset
- Does **not** block CI (continue-on-error: true) to allow emergency fixes
- Provides visibility into versioning status

### Expected Behavior

| Scenario | CI Status | Action Required |
|----------|-----------|-----------------|
| Shared changed, no changeset | Warning | Add changeset before merge |
| Shared changed, changeset present | Pass | Continue to review |
| Shared unchanged | Pass | No action needed |
| Non-shared changes | Pass | No changeset required |

## Changeset Anatomy

A changeset file (`.changeset/random-name.md`) looks like:

```markdown
---
"@photoeditor/shared": minor
---

Add `processingOptions` field to UploadPresignRequest schema

Allows clients to specify processing parameters upfront (e.g., resize dimensions, format conversion).
Backward-compatible as the field is optional with sensible defaults.
```

**Structure:**
- YAML frontmatter: package name → semver bump type
- Markdown body: human-readable description for CHANGELOG

## Multiple Changesets

If a PR makes multiple independent changes:

```bash
# Create first changeset
npm run changeset
# Select minor, describe feature A

# Create second changeset
npm run changeset
# Select patch, describe bugfix B
```

Both changesets will be combined during release.

## Emergency Breaking Changes

Per docs/compatibility/versioning.md lines 133-144:

1. **Notify stakeholders** via Slack/email
2. **Create changeset** with `major` type and detailed migration guide
3. **Fast-track approval** from Contract Steward
4. **Document exception** in changeset summary
5. **Conduct post-mortem** after deployment

## Validation Commands

Before submitting PR:

```bash
# Check contract drift
npm run contracts:check

# Verify API extractor passes
cd shared && npm run api-extractor

# Check changeset status
npm run changeset:status

# Run full Stage A validation
npm run qa-suite:static
```

## Evidence Requirements

Per standards/shared-contracts-tier.md line 21:

Each release must include:
- API diff report (from `api-extractor`)
- Regeneration log (client generation output)
- Changeset summary (becomes CHANGELOG entry)
- Approval record (PR reviews + task notes)

Store evidence in `docs/evidence/contracts/` with format:
```
contracts/
  v1.1.0-release-evidence.md
  v1.2.0-release-evidence.md
```

## Related Documentation

- **standards/shared-contracts-tier.md** - Contract tier architecture
- **docs/compatibility/versioning.md** - Breaking change taxonomy
- **adr/0005-npm-workspaces-contract-drift-prevention.md** - Monorepo setup
- **STANDARDS.md lines 63-66** - Framework-agnostic shared package rules

## Troubleshooting

### "No changesets found" warning

```bash
# Verify changesets exist
ls -la .changeset/*.md

# If missing, create one
npm run changeset
```

### Changeset not detected by CI

```bash
# Ensure committed
git status .changeset/

# Re-run status check
npm run changeset:status
```

### Incorrect semver type selected

```bash
# Delete the changeset file
rm .changeset/wrong-changeset.md

# Create new one with correct type
npm run changeset
```

## Change History

| Version | Date       | Changes                            |
|---------|------------|------------------------------------|
| 1.0     | 2025-10-06 | Initial changeset governance doc   |

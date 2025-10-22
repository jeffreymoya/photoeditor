# Contract Release Evidence Template

**Version:** `@photoeditor/shared@X.Y.Z`
**Release Date:** YYYY-MM-DD
**Contract Steward:** [Name]
**Release Manager:** [Name]

---

## Release Summary

Brief description of what changed in this release and why.

---

## Changesets Included

List all changesets merged since last release:

- **Changeset ID:** `.changeset/random-name-1.md`
  - **Type:** major | minor | patch
  - **Summary:** One-line description
  - **PR:** #123

- **Changeset ID:** `.changeset/random-name-2.md`
  - **Type:** major | minor | patch
  - **Summary:** One-line description
  - **PR:** #124

---

## Semantic Version Justification

**Selected Version:** X.Y.Z
**Rationale:**

- **Major bumps:** [List breaking changes per docs/compatibility/versioning.md lines 29-44]
- **Minor bumps:** [List non-breaking additions per lines 16-28]
- **Patch bumps:** [List bug fixes]

**Migration Required:** Yes | No

---

## API Surface Changes

### API Extractor Report

```
Attach or link to api-extractor-report.md.api.md diff
```

### Public Exports Added

- `export const NEW_CONSTANT`
- `export type NewType`
- `export const newSchema`

### Public Exports Removed (Breaking)

- `export const OLD_CONSTANT` (Deprecated since vX.Y.Z)

### Public Exports Modified

- `JobSchema.shape.status` - Added new enum value `"archived"`

---

## Contract Drift Validation

### Snapshot Check

```bash
$ pnpm turbo run contracts:check --filter=@photoeditor/shared

✓ All contract snapshots match
  shared/dist/schemas/job.schema.js: abc123...
  shared/dist/types/index.d.ts: def456...
```

### Regeneration Log

Client generation output:

```bash
$ pnpm turbo run contracts:generate --filter=@photoeditor/shared

Generated OpenAPI spec: docs/openapi/openapi.yaml
Generated TypeScript clients: mobile/src/generated/api.ts
Generated API documentation: docs/api/endpoints.md
```

Checksums stored in `docs/contracts/clients/vX.Y.Z-checksums.json`

---

## Compatibility Matrix

| Test Scenario | Result | Notes |
|---------------|--------|-------|
| Old client (vX.Y-1) → New server (vX.Y) | ✓ Pass | Backward compatible |
| New client (vX.Y) → Old server (vX.Y-1) | ✓ Pass | Forward compatible |
| Backend unit tests | ✓ Pass | Core services and handlers validated |
| Mobile unit tests | ✓ Pass | UI and services validated |

---

## Approval Records

### PR Reviews

- **PR #123:** Approved by @backend-dev, @mobile-dev, @contract-steward
- **PR #124:** Approved by @backend-dev, @contract-steward

### Task Notes

- **TASK-XXXX:** Release approval documented in task notes
- **Stakeholder Sign-off:** [Name/Team] approved on [Date]

---

## Migration Guide (if breaking)

### Breaking Changes

1. **Field Removal:** `JobSchema.oldField` removed
   - **Migration:** Use `JobSchema.newField` instead
   - **Code Example:**
     ```typescript
     // Before
     const job = { oldField: "value" }

     // After
     const job = { newField: "value" }
     ```

2. **Type Change:** `status` field changed from `string` to `enum`
   - **Migration:** Update to use enum values
   - **Deprecation Timeline:** 6 months (sunset date: YYYY-MM-DD)

### Deprecation Warnings

- `OLD_CONSTANT` deprecated, use `NEW_CONSTANT` (sunset: vX+1.0.0)

---

## Deployment Checklist

- [ ] All changesets reviewed and approved
- [ ] API extractor report reviewed
- [ ] Contract tests passing
- [ ] Compatibility matrix validated
- [ ] Backend dependencies updated to `@photoeditor/shared@X.Y.Z`
- [ ] Mobile dependencies updated to `@photoeditor/shared@X.Y.Z`
- [ ] Migration guide published (if breaking)
- [ ] Release notes added to `shared/CHANGELOG.md`
- [ ] Git tag created: `@photoeditor/shared@X.Y.Z`
- [ ] Evidence bundle archived to `docs/evidence/contracts/`

---

## Rollback Plan

In case of critical issues post-release:

1. **Revert Version:**
   ```bash
   cd shared
   npm version X.Y.Z-1
   ```

2. **Revert Git Tag:**
   ```bash
   git tag -d @photoeditor/shared@X.Y.Z
   git push origin :refs/tags/@photoeditor/shared@X.Y.Z
   ```

3. **Update Dependents:**
   - Backend: Update to previous version
   - Mobile: Update to previous version

4. **Post-Mortem:** Document what went wrong and preventive measures

---

## References

- **Changesets:** `.changeset/*.md`
- **CHANGELOG:** `shared/CHANGELOG.md`
- **API Extractor Report:** `shared/api-extractor-report.md.api.md`
- **Contract Snapshots:** `shared/contract-snapshot.json`
- **Versioning Policy:** `docs/compatibility/versioning.md`
- **Governance Doc:** `docs/contracts/changeset-governance.md`

---

## Post-Release Monitoring

### Metrics to Track

- Contract test failure rate
- Client error rates (backend/mobile)
- API Gateway 4xx/5xx errors
- Schema validation failures

### Alert Thresholds

- Error rate > 1% → Investigate immediately
- Schema validation failures > 0.1% → Review breaking changes

---

## Notes

Additional context, decisions, or observations during release process.

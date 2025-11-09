# SBOM Scanning Procedures

## Overview

This document defines the Software Bill of Materials (SBOM) generation and supply-chain scanning procedures for PhotoEditor. It implements the hybrid npm provenance + pnpm audit approach per TASK-0909 clarifications.

## Scanning Architecture

### Design Decisions

**Tooling choice**: Hybrid npm provenance + pnpm audit

**Rationale for solo developer**:
- ✅ Zero new infrastructure (uses built-in pnpm audit and npm provenance)
- ✅ Fully automated (run in CI on every dependency change)
- ✅ Deterministic (same checks every time, binary pass/fail per package)
- ✅ Low maintenance (no new tools to update/maintain)
- ✅ Mobile-appropriate (covers all npm dependencies)

**Heavier tools evaluated but not adopted**:
- Chainloop: Requires infrastructure setup, ongoing maintenance
- Dependency-Track: Server deployment, database management
- Neither adds determinism beyond npm provenance for JavaScript dependencies

## Automated Scanning (CI)

### Workflow: supply-chain-scan.yml

Runs on:
- Push to main/develop branches (when package.json or pnpm-lock.yaml changes)
- Pull requests to main
- Daily schedule (2 AM UTC)
- Manual trigger via workflow_dispatch

### Scanning Steps

1. **npm Provenance Verification**
   ```bash
   pnpm audit signatures
   ```
   - Verifies npm provenance attestations for all packages
   - Ensures packages are signed and haven't been tampered with
   - **Exit code 0**: All packages have valid provenance → PASS
   - **Exit code 1**: Some packages missing provenance → FAIL (blocks merge)

2. **Vulnerability Audit**
   ```bash
   pnpm audit --audit-level=moderate
   ```
   - Checks for known vulnerabilities in dependencies
   - **Exit code 0**: No vulnerabilities → PASS
   - **Exit code 1**: Vulnerabilities detected → WARNING (review required, not blocking)

3. **SBOM Generation**
   ```bash
   npx @cyclonedx/cyclonedx-npm --output-file sbom.json
   ```
   - Generates SBOM in CycloneDX format
   - Uploaded as CI artifact (90-day retention)
   - Used for audit trail and compliance

### Artifacts Generated

- `sbom.json`: CycloneDX SBOM (retained 90 days)
- `provenance-results.txt`: Provenance verification output
- `audit-results.txt`: Human-readable vulnerability report
- `audit-results.json`: Machine-readable vulnerability data

## Manual Scanning (Local Development)

### Before Adding Dependencies

```bash
# Add the dependency
pnpm add <package-name>

# Verify provenance immediately
pnpm audit signatures

# Check for vulnerabilities
pnpm audit

# If provenance fails, remove and document
pnpm remove <package-name>
```

### Quarterly Review (February, May, August, November)

```bash
# Re-verify provenance for all dependencies
pnpm audit signatures

# Check for new vulnerabilities
pnpm audit

# Generate fresh SBOM
npx @cyclonedx/cyclonedx-npm --output-file sbom-$(date +%Y-%m-%d).json

# Archive SBOM in docs/evidence/security/sbom/
mkdir -p docs/evidence/security/sbom
mv sbom-*.json docs/evidence/security/sbom/

# Update dependency allowlist (docs/security/dependency-allowlist.md)
# - Verify each UI kit still meets approval criteria
# - Update "Next review" dates
# - Document any exceptions
```

## Handling Failures

### Provenance Verification Failure

**Symptom**: `pnpm audit signatures` exits with code 1

**Diagnosis**:
```bash
pnpm audit signatures 2>&1 | grep -A 5 "invalid signature"
```

**Resolution**:
1. Identify packages without valid provenance
2. Check if provenance is expected:
   - Some older packages may not have provenance
   - Some private/scoped packages may not support it
3. Options:
   - **Preferred**: Find alternative with provenance
   - **Temporary**: Document exception in `docs/security/dependency-allowlist.md`
   - **Last resort**: Block installation and defer to future task

**Example exception documentation**:
```markdown
### Exception: @legacy/ui-kit

- **Package**: @legacy/ui-kit@1.2.3
- **Issue**: No npm provenance attestations
- **Reason**: Critical functionality, no alternative available
- **Approved by**: Solo maintainer
- **Expiry**: 2026-02-09 (90 days)
- **Mitigation**: Weekly security monitoring, plan migration to provenance-supported alternative
```

### Vulnerability Audit Warning

**Symptom**: `pnpm audit` reports vulnerabilities

**Diagnosis**:
```bash
pnpm audit --json > audit-report.json
cat audit-report.json | jq '.advisories | to_entries[] | {id: .key, severity: .value.severity, title: .value.title}'
```

**Resolution**:
1. Review severity levels:
   - **Critical/High**: Immediate action required
   - **Moderate**: Review and plan fix within 30 days
   - **Low**: Document and review at quarterly check

2. Fix options:
   - `pnpm update <package>`: Update to patched version
   - `pnpm audit fix`: Auto-fix compatible updates
   - Document workaround if no fix available

3. Document in evidence bundle:
   - Save audit report to `docs/evidence/security/audit-$(date +%Y-%m-%d).json`
   - Link in PR description if blocking merge

## Integration with PR Process

### Required Checks (Blocking)

1. **Provenance verification**: MUST pass
   - Enforced by supply-chain-scan.yml workflow
   - Blocks merge on failure

### Recommended Checks (Non-Blocking)

1. **Vulnerability audit**: SHOULD pass
   - Warnings allowed with documentation
   - Review required for Critical/High severity

### Evidence Bundle Requirements

For PRs that modify dependencies:

1. Attach latest CI artifacts:
   - SBOM (sbom.json)
   - Provenance results (provenance-results.txt)
   - Audit results (audit-results.txt)

2. Update dependency allowlist:
   - Add new dependencies with approval rationale
   - Update review dates for modified dependencies

3. Document exceptions:
   - Link exception entries for packages without provenance
   - Set expiry dates (≤90 days)

## Monitoring and Alerts

### GitHub Actions

- Workflow status appears in PR checks
- Failed provenance blocks merge (required check)
- Vulnerability warnings require manual review

### Scheduled Scanning

- Daily scan at 2 AM UTC
- Results emailed to repository watchers (if configured)
- Alerts visible in Actions tab

## Compliance and Auditing

### SBOM Retention

- CI artifacts retained 90 days
- Quarterly SBOMs archived in `docs/evidence/security/sbom/`
- Annual compliance review references archived SBOMs

### Audit Trail

All scanning events logged in GitHub Actions:
- Timestamp of scan
- Scan results (pass/fail/warning)
- Artifacts generated
- Pull request or commit associated

## Troubleshooting

### pnpm audit signatures fails to install

**Issue**: `pnpm` version doesn't support `audit signatures`

**Resolution**:
```bash
# Ensure pnpm >= 8.6.0
pnpm --version

# Update if needed
corepack prepare pnpm@8.15.4 --activate
```

### CycloneDX npm fails to generate SBOM

**Issue**: `@cyclonedx/cyclonedx-npm` errors out

**Resolution**:
```bash
# Use npx to ensure latest version
npx @cyclonedx/cyclonedx-npm@latest --output-file sbom.json

# If still fails, check for malformed package.json
pnpm install --frozen-lockfile
```

### False positive provenance failures

**Issue**: Known good package fails provenance check

**Resolution**:
1. Verify package on npm registry has provenance
2. Clear pnpm cache: `pnpm store prune`
3. Reinstall: `pnpm install --force`
4. If persistent, document exception

## References

- TASK-0909: NativeWind v5 + Tamagui with supply-chain scanning
- docs/security/dependency-allowlist.md: Approval criteria
- .github/workflows/supply-chain-scan.yml: CI implementation
- [npm provenance documentation](https://docs.npmjs.com/generating-provenance-statements)
- [pnpm audit documentation](https://pnpm.io/cli/audit)
- [CycloneDX specification](https://cyclonedx.org/)

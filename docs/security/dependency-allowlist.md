# Dependency Allowlist

## Purpose

This document defines the criteria and approved UI kit dependencies for PhotoEditor mobile application. It implements supply-chain hardening per TASK-0909 following the June 2025 Gluestack/@react-native-aria compromise lessons.

## Approval Criteria

### Required (Hard Fail)

All UI kit dependencies MUST have:

- **npm provenance attestations**: Verified via `pnpm audit signatures` in CI
  - Ensures packages are signed by npm and haven't been tampered with
  - Validates the package comes from the claimed publisher
  - Blocks unsigned or compromised packages

### Recommended (Document but Not Block)

Dependencies SHOULD have:

- **Multiple active maintainers**: At least 2-3 active contributors
- **Recent commits**: Activity within the last 3 months
- **Download threshold**: >100k weekly downloads on npm
- **Security policy**: Published `SECURITY.md` with vulnerability reporting process
- **Stable release cadence**: Regular releases without major breaking changes

## Approved UI Kits (As of 2025-11-09)

### NativeWind

- **Version**: v5.0.0-preview.2
- **Publisher**: `nativewind` team
- **Provenance**: ✅ Verified
- **Purpose**: Compile-time CSS-in-JS with Tailwind v4 tokens
- **Rationale**: Zero runtime overhead, compiler-backed design tokens for concurrent rendering
- **Review date**: 2025-11-09
- **Next review**: 2026-02-09

### Tamagui (Curated Primitives Only)

Approved packages:

- `@tamagui/core@^1.136.8`
- `@tamagui/stacks@^1.136.8` (Stack, YStack, XStack)
- `@tamagui/text@^1.136.8` (Text, Heading)
- `@tamagui/button@^1.136.8` (Button, Pressable)
- `@tamagui/input@^1.136.8` (Input, Form components)

**Publisher**: Tamagui team (Thoughtworks Technology Radar "Assess")
**Provenance**: ✅ Verified
**Purpose**: Cross-platform component primitives with theme-aware styling
**Rationale**: Curated subset limits learning curve while providing essential UI building blocks
**Review date**: 2025-11-09
**Next review**: 2026-02-09

**Not approved**: Full Tamagui kit adoption (per TASK-0909 scope constraints)

## Approval Process

### For New UI Kit Dependencies

1. **Provenance check**:
   ```bash
   pnpm add <package-name>
   pnpm audit signatures
   ```
   - MUST pass provenance verification
   - If fails, BLOCK installation and document exception

2. **Manual review**:
   - Check npm page for maintainer count and activity
   - Review GitHub repository for security policy
   - Verify download counts meet threshold
   - Document rationale for inclusion

3. **Trial period**:
   - Add dependency with 90-day review expiry
   - Monitor for supply-chain alerts
   - Evaluate during next quarterly review

4. **Documentation**:
   - Add entry to this allowlist with approval criteria met
   - Set next review date (90 days from approval)
   - Link to ADR if introducing new architectural pattern

### For Existing Dependencies

Quarterly review (February, May, August, November):

- Re-run `pnpm audit signatures` to verify provenance
- Check for security advisories
- Evaluate continued fit for purpose
- Update next review date

## Exceptions

### Temporary Exceptions

Packages without provenance attestations may be approved temporarily (≤90 days) if:

- Provenance support is in progress (documented issue/PR)
- No alternative exists for critical functionality
- Security review completed and documented
- Monitoring plan in place

Document all exceptions in `docs/evidence/security/exceptions.md` with:
- Exception ID
- Package name and version
- Rationale
- Expiry date (≤90 days)
- Mitigation plan
- Next review date

## Rejected Dependencies

Packages explicitly rejected:

- *(None as of 2025-11-09)*

## References

- TASK-0909: NativeWind v5 + Tamagui adoption with supply-chain scanning
- June 2025 Gluestack/@react-native-aria compromise report
- standards/security.md: Supply-chain requirements
- .github/workflows/supply-chain-scan.yml: Automated scanning

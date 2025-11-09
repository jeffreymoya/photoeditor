# UI Kit Supply-Chain Guardrails

## Context

The June 2025 Gluestack/@react-native-aria compromise demonstrated UI kit supply-chain risk: 17 packages with >1M weekly downloads were compromised, affecting thousands of React Native applications. This document establishes guardrails to reduce exposure when adopting design system kits per TASK-0909.

## Threat Model

### Attack Vectors

1. **Package hijacking**: Attacker gains access to maintainer account and publishes malicious version
2. **Dependency confusion**: Malicious package with same name in different registry
3. **Typosquatting**: Similar package name tricks developers into installing wrong package
4. **Supply-chain injection**: Compromised dependency of UI kit pulls in malicious code
5. **Unmaintained packages**: Abandoned UI kits with unpatched vulnerabilities

### Impact Scenarios

- **Data exfiltration**: Malicious UI component sends user data to attacker
- **Code injection**: Compromised package modifies app behavior at runtime
- **Backdoor installation**: Persistent access mechanism hidden in UI library
- **Build-time attacks**: Malicious scripts execute during CI/CD pipeline

## Defense Layers

### Layer 1: Provenance Verification (Automated)

**Control**: npm provenance attestations required for all UI kit dependencies

**Implementation**: `.github/workflows/supply-chain-scan.yml`

**Mechanism**:
```bash
pnpm audit signatures
```

**Enforcement**:
- Runs on every dependency change (push to main/develop, PRs)
- Blocks merge if provenance verification fails
- Daily scheduled scan to catch registry tampering

**Coverage**:
- ✅ Prevents unsigned packages
- ✅ Detects package tampering
- ✅ Verifies publisher identity

**Limitations**:
- ❌ Doesn't catch malicious code from legitimate publisher
- ❌ Some packages (older, private) may not have provenance

### Layer 2: Dependency Allowlist (Manual Review)

**Control**: Explicit approval required before adopting UI kit

**Implementation**: `docs/security/dependency-allowlist.md`

**Approval criteria**:
- **Required**: npm provenance attestations
- **Recommended**: Multiple maintainers, recent activity, >100k downloads

**Process**:
1. Developer proposes new UI kit in task file
2. Manual review of npm page, GitHub repo, security policy
3. Document approval rationale in allowlist
4. Set 90-day review expiry
5. Link to ADR if introducing new pattern

**Coverage**:
- ✅ Prevents adoption of unmaintained packages
- ✅ Documents supply-chain decisions
- ✅ Forces periodic re-evaluation

**Limitations**:
- ❌ Manual process, can be bypassed
- ❌ Relies on solo maintainer judgment

### Layer 3: Vulnerability Scanning (Automated)

**Control**: Known vulnerability detection via pnpm audit

**Implementation**: `.github/workflows/supply-chain-scan.yml`

**Mechanism**:
```bash
pnpm audit --audit-level=moderate
```

**Enforcement**:
- Runs on every dependency change
- Generates warning (non-blocking) for moderate+ vulnerabilities
- Requires manual review and documentation

**Coverage**:
- ✅ Detects known CVEs
- ✅ Catches transitive dependency vulnerabilities
- ✅ Provides remediation guidance

**Limitations**:
- ❌ Only catches known vulnerabilities
- ❌ Zero-day exploits undetected
- ❌ False positives require triage

### Layer 4: SBOM Generation (Audit Trail)

**Control**: Software Bill of Materials for compliance and forensics

**Implementation**: CycloneDX SBOM via `@cyclonedx/cyclonedx-npm`

**Artifacts**:
- CI artifacts (90-day retention)
- Quarterly snapshots in `docs/evidence/security/sbom/`

**Purpose**:
- Incident response: Identify affected versions
- Compliance: Prove UI kit lineage
- Forensics: Trace when compromised package entered codebase

**Coverage**:
- ✅ Complete dependency graph
- ✅ Versioned snapshots
- ✅ Machine-readable format

**Limitations**:
- ❌ Doesn't prevent attacks, only aids response

### Layer 5: Curated Subset Adoption (Risk Reduction)

**Control**: Limit exposure by adopting minimal UI kit subset

**Implementation**: Curated Tamagui primitives (Stack, Text, Button, Input)

**Rationale**:
- Smaller attack surface than full kit
- Easier to audit and review
- Faster to replace if compromised

**Coverage**:
- ✅ Reduces code exposure
- ✅ Limits learning curve and onboarding time
- ✅ Enables faster migration if needed

**Limitations**:
- ❌ May still need full kit features eventually
- ❌ Doesn't eliminate risk, just reduces it

## Operational Procedures

### Before Adding UI Kit Dependency

1. **Provenance check**:
   ```bash
   pnpm add <ui-kit-package>
   pnpm audit signatures
   ```
   - MUST pass → proceed
   - FAILS → document exception or find alternative

2. **Manual review**:
   - npm page: Check maintainers, downloads, last publish
   - GitHub: Verify security policy, recent commits, issue triaging
   - Thoughtworks Radar: Check technology radar assessment (if available)

3. **Document approval**:
   - Add entry to `docs/security/dependency-allowlist.md`
   - Link to task file authorizing adoption
   - Set 90-day review expiry

4. **Test integration**:
   - Verify themed components render identically on iOS/Android
   - Check bundle size impact
   - Run full QA suite

### Quarterly Review (Every 90 Days)

**Schedule**: February 1, May 1, August 1, November 1

**Checklist**:
1. Re-run provenance verification: `pnpm audit signatures`
2. Check for security advisories on each UI kit
3. Verify maintainer activity on GitHub
4. Review download trends on npm
5. Update "Next review" dates in allowlist
6. Archive quarterly SBOM snapshot

**Action items**:
- Update allowlist entries
- Document any new exceptions
- Plan migration if UI kit shows abandonment signs
- Link findings to evidence bundle

### Incident Response (Compromise Detected)

**Detection**:
- GitHub security advisory
- npm provenance failure in CI
- Community reports on social media
- Unusual package behavior in production

**Immediate response**:
1. Freeze dependency updates: `pnpm install --frozen-lockfile`
2. Identify affected versions via SBOM
3. Check if compromise affects installed version
4. Document incident in `docs/evidence/security/incidents/`

**Remediation**:
1. **Confirmed compromise**:
   - Remove affected package: `pnpm remove <package>`
   - Revert to safe version or migrate to alternative
   - Audit app behavior for signs of exploitation
   - Notify users if data breach suspected

2. **Unconfirmed reports**:
   - Pin current version in package.json
   - Monitor for official advisories
   - Prepare migration plan
   - Document watchlist status

**Post-incident**:
- Update allowlist with new restrictions
- File ADR documenting response
- Review guardrails for gaps
- Share lessons learned in evidence bundle

## Metrics and Monitoring

### Supply-Chain Health Dashboard

Track monthly:
- Provenance verification pass rate
- Number of UI kit dependencies with vulnerabilities
- Average time to remediate moderate+ CVEs
- UI kit dependency count trend
- SBOM generation success rate

**Target thresholds**:
- Provenance pass rate: 100%
- Critical/High CVEs open: 0
- Moderate CVE remediation: <30 days
- UI kit dependency count: Stable or decreasing
- SBOM generation: 100% success

### Early Warning Signals

Monitor for:
- Provenance failures on established packages
- Sudden version bumps without changelog
- Maintainer account changes
- Dependency graph expansion (new transitive deps)
- Unusual npm publish patterns

**Actions**:
- Investigate immediately
- Document in allowlist
- Consider pinning version
- Prepare migration plan

## Comparison with Alternatives

### Why Not Full Chainloop/Dependency-Track?

**Chainloop** and **Dependency-Track** offer comprehensive supply-chain security but add:
- Infrastructure overhead (servers, databases)
- Ongoing maintenance (updates, backups)
- Learning curve and training time
- Cost (hosting, monitoring)

**For solo developer**:
- Hybrid npm provenance + pnpm audit provides deterministic, zero-overhead scanning
- CI integration requires no new infrastructure
- Built-in tooling (npm, pnpm) reduces maintenance
- JavaScript-specific provenance appropriate for React Native app

**When to upgrade**:
- Team grows beyond solo developer
- Compliance requires SBOM attestation signatures
- Need cross-language supply-chain analysis (Docker, Python, etc.)
- Enterprise security policies mandate specific tooling

## References

- TASK-0909: NativeWind v5 + Tamagui with supply-chain scanning
- June 2025 Gluestack/@react-native-aria compromise report
- docs/security/dependency-allowlist.md: Approval criteria
- docs/security/sbom-scanning-procedures.md: Operational procedures
- .github/workflows/supply-chain-scan.yml: CI implementation
- standards/security.md: Security requirements (if exists)
- [npm provenance documentation](https://docs.npmjs.com/generating-provenance-statements)
- [Sonatype State of Software Supply Chain Report](https://www.sonatype.com/state-of-the-software-supply-chain)

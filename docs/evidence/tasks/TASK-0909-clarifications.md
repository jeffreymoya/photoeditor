# TASK-0909 Clarifications

## Outstanding Questions (Resolved)

This file serves as the evidence path for TASK-0909 clarifications.

## Resolution

### 1. Pilot Surface Selection
**Decision**: Jobs surface (align with Expo Router migration)
- Pilot NativeWind v5 + Tamagui on Jobs surface to align with TASK-0908 Expo Router migration
- Provides consistent modernization path for single feature (routing + design tokens together)
- Incremental approach reduces risk and allows validation before broader rollout

### 2. Curated Tamagui Primitives Subset
**Decisions** (comprehensive set selected):
- **Core layout (Stack, YStack, XStack)**: Flexbox-based layout primitives for structuring components
- **Text & Heading components**: Typography primitives with theme-aware styling
- **Button & Pressable**: Interactive components with built-in press states
- **Input & Form components**: Text inputs, selects, switches for Settings/forms

Rationale: Selected full curated set to provide complete UI toolkit for Jobs surface implementation while avoiding full Tamagui adoption overhead.

### 3. SBOM/Provenance Scanning Tooling
**Decision**: Hybrid npm provenance + pnpm audit (deterministic, automated, zero-overhead)

Rationale for solo developer:
- ✅ **Zero new infrastructure** - uses built-in pnpm audit and npm provenance
- ✅ **Fully automated** - run `pnpm audit signatures` in CI to verify provenance
- ✅ **Deterministic** - same checks every time, binary pass/fail per package
- ✅ **Low maintenance** - no new tools to update/maintain
- ✅ **Mobile-appropriate** - covers all npm dependencies (React Native, Expo, UI kits)

Heavier tools (Chainloop/Dependency-Track) evaluated but don't add mobile-specific determinism beyond npm provenance for JavaScript dependencies.

CI Implementation:
```bash
pnpm audit signatures  # Verify npm provenance attestations
pnpm audit             # Check for known vulnerabilities
```

### 4. Dependency Allowlist Criteria
**Decision**: npm provenance attestations required

Criteria for UI kit dependencies:
- **Required**: npm provenance attestations (prevents unsigned/tampered packages)
- **Recommended** (document but not block): Multiple active maintainers, recent commits, download threshold

Pragmatic approach: Hard-fail on missing provenance, document other factors for manual review.

### 5. Tailwind v4 Token Compatibility
**Decision**: Validate during implementation

Approach:
- NativeWind v5 is designed for Tailwind v4 tokens with zero-runtime class parsing
- Validate compiler-backed tokens work correctly during Jobs surface implementation
- Document any edge cases or workarounds in themed component test results
- Design token system will be validated for reuse across Expo Router, VisionCamera overlays, and future surfaces

## Notes

- This task adopts NativeWind v5 and curated Tamagui primitives with supply-chain hardening
- Blocked by TASK-0907 (NativeWind v5 requires New Architecture)
- References June 2025 Gluestack/@react-native-aria compromise for supply-chain context
- Pilot approach on Jobs surface aligns with TASK-0908 Expo Router migration for consistent modernization path

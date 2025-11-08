# ADR 0009: Mobile Stack Modernization

- Status: Accepted
- Date: 2025-11-08

## Context

The mobile workspace remains on Expo SDK 51 / React Native 0.74.5, predating Expo's SDK 53 New Architecture defaults, Android 16 edge-to-edge enforcement, and the React 19.1 / Hermes V1 toolchain. Expo SDK 53 (React Native 0.79) enables the New Architecture for every project and introduces `expo-background-task`, edge-to-edge defaults, and experimental Expo UI primitives built atop SwiftUI and Jetpack Compose. React Native 0.82 (released 2025-10-08) makes the New Architecture mandatory and adds Hermes V1 plus DOM-like refs, while React Native 0.81 raised the minimum toolchain to Node 20 and deprecated the built-in `SafeAreaView` in favor of `react-native-safe-area-context`.

Modern starter stacks (Create Expo Stack, Expo Router templates, NativeWind/Tamagui presets) assume file-based routing, Tailwind-style tokens, and Fabric-only UI features by default. Remaining on legacy navigation and styling choices increases churn for any incoming references, documentation, or external contributors.

The list virtualization layer still relies on FlatList, even though FlashList v2 (Fabric-only) and Legend List (pure TypeScript) now ship production-grade replacements. The camera layer uses Expo Camera, while VisionCamera's Skia frame processors have become the standard for AI overlays and on-device ML workflows.

June 2025's Gluestack/@react-native-aria supply-chain compromise (affecting packages with >1M weekly downloads) demonstrated how React Native UI libraries can be weaponized, reinforcing the need for curated design-system dependencies and provenance scanning before importing new UI kits.

This ADR documents the decision to modernize the mobile stack across six upgrade pillars (platform parity, navigation, styling, list performance, camera/background work, and supply-chain security) delivered in five phased implementation tasks.

## Decision

Adopt a phased mobile stack modernization strategy that brings the PhotoEditor mobile application to Expo SDK 53+ with New Architecture enabled, preparing for React Native 0.82's mandatory migration while introducing modern navigation, styling, and performance patterns.

**Key Principles**:

1. **Platform Parity**: Align with Expo SDK 53+ ecosystem defaults to ensure compatibility with React Native 0.82's mandatory New Architecture, Android 16 edge-to-edge requirements, and current React Native community patterns.

2. **Continuous Delivery**: Phases ship as they complete rather than fixed sprint boundaries, allowing parallelization where dependencies permit.

3. **Feature Flag Isolation**: Maintain SDK 53 dependencies but feature-flag New Architecture surfaces using expo-build-properties to control `newArchEnabled` per surface/feature, enabling gradual rollout and selective rollback without full SDK downgrade.

4. **Standards Alignment**: All modernization work must satisfy `standards/frontend-tier.md`, `standards/typescript.md`, and `standards/testing-standards.md` requirements, with explicit citations in implementation tasks.

5. **Supply-Chain Hardening**: Incorporate SBOM validation, provenance checking, and curated dependency allowlists when adopting NativeWind/Tamagui or any design system kit, per `standards/cross-cutting.md` hard fail controls.

**Implementation Phases**:

| Phase | Scope | Task ID | Success Criteria |
|-------|-------|---------|------------------|
| **P0** | Expo SDK 53 migration with New Architecture enabled | TASK-0907 | Builds & tests green on SDK 53, opt-out path documented, toolchain updated (Node 20+, Xcode 16.1) |
| **P1** | Expo Router adoption in new feature slice | TASK-0908 | Mixed navigation verified, file-based routing working with typed params |
| **P2** | NativeWind v5 + curated Tamagui primitives | TASK-0909 | Themed components render identically on iOS/Android, SBOM pipeline passes |
| **P3** | FlashList v2 (Fabric) and Legend List integration | TASK-0910 | Scroll/jank metrics meet baseline (<16ms frame budget) |
| **P4** | VisionCamera + expo-background-task pilot | TASK-0911 | Upload success rate ≥ baseline with fewer manual retries |

**Rollback Strategy**:
- Feature-flag New Architecture surfaces to allow selective deactivation
- Document opt-out procedures in tracking artifacts
- Maintain SDK 53 dependencies while controlling `newArchEnabled` per feature
- Capture baseline metrics before TASK-0907 for rollback validation

**Success Metrics** (tracked per phase):

| Metric | Target | Measurement |
|--------|--------|-------------|
| Bundle size (app.bundle.js) | No >10% regression | Compare production bundle sizes before/after |
| Cold start time (ms) | <3s on mid-tier devices | Measure launch time on Android (Pixel 5) / iOS (iPhone 12) |
| Jank metrics (dropped frames) | <16ms p95 | Monitor frame drops with React DevTools Profiler |
| Memory footprint (MB) | Baseline ±5% | Track RAM usage via Xcode Instruments / Android Profiler |

## Consequences

**Positive**:
- Aligns mobile stack with current Expo/React Native ecosystem patterns, reducing integration friction for new features and external contributors
- Prepares application for React Native 0.82's mandatory New Architecture migration, avoiding forced cutover window
- Enables modern UI patterns (file-based routing, Tailwind-style tokens, Fabric-only features) that match Create Expo Stack and community templates
- Improves list performance and camera capabilities with battle-tested libraries (FlashList v2, VisionCamera)
- Hardens supply-chain security posture through SBOM validation and provenance checking, mitigating risks demonstrated by Gluestack compromise
- Continuous delivery approach allows parallel work on independent phases while maintaining incremental rollback capability

**Negative**:
- Short-term velocity reduction while dual navigation systems (React Navigation + Expo Router) coexist during migration
- Toolchain upgrades (Node 20+, Xcode 16.1) require CI image refreshes and may temporarily destabilize local development environments
- Some Expo modules and third-party SDKs (Stripe, older camera libraries) may trail on New Architecture support, requiring temporary opt-outs or replacements
- NativeWind v5 and FlashList v2 require New Architecture, blocking adoption until TASK-0907 completes
- Additional supply-chain tooling (SBOM scanning, provenance validation) increases maintenance overhead and dependency intake latency
- QA matrix expands to cover Hermes V1 and legacy Hermes until final runtime locked

**Neutral**:
- Phased approach distributes learning curve across smaller increments (Expo Router, NativeWind, FlashList, VisionCamera)
- Feature flags add complexity but provide essential rollback capability during New Architecture migration
- Success metrics establish baseline performance contracts that future work must honor

## Upgrade Pillars

This modernization addresses six critical pillars:

1. **Platform Parity**: Expo SDK 53+ alignment, React Native 0.82 readiness, Android 16 edge-to-edge, Hermes V1, Node 20/Xcode 16.1 toolchain
2. **Navigation & Layout**: Expo Router adoption for file-based routing, nested layouts, deeplinks, auth redirects
3. **Styling & Design System**: NativeWind v5 (Tailwind v4 tokens), Tamagui compiler-driven primitives, supply-chain hardening
4. **List & Feed Performance**: FlashList v2 (Fabric-only) for galleries/feeds, Legend List (TypeScript) for legacy compatibility
5. **Camera & Background Work**: VisionCamera + Skia frame processors for AI overlays, expo-background-task for reliable background jobs
6. **Supply-Chain Security**: SBOM validation, provenance checking, curated allowlists for UI dependencies

## Migration Plan

### Phase 0: SDK 53 Migration (TASK-0907)
- Upgrade Expo SDK to 53, React Native to 0.79, React to 19.1.1
- Enable New Architecture via expo-build-properties
- Update toolchain: Node 20+, Xcode 16.1, Android build tools
- Patch CI images and local development setup
- Run full QA suite and capture baseline metrics
- Document opt-out paths and rollback procedures
- **Blocks**: TASK-0908, TASK-0909, TASK-0910, TASK-0911 (all require New Architecture)

### Phase 1: Expo Router Adoption (TASK-0908)
- Introduce Expo Router in new feature slice (e.g., Jobs surface)
- Implement file-based routing with nested layouts (`app/(group)/_layout.tsx`)
- Maintain dual navigation during migration (React Navigation + Expo Router)
- Validate deeplinks, auth redirects, typed params
- Update lint/TS rules for generated routes
- **Depends on**: TASK-0907 (SDK 53 baseline)

### Phase 2: Styling Modernization (TASK-0909)
- Adopt NativeWind v5 for Tailwind v4 utility tokens
- Integrate curated Tamagui primitives for design system
- Implement SBOM validation and provenance checking in CI
- Theme at least one surface with new system
- Validate iOS/Android rendering parity
- **Depends on**: TASK-0907 (New Architecture required)

### Phase 3: List Performance (TASK-0910)
- Replace FlatList with FlashList v2 (Fabric-only) for galleries/feeds
- Integrate Legend List (TypeScript) for legacy-compatible surfaces
- Codify usage patterns and unit tests
- Measure scroll/jank metrics vs. baseline (<16ms frame budget)
- **Depends on**: TASK-0907 (Fabric required for FlashList v2)

### Phase 4: Camera & Background Jobs (TASK-0911)
- Integrate VisionCamera with Skia frame processors for AI overlays
- Replace deprecated expo-background-fetch with expo-background-task
- Implement WorkManager (Android) and BGTaskScheduler (iOS) patterns
- Profile memory and frame budget on lower-end devices
- Validate upload success rate ≥ current baseline
- **Depends on**: TASK-0907 (New Architecture required for VisionCamera)

### Ongoing Governance
- Track actual vs. estimated timelines for each phase
- Update ADR and tracking artifacts as phases progress
- Iterate proposal if requirements change during implementation
- Document all exceptions with expiry dates per `standards/global.md`
- Maintain compatibility matrix for Expo modules during migration window

## Alternatives Considered

### 1. Remain on Expo SDK 51 / React Native 0.74
- **Pros**: No migration effort, stable current environment
- **Cons**: React Native 0.82 makes New Architecture mandatory, SDK 54 removes opt-out; delaying migration increases future cutover risk and divergence from ecosystem patterns
- **Rejected**: Forced migration inevitable; incremental approach reduces risk vs. big-bang upgrade

### 2. Big-Bang Migration to SDK 53 + All Pillars Simultaneously
- **Pros**: Single migration window, faster calendar completion
- **Cons**: High blast radius, difficult rollback, violates `standards/task-breakdown-canon.md` complexity thresholds
- **Rejected**: Phased approach enables parallel work, incremental validation, and surgical rollback

### 3. Adopt React Navigation 7.x Instead of Expo Router
- **Pros**: Incremental upgrade from current React Navigation stack, familiar patterns
- **Cons**: Ecosystem momentum favors Expo Router for new Expo apps; Create Expo Stack defaults to Router; missing co-located layout benefits
- **Rejected**: Expo Router aligns with ecosystem direction and modern starter templates

### 4. Skip Styling Modernization (NativeWind/Tamagui)
- **Pros**: No new design system learning curve, current StyleSheet approach stable
- **Cons**: Tailwind-style tokens and compiler-driven systems are ecosystem defaults; manual StyleSheet maintenance increases long-term churn
- **Rejected**: Compiler-backed systems reduce runtime overhead and align with modern patterns; supply-chain hardening mitigates security risk

### 5. Continue Using FlatList
- **Pros**: No virtualization migration, current implementation stable
- **Cons**: FlashList v2 offers pixel-perfect scrollToIndex, masonry layouts, adaptive render windows; missing performance optimizations for fast feeds/galleries
- **Rejected**: Performance benefits significant for user-facing surfaces; Legend List provides TypeScript fallback where needed

## Compliance References

This ADR satisfies the following standards requirements:

- `standards/frontend-tier.md`: Mobile stack toolchain, state management, component architecture, performance budgets
- `standards/typescript.md`: Language-level practices, strict config, discriminated unions, Results pattern
- `standards/testing-standards.md`: Coverage thresholds, test structure, validation commands
- `standards/cross-cutting.md`: Hard fail controls (secrets, encryption), maintainability requirements
- `standards/global.md`: ADR governance, evidence bundle requirements, exception handling

## Related Work

- Proposal: `docs/proposals/mobile-stack-modernization.md` (technical details, ecosystem research, pros/cons)
- Clarifications: `docs/evidence/tasks/TASK-0906-clarifications.md` (timeline, rollback strategy, success metrics)
- Tracking: `docs/mobile/stack-modernization-tracking.md` (phase status, rollback procedures, metrics dashboard)
- Implementation Tasks:
  - TASK-0907: Expo SDK 53 migration (P0 foundation)
  - TASK-0908: Expo Router adoption (P1 navigation)
  - TASK-0909: NativeWind/Tamagui integration (P2 styling)
  - TASK-0910: FlashList/Legend List performance (P3 virtualization)
  - TASK-0911: VisionCamera/background tasks (P4 camera/jobs)
- Driving Task: `tasks/mobile/TASK-0906-mobile-stack-modernization-tracking.task.yaml`

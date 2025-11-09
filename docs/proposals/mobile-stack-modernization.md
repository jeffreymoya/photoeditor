# Mobile Stack Modernization Proposal

- **Author:** Solo Maintainer  
- **Date:** 2025-11-07  
- **Status:** Draft  
- **Related Standards:** `standards/AGENTS.md`, `standards/typescript.md`, `standards/testing-standards.md`, `standards/security.md`  
- **Related Docs:** `ARCHITECTURE.md`, `docs/mobile/README.md`, `tasks/README.md`

## 1. Background & Problem Statement

The mobile workspace remains on Expo ~51 / React Native 0.74.5 (`mobile/package.json`), an era that predates Expo’s SDK 53 new-architecture defaults, Android 16 edge‑to‑edge enforcement, and the React 19.1 / Hermes V1 toolchain. SDK 53 (React Native 0.79) already enables the New Architecture for every project and introduces `expo-background-task`, edge‑to‑edge defaults, and experimental Expo UI primitives built atop SwiftUI and Jetpack Compose; Expo SDK 54+ will remove the opt-out entirely.【turn0search0】 React Native 0.82 (released 2025‑10‑08) makes the New Architecture mandatory and adds Hermes V1 plus DOM-like refs, while React Native 0.81 previously raised the minimum toolchain to Node 20 and deprecated the built-in `SafeAreaView` in favor of `react-native-safe-area-context`.【turn1search0】【turn1search10】

Modern starter stacks (Create Expo Stack, Expo Router templates, NativeWind/Tamagui presets) assume file-based routing, Tailwind-style tokens, and Fabric-only UI features by default, so remaining on legacy navigation and styling choices increases churn for any incoming references, docs, or external contributors.【turn8search2】【turn6search2】 Meanwhile, the list virtualization and camera layers still rely on FlatList and Expo Camera, even though FlashList v2 (Fabric-only) and Legend List (pure TypeScript) now ship production-grade replacements, and VisionCamera’s Skia frame processors have become the standard for AI overlays.【turn3search0】【turn4search0】【turn5search0】

Finally, June 2025’s Gluestack/@react-native-aria supply-chain compromise demonstrated how React Native UI libraries can be weaponized, reinforcing the need for curated design-system dependencies and provenance scanning before we import new kits.【turn9search2】

## 2. Upgrade Pillars

1. **Platform parity:** Align with Expo SDK 53+ and prep for RN 0.82’s mandatory New Architecture.  
2. **Navigation & layout:** Pilot Expo Router to match current ecosystem patterns and unlock co-located layouts.  
3. **Styling & design system:** Adopt compiler-backed utility systems (NativeWind v5, Tamagui) while hardening supply-chain intake.  
4. **List & feed performance:** Replace FlatList surfaces with FlashList v2 (Fabric) or Legend List (JS) depending on target.  
5. **Camera & background work:** Introduce VisionCamera + Skia frame processors and migrate polling/notification jobs to `expo-background-task`.  
6. **Security posture:** Bake SBOM + provenance scanning into dependency upgrades, especially for UI kits affected by the Gluestack incident.

## 3. Detailed Recommendations (Pros & Cons)

### 3.1 Expo SDK 53 (short term) with RN 0.82 readiness

**Pros**
- New Architecture enabled everywhere today, matching Expo’s support matrix and avoiding the forced upgrade window in SDK 54.【turn0search0】
- Access to edge-to-edge defaults, `expo-background-task`, and experimental Expo UI components that map directly to SwiftUI/Compose, reducing bespoke native shims.【turn0search0】
- Aligns with React Native 0.82’s Hermes V1, DOM-like refs, and React 19.1.1 compatibility, preventing future API freezes on legacy architecture.【turn1search0】
- Ensures compliance with Android 16 (API 36) edge-to-edge enforcement and Node 20 / Xcode 16.1 minimums established in RN 0.81.【turn1search10】

**Cons**
- Some Expo modules and third-party SDKs (Stripe, older camera libs) still trail on New Architecture; we may need temporary opt-outs or replacements during the migration window.【turn0search0】
- Toolchain upgrades (Node 20+, Xcode 16.1) require CI image refreshes and can temporarily destabilize local dev machines.【turn1search10】
- QA matrix must cover Hermes V1 and legacy Hermes until we lock in final runtime, doubling cold-start benchmarking.

### 3.2 Navigation & Layout: Expo Router adoption

**Pros**
- File-based routing with nested layouts brings us in line with Expo’s documentation and modern starters, simplifying deeplinks, auth redirects, and incremental feature work.【turn6search2】
- Create Expo Stack (`rn.new`) already scaffolds Expo Router, NativeWind, and Supabase/Firebase options, so future prototypes and hiring pipelines will expect this structure.【turn8search2】
- Co-locating providers/layouts reduces global re-render cost in our current single `NavigationContainer` tree (`mobile/App.tsx`).

**Cons**
- Requires rewiring existing React Navigation stacks, bottom tabs, and typed params into the new directory-based conventions; short-term velocity dip while both systems coexist.
- Developers must learn Expo Router’s conventions (`app/(group)/_layout.tsx`, `+not-found.tsx`), and lint/TS rules need updates for generated routes.

### 3.3 Styling & Design System Strategy

**Pros**
- NativeWind v5 targets React Native 0.81+ and the New Architecture, unlocking Tailwind v4 utility tokens with zero runtime class parsing and better concurrent rendering support.【turn2search0】
- Tamagui’s compiler-driven design system remains on Thoughtworks’ Technology Radar (“Assess”), signaling industry adoption for cross-platform tokens and shared components.【turn7search0】
- Consolidating tokens into a compiler-backed system lets us reuse surface logic across Expo Router, VisionCamera overlays, and eventual web previews.

**Cons**
- NativeWind v5 explicitly requires the New Architecture; we cannot adopt it until the SDK 53 migration is stable.【turn2search0】
- Tamagui’s documentation gaps and steeper learning curve (per industry feedback) increase ramp time; we must budget onboarding and template updates.
- Recent Gluestack/@react-native-aria supply-chain compromises show that UI kits can be attack vectors; any adoption must include SBOM validation, provenance signatures, and mirrored registries before we trust new component ecosystems.【turn9search2】

### 3.4 List Virtualization: FlashList v2 vs. Legend List

**Pros**
- FlashList v2 was rewritten exclusively for Fabric, eliminating size estimates, delivering pixel-perfect `scrollToIndex`, built-in masonry layouts, and adaptive render windows for fast feeds—ideal for gallery, job history, and notification surfaces.【turn3search0】
- Legend List provides a 100% TypeScript, bridge-compatible alternative with dynamic item sizes, bidirectional infinite scroll, chat alignment helpers, and optional recycling—useful where Fabric isn’t fully deployed yet.【turn4search0】

**Cons**
- FlashList v2 drops legacy-architecture support, so legacy bundles (pre-SDK 53) cannot consume it without completing the New Architecture migration first.【turn3search0】
- Legend List’s recycling features can leak per-item state if consumers are careless; we must codify usage patterns and unit tests to guard against subtle UI bugs.【turn4search0】

### 3.5 Camera & Background Processing

**Pros**
- VisionCamera’s Skia frame processors let us run GPU-accelerated overlays (bounding boxes, live filters) directly on frames, opening doors for AI-assisted editing previews and on-device ML without leaving the Expo ecosystem.【turn5search0】
- `expo-background-task` replaces the deprecated `expo-background-fetch`, using WorkManager on Android and `BGTaskScheduler` on iOS for reliable retries (uploads, notification hydration) far beyond what Expo 51 provided.【turn0search0】
- Expo’s Compose/SwiftUI integration plus VisionCamera APIs give us a path toward richer camera UIs without ejecting to custom native code.【turn0search0】【turn5search0】

**Cons**
- VisionCamera Skia workflows still report memory leaks in certain scenarios; we must profile and potentially upstream fixes before rolling to production cameras.【turn5search6】
- Frame processors require Reanimated worklets and can starve the UI thread if we overrun their 16 ms budget; we need guardrails (feature flags, diagnostics) for lower-end devices.【turn5search0】
- Background tasks add platform review overhead (entitlements, scheduling limits) and must be integrated with our notification/queue standards to avoid duplicate work.

### 3.6 Supply-Chain Guardrails

**Pros**
- The June 2025 compromise of 17 Gluestack/@react-native-aria packages (>1 M weekly downloads) shows tangible risk; codifying dependency allowlists, provenance checks, and SBOM scans reduces exposure when we adopt NativeWind/Tamagui or any design system kit.【turn9search2】
- Incorporating attestation (npm provenance, Sigstore) into CI aligns with `standards/security.md` and our solo-maintainer audit trail expectations.

**Cons**
- Additional tooling (e.g., Chainloop, Dependency Track) adds maintenance and false-positive triage overhead.
- Slower dependency intake may frustrate feature timelines if we cannot quickly approve new UI libraries.

## 4. Phased Implementation Outline

| Phase | Scope | Success Criteria |
| --- | --- | --- |
| **P0** | Create `TASK-xxxx` for SDK 53 readiness; upgrade Expo CLI, patch Node/Xcode images, run `pnpm turbo run qa:static` and smoke tests under New Architecture. | Builds & tests green on SDK 53 with opt-out path documented. |
| **P1** | Introduce Expo Router in a new feature slice (e.g., Jobs surface), sharing providers via `app/(jobs)/_layout.tsx`. | Mixed navigation (legacy + router) verified in device tests; linking works. |
| **P2** | Adopt NativeWind v5 tokens + curated Tamagui primitives for at least one surface; enforce supply-chain scanning in CI. | Themed components render identically on iOS/Android, SBOM pipeline passes. |
| **P3** | Swap FlatList implementations for FlashList v2 (Fabric-only flows) and Legend List (legacy fallback). | Scroll/jank metrics meet baseline (<16 ms frame budget) in profiling traces. |
| **P4** | Implement VisionCamera + `expo-background-task` pilot for the upload pipeline; measure end-to-end latency vs. current flow. | Upload success rate ≥ current baseline with fewer manual retries. |

## 5. Decision Ask

Approve the phased modernization plan so we can:
1. Open a tracking task/ADR referencing this proposal.  
2. Schedule SDK 53 migration work in the next sprint to avoid RN 0.82’s forced cutover.  
3. Budget time for router/styling pilots and security tooling so new UI frameworks do not jeopardize auditability.

---

**References**

1. Expo SDK 53 release notes — https://expo.dev/changelog/sdk-53  
2. React Native 0.82 release blog — https://reactnative.dev/blog/2025/10/08/react-native-0.82  
3. React Native 0.81 release blog — https://reactnative.dev/blog/2025/08/12/react-native-0.81  
4. Expo Router file-based routing docs — https://docs.expo.dev/develop/file-based-routing  
5. Create Expo Stack CLI options — https://docs.rn.new/en/installation  
6. NativeWind v5 migration guide — https://www.nativewind.dev/v5/guides/migrate-from-v4  
7. Thoughtworks Technology Radar: Tamagui — https://www.thoughtworks.com/en-us/radar/languages-and-frameworks/tamagui  
8. FlashList v2 announcement — https://shopify.engineering/flashlist-v2  
9. Legend List README — https://github.com/LegendApp/legend-list  
10. VisionCamera Skia frame processor guide — https://react-native-vision-camera.com/docs/guides/skia-frame-processors  
11. VisionCamera memory leak issue #3517 — https://github.com/mrousavy/react-native-vision-camera/issues/3517  
12. Gluestack/@react-native-aria supply-chain attack — https://www.bleepingcomputer.com/news/security/supply-chain-attack-hits-gluestack-npm-packages-with-960k-weekly-downloads/

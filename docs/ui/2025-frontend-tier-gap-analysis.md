# Frontend Tier Compliance Gap Analysis

**Document Version:** 1.0
**Date:** 2025-11-01
**Status:** Analysis Complete
**Scope:** Mobile codebase compliance against `standards/frontend-tier.md`

## Executive Summary

This document identifies specific gaps between the current mobile implementation and the Frontend Tier standard. The audit covered feature layering, UI components, state management, and services layers across 45+ source files.

**Key Findings:**
- Feature layering partially compliant; `/public` exports exist but deep imports found in screens
- UI tokens centralized but missing design system infrastructure (Radix/Tamagui, Storybook, vanilla-extract)
- State management has RTK Query + XState foundation but missing selector purity enforcement, statechart exports, and complexity tracking
- Services layer implements ports/adapters pattern correctly but missing fitness evidence and some documentation

**Remediation Priority:** P1 items focus on missing infrastructure (Storybook, design tokens, fitness gates); P2 items address refinements (selector audits, statechart exports).

---

## Feature & UI Gaps

### Gap F-1: Feature Layering - Deep Imports from Context
**Standard:** `standards/frontend-tier.md#feature-guardrails` - "Each feature publishes a `/public` surface; deep imports into internal paths are banned."

**Current State:**
- `mobile/src/screens/EditScreen.tsx:16` directly imports from feature internals:
  ```typescript
  import { useServices } from '@/features/upload/context/ServiceContext';
  ```
- This bypasses the `/public` export barrel in `mobile/src/features/upload/public/index.ts`

**Impact:** Violates encapsulation; screens couple to internal feature structure.

**Remediation:**
- Export `useServices` and `ServiceProvider` through `/public/index.ts`
- Update all screen imports to use `/public` surface only
- Add ESLint rule to ban deep feature imports (exception: within same feature)

**Task Link:** TASK-0819 (feature UI layering task)

---

### Gap F-2: UI Design System Infrastructure Missing
**Standard:** `standards/frontend-tier.md#ui-components-layer` - "Radix UI primitives for web and Tamagui primitives for native; both consume shared design tokens defined in vanilla-extract"

**Current State:**
- Basic token file exists at `mobile/src/lib/ui-tokens.ts` with colors, spacing, typography
- No Radix UI or Tamagui integration found in dependencies
- No vanilla-extract for token definition
- No atomic design hierarchy (atoms/molecules/organisms) with export barrels
- All components use raw React Native primitives (View, Text, TouchableOpacity)

**Impact:**
- Ad-hoc styling proliferates (81 style objects across 7 screen files)
- No shared UI primitive library
- No design token governance
- Manual maintenance of visual consistency

**Remediation:**
- Install and configure Tamagui for React Native primitives
- Migrate `ui-tokens.ts` to vanilla-extract CSS-in-TS tokens
- Create atomic component hierarchy under `mobile/src/components/atoms/`, `/molecules/`, `/organisms/`
- Build wrapper components around Tamagui primitives that consume tokens
- Establish export barrels per atom/molecule/organism level

**Task Link:** TASK-0819, TASK-0821 (Storybook + Chromatic setup dependency)

---

### Gap F-3: Storybook + Visual Regression Missing
**Standard:** `standards/frontend-tier.md#ui-components-layer` - "Storybook (+ @storybook/addon-a11y, addon-interactions) with Chromatic baseline per commit"

**Current State:**
- No `.storybook/` directory found
- No `*.stories.tsx` files in codebase
- No Chromatic integration

**Impact:**
- No visual regression testing
- No component documentation
- No accessibility checks in CI
- Cannot achieve "Story coverage >= 85% of atoms/molecules" fitness gate

**Remediation:**
- Install Storybook for React Native (v7+)
- Configure addons: `@storybook/addon-a11y`, `addon-interactions`, `addon-react-native-web`
- Set up Chromatic CI integration
- Create stories for existing components (ErrorBoundary, UploadButton)
- Establish coverage tracking in `docs/ui/storybook/coverage-summary.md`

**Task Link:** TASK-0821 (Storybook + Chromatic setup)

---

### Gap F-4: Accessibility Testing Not Enforced
**Standard:** `standards/frontend-tier.md#ui-components-layer` - "Chromatic no-change gate; a11y violations = hard fail"

**Current State:**
- No axe-core or similar accessibility linting in CI
- No @storybook/addon-a11y integration (depends on Gap F-3)
- Forms and upload flows lack dedicated a11y audits

**Impact:** Accessibility regressions undetected; fails WCAG compliance goal

**Remediation:**
- Integrate `@storybook/addon-a11y` with axe rules in Storybook
- Add CI step to run axe checks on Storybook stories (exit code 1 on violations)
- Audit critical forms (upload prompt input, image selection) for screen reader support
- Document a11y test plan in `docs/ui/a11y-checklist.md`

**Task Link:** TASK-0821 (Storybook setup includes a11y addon)

---

### Gap F-5: Component Snapshot Policy Not Defined
**Standard:** `standards/frontend-tier.md#ui-components-layer` - "Snapshot policy: only for stable atoms/molecules"

**Current State:**
- No snapshot tests found in codebase
- No documented snapshot policy

**Impact:** Cannot leverage snapshots for regression detection on stable primitives

**Remediation:**
- Define snapshot policy in `mobile/README.md` or `docs/ui/testing-strategy.md`
- Create snapshots for stable atoms once atomic component hierarchy exists (Gap F-2)
- Exclude volatile components (screens, feature-level orchestrators) from snapshots

**Task Link:** TASK-0823 (test coverage evidence; includes snapshot policy documentation)

---

### Gap F-6: Upload Flow Missing Breadcrumb Trails
**Standard:** `standards/frontend-tier.md#feature-guardrails` - "Upload surfaces provide breadcrumb trails linked to jobId and raise optimistic job status when latency exceeds 500 ms"

**Current State:**
- Upload components exist (UploadButton) with progress display
- No breadcrumb trail component showing upload lifecycle stages
- No optimistic UI update when latency > 500ms threshold

**Impact:** User cannot track upload state; poor UX on slow networks

**Remediation:**
- Create breadcrumb component in `mobile/src/features/upload/components/UploadBreadcrumbs.tsx`
- Display stages: Select → Preprocess → Upload → Processing → Complete
- Highlight current stage based on XState machine state
- Add latency tracker in RTK Query; show optimistic spinner after 500ms

**Task Link:** TASK-0819 (feature UI layering)

---

## State Gaps

### Gap S-1: Selector Purity Not Enforced
**Standard:** `standards/frontend-tier.md#state--logic-layer` - "Selectors are 100% pure (verified via code review: no I/O imports in selector files)"

**Current State:**
- Redux slices exist but no dedicated selector files found
- No code review checklist for selector purity
- No automated check for I/O imports (fetch, Date, Math.random, etc.) in selectors

**Impact:** Cannot guarantee selectors are deterministic; breaks time-travel debugging

**Remediation:**
- Extract selectors to dedicated files: `mobile/src/store/selectors/jobSelectors.ts`, etc.
- Create ESLint rule or dependency-cruiser rule banning I/O imports in selector files
- Document selector purity requirement in `mobile/src/store/README.md`
- Add purity audit to evidence bundle checklist

**Task Link:** TASK-0823 (test coverage evidence; includes selector purity audit)

---

### Gap S-2: Reducer Complexity Not Tracked
**Standard:** `standards/frontend-tier.md#state--logic-layer` - "Reducer cyclomatic complexity <= 10 (tracked via ESLint rule) with weekly report stored in docs/ui/state-metrics"

**Current State:**
- `docs/ui/state-metrics/` directory exists but is empty
- No ESLint complexity rule configured for reducers
- No automated reporting pipeline

**Impact:** Cannot enforce complexity budget; reducer bloat risk

**Remediation:**
- Configure ESLint `complexity` rule in `mobile/.eslintrc.js` with max 10 for reducer files
- Create script to generate weekly complexity report: `scripts/report-reducer-complexity.sh`
- Store reports in `docs/ui/state-metrics/YYYY-WW-reducer-complexity.json`
- Add report generation to CI pre-commit hook

**Task Link:** TASK-0822 (RTK Query + XState refinement)

---

### Gap S-3: XState Statechart Exports Missing
**Standard:** `standards/frontend-tier.md#state--logic-layer` - "Statechart contracts: export .scxml or Mermaid from XState to your KB"

**Current State:**
- XState machine exists at `mobile/src/features/upload/machines/uploadMachine.ts`
- No `.scxml` or Mermaid diagram generated
- No statechart visualization in docs

**Impact:** State transitions not documented; hard to reason about machine behavior

**Remediation:**
- Use XState visualizer or `@xstate/cli` to generate Mermaid diagrams
- Export diagram to `docs/ui/statecharts/upload-machine.mermaid`
- Add diagram to feature README or ADR
- Include statechart checksum in evidence bundle (per fitness gate)

**Task Link:** TASK-0822 (RTK Query + XState refinement)

---

### Gap S-4: XState Test Coverage Incomplete
**Standard:** `standards/frontend-tier.md#state--logic-layer` - "Every critical slice has an XState chart + test for each transition"

**Current State:**
- XState machine has tests at `mobile/src/features/upload/machines/__tests__/uploadMachine.test.ts`
- Test file exists but coverage of all transitions not verified
- No transition matrix documenting tested paths

**Impact:** Untested transitions may harbor bugs

**Remediation:**
- Audit test file for transition coverage
- Create transition matrix in test comments or markdown file
- Ensure every state + event combination is tested
- Use XState test model utilities (`@xstate/test`) for exhaustive coverage

**Task Link:** TASK-0822 (RTK Query + XState refinement)

---

### Gap S-5: Offline Support Incomplete
**Standard:** `standards/frontend-tier.md#feature-guardrails` - "Offline experience uses deterministic React Query keys, optimistic updates with a sync queue, and NetInfo-based pause/resume"

**Current State:**
- RTK Query used for network calls
- NetInfo dependency installed (`@react-native-community/netinfo`)
- No sync queue implementation found
- No evidence of NetInfo-based pause/resume in upload flow

**Impact:** Uploads may fail on network disruption; no retry queue for offline-to-online transitions

**Remediation:**
- Integrate NetInfo listener in upload feature
- Pause XState upload machine on network loss (send PAUSE event)
- Resume on network restoration
- Implement RTK Query middleware for sync queue (persist failed mutations, replay on reconnect)
- Document offline strategy in feature README

**Task Link:** TASK-0820 (services ports & adapters; includes offline resilience)

---

### Gap S-6: Feature Flags Not Integrated
**Standard:** `standards/frontend-tier.md#state--logic-layer` - "Feature flags: Unleash or ConfigCat; inject via context"

**Current State:**
- No Unleash or ConfigCat integration found
- No feature flag context or provider

**Impact:** Cannot toggle features remotely; requires app rebuild for A/B tests

**Remediation:**
- Evaluate Unleash vs ConfigCat (recommend ConfigCat for simpler SDK)
- Install SDK and create feature flag context in `mobile/src/lib/featureFlags/`
- Inject context at app root
- Add flags for experimental features (e.g., batch upload, HEIC fallback)

**Task Link:** TASK-0822 (state refinement; flags support XState transitions)

---

## Services Gaps

### Gap SV-1: Contract Drift Check Missing
**Standard:** `standards/frontend-tier.md#services--integration-layer` - "Contract drift check: generated client hash must match CI's server hash; CI step exports hash comparison artefact stored in docs/ui/contracts"

**Current State:**
- RTK Query manually defines endpoints in `mobile/src/store/uploadApi.ts`
- No codegen from OpenAPI found
- No hash comparison artefact

**Impact:** API contract drift undetected; mobile may call outdated endpoints

**Remediation:**
- Generate OpenAPI client using `rtk-query codegen` or `orval`
- Add CI step to hash OpenAPI spec and compare against stored hash
- Store comparison result in `docs/ui/contracts/contract-hash-{date}.log`
- Fail CI if hash mismatch (breaking change detection)

**Task Link:** TASK-0820 (services ports & adapters task)

---

### Gap SV-2: Port Purity Check Not Automated
**Standard:** `standards/frontend-tier.md#services--integration-layer` - "Port interfaces contain zero platform-specific imports (verified via dependency-cruiser rule or code review)"

**Current State:**
- Port files exist: `mobile/src/services/upload/port.ts`, `mobile/src/services/notification/port.ts`
- Manual inspection shows no platform imports (good)
- No automated check enforcing this

**Impact:** Regression risk; future refactor may introduce platform coupling

**Remediation:**
- Add dependency-cruiser rule banning imports of `expo-*`, `@react-native-*`, `fetch` in `/services/*/port.ts` files
- Run check in CI as part of `qa:static`
- Document port purity constraint in `mobile/src/services/README.md`

**Task Link:** TASK-0820 (services layer task)

---

### Gap SV-3: Fitness Evidence Not Generated
**Standard:** `standards/frontend-tier.md#services--integration-layer` - "Owner: Services Maintainer. Evidence: interface audit + client hash log + port purity check attached to evidence bundle"

**Current State:**
- No `docs/ui/contracts/` evidence found
- No interface audit report
- No automated evidence generation

**Impact:** Cannot validate services tier compliance; no audit trail for releases

**Remediation:**
- Create CI job `mobile:services:evidence` that runs:
  - Port purity check (dependency-cruiser)
  - Interface audit (list all port files + export count)
  - Contract hash comparison
- Output to `docs/ui/contracts/services-evidence-{date}.json`
- Attach to evidence bundle per `standards/global.md#evidence-requirements`

**Task Link:** TASK-0823 (test coverage evidence task)

---

### Gap SV-4: Retry Policy Configuration Not Externalized
**Standard:** `standards/frontend-tier.md#services--integration-layer` - "Retry + Circuit Breaker: cockatiel (policy combinators)"

**Current State:**
- cockatiel correctly implemented in `mobile/src/services/upload/adapter.ts`
- Policy values hardcoded:
  - `maxAttempts: 3`
  - `backoff: new ExponentialBackoff()`
  - `halfOpenAfter: 30_000`
- No configuration via environment or feature flags

**Impact:** Cannot tune retry behavior without code changes; hard to test edge cases

**Remediation:**
- Move policy config to `mobile/src/lib/resilience/config.ts`
- Allow override via environment variables (e.g., `EXPO_PUBLIC_RETRY_MAX_ATTEMPTS`)
- Support per-request policy overrides for critical uploads
- Document policy tuning guide in services README

**Task Link:** TASK-0820 (services layer task)

---

## Platform & Delivery Gaps

### Gap P-1: Mobile Test Harness Missing
**Standard:** `standards/frontend-tier.md#platform--delivery-layer` - "Dedicated 'Mobile Test Harness' screen that can render any screen in isolation with mock providers"

**Current State:**
- No test harness screen found
- Manual testing requires navigating full app flow

**Impact:** Slow manual testing; hard to test edge cases in isolation

**Remediation:**
- Create `mobile/src/screens/__dev__/TestHarnessScreen.tsx` (dev-only)
- Provide UI to select screen + inject mock providers (services, state)
- Gate behind `__DEV__` flag or Expo dev client
- Document usage in `mobile/README.md#testing`

**Task Link:** TASK-0823 (test coverage evidence; harness aids manual testing)

---

### Gap P-2: Navigation Smoke Tests Missing
**Standard:** `standards/frontend-tier.md#platform--delivery-layer` - "Navigation smoke tests on CI; manual testing of critical user flows before release"

**Current State:**
- No E2E tests found (Detox not configured)
- No smoke test suite for navigation flows

**Impact:** Navigation regressions undetected; broken flows may ship

**Remediation:**
- Install Detox and configure for iOS/Android
- Create smoke test suite: `mobile/e2e/smoke/navigation.spec.ts`
- Test critical flows:
  - Home → Camera → Preview → Edit → Jobs
  - Gallery → Select → Edit → Download
- Run on CI for every PR
- Document test plan in `docs/ui/e2e-test-plan.md`

**Task Link:** TASK-0823 (test coverage evidence includes E2E plan)

---

### Gap P-3: Release Checklist Not Defined
**Standard:** `standards/frontend-tier.md#platform--delivery-layer` - "Owner: Mobile Release Captain. Evidence: Test plan + release checklist attached to evidence bundle"

**Current State:**
- No release checklist found
- No defined release captain role

**Impact:** Ad-hoc release process; risk of skipping critical steps

**Remediation:**
- Create `docs/ui/release-checklist.md` with pre-release steps:
  - Run full QA suite (`pnpm turbo run qa --filter=photoeditor-mobile`)
  - Verify Storybook coverage >= 85%
  - Run navigation smoke tests
  - Check accessibility violations = 0
  - Validate contract hash match
  - Manual test on physical devices (iOS + Android)
- Assign release captain role (solo dev acts as captain)
- Attach checklist completion to evidence bundle

**Task Link:** TASK-0823 (test coverage evidence; includes release checklist template)

---

## Cross-Cutting Gaps

### Gap X-1: Upload Flow Preprocessing Missing HEIC Fallback
**Standard:** `standards/frontend-tier.md#feature-guardrails` - "Upload flows support background retry/backoff/resume with HEIC→JPEG fallback and enforce a 4096 px cap"

**Current State:**
- Preprocessing file exists: `mobile/src/lib/upload/preprocessing.ts`
- No HEIC→JPEG conversion logic found
- No 4096px dimension cap enforcement visible

**Impact:** HEIC uploads may fail on backend; oversized images waste bandwidth

**Remediation:**
- Install `react-native-image-resizer` or similar library
- Add HEIC detection in preprocessing
- Convert HEIC to JPEG before upload
- Enforce max dimension 4096px (downscale if needed)
- Add preprocessing tests with HEIC fixtures

**Task Link:** TASK-0819 (feature UI layering includes upload flow refinements)

---

### Gap X-2: Background Retry/Resume Not Fully Implemented
**Standard:** `standards/frontend-tier.md#feature-guardrails` - "Upload flows support background retry/backoff/resume"

**Current State:**
- Retry logic exists in cockatiel policies (adapter level)
- XState machine has pause/resume states
- No evidence of background task handling (app backgrounded during upload)
- No persistence of upload state across app restarts

**Impact:** Upload aborts if user backgrounds app; no recovery on app restart

**Remediation:**
- Use `expo-background-fetch` or `expo-task-manager` for background uploads
- Persist XState machine context to AsyncStorage on state changes
- Restore context on app launch
- Resume in-progress uploads from persisted state

**Task Link:** TASK-0820 (services & integration; background tasks are platform adapters)

---

## Remediation Approach

### Task Breakdown Strategy

Following `standards/task-breakdown-canon.md`, remediation is broken into focused tasks:

1. **TASK-0819: Feature UI Layering** (P1, unblocker)
   - Fix deep imports (Gap F-1)
   - Add breadcrumb trails (Gap F-6)
   - Add HEIC fallback (Gap X-1)
   - Scope: Feature layer + upload flow only
   - Estimated effort: M

2. **TASK-0820: Services Ports & Adapters** (P1)
   - Contract drift check (Gap SV-1)
   - Port purity automation (Gap SV-2)
   - Retry config externalization (Gap SV-4)
   - Background retry/resume (Gap X-2)
   - Scope: Services layer only
   - Estimated effort: L

3. **TASK-0821: Storybook + Chromatic Setup** (P1, unblocker)
   - Install Storybook (Gap F-3)
   - Configure a11y addon (Gap F-4)
   - Set up Chromatic CI
   - Scope: Infrastructure only (no component migration yet)
   - Estimated effort: M

4. **TASK-0822: RTK Query + XState Refinement** (P2)
   - Statechart exports (Gap S-3)
   - XState transition coverage (Gap S-4)
   - Offline sync queue (Gap S-5)
   - Feature flags (Gap S-6)
   - Reducer complexity tracking (Gap S-2)
   - Scope: State layer only
   - Estimated effort: L

5. **TASK-0823: Test Coverage Evidence** (P2)
   - Fitness evidence generation (Gap SV-3)
   - Selector purity audit (Gap S-1)
   - Navigation smoke tests (Gap P-2)
   - Release checklist (Gap P-3)
   - Test harness screen (Gap P-1)
   - Snapshot policy (Gap F-5)
   - Scope: Testing infrastructure + documentation
   - Estimated effort: M

6. **Design System Migration** (P2, deferred)
   - Radix/Tamagui integration (Gap F-2)
   - Atomic component hierarchy
   - vanilla-extract tokens
   - Scope: Large refactor; defer until Storybook foundation (TASK-0821) complete
   - Estimated effort: XL (multi-sprint)

### Sequencing

```
TASK-0821 (Storybook) → TASK-0819 (Feature Layer) → TASK-0820 (Services)
                     ↓
                 TASK-0822 (State) → TASK-0823 (Evidence)
                     ↓
             Design System Migration (P2, future)
```

**Rationale:**
- TASK-0821 is unblocker for visual regression and a11y checks
- TASK-0819 and TASK-0820 can run in parallel after Storybook setup
- TASK-0822 builds on TASK-0820 (offline queue depends on services layer)
- TASK-0823 aggregates evidence from prior tasks
- Design system migration is large; defer to future sprint after core gaps closed

### Parallel vs Sequential

**Parallel Candidates:**
- TASK-0819 + TASK-0820 (independent layers)

**Sequential Dependencies:**
- TASK-0821 → TASK-0819 (breadcrumbs need Storybook stories)
- TASK-0820 → TASK-0822 (sync queue depends on services resilience)
- All → TASK-0823 (evidence aggregation is final step)

### Standards CR Needs

**No standards CRs required.** All gaps map to existing standards; remediation aligns with `standards/frontend-tier.md` as written.

**Potential ADR:**
- ADR for offline sync queue strategy (RTK Query middleware vs XState service)
- ADR for feature flag provider choice (ConfigCat vs Unleash)

### Risk Assessment

| Gap | Severity | Effort | Risk |
|-----|----------|--------|------|
| F-2 (Design System) | High | XL | Medium (large refactor; defer to P2) |
| F-3 (Storybook) | High | M | Low (well-documented setup) |
| S-5 (Offline Support) | High | L | Medium (complex state persistence) |
| SV-1 (Contract Drift) | Medium | M | Low (codegen tooling mature) |
| X-2 (Background Upload) | Medium | M | Medium (platform API nuances) |
| P-2 (E2E Tests) | Medium | M | Low (Detox well-supported) |
| All others | Low-Medium | S-M | Low |

**Mitigation:**
- Defer Design System (F-2) until Storybook foundation proven
- Prototype offline sync queue (S-5) in spike before committing to approach
- Test background upload (X-2) on physical devices early

---

## Summary of Violations by Standard Section

| Standard Section | Gaps | Priority |
|------------------|------|----------|
| Feature Guardrails | F-1, F-6, X-1, X-2 | P1 |
| UI Components Layer | F-2, F-3, F-4, F-5 | P1 (F-2 deferred) |
| State & Logic Layer | S-1, S-2, S-3, S-4, S-5, S-6 | P1-P2 |
| Services & Integration | SV-1, SV-2, SV-3, SV-4 | P1 |
| Platform & Delivery | P-1, P-2, P-3 | P2 |

**Total Gaps:** 22
**P1 Critical:** 10 (F-1, F-3, F-4, F-6, S-5, SV-1, SV-2, X-1, X-2, SV-4)
**P2 Refinements:** 11 (S-1, S-2, S-3, S-4, S-6, F-5, SV-3, P-1, P-2, P-3)
**Deferred:** 1 (F-2 Design System migration)

---

## Next Steps

1. **Immediate (Sprint 1):**
   - Execute TASK-0821 (Storybook setup)
   - Execute TASK-0819 (Feature layer fixes)
   - Execute TASK-0820 (Services layer hardening)

2. **Short-term (Sprint 2):**
   - Execute TASK-0822 (State layer refinement)
   - Execute TASK-0823 (Evidence generation)

3. **Medium-term (Sprint 3+):**
   - Design System migration (pending ADR on migration strategy)
   - Continuous monitoring of fitness gates (Storybook coverage, complexity reports)

4. **Standards Alignment:**
   - No standards CRs required; all gaps map to existing tier standards
   - Create ADRs for offline sync queue and feature flag provider choices

---

## References

- **Standards:** `standards/frontend-tier.md` (all sections)
- **TypeScript Standards:** `standards/typescript.md#analyzability`, `#immutability--readonly`
- **Testing Standards:** `standards/testing-standards.md` (mobile tier)
- **Task Breakdown Canon:** `standards/task-breakdown-canon.md`
- **Governance SSOT:** `standards/standards-governance-ssot.md`

---

**Document Owner:** Mobile Engineering (Solo Developer)
**Last Reviewed:** 2025-11-01
**Next Review:** After TASK-0823 completion

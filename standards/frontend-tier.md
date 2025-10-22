# Frontend Tier

## Feature Guardrails

* Feature modules follow `screens → feature components → shared UI → hooks`; cross-feature imports are disallowed.
* Each feature publishes a `/public` surface; deep imports into internal paths are banned.
* UI primitives must come from `packages/ui-tokens`; inline raw tokens are not allowed.
* Upload surfaces provide breadcrumb trails linked to `jobId` and raise optimistic job status when latency exceeds 500 ms.
* Hooks and schemas include component tests, and critical forms run dedicated accessibility linting.
* Upload flows support background retry/backoff/resume with HEIC→JPEG fallback and enforce a 4096 px cap.
* Offline experience uses deterministic React Query keys, optimistic updates with a sync queue, and NetInfo-based pause/resume.

## UI Components Layer

**Libraries**

* **Radix UI** primitives for web and **Tamagui** primitives for native; both consume shared design tokens defined in **vanilla-extract** (Tailwind classes derived from same tokens only for web).
* **react-error-boundary** for Error Handling Surfaces.
* **react-native-svg** for icons; **lucide-react-native** for consistency.

**Patterns**

* **Atomic Design** with export barrels per atom/molecule/organism.
* **Headless components** + presentational wrappers.
* **Theming via tokens** (no ad-hoc colors).
* **Storybook** (+ **@storybook/addon-a11y**, **addon-interactions**) with Chromatic baseline per commit.

**Strategies**

* **Visual regression**: **Storybook + Chromatic** (or Loki).
* **Accessibility**: axe rules in CI.
* **Snapshot policy**: only for stable atoms/molecules.

**Fitness gates**

* Story coverage ≥ 85% of atoms/molecules with coverage report archived in `docs/ui/storybook`.
* Chromatic no-change gate; a11y violations = hard fail.
* **Owner**: UI Systems Lead. **Evidence**: Storybook coverage summary + Chromatic gate status attached to evidence bundle.

## State & Logic Layer

**Libraries**

* **Redux Toolkit** + **RTK Query** (normalize server-state; RTK Query mandated for network calls).
* **Zustand** limited to feature-local UI state (exceptions require ADR) or consolidate with RTK slices.
* **XState** for **Media** and **Job Lifecycle** state machines (diagrams + testable transitions).

**Patterns**

* **Selector-first** (reselect) for analyzability & performance.
* **Command–Query split** (mutations vs selectors).
* **Event sourcing (lightweight)**: append domain events into a dev log to reproduce flows.

**Strategies**

* **Statechart contracts**: export `.scxml` or Mermaid from XState to your KB.
* **Feature flags**: **Unleash** or **ConfigCat**; inject via context.

**Fitness gates**

* Reducer cyclomatic complexity ≤ 10 (tracked via ESLint rule) with weekly report stored in `docs/ui/state-metrics`.
* Every critical slice has an XState chart + test for each transition; charts generated from `shared/statecharts` package.
* **Owner**: State Management Maintainer. **Evidence**: lint complexity report + statechart checksum list in evidence bundle.

## Services & Integration Layer

**Libraries**

* **OpenAPI** or **Zod** + **zod-to-openapi**; client via **rtk-query codegen** (orval usage requires justification).
* **Expo Notifications** with a thin adapter; **p-retry** for delivery retry.
* **expo-file-system**, **expo-media-library** behind a **Repository/Adapter**.

**Patterns**

* **Ports & Adapters** (Hexagonal) for API/Notifications/Platform.
* **Idempotency** (idempotency keys for upload).
* **Retry + Circuit Breaker**: **cockatiel** (policy combinators).

**Fitness gates**

* 100% of external calls behind an interface in `/services/*/port.ts`.
* Contract drift check: generated client hash must match CI's server hash; CI step exports hash comparison artefact stored in `docs/ui/contracts`.
* **Owner**: Services Maintainer. **Evidence**: interface audit + client hash log attached to evidence bundle.

## Platform & Delivery Layer

**Libraries**

* **Expo EAS** (build profiles), **babel-plugin-module-resolver** (absolute imports).
* **React Native Testing Library**, **Detox/E2E** for smoke navigation.

**Strategies**

* Dedicated **"Mobile Test Harness"** screen that can render any screen in isolation with mock providers.

**Fitness gates**

* Navigation smoke tests on CI; manual testing of critical user flows before release.
* **Owner**: Mobile Release Captain. **Evidence**: Test plan + release checklist attached to evidence bundle.

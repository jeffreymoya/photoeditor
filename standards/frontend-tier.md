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

**Purity & Immutability in State Management**

Mobile state logic should maximize purity and enforce immutability to enable time-travel debugging and predictable updates:

*Redux Toolkit (immer-powered reducers):*
- Write "mutating" syntax inside reducer cases; immer's proxy makes it safe and immutable
- Example: `state.jobs[id].status = 'completed'` — appears to mutate but creates new state under the hood
- **Never** manually mutate state outside reducers; always use dispatch with actions
- Selectors must be pure: same state input → same derived output, no side effects

*Redux selectors (reselect):*
- Input selectors are pure functions extracting slices: `(state) => state.jobs`
- Result selectors use memoized transforms; all callbacks must be pure
- Example: `createSelector([selectJobs], (jobs) => jobs.filter(j => j.status === 'active'))` — pure transformation
- Test selectors with state fixtures; no mocks, just input → output assertions

*RTK Query cache updates:*
- Use `api.util.updateQueryData` to patch cache; operates on immer draft so "mutations" are safe
- Optimistic updates: clone/spread the data before dispatching; never mutate query results in-place
- Example: `dispatch(api.util.updateQueryData('getJob', jobId, (draft) => { draft.status = 'updated'; }));`
- Invalidate tags to trigger refetch rather than manually syncing derived state

*XState state machines:*
- **Guards and conditions** are pure predicates: `(context, event) => boolean` with no side effects
- **Context updates** via `assign()` with pure updaters that return new context slices
- Example: `assign({ count: (ctx) => ctx.count + 1 })` — returns new value, doesn't mutate
- **Actions** may invoke side effects (send, raise) but must not mutate context directly
- Test state transitions with input events and assert resulting context/state; no mocks for pure guards

*Measuring purity in mobile state:*
- Reducers: automatically pure via immer (trust the framework)
- Selectors: 100% pure; if a selector calls `Date.now()` or `fetch()`, refactor to accept input
- XState guards/conditions: 100% pure predicates
- Custom hooks: separate pure computation from effects; pure logic should be extractable and testable without React

*Testing approach:*
- Reducers: dispatch actions, assert new state; no mocks
- Selectors: call with mock state, assert output; no mocks on selectors themselves
- XState: send events to machine, assert state transitions and context; guards tested as pure predicates
- Hooks with effects: test pure logic separately, then integration test the hook with minimal mocking

See `standards/typescript.md#analyzability` and `standards/typescript.md#immutability--readonly` for foundational patterns and `docs/evidence/purity-immutability-gap-notes.md` for analysis.

**Strategies**

* **Statechart contracts**: export `.scxml` or Mermaid from XState to your KB.
* **Feature flags**: **Unleash** or **ConfigCat**; inject via context.

**Fitness gates**

* Reducer cyclomatic complexity ≤ 10 (tracked via ESLint rule) with weekly report stored in `docs/ui/state-metrics`.
* Every critical slice has an XState chart + test for each transition; charts generated from `shared/statecharts` package.
* Selectors are 100% pure (verified via code review: no I/O imports in selector files).
* **Owner**: State Management Maintainer. **Evidence**: lint complexity report + statechart checksum list + selector purity audit in evidence bundle.

## Services & Integration Layer

**Libraries**

* **OpenAPI** or **Zod** + **zod-to-openapi**; client via **rtk-query codegen** (orval usage requires justification).
* **Expo Notifications** with a thin adapter; **p-retry** for delivery retry.
* **expo-file-system**, **expo-media-library** behind a **Repository/Adapter**.

**Patterns**

* **Ports & Adapters** (Hexagonal) for API/Notifications/Platform.
* **Idempotency** (idempotency keys for upload).
* **Retry + Circuit Breaker**: **cockatiel** (policy combinators).

**Purity & Immutability in Services**

Services and adapters should isolate platform I/O and enable pure domain logic in hooks/reducers:

*Port interfaces (pure contracts):*
- Define service contracts as pure TypeScript interfaces with clear input → output signatures
- Example: `interface JobService { getJob(id: string): Promise<Job>; }` — pure interface, impure implementation
- Keep port definitions free of platform details (no Expo types, no AWS SDK types)

*Adapter implementations (impure, isolated):*
- Adapters implement ports and contain all platform-specific I/O (fetch, Expo APIs, file system)
- Mark adapter files clearly: `/services/*/adapters/` or naming like `expo-notifications.adapter.ts`
- Never import adapters directly into components/hooks; inject via context or RTK Query

*Immutability in service responses:*
- API responses and cache data are immutable; clone before local manipulation
- Use `Object.freeze()` in dev builds to catch accidental mutations
- RTK Query enforces this via immer drafts for cache updates

*Testing services:*
- Pure port interfaces: no tests needed (just types)
- Adapter implementations: mock platform APIs (Expo, fetch) with stubs/fixtures
- Integration: test that adapters satisfy port contracts with representative I/O scenarios

See `standards/typescript.md#analyzability` for purity criteria and `standards/backend-tier.md#provider-integration-layer` for parallel backend patterns.

**Fitness gates**

* 100% of external calls behind an interface in `/services/*/port.ts`.
* Contract drift check: generated client hash must match CI's server hash; CI step exports hash comparison artefact stored in `docs/ui/contracts`.
* Port interfaces contain zero platform-specific imports (verified via dependency-cruiser rule or code review).
* **Owner**: Services Maintainer. **Evidence**: interface audit + client hash log + port purity check attached to evidence bundle.

## Platform & Delivery Layer

**Libraries**

* **Expo EAS** (build profiles), **babel-plugin-module-resolver** (absolute imports).
* **React Native Testing Library**, **Detox/E2E** for smoke navigation.

**Strategies**

* Dedicated **"Mobile Test Harness"** screen that can render any screen in isolation with mock providers.

**Fitness gates**

* Navigation smoke tests on CI; manual testing of critical user flows before release.
* **Owner**: Mobile Release Captain. **Evidence**: Test plan + release checklist attached to evidence bundle.

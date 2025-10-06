# Atomic Interface Elements

- **Source Task**: docs/architectural-improvement-plan.md
- **Checklist Entry**: - [x] Atomic Interface Elements (buttons, inputs, icons) (see docs/arch-improv/atomic-interface-elements.md)
- **Primary Owners**: TBD

## Maintainability Scores (ISO/IEC 25010)
| Attribute | Score (1–5) | Evidence & References |
|-----------|-------------|------------------------|
| Modularity | 2 | Inline `TouchableOpacity`/`Text` usage with duplicated styles in `mobile/src/screens/HomeScreen.tsx:52` conflicts with `STANDARDS.md:162` guidance to consume shared UI tokens. |
| Reusability | 2 | Most screens reimplement buttons (`mobile/src/screens/EditScreen.tsx:211`, `mobile/src/screens/CameraScreen.tsx:188`) while the only token-compliant button lives inside the upload feature (`mobile/src/features/upload/components/UploadButton.tsx:43`). |
| Analysability | 3 | Atomic UI concerns are scattered across screens without module-level docs or Storybook coverage, though components remain relatively small and readable (`mobile/src/components/ErrorBoundary.tsx:41`). |
| Modifiability | 2 | Brand colors, typography, and spacing are hard-coded across screens (`mobile/src/screens/HomeScreen.tsx:118`, `mobile/src/screens/SettingsScreen.tsx:14`), so design pivots require touching multiple files. |
| Testability | 1 | No Jest specs exercise atomic UI; only the shared test bootstrap exists (`mobile/src/__tests__/setup.ts:1`) and `mobile/src/features/upload/__tests__/` is empty. |

## Observations & Risks
- `mobile/src/screens/HomeScreen.tsx:52` defines bespoke quick-action buttons with inline tokens, bypassing the shared UI layer and increasing chances of drift from `ui-tokens`.
- `mobile/src/screens/EditScreen.tsx:211` repeats button, text, and container styles that should be centralized, inflating change surface for accessibility or branding updates.
- `mobile/src/screens/CameraScreen.tsx:188` introduces additional button variants (header, gallery, capture) with ad-hoc styling and state handling, fragmenting behaviour like disabled/pressed states.
- `STANDARDS.md:162` bans inline raw tokens, yet multiple screens violate this, signaling enforceability gaps and potential lint/test coverage issues.
- `mobile/src/features/upload/components/UploadButton.tsx:43` is token-aligned but trapped inside a feature namespace, preventing reuse across the rest of the app.

## Remediation Plan (Not Executed)
- Recommended approach type (Library / Framework / Design Pattern / Custom Implementation)
  - Design Pattern: establish an Atomic Design-inspired shared UI module that wraps `ui-tokens` and standardises state management.
- Detailed implementation outline (layers, modules, interfaces, dependencies)
  - Create `mobile/src/ui/atoms` with components such as `Button`, `IconButton`, `Text`, `Badge`, `Surface`, and `Input`, each consuming `@/lib/ui-tokens` and exposing semantic variants (primary, secondary, destructive, ghost) plus loading/disabled states.
  - Publish the shared surface via `mobile/src/ui/public/index.ts` to satisfy the "shared UI" layer in `STANDARDS.md:53`, and refactor existing screens/features to import from this surface rather than React Native primitives.
  - Factor icon handling into a thin wrapper around `@expo/vector-icons` that normalises size/color props and consolidates the icon set used by atomic elements.
  - Add Storybook (or Expo component catalog) entries under `docs/` to document expected props, tokens, and accessibility notes per component.
- Rationale and expected impact on maintainability scores
  - Consolidating button/typography primitives will lift Modularity and Reusability to ≥4 by reducing duplication and enforcing token usage, while centralised props improve Analysability and Modifiability by isolating behaviour.
- Validation and rollout strategy
  - Introduce `@testing-library/react-native` specs covering state transitions (loading, disabled, pressed) with coverage targets ≥80% lines / ≥70% branches for the shared UI package, and run visual spot-checks via Expo preview to confirm token fidelity.
  - Migrate one screen per PR to mitigate regression risk, tracking fan-in/fan-out deltas to ensure the new module stays within dependency budgets.
- Confirmation: "No code changes executed during this session"

## STANDARDS Coverage Review
- Existing clauses that govern this taxonomy group (cite exact sections)
  - `STANDARDS.md:53` mandates the `screens → feature components → shared UI → hooks` layering, and `STANDARDS.md:162` bans inline raw tokens in mobile UI.
- Gaps identified and recommended wording updates (if any)
  - Current standards lack explicit guidance requiring atomic interface elements to live in a reusable shared UI module with documented variants and tests. Recommend adding under "Mobile (React Native)" a clause: "Atomic interface elements (buttons, inputs, icon wrappers, badges) must reside in the shared UI layer, consume `ui-tokens`, expose a `/public` API, and maintain ≥80%/70% (line/branch) Jest coverage."
  - Consider clarifying that the canonical token source is `@/lib/ui-tokens` (or `packages/ui-tokens`) and linting should flag direct hex/number literals in React Native styles.
- Follow-up actions required to align standards
  - Update `STANDARDS.md` with the recommended clause and add lint rules (ESLint or custom codemod) to enforce token usage once the shared UI module exists.

## Follow-up Log
- Open a task (e.g., `tasks/TASK-XXXX`) to implement the shared `mobile/src/ui/atoms` module, migrate existing screens, and add component test coverage.
- Evaluate whether an ADR is needed to document the adoption of the shared UI design pattern and any deviation from historical package layout (e.g., confirming location of `ui-tokens`).
- Add tooling work to integrate ESLint/TS rules that forbid raw color/spacing literals in React Native `StyleSheet` declarations.

## Session Closure
- Confirmation that the taxonomy group checkbox is set to `[x]`
- Date and facilitator signature/identifier: 2025-10-05 — Codex (GPT-5)
- "Session complete"

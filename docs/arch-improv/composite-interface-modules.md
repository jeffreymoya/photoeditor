# Composite Interface Modules

- **Source Task**: docs/architectural-improvement-plan.md
- **Checklist Entry**: - [x] Composite Interface Modules (forms, cards, media viewers) (see docs/arch-improv/composite-interface-modules.md)
- **Primary Owners**: TBD

## Maintainability Scores (ISO/IEC 25010)
| Attribute | Score (1–5) | Evidence & References |
|-----------|-------------|------------------------|
| Modularity | 2 | Composite UIs are embedded within screens rather than shared modules: media grid and selection in `mobile/src/screens/EditScreen.tsx:128`, prompt form in `mobile/src/screens/EditScreen.tsx:148`, and processing CTA in `mobile/src/screens/EditScreen.tsx:160`. Quick actions grid and job list cards are defined inline in `mobile/src/screens/HomeScreen.tsx:52` and `mobile/src/screens/HomeScreen.tsx:79`. This conflicts with layered guidance in `STANDARDS.md:53` and token consumption in `STANDARDS.md:162`. |
| Reusability | 2 | Repeated card/list/status patterns (e.g., `HomeScreen` job card at `mobile/src/screens/HomeScreen.tsx:79` and status chip styles at `mobile/src/screens/HomeScreen.tsx:222`) are not factored into a shared composite module. No shared media grid or form components are exposed via a public surface. |
| Analysability | 3 | Code remains readable, but composite concerns are interleaved with screen logic (e.g., `EditScreen` combines selection, form, and action areas in a single file). There is no dedicated documentation for composite components and no Storybook or catalog. |
| Modifiability | 2 | UI token usage is not centralized in composites; colors and spacing appear as raw literals (e.g., `mobile/src/screens/HomeScreen.tsx:133`, `mobile/src/screens/EditScreen.tsx:214`), so design changes require edits across screens. Introducing new composite variants would touch multiple screens. |
| Testability | 1 | No Jest specs target composite UI. Existing mobile tests focus on upload utilities (`mobile/src/lib/upload/__tests__/*`). No @testing-library/react-native coverage for forms/cards/media viewers. `STANDARDS.md:224` coverage gates do not currently apply to mobile composites. |

## Observations & Risks
- Composite UI patterns (cards, grids, chips, toolbars) are duplicated across screens without a shared composite layer, increasing change surface and inconsistency risk.
- Forms do not use `react-hook-form` plus `zod` as required by `STANDARDS.md:150` (no imports found project-wide), making validation/error surfaces inconsistent and harder to test.
- Raw token usage appears in screen-level styles (e.g., hex colors and spacing numbers), despite mobile token guidance in `STANDARDS.md:53` and explicit ban in `STANDARDS.md:162`.
- Lack of a public composite surface prevents dependency-cruiser rules from enforcing proper layering for UI reuse.

## Remediation Plan (Not Executed)
- Recommended approach type (Library / Framework / Design Pattern / Custom Implementation)
  - Library + Design Pattern: adopt `react-hook-form` with `zod` for forms, and introduce a shared composite UI module that wraps `ui-tokens` and unifies common layouts.
- Detailed implementation outline (layers, modules, interfaces, dependencies)
  - Dependencies (mobile): add `react-hook-form`, `@hookform/resolvers`, and ensure `zod` is available for schema validation.
  - Structure: create `mobile/src/ui/composites` and expose via `mobile/src/ui/public/index.ts`.
    - `Card`: base container with tokenized padding, elevation, and variants (default, elevated, outline). Props: `variant`, `onPress?`, `footer?`.
    - `StatusChip`: compact status indicator used in lists. Props: `status`, `icon?`, tokenized color mapping.
    - `MediaGrid`: horizontal or grid preview for images. Props: `items`, `layout` (horizontal|grid), `onSelect?`.
    - `Form` primitives: `FormProvider` wrapper, `FormTextField`, `FormTextArea` using RHF + Zod. Props: `name`, `label`, `rules`, auto inline error messages.
    - `ActionBar`: toolbar with primary/secondary actions and progress state.
  - Layering: screens import from `ui/public` only. Feature components can wrap composites but do not deep import internals.
  - Tokenization: all composites consume `@/lib/ui-tokens` for color/spacing/typography.
- Rationale and expected impact on maintainability scores
  - Centralizing composites should lift Modularity and Reusability to 4 by reducing duplication and providing a single extension point. Analysability and Modifiability improve via consistent props and token usage. Testability improves once composites are covered with UI tests.
- Validation and rollout strategy
  - Add @testing-library/react-native specs for composites with target coverage >=80% lines and >=70% branches. Include form validation tests (happy, invalid, error surfaces).
  - Migrate incrementally: refactor `EditScreen` to `MediaGrid + FormTextArea + ActionBar`, then `HomeScreen` to `Card + StatusChip`.
  - Track fan-in/out for the new `ui/composites` module to stay within dep budgets in `STANDARDS.md:56`.
- Confirmation: "No code changes executed during this session"

## STANDARDS Coverage Review
- Existing clauses that govern this taxonomy group (cite exact sections)
  - `STANDARDS.md:53` mandates the mobile layering `screens -> feature components -> shared UI -> hooks` and token consumption.
  - `STANDARDS.md:150` requires forms to be typesafe using react-hook-form + zod with inline errors.
  - `STANDARDS.md:162` bans inline raw tokens in mobile UI.
- Gaps identified and recommended wording updates (if any)
  - Add explicit guidance under "Mobile (React Native)" that composite UI modules (cards, lists, media viewers, toolbars, form fields) must live in a shared composite layer and be exported via a public surface with >=80%/70% coverage.
  - Example wording: "Composite UI modules (cards, list items, media viewers, toolbars, form fields) must be implemented in `ui/composites`, consume `ui-tokens`, expose a `/public` API, and maintain >=80% line and >=70% branch coverage. Screens and features import from the public surface only."
- Follow-up actions required to align standards
  - Update `STANDARDS.md` with the composite UI clause and ensure lint rules or code reviews enforce token usage and public-surface imports.

## Follow-up Log
- Create a task to implement `mobile/src/ui/composites` (Card, StatusChip, MediaGrid, Form primitives, ActionBar) and expose `mobile/src/ui/public/index.ts`.
- Add mobile dev dependency for @testing-library/react-native and write initial specs for each composite.
- Evaluate an ADR to document the introduction of a shared composite UI layer and form library adoption (if considered a material change).

## Session Closure
- Confirmation that the taxonomy group checkbox is set to `[x]`
- Date and facilitator signature/identifier: 2025-10-05 -- Codex (GPT-5)
- "Session complete"


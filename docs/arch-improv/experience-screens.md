# Experience Screens

- **Source Task**: docs/architectural-improvement-plan.md
- **Checklist Entry**: - [x] Experience Screens (camera, gallery, home, jobs, preview, edit, settings) (see docs/arch-improv/experience-screens.md)
- **Primary Owners**: TBD

## Maintainability Scores (ISO/IEC 25010)
| Attribute | Score (1–5) | Evidence & References |
|-----------|-------------|------------------------|
| Modularity | 3 | Screens are top-level containers but mix layout, styles, and orchestration. Inline tokens and ad-hoc composites appear in `mobile/src/screens/HomeScreen.tsx:18`–`mobile/src/screens/HomeScreen.tsx:37` and styles such as `mobile/src/screens/HomeScreen.tsx:118`. Layering guidance exists in `STANDARDS.md:53` (Mobile layers) but is not fully applied. |
| Reusability | 2 | Screen-level buttons, chips, and cards are reimplemented instead of consuming shared UI. Example: quick actions in `mobile/src/screens/HomeScreen.tsx:18` and CTA in `mobile/src/screens/EditScreen.tsx:160` duplicate button variants that a tokenized component like `mobile/src/features/upload/components/UploadButton.tsx:135` already models. |
| Analysability | 3 | Code is reasonably small and readable, but logic and view concerns interleave (e.g., image selection, form prompt, and submission live together in `mobile/src/screens/EditScreen.tsx:27`–`mobile/src/screens/EditScreen.tsx:112`). No module-level docs or component catalog for screens. |
| Modifiability | 2 | Design tokens are embedded as literals (e.g., `#007AFF`, `#34C759`) across screens (`mobile/src/screens/HomeScreen.tsx:23`, `mobile/src/screens/EditScreen.tsx:292`), increasing change surface for design or accessibility updates. Navigation types are untyped (`any`) in `mobile/src/screens/HomeScreen.tsx:14`, complicating safe changes. |
| Testability | 1 | No Jest specs target screens (`mobile/src/__tests__/setup.ts:1` exists but no `*.test.tsx`). UI flows (camera, batch prompts, status) have no @testing-library/react-native coverage. `STANDARDS.md:224` test gates focus on services/adapters only. |

## Observations & Risks
- Inline raw tokens conflict with standards: `STANDARDS.md:162` bans inline raw tokens, yet multiple screens use hex colors and spacing literals (`mobile/src/screens/HomeScreen.tsx:121`, `mobile/src/screens/EditScreen.tsx:292`).
- ESLint policy forbids `any`, but screens use it for navigation props (`mobile/src/screens/HomeScreen.tsx:14`, `mobile/src/screens/CameraScreen.tsx:17`). See `STANDARDS.md:82` (no/implicit-any).
- Composite UI patterns (cards, chips, media grid) are defined inline within screens (`mobile/src/screens/HomeScreen.tsx:79`, `mobile/src/screens/EditScreen.tsx:243`), fragmenting behaviour and styles across files.
- Navigation shell defines routes correctly but lacks typed param lists and deep link mapping (`mobile/src/navigation/AppNavigator.tsx:58`).
- Edit flow couples UI and network orchestration directly (`mobile/src/screens/EditScreen.tsx:73` calls `apiService.processImage`), limiting swapability and test seams.

## Remediation Plan (Not Executed)
- Recommended approach type (Library / Framework / Design Pattern / Custom Implementation)
  - Design Pattern + Bespoke Implementation aligned to standards.
- Detailed implementation outline (layers, modules, interfaces, dependencies)
  - Screens adopt a container/presentational split:
    - Containers remain in `mobile/src/screens/*` and orchestrate navigation and global store usage only.
    - Presentational pieces come from `ui/atoms` and `ui/composites` (see prior sessions) via `mobile/src/ui/public/index.ts`.
  - Replace literals with `ui-tokens` consumed by shared UI.
  - Introduce typed navigation params:
    - Define `RootStackParamList` and `TabParamList` in `mobile/src/navigation/types.ts`; update screens to `({ navigation }: StackNavigationProp<...>)` instead of `any`.
  - Decouple network orchestration from screens:
    - Wrap `apiService` calls in a feature-level hook (e.g., `useBatchEdit`) under `mobile/src/features/edit/hooks` with explicit inputs/outputs to simplify testing.
  - Validation strategy:
    - Add @testing-library/react-native specs for each screen covering critical flows (take photo → edit, select gallery → edit, submit prompt → progress → result).
    - Ensure mocks for store and `apiService` are provided; target ≥80% line / ≥70% branch coverage for the screen containers’ logic paths.
  - Rollout considerations:
    - Migrate `HomeScreen` and `EditScreen` first, then `CameraScreen`, then stubs (`Gallery`, `Jobs`, `Preview`, `Settings`). One-screen-per-PR to confine risk. Track fan-in/out changes.
- Rationale and expected impact on maintainability scores
  - Centralizing view primitives and composites while typing navigation reduces duplication and clarifies responsibilities, lifting Modularity and Reusability to ≥4 and Analysability/Modifiability to ≥3–4. Test seams improve, enabling Testability ≥3 with initial specs.
- Validation and rollout strategy
  - CI adds mobile UI test jobs. Evidence bundle includes coverage diff, dep-cruiser graph for `ui/*` and `screens/*`, and a reuse ratio snapshot for UI tokens adoption.
- Confirmation: "No code changes executed during this session"

## STANDARDS Coverage Review
- Existing clauses that govern this taxonomy group
  - Layering and tokens: `STANDARDS.md:53` (Mobile layers) and `STANDARDS.md:162` (ban inline raw tokens).
  - Static analysis: `STANDARDS.md:82` (tsconfig strict, ESLint no/implicit-any).
- Gaps identified and recommended wording updates (do not edit file here)
  - Add under "Mobile (React Native)": "Screens act as containers only (navigation + store orchestration). Presentational UI must be imported from `ui/public` and consume `ui-tokens`."
  - Add: "React Navigation must use typed param lists; usage of `any` for navigation types is prohibited."
  - Add: "Screens with non-trivial flows require @testing-library/react-native specs covering happy/error paths; aggregate coverage reported per PR."
- Follow-up actions required to align standards
  - Amend `STANDARDS.md` with the above mobile screen clauses and extend PR gates to include mobile UI coverage thresholds for screen containers.

## Follow-up Log
- Create tasks to:
  - Introduce `navigation/types.ts` with typed param lists and refactor screens off `any`.
  - Extract screen UI to `ui/atoms` and `ui/composites` and expose via `ui/public`.
  - Add screen container tests using @testing-library/react-native; attach coverage report.
  - Wrap `apiService` usage in `useBatchEdit` and related hooks; add unit tests.
- Consider an ADR documenting typed navigation and screen/container separation.

## Session Closure
- Confirmation that the taxonomy group checkbox is set to `[x]`
- Date and facilitator signature/identifier: 2025-10-05 -- Codex (OpenAI)
- "Session complete"


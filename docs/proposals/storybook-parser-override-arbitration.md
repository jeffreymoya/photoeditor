# Storybook Parser Override Arbitration & Chromatic Reliability

- **Author:** Solo Maintainer
- **Date:** 2025-11-15
- **Status:** Implementation (LLM direct)
- **Task Reference:** _None — executing directly via LLM per maintainer instruction_
- **Execution Mode:** This proposal is the canonical tracker; cite it from the PR instead of a `.task` file.
- **Related Standards:** `standards/AGENTS.md`, `standards/typescript.md`, `standards/testing-standards.md`, `standards/storybook.md` (will add references), `ARCHITECTURE.md`
- **Source Docs:** `docs/pending/storybook-chromatic-blockers.md`, `docs/fix-review-rubric.md`, `mobile/babel.config.js`

## 1. Background & Problem Statement

Storybook now bootstraps with the webpack5 framework and correctly aliases heavy React Native modules, but the static build halts because multiple Babel presets attempt to register `parserOverride`. When Storybook (and Chromatic, which shells out to `pnpm run build-storybook`) reaches modules supplied by NativeWind v5’s experimental `react-native-css` preset, Babel throws `Error: More than one plugin attempted to override parsing.` The current mitigation (`STORYBOOK_BUILD=1` toggles inside `mobile/babel.config.js`) still allows at least two plugins to register parser overrides, and the repo lacks automation to verify that only one override is active. Chromatic will remain blocked until we formalize how web-target Storybook builds arbitrate parser ownership, provide deterministic shims for NativeWind/Reanimated, and document QA plus success criteria.

## 2. Objectives

1. **Single-source parser governance:** Introduce a Storybook-specific Babel preset that inspects downstream plugins and guarantees a single `parserOverride`, failing fast with actionable logs if another plugin attempts to register one.
2. **Predictable adapter surface:** Encapsulate NativeWind/Reanimated stubbing behind a typed adapter so Storybook builds avoid reaching native dependencies while keeping Expo mobile builds untouched.
3. **Deterministic CI:** Ensure `pnpm run build-storybook` and `pnpm run chromatic` succeed locally and in CI, with artifacts stored for audit.
4. **Auditable metrics and QA:** Define commands, coverage goals, and telemetry (Chromatic pipeline success rate, Storybook build duration) so regression signals are measurable.
5. **Documentation & standards alignment:** Capture the parser-governance rule in an ADR (linked from this proposal/PR) and cross-link to standards so future UI frameworks follow the same guidelines.

## 3. Constraints & Current Findings

- **NativeWind dependency:** v5 pulls `react-native-css` with its own Babel preset. It injects `parserOverride` to parse CSS-like tagged templates used by the new className syntax.
- **Expo-managed preset:** `babel-preset-expo` may reinsert Reanimated plugins even when the `reanimated: false` flag is set, depending on environment; our current toggle relies on `STORYBOOK_BUILD`.
- **Alias coverage:** Storybook already aliases `react-native-vision-camera` and `react-native-worklets-core`, but NativeWind’s runtime remains unresolved. Downgrading to NativeWind v4 would reduce features and risks diverging from the mobile runtime.
- **Chromatic surface:** Chromatic’s CLI accepts `--only-changed` or `--do-not-start` to reuse builds, but it always invokes Storybook build first. Fix must land before Chromatic gating, otherwise PRs block.

## 4. Proposed Solution

### 4.1 Dedicated Storybook Babel preset module

- Create `mobile/storybook/babel/storybookPreset.js` exporting a preset function accepted by Babel.
- Responsibilities:
  - Load `babel-preset-expo` with explicit options (`{ reanimated: false, web: { useTransformReactJSXExperimental: false } }`) to prevent implicit plugin injection.
  - Apply NativeWind preset conditionally. If the preset exposes `parserOverride`, wrap it in a proxy that records ownership.
  - Maintain a shared `parserOverrideRegistry`. When the preset graph is evaluated, enforce that only one plugin registers `parserOverride`. If a second registration occurs, throw an error that prints the plugin name, originating package, and recommended override flag.
  - Export helper `assertSingleParserOverride({ module, hook })` for reuse by other packages (future backend UI harness).
- Replace the ad-hoc logic in `mobile/babel.config.js` with:
  ```js
  const storybookPreset = require('./storybook/babel/storybookPreset');
  module.exports = (api) => ({
    presets: [storybookPreset(api)],
    plugins: storybookPreset.getPlugins(api),
  });
  ```
  (Preset exports `getPlugins` to centralize plugin selection for clarity.)

### 4.2 Parser override instrumentation CLI

- Add `scripts/storybook/audit-parser-overrides.mjs` that:
  - Runs `BABEL_SHOW_CONFIG_FOR=<path> npx babel --show-config`.
  - Parses the JSON output, extracts plugin names declaring `parserOverride`, and writes a report to `mobile/storybook/.cache/parser-override-report.json`.
  - Fails CI if more than one override appears when `STORYBOOK_BUILD=1`.
- Integrate this script into `pnpm run qa:static --parallel` via workspace script entry so future dependency bumps are gated.

### 4.3 NativeWind and Reanimated adapters

- Create `mobile/storybook/adapters/nativewind.ts` exporting identity functions for `styled`, `cssInterop`, etc., so Storybook can render components without the CSS runtime.
- Add `module-resolver` alias inside the preset for `nativewind` and `react-native-css` when `STORY_STUB_NATIVEWIND=1` (automatically set inside `pnpm run build-storybook`).
- Document adapter contracts in `docs/mobile/storybook-adapters.md` with type definitions shared via `shared/storybook/adapters/nativewind.ts`.

### 4.4 Chromatic workflow hardening

- Update `package.json` scripts:
  - `chromatic:ci`: `cross-env STORYBOOK_BUILD=1 STORY_STUB_NATIVEWIND=1 pnpm run chromatic -- --exit-zero-on-changes --only-changed`.
  - `storybook:build`: include parser audit before invoking Storybook.
- Configure Chromatic GitHub Action to upload the parser audit report as an artifact for traceability.

### 4.5 Documentation & ADR

- Draft `adr/2025-11-15-storybook-parser-governance.md` summarizing the decision to enforce single parser override and adapter contract boundaries.
- Update `docs/pending/storybook-chromatic-blockers.md` once the blocker is lifted; link to this proposal and ADR for historical reasoning.

## 5. Implementation Plan

1. **Phase 0 – Instrumentation (0.5 day)**
   - Build parser audit script and wire it to `pnpm run build-storybook`.
   - Capture baseline report in `docs/pending/storybook-parser-audit.md`.
2. **Phase 1 – Shared preset & adapters (1 day)**
   - Implement `storybookPreset` module with registry enforcement.
   - Add NativeWind/Reanimated adapters plus aliases.
   - Update `mobile/babel.config.js` to consume the preset.
3. **Phase 2 – Chromatic & documentation (0.5 day)**
   - Update scripts/GitHub Action, add ADR, refresh `docs/pending` entry, and note QA evidence directly in this proposal/PR log.
4. **Phase 3 – Rollout validation (0.5 day)**
   - Run full QA suite, Chromatic dry run, and gather metrics for baseline.

## 6. QA Strategy

- **Commands**
  - `pnpm turbo run qa:static --parallel`
  - `cd mobile && STORYBOOK_BUILD=1 pnpm run build-storybook --output-dir=.storybook-static`
  - `CHROMATIC_PROJECT_TOKEN=$TOKEN STORYBOOK_BUILD=1 pnpm run chromatic -- --dry-run`
  - `node scripts/storybook/audit-parser-overrides.mjs --file src/features/camera/CameraWithOverlay.tsx`
- **Coverage expectations**
  - New preset/adapters: ≥80% line / ≥70% branch via Jest in `mobile/src/__tests__/storybook` (mocks verifying alias behavior).
  - Parser audit script: CLI unit tests using mocked Babel output.
- **Automation notes**
  - Add CI job `storybook-web-audit` that runs parser audit + Storybook build on every PR touching `mobile/` or root `package.json`.
  - Capture logs under `logs/storybook/` and cite them from this proposal/PR instead of a `.task` file.

## 7. Metrics & Feedback Loop

| Metric | Baseline Source | Target | Window |
| --- | --- | --- | --- |
| Chromatic pipeline success rate | Chromatic dashboard API (`scripts/ci/chromatic-report.mjs`) | ≥98% successful runs | First 14 days post-launch |
| Storybook build duration | GitHub Actions timing for `storybook-web-audit` | ≤8 minutes P95 | Same window |
| Parser override violations | Parser audit report | 0 violations per run | Continuous |

- **Owner:** Solo Maintainer
- **Follow-up date:** 2025-11-29
- **Planned checks:** Review Chromatic dashboard 48h post-merge, rerun parser audit weekly during dependency updates, log a retro note inside `docs/pending/storybook-chromatic-blockers.md`.

## 8. Risks & Mitigations

- **NativeWind upgrade churn:** Upstream changes might reintroduce overrides. Mitigation: pin package versions and rerun audit script as part of dependency PR template.
- **Alias drift:** If adapters diverge from production implementations, Storybook could hide real bugs. Mitigation: Add contract tests comparing stub exports to actual NativeWind shape in Expo runtime.
- **CI runtime increase:** Parser audit adds minutes to CI. Mitigation: cache Babel show-config output and allow selective audit by file path list tied to Git diff.

## 9. Open Questions

1. Should we upstream the parser-override guard as an OSS package for reuse across future repos?
2. Can we share adapters between Storybook web and any planned desktop/web preview apps to avoid duplication?
3. Do we need a fallback path (e.g., disable NativeWind entirely) for emergency Chromatic runs, and how would we document that exception?

## 10. Rubric-based Scoring (Prospective)

```yaml
proposal_systemic_review:
  proposal: "docs/proposals/storybook-parser-override-arbitration.md"
  title: "Storybook parser override arbitration & Chromatic reliability"
  author: "Solo Maintainer"
  reviewer: "TBD"
  date: "2025-11-15"
  task_ref: "LLM-direct (no .task file per maintainer instruction)"
  adr_refs:
    - "adr/2025-11-15-storybook-parser-governance.md"

  scores:
    generality: 4
    coupling_boundaries: 4
    test_depth: 4
    design_alignment: 4
    complexity_clarity: 4

  weighted_score: 23.6
  tier: "Advanced"
  outcome: "READY"

  systemic_rationale:
    - "Generalization plan: shared Storybook preset module with parser override registry and ADR."
    - "Coupling mitigation: typed adapters plus module-resolver aliases enforced via contract tests."
    - "Test strategy: parser audit CLI tests, Storybook build in CI, Jest coverage on adapters."
    - "Design alignment: references standards/AGENTS + new ADR documenting boundary contract."
    - "Complexity control: consolidates Babel logic into single preset rather than scattered env flags."

  qa_plan:
    commands:
      - "pnpm turbo run qa:static --parallel"
      - "cd mobile && STORYBOOK_BUILD=1 pnpm run build-storybook --output-dir=.storybook-static"
      - "CHROMATIC_PROJECT_TOKEN=$TOKEN STORYBOOK_BUILD=1 pnpm run chromatic -- --dry-run"
    coverage_expectations: "≥80% line / ≥70% branch on new preset/adapters"
    automation_notes: "Parser audit CLI runs in CI; artifacts stored under logs/storybook/."

  metrics:
    - metric: "chromatic_pipeline_success_rate"
      baseline_source: "scripts/ci/chromatic-report.mjs (new)"
      target: "≥98% successful runs during first 14 days"
      measurement_window: "2025-11-16 → 2025-11-30"
    - metric: "storybook_build_duration_p95"
      baseline_source: "GitHub Action storybook-web-audit job timing"
      target: "≤8 minutes"
      measurement_window: "Same as above"

  feedback_loop:
    owner: "Solo Maintainer"
    follow_up_date: "2025-11-29"
    planned_checks:
      - "Review Chromatic dashboard 48h post merge"
      - "Weekly parser audit review during dependency updates"
      - "Log retro summary in docs/pending/storybook-chromatic-blockers.md"
```

## 11. Implementation Scope & Tasking Decision

- **Complexity assessment:** Work touches four cohesive areas (Storybook Babel preset, parser audit CLI, NativeWind/Reanimated adapters, Chromatic workflow/docs). All changes land inside `mobile/storybook`, `scripts/storybook`, or docs, so dependency radius stays bounded and can be delivered in one pass.
- **Tasking decision:** No additional `.task` files or sub-tasks are required; this proposal plus the upcoming ADR remain the authoritative intent record while the LLM executes the implementation.
- **Fallback plan:** If preset/CLI efforts uncover deeper Babel or NativeWind regressions, split follow-up work into Part A (parser governance + audit) and Part B (Chromatic workflow/doc automation). At present the combined scope is tractable for a single implementation stream.

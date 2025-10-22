# TypeScript Standards (ISO/IEC 25010 Aligned)

**Purpose & Scope**

* Heuristics and review gates to maximize ISO/IEC 25010 maintainability: modularity, reusability, analyzability, modifiability, and testability.
* Applies to all TypeScript packages: backend Lambdas, mobile (Expo/React Native), and shared libraries. Complements standards in `standards/global.md`, `standards/cross-cutting.md`, `standards/testing-standards.md`, `standards/backend-tier.md`, and `standards/frontend-tier.md`.

## Tsconfig Baseline

* `strict: true`; `noUnusedLocals: true`; `noUnusedParameters: true` (underscore-escape allowed by ESLint for intentional ignores).
* `exactOptionalPropertyTypes: true` for production builds; tests may disable via a dedicated `tsconfig.jest.json` (see backend) to reduce friction for mocks.
* `noImplicitReturns: true`, `noFallthroughCasesInSwitch: true`, `noImplicitOverride: true`, `forceConsistentCasingInFileNames: true`.
* `skipLibCheck: true` accepted for build performance; do not use it to mask broken ambient types—raise a task to remediate upstream types.
* Use path aliases only at the package boundary (e.g., `@/` in mobile, `@backend/core` in backend). Cross-layer imports are blocked by dependency rules.

---

## Maintainability Pillars → Concrete Heuristics

### 1) Modularity

* Enforce vertical layering: screen → feature → shared UI → hooks (mobile) and controller → service/use case → port → adapter (backend). Domain and IO do not mix.
* Prefer small modules: ≤ 200 LOC per service/adapter, ≤ 75 LOC per handler; avoid cyclic deps (CI hard‑fails via dependency‑cruiser).
* One responsibility per file. If a module’s public API keeps growing, extract a new module rather than widening surfaces.
* No default exports in domain code; prefer named exports with a minimal public surface. Barrel files only at package root—never nest barrels that can create cycles.
* Keep DTOs and domain types separate. Map at the edge using explicit mappers.

### 2) Reusability

* Favor pure, parameterized utilities; avoid hidden state and ambient singletons. Inject dependencies via ports.
* Design with discriminated unions (`kind` or `type` tag) instead of boolean flags; expose stable, versioned DTOs from `shared`.
* Compose with functions/objects; avoid inheritance in application code except when required by frameworks.
* Prefer generic helpers with constrained type parameters over `any`; keep generic names descriptive (`TInput`, `TError`, `TResource`).
* Export narrow interfaces/types; keep implementation details internal. Use `satisfies` for config objects to preserve exactness while inferring constants.

### 3) Analyzability

* Strong typing everywhere: avoid `any`; prefer `unknown` + refinements; use `never` to prove exhaustiveness.
* Runtime schemas are mandatory at boundaries: Zod is SSOT; generate OpenAPI/types/clients from Zod (see `standards/shared-contracts-tier.md`).
* Typed errors and results: use `neverthrow` (`Result`/`ResultAsync`)—no exceptions for control flow. Encode `code`, `category`, and `cause`.
* Use TSDoc on exported APIs; keep 70%+ coverage for public surface (warn 60%, fail 50%) as per cross‑cutting standards.
* Keep logs typed: structure log/event shapes, include correlation/trace ids; never log secrets.

### 4) Modifiability

* Minimize coupling: depend on ports, not concrete providers; drive features behind edge‑level flags with expiry ≤ 90 days.
* Prefer additive changes: extend discriminated unions and config objects; avoid breaking field renames—add, deprecate, remove with playbooks.
* Keep constructors and function signatures stable; prefer options objects with `readonly` fields for forward compatibility.
* Keep side effects at the boundary; domain stays pure to reduce blast radius of change.

### 5) Testability

* Strive for ≥ 70% of domain code to be pure. Test pure units without mocks; test IO via adapters behind ports.
* Use generated clients/contracts in tests; never hand‑craft wire payloads.
* Property‑based tests are encouraged for pure logic (e.g., `fast-check`).
* Enforce coverage floors per tier (see `standards/testing-standards.md`); mutation score targets apply.

---

## Language & API Surface Rules

**Types vs Interfaces**

* Use `type` for unions, function signatures, and mapped/conditional types. Use `interface` for object shapes intended for extension via declaration merging (rare; prefer `type`).
* Do not prefix interfaces with `I`; use `PascalCase` for types/interfaces, `camelCase` for variables/functions.

**Discriminated Unions & Exhaustiveness**

* Model domain states with discriminated unions. Switches over tagged unions must be exhaustive with an `assertNever` helper.

**Immutability & Readonly**

* Use `as const`, `readonly` fields, and `ReadonlyArray<T>` for inputs and DTOs. Avoid mutating parameters—return new values.

**Nullish Strategy**

* Prefer `undefined` for optional properties and `null` only for tri‑state semantics; model absence explicitly with `Option` or a tagged union when useful.

**Async & Concurrency**

* Prefer `async/await` with `ResultAsync`; never float promises—`await` them or explicitly return.
* For parallelism, use `Promise.allSettled` with typed aggregation; cap concurrency for IO with small helpers (e.g., p‑limit) and emit trace spans.

**Error Handling**

* No thrown exceptions for expected cases; return `Result` with typed errors. Throw only for truly unrecoverable programmer errors, fail fast, and let the platform crash handlers capture.

**React/React Native**

* Component props are `Props`; never export default components. Keep hooks pure (no conditional hooks), and co-locate feature types next to the feature entry.

---

## Runtime Schemas & Contracts

* Zod schemas live in `shared`; backends and mobile import generated types and OpenAPI. Schemas are versioned and drive client regeneration.
* Validate all IO: API handlers, queue events, storage metadata. Map Zod issues to typed error codes.

---

## Naming, Files, and Layout

* File names `kebab-case.ts`. Types and interfaces co‑locate with their module; cross‑module types live under `types/`.
* Suffixes: `Port`, `Adapter`, `Service`, `UseCase`, `Dto`, `Schema`, `Props`.
* One `index.ts` barrel at package root; avoid multi‑level barrels.

---

## Tooling & Automation

* Lint: strict eslint + typescript‑eslint; forbid implicit `any`, default exports in domain modules, and cross‑layer imports (depcruise rules).
* Dead code: `ts-prune` and `knip` must be clean; zero unused exports/deps on PR.
* API surface: `api-extractor` on `shared` packages to detect accidental public API changes.
* Architecture: `dependency-cruiser` graph + forbidden rules enforced in CI.

---

## Fitness Gates (Executable Checks)

* Static: typecheck, eslint, depcruise, ts-prune, knip run via `pnpm turbo run qa:static --parallel`; artefacts are attached to the evidence bundle.
* Contracts: Zod/OpenAPI diff approved; RTK Query/clients regenerated and committed.
* Coverage: services/adapters ≥ 80% lines, ≥ 70% branches; mutation ≥ 60% now (80% target). Attach reports per `standards/testing-standards.md`.
* Complexity & size budgets: functions and modules must stay under published thresholds (`standards/cross-cutting.md`).
* TSDoc: exported APIs reach 70% coverage (warn 60%, fail 50%).
* Owner: Developer Experience Lead. Evidence: CI uploads static analysis, dep graphs, api-extractor report, and coverage/mutation dashboards.

---

## Reviewer Checklist (Paste in PRs)

- Maintains layer boundaries; no cross‑layer imports or cycles.
- Public API minimal and named exports only; barrels not nested.
- Strict typing upheld: no `any`; uses `unknown`+refinement or `Result` errors.
- Zod at boundaries; DTO ↔ domain mapping explicit and localized.
- Exhaustive switches over unions with `assertNever`.
- Functions small and focused; complexity within budgets; pure where possible.
- Tests cover pure logic without mocks; adapters tested via ports; contracts re‑generated.
- Evidence bundle attached (static analysis, dep graph, coverage, mutation, API report).

---

## Exceptions & ADRs

* Any deviation (e.g., class‑validator, default exports, disabling strict flags, skipping schema validation) requires an ADR, an entry in the Exception Registry with expiry ≤ 90 days, and links from the driving task and PR.


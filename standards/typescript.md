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
* Prefer small modules; avoid cyclic deps (CI hard‑fails via dependency‑cruiser). See `standards/cross-cutting.md` for complexity/LOC budgets.
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
* Use TSDoc on exported APIs; documentation coverage thresholds are defined in `standards/cross-cutting.md`.
* Keep logs typed: structure log/event shapes, include correlation/trace ids; never log secrets.

**Pure Functions & Purity Heuristics**

A function is **pure** when it satisfies all three criteria:
1. **Deterministic:** Same inputs always yield same outputs
2. **No side effects:** Does not mutate arguments, global/external state, or perform I/O (logging, network, file system, Date.now, Math.random)
3. **Referentially transparent:** Can be replaced with its return value without changing program behavior

**Pure in PhotoEditor context:**
- Zod schema transforms (`.transform()`, `.refine()` with pure predicates)
- DTO mappers and entity transformers (input object → new output object via spread/Object.assign)
- `Result.map()` / `.mapErr()` / `.andThen()` chains where all callbacks are pure
- Validation predicates and business rule functions
- Redux selectors (reselect) and derived state computations
- XState guards, conditions, and pure context updaters

**Impure (must isolate to adapters/ports/effect handlers):**
- OneTable CRUD operations (`.get()`, `.create()`, `.update()`, `.delete()`)
- AWS SDK calls, HTTP fetch, file system access
- Logger calls (`logger.info()`, `console.log()`)
- Non-deterministic sources: `Date.now()`, `Math.random()`, `crypto.randomUUID()`
- Mutations of function parameters or external variables

**Measuring purity:**
- Aim for ≥70% of domain code (services, reducers, selectors, mappers, validators) to be pure functions that can be tested with input/output assertions only (no mocks, no timers, no spies on external calls).
- Document impure boundaries explicitly: label ports, adapters, and effect handler modules.
- Reviewers should verify that domain logic files import zero I/O libraries (AWS SDK, fetch, fs, logger) and defer side effects to injected dependencies.

**Testing pure functions:**
- Unit tests should assert `f(input) === expectedOutput` without mocking.
- Impure functions under test require mocks/stubs for their I/O dependencies (via ports).
- If a test needs `jest.fn()`, `nock`, or `aws-sdk-client-mock`, the subject is impure.

See `docs/evidence/purity-immutability-gap-notes.md` for detailed analysis and `standards/backend-tier.md`, `standards/frontend-tier.md` for tier-specific patterns.

### 4) Modifiability

* Minimize coupling: depend on ports, not concrete providers; drive features behind edge‑level flags with expiry ≤ 90 days.
* Prefer additive changes: extend discriminated unions and config objects; avoid breaking field renames—add, deprecate, remove with playbooks.
* Keep constructors and function signatures stable; prefer options objects with `readonly` fields for forward compatibility.
* Keep side effects at the boundary; domain stays pure to reduce blast radius of change.

### 5) Testability

* Strive for ≥ 70% of domain code to be pure. Test pure units without mocks; test IO via adapters behind ports.
* Use generated clients/contracts in tests; never hand‑craft wire payloads.
* Property‑based tests are encouraged for pure logic (e.g., `fast-check`).
* Enforce coverage floors per tier (see `standards/testing-standards.md`).

---

## Language & API Surface Rules

**Types vs Interfaces**

* Use `type` for unions, function signatures, and mapped/conditional types. Use `interface` for object shapes intended for extension via declaration merging (rare; prefer `type`).
* Do not prefix interfaces with `I`; use `PascalCase` for types/interfaces, `camelCase` for variables/functions.

**Discriminated Unions & Exhaustiveness**

* Model domain states with discriminated unions. Switches over tagged unions must be exhaustive with an `assertNever` helper.

**Immutability & Readonly**

* Use `as const`, `readonly` fields, and `ReadonlyArray<T>` for inputs and DTOs. Avoid mutating parameters—return new values.

**Immutability Patterns by Context:**

*General rules:*
- Function parameters and DTO properties are `readonly` by default.
- Return new objects via spread (`{ ...obj, field: newValue }`), `Object.assign({}, ...)`, or builder functions.
- Never mutate arguments in-place; treat all inputs as immutable.

*Redux Toolkit (immer-powered reducers):*
- Write "mutating" syntax inside reducer cases; immer makes it immutable under the hood.
- Example: `state.jobs[id].status = 'completed'` is safe inside `createSlice` reducers.
- Outside reducers (selectors, utilities): use spread or `structuredClone` to avoid accidental mutation.

*RTK Query cache updates:*
- Use `api.util.updateQueryData` with immer draft for cache patches.
- Optimistic updates must clone/spread; never mutate query results directly.

*XState context updates:*
- Use `assign()` with pure updater functions that return new context slices.
- Guards and conditions are pure predicates; they read context but do not mutate.
- Actions triggering side effects (send, raise) are allowed, but context manipulation stays immutable.

*OneTable entities:*
- Fetch results are immutable snapshots; create new entity objects for updates.
- Mapper functions transforming DB format ↔ domain types use spread, not mutation.
- Domain logic on entities applies functional updates: `updateEntity = (e) => ({ ...e, field: newValue })`.

*neverthrow Result chains:*
- `.map()` and `.mapErr()` callbacks must return new values, not mutate captured variables.
- Chaining preserves immutability if all callbacks avoid side effects.

See `docs/evidence/purity-immutability-gap-notes.md` for rationale and `standards/backend-tier.md#domain-service-layer`, `standards/frontend-tier.md#state--logic-layer` for applied patterns.

**Unused Variables & Parameters**

* Prefix unused variables and parameters with underscore (`_`) to indicate intentional non-use. This satisfies both TypeScript's `noUnusedLocals`/`noUnusedParameters` and ESLint's `unused-imports/no-unused-vars` with `argsIgnorePattern: '^_'`.
* Common in stub/mock implementations where function signatures must match interfaces but parameters aren't needed in the stub body.
* Example: `async deactivateDeviceToken(_deviceId: string): Promise<Response> { ... }`

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

## Fitness Gates (Pointers Only)

- Commands: see `standards/qa-commands-ssot.md`.
- Coverage thresholds: see `standards/testing-standards.md`.
- Complexity/size budgets and hard‑fail controls: see `standards/cross-cutting.md`.
- Documentation coverage thresholds (TSDoc): see `standards/cross-cutting.md`.
- Evidence expectations: see the relevant tier standards and `standards/testing-standards.md`.

---

## Reviewer Checklist (Paste in PRs)

- Maintains layer boundaries; no cross‑layer imports or cycles.
- Public API minimal and named exports only; barrels not nested.
- Strict typing upheld: no `any`; uses `unknown`+refinement or `Result` errors.
- Zod at boundaries; DTO ↔ domain mapping explicit and localized.
- Exhaustive switches over unions with `assertNever`.
- Functions small and focused; complexity within budgets; pure where possible.
- Tests cover pure logic without mocks; adapters tested via ports; contracts re‑generated.
- Evidence bundle attached (static analysis, dep graph, coverage, API report).
- Prefix unused variables with underscore.

---

## Exceptions & ADRs

* Any deviation (e.g., class‑validator, default exports, disabling strict flags, skipping schema validation) requires an ADR, an entry in the Exception Registry with expiry ≤ 90 days, and links from the driving task and PR.

# Purity & Immutability Gap Analysis

**Purpose:** Catalogue existing purity and immutability guidance across standards files, identify gaps, and provide foundation for operational heuristics aligned with the PhotoEditor tech stack (neverthrow, Redux Toolkit, RTK Query, OneTable, XState).

**Created:** 2025-11-01
**Status:** Foundation for TASK-0813

---

## Current Guidance Inventory

### standards/typescript.md

**Section: 3) Analyzability**
- **Current:** "Typed errors and results: use `neverthrow` (`Result`/`ResultAsync`)—no exceptions for control flow."
- **Gap:** No concrete guidance on what makes a function "pure" in the context of neverthrow Result chains or how to structure immutable data flows when mapping between Results.

**Section: 2) Reusability**
- **Current:** "Favor pure, parameterized utilities; avoid hidden state and ambient singletons."
- **Gap:** Missing operational definition of "pure" tied to actual patterns in the codebase (e.g., Zod mappers, DTO transformations).

**Section: Immutability & Readonly**
- **Current:** "Use `as const`, `readonly` fields, and `ReadonlyArray<T>` for inputs and DTOs. Avoid mutating parameters—return new values."
- **Gap:** No examples showing immutable patterns with OneTable entities, Redux Toolkit state updates, or RTK Query cache manipulation.

**Section: 5) Testability**
- **Current:** "Strive for ≥ 70% of domain code to be pure. Test pure units without mocks; test IO via adapters behind ports."
- **Gap:** No guidance on measuring or verifying the "≥ 70% pure" target. What counts as "domain code" vs IO? How should reviewers assess this?

---

### standards/backend-tier.md

**Section: Domain Service Layer**
- **Current:** "DDD-lite: domain services with pure functions where possible."
- **Fitness Gate:** "Pure units (no I/O) ≥ 70% of domain code."
- **Gap:** No operational heuristics for:
  - What constitutes a "pure function" when using neverthrow Results
  - How to structure services to maximize purity when OneTable operations are present
  - How to test/measure the 70% threshold
  - Examples of pure vs impure service methods

**Section: Provider Integration Layer**
- **Current:** References adapters, ports, and Strategy pattern
- **Gap:** No guidance on keeping provider selection logic pure (policy/strategy objects should contain pure functions)

---

### standards/frontend-tier.md

**Section: State & Logic Layer**
- **Current:** "Redux Toolkit + RTK Query" with "Selector-first (reselect)"
- **Gap:** No explicit immutability patterns for:
  - Redux Toolkit slice reducers (immer usage vs explicit spread)
  - RTK Query cache updates and optimistic updates
  - XState statechart actions and guards (which should be pure)
  - How to keep selector logic pure and testable

**Section: Services & Integration Layer**
- **Current:** "Ports & Adapters (Hexagonal)" pattern mentioned
- **Gap:** No guidance on structuring port interfaces to enable pure domain logic while isolating platform effects (Expo APIs, file system)

---

### standards/cross-cutting.md

**Section: Maintainability & Change Impact**
- **Current:** Coverage thresholds reference testing-standards.md
- **Gap:** No evidence expectations specifically for purity/immutability (e.g., what artefacts should reviewers request to validate purity claims?)

---

## Identified Gaps Summary

1. **No operational definition of "pure function"** tied to PhotoEditor's stack:
   - How do neverthrow Results affect purity?
   - Are Zod schema definitions and mappers pure?
   - What about OneTable entity transformations?

2. **Missing immutability patterns for key libraries:**
   - Redux Toolkit slice reducers (immer conventions)
   - RTK Query optimistic updates and cache manipulation
   - XState statechart actions, guards, and context updates
   - OneTable entity updates and query result mapping

3. **No measurable criteria for "≥ 70% pure domain code":**
   - What counts as "domain code" vs infrastructure/IO?
   - How should this be measured or verified?
   - What evidence should reviewers expect?

4. **Lack of concrete examples:**
   - Pure service method with neverthrow
   - Pure Redux reducer using immer
   - Pure XState guard function
   - Pure Zod transformer/mapper
   - Immutable OneTable entity manipulation

5. **Missing reviewer guidance:**
   - What artefacts validate purity claims?
   - How to spot violations during code review?
   - Red flags indicating impure functions masquerading as pure

---

## Proposed Heuristics (To Be Documented)

### Pure Function Definition (TypeScript/neverthrow context)

A function is **pure** if:
1. **Deterministic:** Same inputs always produce same outputs
2. **No side effects:** Does not mutate arguments, external state, or perform I/O
3. **Referentially transparent:** Can be replaced with its return value without changing program behavior

**In PhotoEditor context:**
- ✅ **Pure:** Zod schema transforms, DTO mappers, Result.map/mapErr chains with pure callbacks
- ✅ **Pure:** Redux selectors, XState guards/predicates (no context mutation)
- ✅ **Pure:** Validation functions, entity transformers (input → new output)
- ❌ **Impure:** OneTable CRUD operations, SDK calls, logger calls, Date.now(), Math.random()
- ❌ **Impure:** Redux reducer if manually mutating state (immer proxy mutation is acceptable)
- ❌ **Impure:** XState actions that mutate context without returning new object

### Immutability Patterns by Library

**Redux Toolkit:**
- Use immer-powered reducers; write "mutating" code that immer makes immutable
- Never mutate state outside reducer; return new references in utility functions
- Selectors must be pure and not mutate derived data

**RTK Query:**
- Use updateQueryData with immer draft for cache updates
- Optimistic updates must clone/spread data, never mutate in-place

**XState:**
- Context updates via assign() with pure updater functions
- Guards and conditions are pure predicates
- Actions may trigger effects but context manipulation stays pure

**OneTable:**
- Entity fetch results are immutable; create new entities for updates
- Mapper functions from DB format → domain entity are pure
- Domain logic on entities uses spread/Object.assign, never direct mutation

**neverthrow:**
- Result.map/mapErr callbacks must be pure
- Chaining operations preserves purity if all callbacks are pure
- Side effects belong in final .match() or explicit effect functions

### Evidence Expectations

Reviewers should request:
1. **Test coverage report** showing ≥70% coverage of domain modules (services, reducers, selectors, mappers)
2. **Explicit tests** for pure functions without mocks (input/output assertions only)
3. **Documentation** of impure boundaries (ports, adapters, effect handlers)
4. **Code review checklist** confirming:
   - No Date.now(), Math.random(), console.log in domain functions
   - No mutation of function parameters
   - Redux reducers use immer correctly
   - XState guards/conditions are pure predicates
   - Zod transforms don't trigger side effects

---

## Next Steps (Per TASK-0813 Plan)

1. ✅ **Step 1 (This document):** Gap analysis complete
2. ✅ **Step 2:** Draft concrete heuristics into relevant standards sections
3. ✅ **Step 3:** Update cross-cutting.md with evidence expectations
4. ✅ **Step 4:** Self-review and align cross-references

---

## Implementation Summary (TASK-0813)

**Status:** COMPLETED
**Date:** 2025-11-01

All identified gaps have been addressed with concrete, operational heuristics:

### Changes Made

**standards/typescript.md**
- Added **Pure Functions & Purity Heuristics** subsection under Analyzability with:
  - Three-criteria definition of purity (deterministic, no side effects, referentially transparent)
  - PhotoEditor-specific examples of pure vs impure code (Zod, neverthrow, Redux, XState)
  - Measurement guidance: ≥70% domain code target with clear criteria
  - Testing approach differentiation (pure = no mocks, impure = mocked dependencies)
- Expanded **Immutability & Readonly** subsection with:
  - Context-specific patterns for Redux Toolkit, RTK Query, XState, OneTable, and neverthrow
  - Concrete examples showing safe immer usage vs explicit spread patterns
  - Cross-references to tier standards

**standards/backend-tier.md**
- Added **Purity & Immutability in Services** subsection under Domain Service Layer with:
  - Distinction between pure service methods (validation, rules, transformations) and impure orchestration
  - OneTable immutability patterns (treat entities as snapshots, functional updates)
  - Operational definition of the ≥70% pure threshold measurement
  - Testing guidance aligned with purity expectations
- Updated fitness gates to include purity ratio in evidence bundle

**standards/frontend-tier.md**
- Added **Purity & Immutability in State Management** subsection under State & Logic Layer with:
  - Redux Toolkit immer conventions and selector purity requirements
  - RTK Query cache update patterns (immer drafts, optimistic updates)
  - XState purity rules for guards/conditions/context updates
  - Measurement criteria for mobile state purity
- Added **Purity & Immutability in Services** subsection under Services & Integration Layer with:
  - Port interface purity expectations (platform-agnostic contracts)
  - Adapter isolation patterns
  - Service response immutability enforcement
- Updated fitness gates to include selector purity audit and port purity checks

**standards/cross-cutting.md**
- Added **Purity & Immutability Evidence Requirements** subsection under Maintainability & Change Impact with:
  - Tier-specific evidence artefacts for reviewers (backend, frontend, shared)
  - Code review checklist items for purity/immutability validation
  - Integration with existing evidence bundle framework
  - Cross-references to testing-standards.md and tier standards

### Cross-Reference Alignment

All updated sections include bidirectional cross-references:
- `standards/typescript.md` → references tier standards and gap notes
- `standards/backend-tier.md` → references typescript.md and gap notes
- `standards/frontend-tier.md` → references typescript.md, backend-tier.md, and gap notes
- `standards/cross-cutting.md` → references testing-standards.md, typescript.md, and tier standards
- Gap notes document → references all updated standards sections

### Terminology Consistency Verified

- "Pure function" definition is consistent across all files (deterministic, no side effects, referentially transparent)
- "Immutability" patterns use consistent language (spread, immer, readonly, functional updates)
- "Domain code" scoped consistently as services, reducers, selectors, mappers, validators
- "Evidence artefacts" terminology aligned with testing-standards.md framework

### Standards Governance Compliance

Per `standards/standards-governance-ssot.md`:
- Changes are normative updates (add missing operational definitions)
- No existing rules weakened; only clarifications and concrete examples added
- All changes cite relevant sections and maintain authoritative order
- Evidence requirements integrated with existing testing-standards.md framework
- No ADR required (editorial/clarification nature of changes)

---

## Standards Governance Alignment

This gap analysis follows `standards/standards-governance-ssot.md` by:
- Identifying where current standards lack operational guidance
- Proposing normative updates (heuristics) without weakening existing gates
- Planning evidence requirements aligned with solo-maintainer discipline
- Preparing concrete language for standards files rather than ad-hoc conventions

The implemented heuristics are normative updates that add missing operational definitions with proper citations and cross-references maintained throughout.

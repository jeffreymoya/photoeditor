# Proposal: Robust Network & Polling Test Infrastructure

**Status**: Draft - Under Critical Review
**Author**: Development Team
**Date**: 2025-10-31
**Last Updated**: 2025-10-31 (Critical Analysis Integrated)
**Related Documents**:
- `standards/testing-standards.md`
- `docs/tests/reports/2025-10-28-mobile-adapter-tests.log` (RCA evidence)
- `docs/tests/reports/2025-10-31-backend-test-implementation.md`

**⚠️ CRITICAL ANALYSIS FINDINGS**:
This proposal has been critically reviewed against the current implementation. See [Critical Analysis Results](#critical-analysis-results) for severity ratings and recommended adjustments before proceeding with implementation.

---

## Executive Summary

This proposal introduces a three-layer test infrastructure to eliminate flakiness and complexity in network and polling tests across the PhotoEditor monorepo. The infrastructure provides **deterministic, composable, self-documenting** test patterns that solve systemic issues identified in recent test failures.

**Key Problems Solved**:
- Mock lifecycle conflicts (13 test failures on 2025-10-28)
- Schema validation errors at runtime
- Non-deterministic timer control
- Complex test composition for multi-stage flows
- Inconsistent patterns across backend and mobile

**Expected Impact**:
- Test flakiness rate: <1% (down from ~40%)
- Test authoring time: <30 minutes (down from ~2 hours)
- Zero runtime schema validation errors
- 90% test pattern consistency across modules

---

## Critical Success Factors (Solo Developer Focus)

**Before implementing, understand these key pitfalls that will break the infrastructure:**

1. **⚠️ Unbound Method Trap**
   ```typescript
   // ❌ WRONG: Loses `this` context
   builder: Fixtures.Job.build

   // ✅ CORRECT: Arrow wrapper preserves context
   builder: (overrides) => Fixtures.Job.build(overrides)
   ```

2. **⚠️ Response Body Consumption**
   ```typescript
   // ❌ WRONG: Body consumed on first read, maxCalls > 1 fails
   response: schemaSafeResponse({...})

   // ✅ CORRECT: Function returns fresh Response each time
   response: () => schemaSafeResponse({...})
   ```

3. **⚠️ Shallow Merge Limitation**
   - `build()` uses shallow merge; nested overrides require `buildNested()` or full reconstruction
   - Document this clearly in infrastructure README to avoid frustration

4. **⚠️ Realistic Timeline**
   - Phase 1 is 2 weeks, not 1 (accounts for edge case discovery)
   - Validate FetchScenario with real migrations before building PollingOrchestrator
   - Patterns are examples, not rigid templates—adapt as needed

**Goal**: Invest time upfront to build bulletproof infrastructure, then write tests confidently without fighting edge cases.

---

## Table of Contents

1. [Critical Analysis Results](#critical-analysis-results) ⚠️ **READ FIRST**
2. [Problem Statement](#1-problem-statement)
3. [Root Cause Analysis](#2-root-cause-analysis)
4. [Proposed Solution](#3-proposed-solution)
5. [Architecture](#4-architecture)
6. [Implementation Details](#5-implementation-details)
7. [Usage Examples](#6-usage-examples)
8. [Migration Plan](#7-migration-plan)
9. [Success Metrics](#8-success-metrics)
10. [Alternatives Considered](#9-alternatives-considered)
11. [Risks & Mitigations](#10-risks--mitigations)
12. [References](#11-references)

---

## Critical Analysis Results

**Date**: 2025-10-31
**Methodology**: Comparative analysis of proposal vs. current implementation in `mobile/src/services/__tests__/`
**Overall Effectiveness Rating**: **6.2/10**

### Executive Verdict

The proposal solves **real, high-severity problems** (mock lifecycle conflicts) but introduces **unnecessary complexity** in Layer 2 and **underestimates adoption risks** for a solo developer. **Recommended path**: Adopt Layer 1 with modifications, skip/defer Layer 2, simplify Layer 3.

---

### Problems Assessment

| Problem | Severity | Current State | Analysis |
|---------|----------|---------------|----------|
| **Mock Lifecycle Conflicts** | 🔴 **CRITICAL** | Confirmed at `adapter.test.ts:461-473` | `createPollingScenario()` calls `mockImplementation()` which wipes `mockResolvedValueOnce()` chains. **Real and significant.** |
| **Incomplete Schema Fixtures** | 🟢 **LOW** | Already solved by `buildJob()` at `stubs.ts:55-66` | Current builders provide complete defaults, merged via spread. **Problem overstated** - existing `schemaSafeResponse()` pattern works. |
| **Timer Control Fragmentation** | 🟡 **MEDIUM** | `advanceTimersUntilSettled()` is well-designed | Magic numbers exist but current helper is reasonable. **Problem overstated** - patterns could be more declarative but not broken. |
| **Test Composition Complexity** | 🟡 **MEDIUM** | 52-line tests in adapter.test.ts | Symptom of mock lifecycle issue, not root cause. **Real but solvable** without full rewrite. |

### Layer-by-Layer Ratings

#### Layer 1: FetchScenario (Mock Lifecycle Manager)
**Effectiveness: 8/10** | **Complexity: 6/10** | **Recommendation: ✅ ADOPT WITH MODIFICATIONS**

**Strengths:**
- ✅ Solves real FIFO stage evaluation problem
- ✅ Diagnostic API (`getCallCounts()`, `assertStageCalled()`) improves debuggability
- ✅ Clear error messages for unmatched requests

**Critical Issues:**
- 🔴 **Unbound Method Trap** (lines 37-43): Easy to miss, causes silent runtime failures. **MUST add ESLint rule in Phase 1, not Phase 4**
- ⚠️ **Complexity vs. Benefit**: 200+ LOC vs. 30 LOC current implementation
- ⚠️ **Learning Curve**: Departure from Jest's familiar patterns

**Required Modifications:**
1. Add ESLint rule enforcing arrow wrappers: `builder: (o) => Fixtures.Job.build(o)`
2. Add TypeScript constraint: `type BuilderFn<T> = (overrides?: Partial<T>) => T;`
3. Validate with 3+ pilot migrations before proceeding to Layer 2/3

#### Layer 2: FixtureBuilder (Schema-Complete Fixtures)
**Effectiveness: 6/10** | **Complexity: 4/10** | **Recommendation: ⚠️ DEFER OR SKIP**

**Strengths:**
- ✅ Type safety with TypeScript + Zod
- ✅ Build-time validation catches errors early
- ✅ Extensibility via `extend()` method

**Critical Issues:**
- 🔴 **Duplicate Effort**: Current `buildJob()` + `schemaSafeResponse()` already solve this (stubs.ts:38-243)
  - Proposal adds **500 LOC** for functionality in **~100 LOC**
  - Cost/benefit ratio: **3/10**
- ⚠️ **Shallow Merge Footgun**: Developers must remember `build()` vs. `buildNested()` - no static analysis
- ⚠️ **Performance Overhead**: Zod `.parse()` on every `build()` (~1ms × 1000 fixtures = 1s overhead)
- 🔴 **Timestamp Determinism**: Hardcodes `2025-10-31` (line 781) - will become stale vs. current `isoNow()`

**Alternative (Recommended):**
Enhance existing builders instead of replacing:
```typescript
// Add validation to current pattern - 90% benefit, 10% effort
export function buildJob(overrides: Partial<Job> = {}): Job {
  const merged = { ...defaults, ...overrides };
  return JobSchema.parse(merged); // ← Add this line
}
```

#### Layer 3: PollingOrchestrator (Declarative Scenarios)
**Effectiveness: 7/10** | **Complexity: 5/10** | **Recommendation: ✅ ADOPT SIMPLIFIED**

**Strengths:**
- ✅ Time-based state machine (elapsed time, not call counts)
- ✅ Composable via `getScenario()` for non-polling stages
- ✅ Self-documenting timeline structure

**Critical Issues:**
- ⚠️ **Depends on Layer 1**: Inherits all `FetchScenario` complexity
- 🔴 **Builder Function Trap**: Same unbound method risk as Layer 1 (duplicate documentation = error-prone pattern)
- ⚠️ **Pattern Library Limited**: Explicitly "examples to copy" (line 1111), not reusable libraries
  - Solo dev must fork/customize for each test
  - ~300 LOC maintenance burden as job lifecycle evolves
- 🔴 **Timeline Validation Cost**: All states validated at setup (fail-fast) - for 100+ state timelines, 100ms+ overhead

**Modifications:**
1. Simplify pattern library: provide 3-5 canonical examples, not 12+ variations
2. Add lazy validation flag for performance-critical tests
3. Code-generate patterns from JSON schemas (reduce maintenance)

---

### Critical Risks (Must Address)

#### 🔴 CRITICAL: Unbound Method Context Loss
**Impact**: HIGH | **Likelihood**: HIGH | **Lines**: 37-43, 908-918

**Risk**: Developers forget arrow wrappers → silent runtime failures
```typescript
// ❌ Compiles but fails at runtime
builder: Fixtures.Job.build

// ✅ Required pattern
builder: (overrides) => Fixtures.Job.build(overrides)
```

**Mitigation**:
- Move ESLint rule to **Phase 1** (not Phase 4 as currently planned at lines 1833-1836)
- Add type constraint: `type BuilderFn<T> = (o?: Partial<T>) => T` (forces arrow syntax)
- Gate Phase 2/3 on ESLint rule validation

#### 🔴 CRITICAL: Duplicate Complexity, Low ROI
**Impact**: HIGH | **Likelihood**: CERTAIN

**Finding**: Layer 2 (FixtureBuilder) reimplements existing functionality:
- Current: `buildJob()` + `schemaSafeResponse()` in ~100 LOC (stubs.ts:38-243)
- Proposed: `FixtureBuilder` class in ~500 LOC (proposal lines 570-868)
- Marginal benefit: Build-time validation (already achievable with 1-line addition)

**Cost**: 500 LOC maintenance burden for solo developer

**Recommendation**: **SKIP LAYER 2 ENTIRELY** or defer until post-migration metrics prove need

#### ⚠️ HIGH: No Incremental Adoption Path
**Impact**: MEDIUM | **Likelihood**: HIGH

**Risk**: Proposal requires 6-week all-or-nothing migration
- If Phase 1 encounters blockers, no fallback to current patterns
- Tests cannot mix old/new patterns during transition

**Mitigation**:
1. Make Layer 1 **standalone** (doesn't require Layer 2/3)
2. Add feature flag: `USE_LEGACY_POLLING_HELPERS` for gradual rollout
3. Allow test coexistence during Weeks 1-4

#### ⚠️ HIGH: Timeline Underestimation
**Impact**: MEDIUM | **Likelihood**: HIGH

**Proposed**: 6 weeks (Phases 1-4)
**Realistic**: 8-10 weeks for solo developer with:
- Edge case discovery (unbound methods, Response body consumption)
- Pattern library maintenance (staleness as job lifecycle evolves)
- Enforcement tooling (ESLint rules, pre-commit hooks)

**Current Timeline**: Lines 1736-1856 (Phases 1-4)
**Adjustment**: See revised timeline below

---

### Revised Recommendations

#### Option A: Incremental Enhancement (⭐ RECOMMENDED)
**Timeline**: 2 weeks | **Cost**: ~150 LOC | **Benefit**: 75% of proposal value

**Week 1: Fix Mock Lifecycle Conflict**
```typescript
// Enhance createPollingScenario() with prePollStages
createPollingScenario({
  prePollStages: [
    { matcher: presignMatcher, response: presignResponse },
    { matcher: s3Matcher, response: s3Response },
  ],
  pollingMatcher: statusMatcher,
  timeline: [...],
});
```
Cost: ~50 LOC modification to `testUtils.ts`

**Week 2: Validation + Patterns**
- Add Zod validation to existing builders (1 line per builder)
- Create `PollingPatterns` as reusable functions (not classes)
- Add ESLint rule for arrow wrapper enforcement
- Cost: ~100 LOC additions

**Benefits:**
- ✅ Solves core problems (mock conflicts, schema validation)
- ✅ Minimal disruption (backward compatible)
- ✅ 75% of proposal benefits at 25% of cost
- ✅ No migration required

#### Option B: Adopt Layer 1 Only
**Timeline**: 3 weeks | **Cost**: ~300 LOC | **Benefit**: 50% of proposal value

1. Implement `FetchScenario` per proposal (Week 1-2)
2. Skip `FixtureBuilder` - enhance existing builders (Week 2)
3. Skip `PollingOrchestrator` - use `FetchScenario` + `advanceTimersUntilSettled()`

**Benefits:**
- ✅ Solves mock lifecycle completely
- ✅ Diagnostic API for debugging
- ⚠️ Requires learning new API
- ⚠️ Unbound method trap remains

#### Option C: Full Proposal with Modifications
**Timeline**: 4 weeks (vs. 6 weeks original) | **Cost**: ~600 LOC | **Benefit**: 80% of proposal value

**Week 1: Layer 1 + ESLint (MUST DO TOGETHER)**
- Implement `FetchScenario`
- **Add ESLint rule immediately** (not Phase 4)
- Type constraint: `type BuilderFn<T>`
- Validate with 2-3 pilot migrations

**Week 2: Enhance Existing Builders (SKIP LAYER 2 CLASS)**
- Add Zod validation to current builders
- Skip `FixtureBuilder` class entirely
- Saves 500 LOC maintenance

**Week 3: Layer 3 Simplified**
- Implement `PollingOrchestrator` without full pattern library
- Provide 3-5 canonical examples (not 12+)
- Add patterns **only when 3+ tests duplicate same timeline**

**Week 4: Migration + Docs**
- Migrate highest-priority tests (adapter.test.ts)
- Document decision tree for API selection
- Metrics validation

**Benefits:**
- ✅ Solves all real problems
- ✅ Reduces complexity by 40%
- ✅ ESLint rules prevent mistakes early
- ✅ Manageable for solo developer

---

### Decision Matrix

| Criterion | Option A (Incremental) | Option B (Layer 1 Only) | Option C (Modified Full) | Original Proposal |
|-----------|------------------------|------------------------|--------------------------|-------------------|
| **Timeline** | 2 weeks ⭐ | 3 weeks | 4 weeks | 6 weeks ❌ |
| **LOC Added** | 150 ⭐ | 300 | 600 | 1150 ❌ |
| **Solves Mock Conflicts** | ✅ | ✅ | ✅ | ✅ |
| **Schema Validation** | ✅ | ✅ | ✅ | ✅ |
| **Diagnostic API** | ⚠️ Basic | ✅ Full | ✅ Full | ✅ Full |
| **Learning Curve** | Low ⭐ | Medium | Medium-High | High ❌ |
| **Maintenance Burden** | Low ⭐ | Medium | Medium | High ❌ |
| **Migration Required** | None ⭐ | Minimal | Moderate | Extensive ❌ |
| **Risk Level** | Low ⭐ | Medium | Medium | High ❌ |

### Final Recommendation

**Adopt Option C (Full Proposal with Modifications)** with the following non-negotiable requirements:

1. **ESLint rule in Week 1** (not Week 6) - block Layer 2/3 until enforced
2. **Skip FixtureBuilder class** - enhance existing builders instead (saves 500 LOC)
3. **Simplify pattern library** - 3-5 examples, not 12+ (saves 200 LOC)
4. **Incremental rollout** - feature flag for coexistence of old/new patterns
5. **Pilot validation** - 3 test migrations before full Layer 1 adoption

**If Week 1 ESLint rule is not implemented, escalate to Option A (Incremental) instead.**

---

## 1. Problem Statement

### 1.1 Current State

PhotoEditor's test suite exhibits systematic flakiness in tests involving:
- Network calls with retry/circuit breaker policies (cockatiel)
- Polling loops with fake timer control (Jest)
- Multi-stage workflows (presign → upload → poll → complete)
- Schema validation at API boundaries (Zod)

**Evidence from Recent Failures** (`2025-10-28-mobile-adapter-tests.log`):
- 13 of 32 tests failed (40.6% failure rate)
- 5 tests timed out after 5 seconds
- 7 tests failed with Zod validation errors
- Test coverage dropped to 9.14% (target: 70%+)

### 1.2 Business Impact

**Development Velocity**:
- Engineers spend 2+ hours debugging flaky tests
- CI/CD pipelines blocked by non-deterministic failures
- False positives erode trust in test suite

**Quality Confidence**:
- Low coverage of polling/retry logic (high-risk paths)
- Production bugs in error handling discovered post-deployment
- Manual testing required to validate network resilience

**Maintenance Burden**:
- Each test reinvents polling/mocking patterns
- Knowledge silos (only 1-2 engineers can debug tests)
- Tech debt accumulates as tests become "too hard to fix"

### 1.3 Constraints

Per `standards/testing-standards.md`:
- ✅ No network calls to real services
- ✅ No sleep-based polling (fake timers required)
- ✅ Mock external dependencies locally
- ✅ Services/Adapters: ≥70% line coverage, ≥60% branch coverage
- ✅ Zod validation at all boundaries

---

## 2. Root Cause Analysis

### 2.1 Mock Lifecycle Conflicts

**Problem**: `mockImplementation()` overwrites `mockResolvedValueOnce()` chains.

**Example** (from `upload/adapter.test.ts:461-491`):
```typescript
// Setup phase 1: Chain specific responses
mockFetch
  .mockResolvedValueOnce(presignResponse)  // ← Presign call
  .mockResolvedValueOnce(blobResponse)     // ← Image fetch
  .mockResolvedValueOnce(s3Response);      // ← S3 upload

// Setup phase 2: Configure polling scenario
createPollingScenario({
  fetchMock: mockFetch,
  // This calls: mockFetch.mockImplementation(...)
  // ☠️ WIPES OUT THE CHAINED RESPONSES ABOVE
});

// Result: presign/blob/S3 calls fall through to polling matcher
// → 5-second timeout because polling never starts
```

**Root Cause**: Jest mock functions have **destructive** API - later calls replace earlier configuration.

### 2.2 Incomplete Schema Fixtures

**Problem**: Tests provide partial objects; Zod validation fails at runtime.

**Example** (from `upload/adapter.test.ts:583`):
```typescript
// Test provides minimal state
timeline: [{ jobId: mockJobId, status: 'PROCESSING' }]

// JobSchema requires (from shared/schemas/job.ts):
{
  jobId: string;      // ✅ Provided
  userId: string;     // ❌ MISSING
  status: JobStatus;  // ✅ Provided
  createdAt: string;  // ❌ MISSING
  updatedAt: string;  // ❌ MISSING
  locale: Locale;     // ❌ MISSING
}

// Result: ZodError at adapter.ts:200 when parsing response
// → Test fails with cryptic "Required" errors
```

**Root Cause**: No compile-time enforcement of schema completeness in test fixtures.

### 2.3 Timer Control Fragmentation

**Problem**: Inconsistent patterns for advancing fake timers.

**Patterns Found**:
```typescript
// Pattern A: Manual advancement with magic numbers
await jest.advanceTimersByTimeAsync(5000);
await jest.advanceTimersByTimeAsync(5000);
// Problem: Brittle, depends on implementation details

// Pattern B: Helper with hardcoded cycles
await advanceTimersUntilSettled(promise, { maxCycles: 130 });
// Problem: Why 130? Trial and error tuning

// Pattern C: Loop until settled
for (let i = 0; i < maxAttempts; i++) {
  await jest.advanceTimersByTimeAsync(pollInterval);
  if (settled) break;
}
// Problem: Copy-pasted in every test
```

**Root Cause**: No declarative abstraction for "advance time until state X occurs".

### 2.4 Test Composition Complexity

**Problem**: Multi-stage flows require intricate mock orchestration.

**Example** (typical processImage test setup):
```typescript
// Stage 1: Presign (lines 461-470) - 10 lines
mockFetch.mockResolvedValueOnce(schemaSafeResponse({ ... }));

// Stage 2: Blob fetch (lines 471-472) - 2 lines
mockFetch.mockResolvedValueOnce(createMockResponse({ ... }));

// Stage 3: S3 upload (line 473) - 1 line
mockFetch.mockResolvedValueOnce(createMockResponse({ ... }));

// Stage 4: Polling setup (lines 475-491) - 17 lines
createPollingScenario({ ... });

// Stage 5: Progress callback tracking (lines 493-494) - 2 lines
const progressCalls: number[] = [];
const onProgress = jest.fn((progress) => progressCalls.push(progress));

// Stage 6: Execute (lines 496-502) - 7 lines
const processPromise = adapter.processImage(...);
const result = await advanceTimersUntilSettled(processPromise, { ... });

// Stage 7: Assertions (lines 504-508) - 5 lines
expect(result).toContain(...);
expect(onProgress).toHaveBeenCalled();
expect(progressCalls).toEqual(...);

// Total: 44 lines per test (excluding describe/it boilerplate)
```

**Root Cause**: No reusable abstractions for common patterns (presign-upload-poll).

---

## 3. Proposed Solution

### 3.1 Solution Overview

Introduce a **three-layer test infrastructure** that separates concerns:

```
┌─────────────────────────────────────────────────────────────┐
│ Layer 3: Test Orchestrators (Declarative Scenarios)        │
│ - PollingOrchestrator: State progression over time         │
│ - MultiStageOrchestrator: Compose complex flows            │
│ - Pattern Library: Reusable scenario templates             │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 2: Schema-Complete Fixtures (Build Time Validation)  │
│ - FixtureBuilder: Type-safe builders with Zod validation   │
│ - Fixtures: Pre-configured builders for common types       │
│ - Extension API: Test-specific fixture variants            │
└─────────────────────────────────────────────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Layer 1: Mock Lifecycle Manager (Composable Stages)        │
│ - FetchScenario: Multi-stage fetch mock without conflicts  │
│ - Stage Registry: FIFO matcher evaluation                  │
│ - Diagnostic API: Call counts, assertions, error messages  │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 Design Principles

1. **Deterministic Time Control**: All async operations use fake timers with declarative advancement
2. **Complete Schemas**: All mock data validated against Zod schemas at build time
3. **Declarative Scenarios**: Tests describe "what happens when" not "how to mock it"
4. **Composable Stages**: Network call mocks compose without lifecycle conflicts
5. **Self-Documenting**: Test structure reveals intent without deep code diving
6. **Fail Fast**: Validation errors caught at test setup time, not runtime
7. **DRY Patterns**: Common scenarios (timeout, retry, typical polling) reusable

### 3.3 Success Criteria

**Functional**:
- ✅ Zero mock lifecycle conflicts
- ✅ Zero runtime Zod validation errors in tests
- ✅ All polling tests deterministic (<1% flakiness)
- ✅ Multi-stage flows composable in <50 lines

**Non-Functional**:
- ✅ Test authoring time: <30 minutes for new polling test
- ✅ Test debugging time: <15 minutes (down from 2+ hours)
- ✅ 90% pattern adoption across backend and mobile by EOQ
- ✅ Coverage: 70%+ for services/adapters with polling logic

---

## 4. Architecture

### 4.1 Layer 1: FetchScenario (Mock Lifecycle Manager)

**Responsibility**: Manage fetch mock lifecycle with composable stages.

**API Design**:
```typescript
class FetchScenario {
  // Register a stage that handles specific requests
  stage(options: {
    name: string;
    matcher: (input: RequestInfo | URL, init?: RequestInit) => boolean;
    response: Response | ((input, init) => Response);
    maxCalls?: number; // Undefined = unlimited
  }): this;

  // Apply scenario to a jest mock
  apply(mockFetch: jest.MockedFunction<typeof fetch>): void;

  // Diagnostics
  getCallCounts(): Record<string, number>;
  assertStageCalled(stageName: string, expectedCalls: number): void;
}
```

**Key Innovation**: FIFO stage evaluation with explicit exhaustion handling.

**Implementation Strategy**:
- Stages evaluated in registration order
- First matching stage handles the request
- Stages with `maxCalls` skip after exhaustion
- Clear error messages when no stage matches

**File Location**: `mobile/src/services/__tests__/support/fetch-scenario.ts`

### 4.2 Layer 2: FixtureBuilder (Schema-Complete Fixtures)

**Responsibility**: Generate schema-complete test fixtures with build-time validation.

**API Design**:
```typescript
class FixtureBuilder<TSchema extends ZodTypeAny> {
  constructor(
    private schema: TSchema,
    private defaults: z.infer<TSchema>
  );

  // Build with type-safe overrides
  build(overrides?: Partial<z.infer<TSchema>>): z.infer<TSchema>;

  // Create derived builder with extended defaults
  extend(additionalDefaults: Partial<z.infer<TSchema>>): FixtureBuilder<TSchema>;
}

// Pre-configured instances
const Fixtures = {
  Job: new FixtureBuilder(JobSchema, { ...completeDefaults }),
  BatchJob: new FixtureBuilder(BatchJobSchema, { ...completeDefaults }),
  PresignUploadResponse: new FixtureBuilder(PresignUploadResponseSchema, { ...completeDefaults }),
  // ... etc
};
```

**Key Innovation**: Validation at build time throws clear errors with diff.

**Implementation Strategy**:
- Merge defaults with overrides
- Validate via Zod `parse()` (not `safeParse`)
- On error: show defaults, overrides, and missing fields
- TypeScript ensures type safety of overrides

**File Location**: `mobile/src/services/__tests__/support/fixtures.ts`

### 4.3 Layer 3: PollingOrchestrator (Declarative Scenarios)

**Responsibility**: Orchestrate polling tests with time-based state progression.

**API Design**:
```typescript
class PollingOrchestrator<TState extends ZodTypeAny> {
  constructor(options: {
    endpoint: string | RegExp;
    schema: TState;
    pollInterval: number;
  });

  // Define state progression over time
  defineTimeline(states: Array<{
    afterMs: number;
    state: Partial<z.infer<TState>> | z.infer<TState>;
  }>): this;

  // Run test with automatic timer advancement
  async run<T>(
    mockFetch: jest.MockedFunction<typeof fetch>,
    executeFn: () => Promise<T>
  ): Promise<T>;

  // Access underlying FetchScenario for additional stages
  getScenario(): FetchScenario;
}
```

**Key Innovation**: State machine driven by elapsed time, not call counts.

**Implementation Strategy**:
- Timeline validated at setup (fail fast on incomplete states)
- Fetch responses determined by elapsed time (cycles × pollInterval)
- Integrates with `advanceTimersUntilSettled` helper
- Exposes underlying `FetchScenario` for non-polling stages

**File Location**: `mobile/src/services/__tests__/support/polling-orchestrator.ts`

---

## 5. Implementation Details

### 5.1 Layer 1: FetchScenario Implementation

```typescript
/**
 * mobile/src/services/__tests__/support/fetch-scenario.ts
 *
 * Staged fetch mock manager that solves lifecycle conflicts.
 *
 * Per standards/testing-standards.md:
 * - Mock external dependencies using locally defined stubs
 * - Keep assertions focused on observable behavior
 */

export interface FetchStage {
  name: string;
  matcher: (input: RequestInfo | URL, init?: RequestInit) => boolean;
  handler: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
  callCount: number;
  maxCalls?: number;
}

export class FetchScenario {
  private stages: FetchStage[] = [];

  /**
   * Register a stage that handles specific requests.
   * Stages are evaluated in FIFO order.
   *
   * IMPORTANT: If using a Response object with maxCalls > 1, use a function
   * to return fresh Response instances. Response bodies can only be consumed once.
   *
   * @example
   * // ✅ Correct: Function returns new Response each time
   * scenario.stage({
   *   name: 'presign-request',
   *   matcher: (input) => String(input).includes('/presign'),
   *   response: () => schemaSafeResponse({...}),
   *   maxCalls: 3,
   * });
   *
   * // ❌ Wrong: Same Response reused (body consumed on first read)
   * scenario.stage({
   *   name: 'presign-request',
   *   matcher: (input) => String(input).includes('/presign'),
   *   response: schemaSafeResponse({...}),
   *   maxCalls: 3, // Calls 2-3 will fail
   * });
   */
  stage(options: {
    name: string;
    matcher: (input: RequestInfo | URL, init?: RequestInit) => boolean;
    response: Response | ((input: RequestInfo | URL, init?: RequestInit) => Response);
    maxCalls?: number;
  }): this {
    const handler = typeof options.response === 'function'
      ? async (input, init) => options.response(input, init)
      : async () => options.response;

    this.stages.push({
      name: options.name,
      matcher: options.matcher,
      handler,
      callCount: 0,
      maxCalls: options.maxCalls,
    });

    return this; // Fluent interface
  }

  /**
   * Apply this scenario to a jest mock.
   * Replaces any existing mock implementation.
   */
  apply(mockFetch: jest.MockedFunction<typeof fetch>): void {
    mockFetch.mockImplementation(async (input, init) => {
      // Evaluate stages in registration order
      for (const stage of this.stages) {
        if (stage.matcher(input, init)) {
          // Check if stage is exhausted
          if (stage.maxCalls !== undefined && stage.callCount >= stage.maxCalls) {
            continue; // Try next stage
          }

          stage.callCount++;
          return stage.handler(input, init);
        }
      }

      // No stage matched - provide diagnostic error
      const url = String(input);
      const method = (init?.method || 'GET').toUpperCase();
      const stageSummary = this.stages
        .map(s => `  - ${s.name}: ${s.callCount}/${s.maxCalls ?? '∞'} calls`)
        .join('\n');

      throw new Error(
        `FetchScenario: No stage matched ${method} ${url}\n` +
        `Registered stages:\n${stageSummary}\n\n` +
        `Hint: Add a stage with matcher that handles this URL.`
      );
    });
  }

  /**
   * Get call counts for all stages (useful for assertions).
   */
  getCallCounts(): Record<string, number> {
    return Object.fromEntries(
      this.stages.map(s => [s.name, s.callCount])
    );
  }

  /**
   * Assert that a stage was called the expected number of times.
   * Throws if assertion fails.
   */
  assertStageCalled(stageName: string, expectedCalls: number): void {
    const stage = this.stages.find(s => s.name === stageName);
    if (!stage) {
      const availableStages = this.stages.map(s => s.name).join(', ');
      throw new Error(
        `FetchScenario: Stage "${stageName}" not found. Available stages: ${availableStages}`
      );
    }

    if (stage.callCount !== expectedCalls) {
      throw new Error(
        `FetchScenario: Expected stage "${stageName}" to be called ${expectedCalls} times, ` +
        `but it was called ${stage.callCount} times.`
      );
    }
  }

  /**
   * Reset all call counts (useful for beforeEach hooks).
   */
  reset(): void {
    for (const stage of this.stages) {
      stage.callCount = 0;
    }
  }

  /**
   * Get diagnostic summary (useful for debugging).
   */
  getSummary(): string {
    return this.stages
      .map(s => `${s.name}: ${s.callCount}/${s.maxCalls ?? '∞'} calls`)
      .join(', ');
  }
}
```

### 5.2 Layer 2: FixtureBuilder Implementation

```typescript
/**
 * mobile/src/services/__tests__/support/fixtures.ts
 *
 * Schema-complete fixture builders with build-time validation.
 *
 * Per standards/testing-standards.md:
 * - Build responses through shared factories and wrap with schemaSafeResponse
 * - Zod-boundaries never see schema-incomplete payloads
 */

import { z, type ZodTypeAny, ZodError } from 'zod';
import {
  JobSchema,
  BatchJobSchema,
  PresignUploadResponseSchema,
  BatchUploadResponseSchema,
  DeviceTokenResponseSchema,
} from '@photoeditor/shared';

/**
 * Generic fixture builder that enforces schema completeness at build time.
 *
 * @example
 * const builder = new FixtureBuilder(JobSchema, {
 *   jobId: 'default-job',
 *   userId: 'default-user',
 *   // ... all required fields
 * });
 *
 * const job1 = builder.build(); // Uses defaults
 * const job2 = builder.build({ status: 'COMPLETED' }); // Override specific fields
 */
export class FixtureBuilder<TSchema extends ZodTypeAny> {
  constructor(
    private readonly schema: TSchema,
    private readonly defaults: z.infer<TSchema>
  ) {
    // Validate defaults at construction time
    try {
      this.schema.parse(this.defaults);
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues.map(i => `  - ${i.path.join('.')}: ${i.message}`);
        throw new Error(
          `FixtureBuilder: Invalid defaults for schema\n${issues.join('\n')}`
        );
      }
      throw error;
    }
  }

  /**
   * Build a fixture with type-safe overrides.
   * Validates during test execution (not at suite compilation time).
   *
   * NOTES:
   * - Uses shallow merge. For nested objects/arrays, use buildNested()
   *   or provide complete nested structures in overrides.
   * - Zod validation runs on every call (~1ms per object). For test suites
   *   building hundreds of fixtures, consider caching results or using
   *   pre-built fixtures for performance-critical scenarios.
   *
   * @throws {Error} If merged data fails schema validation, with detailed diagnostics
   */
  build(overrides?: Partial<z.infer<TSchema>>): z.infer<TSchema> {
    const merged = { ...this.defaults, ...overrides };

    try {
      return this.schema.parse(merged);
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues.map(i =>
          `  - ${i.path.join('.')}: ${i.message} (expected: ${i.expected}, received: ${i.received})`
        );

        // Calculate what's missing
        const missingFields = error.issues
          .filter(i => i.code === 'invalid_type' && i.received === 'undefined')
          .map(i => i.path.join('.'));

        throw new Error(
          `FixtureBuilder.build() validation failed:\n\n` +
          `Issues:\n${issues.join('\n')}\n\n` +
          (missingFields.length > 0
            ? `Missing required fields: ${missingFields.join(', ')}\n\n`
            : '') +
          `Defaults:\n${JSON.stringify(this.defaults, null, 2)}\n\n` +
          `Overrides:\n${JSON.stringify(overrides || {}, null, 2)}\n\n` +
          `Hint: Ensure all required fields are provided in defaults or overrides.`
        );
      }
      throw error;
    }
  }

  /**
   * Create a new builder with extended defaults.
   * Useful for test-specific fixture variants.
   *
   * @example
   * const completedJobBuilder = Fixtures.Job.extend({ status: 'COMPLETED' });
   * const job1 = completedJobBuilder.build({ jobId: 'job-1' });
   * const job2 = completedJobBuilder.build({ jobId: 'job-2' });
   */
  extend(additionalDefaults: Partial<z.infer<TSchema>>): FixtureBuilder<TSchema> {
    return new FixtureBuilder(
      this.schema,
      { ...this.defaults, ...additionalDefaults }
    );
  }

  /**
   * Build an array of fixtures with a generator function.
   *
   * @example
   * const jobs = Fixtures.Job.buildMany(3, (index) => ({
   *   jobId: `job-${index}`,
   *   status: index < 2 ? 'COMPLETED' : 'PROCESSING',
   * }));
   */
  buildMany(
    count: number,
    generator: (index: number) => Partial<z.infer<TSchema>>
  ): z.infer<TSchema>[] {
    return Array.from({ length: count }, (_, index) =>
      this.build(generator(index))
    );
  }

  /**
   * Build with deep merge for nested structures.
   * Useful when overriding specific nested fields without rebuilding entire subtrees.
   *
   * @example
   * // Override nested field without rebuilding entire uploads array
   * const response = Fixtures.BatchUploadResponse.buildNested({
   *   'uploads[0].presignedUrl': 'https://custom-url.com',
   * });
   */
  buildNested(overrides: Record<string, unknown>): z.infer<TSchema> {
    const merged = deepMerge(this.defaults, overrides);
    try {
      return this.schema.parse(merged);
    } catch (error) {
      if (error instanceof ZodError) {
        const issues = error.issues.map(i =>
          `  - ${i.path.join('.')}: ${i.message}`
        );
        throw new Error(
          `FixtureBuilder.buildNested() validation failed:\\n${issues.join('\\n')}`
        );
      }
      throw error;
    }
  }
}

/**
 * Deep merge helper for nested overrides.
 * Handles arrays and objects recursively.
 */
function deepMerge<T>(target: T, source: Record<string, unknown>): T {
  const result = { ...target } as Record<string, unknown>;

  for (const [key, value] of Object.entries(source)) {
    // Handle dot notation (e.g., 'uploads[0].presignedUrl')
    if (key.includes('.') || key.includes('[')) {
      setNestedProperty(result, key, value);
    } else if (
      value &&
      typeof value === 'object' &&
      !Array.isArray(value) &&
      result[key] &&
      typeof result[key] === 'object'
    ) {
      result[key] = deepMerge(result[key], value as Record<string, unknown>);
    } else {
      result[key] = value;
    }
  }

  return result as T;
}

/**
 * Set nested property using dot/bracket notation.
 * Example: setNestedProperty(obj, 'uploads[0].url', 'https://...')
 */
function setNestedProperty(obj: Record<string, unknown>, path: string, value: unknown): void {
  const parts = path.split(/\.|\[|\]/).filter(Boolean);
  let current = obj;

  for (let i = 0; i < parts.length - 1; i++) {
    const part = parts[i];
    const nextPart = parts[i + 1];
    const isNextArray = !isNaN(Number(nextPart));

    if (!(part in current)) {
      current[part] = isNextArray ? [] : {};
    }
    current = current[part] as Record<string, unknown>;
  }

  current[parts[parts.length - 1]] = value;
}

/**
 * Helper to create ISO timestamps for test consistency
 */
function createTimestamp(offsetMs = 0): string {
  return new Date(Date.UTC(2025, 9, 31, 0, 0, 0, 0) + offsetMs).toISOString();
}

/**
 * Pre-configured fixture builders for common types.
 * These provide sensible defaults that satisfy all schema requirements.
 */
export const Fixtures = {
  /**
   * Job fixture builder
   */
  Job: new FixtureBuilder(JobSchema, {
    jobId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    userId: 'user-123',
    status: 'PROCESSING' as const,
    createdAt: createTimestamp(0),
    updatedAt: createTimestamp(0),
    locale: 'en' as const,
  }),

  /**
   * Completed job fixture builder (convenience)
   */
  CompletedJob: new FixtureBuilder(JobSchema, {
    jobId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    userId: 'user-123',
    status: 'COMPLETED' as const,
    createdAt: createTimestamp(0),
    updatedAt: createTimestamp(15000),
    locale: 'en' as const,
    finalS3Key: 'results/f47ac10b-58cc-4372-a567-0e02b2c3d479/output.jpg',
  }),

  /**
   * Batch job fixture builder
   */
  BatchJob: new FixtureBuilder(BatchJobSchema, {
    batchJobId: 'f47ac10b-58cc-4372-a567-0e02b2c3d480',
    userId: 'user-123',
    status: 'PROCESSING' as const,
    createdAt: createTimestamp(0),
    updatedAt: createTimestamp(0),
    locale: 'en' as const,
    sharedPrompt: 'test prompt',
    childJobIds: ['job-1', 'job-2'],
    totalCount: 2,
    completedCount: 0,
  }),

  /**
   * Presign upload response fixture builder
   */
  PresignUploadResponse: new FixtureBuilder(PresignUploadResponseSchema, {
    jobId: 'f47ac10b-58cc-4372-a567-0e02b2c3d479',
    presignedUrl: 'https://s3.amazonaws.com/bucket/test',
    s3Key: 'uploads/test.jpg',
    expiresAt: createTimestamp(3_600_000), // 1 hour from base time
  }),

  /**
   * Batch upload response fixture builder
   */
  BatchUploadResponse: new FixtureBuilder(BatchUploadResponseSchema, {
    batchJobId: 'f47ac10b-58cc-4372-a567-0e02b2c3d480',
    childJobIds: ['job-1', 'job-2'],
    uploads: [
      {
        presignedUrl: 'https://s3.amazonaws.com/bucket/job-1',
        s3Key: 'uploads/job-1/file1.jpg',
        expiresAt: createTimestamp(3_600_000),
      },
      {
        presignedUrl: 'https://s3.amazonaws.com/bucket/job-2',
        s3Key: 'uploads/job-2/file2.jpg',
        expiresAt: createTimestamp(3_600_000),
      },
    ],
  }),

  /**
   * Device token response fixture builder
   */
  DeviceTokenResponse: new FixtureBuilder(DeviceTokenResponseSchema, {
    success: true,
    message: 'Device token registered successfully',
  }),
};
```

### 5.3 Layer 3: PollingOrchestrator Implementation

```typescript
/**
 * mobile/src/services/__tests__/support/polling-orchestrator.ts
 *
 * Declarative polling test orchestrator with time-based state machines.
 *
 * Per standards/testing-standards.md:
 * - Cockatiel-driven polling specs must compose fetch mocks with createPollingScenario
 * - Drive timers with advanceTimersUntilSettled
 * - Capture subject promise via .catch to assert final rejection
 */

import { z, type ZodTypeAny } from 'zod';
import { FetchScenario } from './fetch-scenario';
import { schemaSafeResponse } from '../stubs';
import { advanceTimersUntilSettled } from '../testUtils';

/**
 * Time-based state for polling timeline
 */
export interface TimelineState<TState> {
  /** Time in milliseconds from start when this state becomes active */
  afterMs: number;
  /** State to return (partial merged with defaults, or complete object) */
  state: Partial<TState> | TState | (() => Partial<TState> | TState);
}

/**
 * Configuration for polling orchestrator
 */
export interface PollingOrchestratorOptions<TState extends ZodTypeAny> {
  /** Endpoint pattern to match (string or regex) */
  endpoint: string | RegExp;
  /** Zod schema for state validation */
  schema: TState;
  /**
   * Builder function to provide defaults for partial states.
   * IMPORTANT: Must be an arrow function or bound method to preserve context.
   *
   * @example
   * // ✅ Correct: Arrow wrapper
   * builder: (overrides) => Fixtures.Job.build(overrides)
   *
   * // ❌ Wrong: Unbound method (loses `this` context)
   * builder: Fixtures.Job.build
   */
  builder: (overrides?: Partial<z.infer<TState>>) => z.infer<TState>;
  /** Polling interval in milliseconds (default: 5000) */
  pollInterval?: number;
  /** Maximum number of polling cycles before timeout (default: 120) */
  maxCycles?: number;
}

/**
 * Declarative polling test orchestrator.
 *
 * Manages fake timers + fetch mocks + state progression in a single abstraction.
 *
 * @example
 * const orchestrator = new PollingOrchestrator({
 *   endpoint: '/status/',
 *   schema: JobSchema,
 *   builder: (overrides) => Fixtures.Job.build(overrides),
 *   pollInterval: 5000,
 * });
 *
 * orchestrator.defineTimeline([
 *   { afterMs: 0,     state: { status: 'QUEUED' } },
 *   { afterMs: 5000,  state: { status: 'PROCESSING' } },
 *   { afterMs: 10000, state: { status: 'COMPLETED', finalS3Key: 'results/...' } },
 * ]);
 *
 * await orchestrator.run(mockFetch, () => adapter.pollJobCompletion('job-123'));
 */
export class PollingOrchestrator<TState extends ZodTypeAny> {
  private scenario: FetchScenario;
  private timeline: Array<{
    afterMs: number;
    state: z.infer<TState>;
  }> = [];
  private readonly pollInterval: number;
  private readonly maxCycles: number;

  constructor(private readonly options: PollingOrchestratorOptions<TState>) {
    this.scenario = new FetchScenario();
    this.pollInterval = options.pollInterval ?? 5000;
    this.maxCycles = options.maxCycles ?? 120;
  }

  /**
   * Define state progression over time.
   * States are validated at setup time to catch errors early.
   *
   * @param states Timeline of states with activation times
   * @throws {Error} If any state fails schema validation
   */
  defineTimeline(states: TimelineState<z.infer<TState>>[]): this {
    // Validate states at setup time (fail fast)
    this.timeline = states.map((entry, index) => {
      const partial = typeof entry.state === 'function'
        ? entry.state()
        : entry.state;

      try {
        // Check if it's already a complete state
        const parseResult = this.options.schema.safeParse(partial);
        if (parseResult.success) {
          return { afterMs: entry.afterMs, state: parseResult.data };
        }

        // Merge with defaults from builder
        const complete = this.options.builder(partial as Partial<z.infer<TState>>);
        const validated = this.options.schema.parse(complete);
        return { afterMs: entry.afterMs, state: validated };
      } catch (error) {
        throw new Error(
          `PollingOrchestrator: Timeline state ${index} at ${entry.afterMs}ms ` +
          `failed validation: ${error instanceof Error ? error.message : String(error)}`
        );
      }
    });

    // Sort timeline by time (defensive programming)
    this.timeline.sort((a, b) => a.afterMs - b.afterMs);

    return this;
  }

  /**
   * Set up the scenario and execute the test with automatic timer advancement.
   *
   * @param mockFetch Jest mock function to configure
   * @param executeFn Function that triggers the polling logic
   * @returns Promise that resolves when polling completes or times out
   */
  async run<T>(
    mockFetch: jest.MockedFunction<typeof fetch>,
    executeFn: () => Promise<T>
  ): Promise<T> {
    if (this.timeline.length === 0) {
      throw new Error(
        'PollingOrchestrator: No timeline defined. Call defineTimeline() first.'
      );
    }

    // Track polling calls
    let pollCallCount = 0;

    // Register polling stage
    this.scenario.stage({
      name: 'polling',
      matcher: (input) => {
        const url = String(input);
        return typeof this.options.endpoint === 'string'
          ? url.includes(this.options.endpoint)
          : this.options.endpoint.test(url);
      },
      response: () => {
        // Calculate elapsed time based on polling cycles
        const elapsedMs = pollCallCount * this.pollInterval;
        pollCallCount++;

        // Find the active state for this time
        const state = this.getStateAtTime(elapsedMs);

        return schemaSafeResponse({
          schema: this.options.schema,
          build: this.options.builder,
          value: state,
        });
      },
    });

    // Apply scenario to mock
    this.scenario.apply(mockFetch);

    // Execute with automatic timer advancement
    return advanceTimersUntilSettled(executeFn(), {
      stepMs: this.pollInterval,
      maxCycles: this.maxCycles,
    });
  }

  /**
   * Get the state that should be active at a given time.
   * Returns the most recent state whose activation time has passed.
   */
  private getStateAtTime(elapsedMs: number): z.infer<TState> {
    // Find the most recent state that should be active
    for (let i = this.timeline.length - 1; i >= 0; i--) {
      if (elapsedMs >= this.timeline[i].afterMs) {
        return this.timeline[i].state;
      }
    }

    // Return first state if before first transition
    // (defensive: should never happen if timeline starts at 0ms)
    return this.timeline[0].state;
  }

  /**
   * Get the underlying FetchScenario for adding non-polling stages.
   *
   * @example
   * orchestrator.getScenario()
   *   .stage({ name: 'presign', ... })
   *   .stage({ name: 's3-upload', ... });
   */
  getScenario(): FetchScenario {
    return this.scenario;
  }

  /**
   * Get diagnostic information about polling execution.
   */
  getDiagnostics(): {
    timelineLengthMs: number;
    stateCount: number;
    pollingCalls: number;
  } {
    return {
      timelineLengthMs: Math.max(...this.timeline.map(t => t.afterMs)),
      stateCount: this.timeline.length,
      pollingCalls: this.scenario.getCallCounts()['polling'] || 0,
    };
  }
}
```

### 5.4 Standard Patterns Library

```typescript
/**
 * mobile/src/services/__tests__/support/patterns.ts
 *
 * Example test patterns for common polling scenarios.
 *
 * IMPORTANT: These are EXAMPLES to copy and adapt, not rigid templates.
 * As your job lifecycle evolves (new states, error conditions), update these
 * patterns or create test-specific variants. Patterns should guide, not constrain.
 *
 * Provides pre-configured timelines and matchers for typical test cases.
 */

import { Fixtures } from './fixtures';

/**
 * Example polling patterns for job status tests.
 * Copy and modify these for your specific test needs.
 */
export const PollingPatterns = {
  /**
   * Immediate completion (for happy path smoke tests)
   * Job completes on first poll.
   */
  immediateCompletion(jobId: string) {
    return {
      timeline: [
        {
          afterMs: 0,
          state: Fixtures.CompletedJob.build({
            jobId,
            finalS3Key: `results/${jobId}/output.jpg`,
          }),
        },
      ],
    };
  },

  /**
   * Typical processing flow (queued → processing → completed)
   * Simulates realistic job lifecycle.
   *
   * @param jobId Job identifier
   * @param durationMs Total processing time (default: 15000ms = 3 polls at 5s interval)
   */
  typicalProcessing(jobId: string, durationMs = 15000) {
    return {
      timeline: [
        {
          afterMs: 0,
          state: Fixtures.Job.build({ jobId, status: 'QUEUED' }),
        },
        {
          afterMs: Math.floor(durationMs * 0.3),
          state: Fixtures.Job.build({ jobId, status: 'PROCESSING' }),
        },
        {
          afterMs: durationMs,
          state: Fixtures.CompletedJob.build({
            jobId,
            finalS3Key: `results/${jobId}/output.jpg`,
          }),
        },
      ],
    };
  },

  /**
   * Failure after processing
   * Job starts processing then fails with error message.
   *
   * @param jobId Job identifier
   * @param errorMsg Error message for failed state
   * @param afterMs Time until failure (default: 10000ms)
   */
  processingFailure(jobId: string, errorMsg: string, afterMs = 10000) {
    return {
      timeline: [
        {
          afterMs: 0,
          state: Fixtures.Job.build({ jobId, status: 'QUEUED' }),
        },
        {
          afterMs: Math.floor(afterMs * 0.5),
          state: Fixtures.Job.build({ jobId, status: 'PROCESSING' }),
        },
        {
          afterMs,
          state: Fixtures.Job.build({
            jobId,
            status: 'FAILED',
            error: errorMsg,
          }),
        },
      ],
    };
  },

  /**
   * Timeout scenario (never completes)
   * Job remains in PROCESSING state indefinitely.
   * Use with reduced maxCycles to test timeout handling.
   */
  timeout(jobId: string) {
    return {
      timeline: [
        {
          afterMs: 0,
          state: Fixtures.Job.build({ jobId, status: 'PROCESSING' }),
        },
        // No completion state - stays in PROCESSING forever
      ],
    };
  },

  /**
   * Long processing with progress indicators
   * Simulates job that takes multiple polls to complete.
   *
   * @param jobId Job identifier
   * @param pollCount Number of PROCESSING polls before completion
   */
  longProcessing(jobId: string, pollCount = 10) {
    const states = [
      {
        afterMs: 0,
        state: Fixtures.Job.build({ jobId, status: 'QUEUED' }),
      },
    ];

    // Add PROCESSING states for each poll
    for (let i = 1; i <= pollCount; i++) {
      states.push({
        afterMs: i * 5000,
        state: Fixtures.Job.build({ jobId, status: 'PROCESSING' }),
      });
    }

    // Final completion
    states.push({
      afterMs: (pollCount + 1) * 5000,
      state: Fixtures.CompletedJob.build({
        jobId,
        finalS3Key: `results/${jobId}/output.jpg`,
      }),
    });

    return { timeline: states };
  },
};

/**
 * Standard patterns for batch job tests
 */
export const BatchPollingPatterns = {
  /**
   * Typical batch processing with progress
   *
   * @param batchJobId Batch job identifier
   * @param totalJobs Total number of child jobs
   * @param completionTimeMs Time to complete all jobs
   */
  typicalBatchProcessing(batchJobId: string, totalJobs: number, completionTimeMs = 30000) {
    const states = [
      {
        afterMs: 0,
        state: Fixtures.BatchJob.build({
          batchJobId,
          totalCount: totalJobs,
          completedCount: 0,
          status: 'PROCESSING',
        }),
      },
    ];

    // Add incremental progress states
    const interval = Math.floor(completionTimeMs / totalJobs);
    for (let completed = 1; completed < totalJobs; completed++) {
      states.push({
        afterMs: completed * interval,
        state: Fixtures.BatchJob.build({
          batchJobId,
          totalCount: totalJobs,
          completedCount: completed,
          status: 'PROCESSING',
        }),
      });
    }

    // Final completion
    states.push({
      afterMs: completionTimeMs,
      state: Fixtures.BatchJob.build({
        batchJobId,
        totalCount: totalJobs,
        completedCount: totalJobs,
        status: 'COMPLETED',
      }),
    });

    return { timeline: states };
  },

  /**
   * Batch failure scenario
   *
   * @param batchJobId Batch job identifier
   * @param totalJobs Total number of child jobs
   * @param errorMsg Error message
   * @param completedBeforeFailure Number of jobs completed before failure
   */
  batchFailure(
    batchJobId: string,
    totalJobs: number,
    errorMsg: string,
    completedBeforeFailure = Math.floor(totalJobs / 2)
  ) {
    return {
      timeline: [
        {
          afterMs: 0,
          state: Fixtures.BatchJob.build({
            batchJobId,
            totalCount: totalJobs,
            completedCount: 0,
            status: 'PROCESSING',
          }),
        },
        {
          afterMs: 10000,
          state: Fixtures.BatchJob.build({
            batchJobId,
            totalCount: totalJobs,
            completedCount: completedBeforeFailure,
            status: 'PROCESSING',
          }),
        },
        {
          afterMs: 15000,
          state: Fixtures.BatchJob.build({
            batchJobId,
            totalCount: totalJobs,
            completedCount: completedBeforeFailure,
            status: 'FAILED',
            error: errorMsg,
          }),
        },
      ],
    };
  },
};

/**
 * Common fetch matchers for reuse
 */
export const FetchMatchers = {
  presignEndpoint: (input: RequestInfo | URL) =>
    String(input).includes('/presign'),

  statusEndpoint: (input: RequestInfo | URL) =>
    String(input).includes('/status/'),

  batchStatusEndpoint: (input: RequestInfo | URL) =>
    String(input).includes('/batch-status/'),

  s3Upload: (input: RequestInfo | URL) =>
    String(input).includes('s3.amazonaws.com'),

  localFile: (input: RequestInfo | URL) =>
    String(input).startsWith('file://'),

  deviceToken: (input: RequestInfo | URL) =>
    String(input).includes('/device-token'),
};
```

---

## 6. Usage Examples

### 6.1 Simple Network Call Test

```typescript
describe('requestPresignedUrl', () => {
  it('should request presigned URL successfully', async () => {
    const scenario = new FetchScenario()
      .stage({
        name: 'presign-request',
        matcher: FetchMatchers.presignEndpoint,
        response: schemaSafeResponse({
          schema: PresignUploadResponseSchema,
          value: Fixtures.PresignUploadResponse.build({
            jobId: 'test-job-123',
          }),
        }),
        maxCalls: 1,
      });

    scenario.apply(mockFetch);

    const result = await adapter.requestPresignedUrl('test.jpg', 'image/jpeg', 1024);

    expect(result.jobId).toBe('test-job-123');
    expect(result.presignedUrl).toBeDefined();
    scenario.assertStageCalled('presign-request', 1);
  });
});
```

**Key Benefits**:
- ✅ Self-documenting: stage names describe intent
- ✅ Type-safe: TypeScript validates response shape
- ✅ Schema-complete: Fixture builder ensures all required fields
- ✅ Diagnostic: `assertStageCalled` validates mock usage

---

### 6.2 Polling Until Completion

```typescript
describe('pollJobCompletion', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should poll until job completes successfully', async () => {
    const orchestrator = new PollingOrchestrator({
      endpoint: '/status/',
      schema: JobSchema,
      builder: (overrides) => Fixtures.Job.build(overrides),
      pollInterval: 5000,
    });

    // Define what happens over time
    orchestrator.defineTimeline(
      PollingPatterns.typicalProcessing('job-123', 15000).timeline
    );

    // Run test
    const result = await orchestrator.run(
      mockFetch,
      () => adapter.pollJobCompletion('job-123')
    );

    expect(result).toContain('/download/job-123');

    const diagnostics = orchestrator.getDiagnostics();
    expect(diagnostics.pollingCalls).toBeGreaterThanOrEqual(3);
  });

  it('should timeout after max polling attempts', async () => {
    const orchestrator = new PollingOrchestrator({
      endpoint: '/status/',
      schema: JobSchema,
      builder: (overrides) => Fixtures.Job.build(overrides),
      pollInterval: 5000,
      maxCycles: 10, // Limit to 10 cycles for timeout test
    });

    orchestrator.defineTimeline(
      PollingPatterns.timeout('job-123').timeline
    );

    await expect(
      orchestrator.run(mockFetch, () => adapter.pollJobCompletion('job-123'))
    ).rejects.toThrow('Processing timeout');
  });
});
```

**Key Benefits**:
- ✅ Declarative: Timeline describes state progression
- ✅ Time-based: States tied to elapsed time, not call counts
- ✅ Reusable: Patterns library provides common scenarios
- ✅ Deterministic: Fake timers eliminate flakiness

---

### 6.3 Multi-Stage Flow (Presign → Upload → Poll)

```typescript
describe('processImage', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should process image end-to-end', async () => {
    const jobId = 'job-123';

    // Set up polling orchestrator
    const orchestrator = new PollingOrchestrator({
      endpoint: '/status/',
      schema: JobSchema,
      builder: (overrides) => Fixtures.Job.build(overrides),
      pollInterval: 5000,
    });

    orchestrator.defineTimeline(
      PollingPatterns.typicalProcessing(jobId, 15000).timeline
    );

    // Add non-polling stages
    orchestrator.getScenario()
      .stage({
        name: 'presign',
        matcher: FetchMatchers.presignEndpoint,
        response: schemaSafeResponse({
          schema: PresignUploadResponseSchema,
          value: Fixtures.PresignUploadResponse.build({ jobId }),
        }),
        maxCalls: 1,
      })
      .stage({
        name: 'image-fetch',
        matcher: FetchMatchers.localFile,
        response: createMockResponse({
          data: new Blob(['fake image data'])
        }),
        maxCalls: 1,
      })
      .stage({
        name: 's3-upload',
        matcher: FetchMatchers.s3Upload,
        response: createMockResponse({ status: 200 }),
        maxCalls: 1,
      });

    // Track progress
    const progressCalls: number[] = [];
    const onProgress = jest.fn((progress: number) => progressCalls.push(progress));

    // Execute
    const result = await orchestrator.run(
      mockFetch,
      () => adapter.processImage(
        'file:///path/to/image.jpg',
        'test.jpg',
        1024,
        'test prompt',
        onProgress
      )
    );

    // Assertions
    expect(result).toContain(`/download/${jobId}`);
    expect(onProgress).toHaveBeenCalled();
    expect(progressCalls).toContain(25); // After presign
    expect(progressCalls).toContain(50); // After upload
    expect(progressCalls).toContain(100); // After completion

    // Verify stage calls
    orchestrator.getScenario().assertStageCalled('presign', 1);
    orchestrator.getScenario().assertStageCalled('s3-upload', 1);
  });
});
```

**Key Benefits**:
- ✅ Composable: Polling + non-polling stages work together
- ✅ No conflicts: Stages evaluated in order without overwriting
- ✅ Complete: All stages (presign, fetch, upload, poll) in single test
- ✅ Observable: Progress callback validation included

---

### 6.4 Retry Policy Test

```typescript
describe('retry policy', () => {
  it('should retry on transient failures', async () => {
    let attempt = 0;

    const scenario = new FetchScenario()
      .stage({
        name: 'api-call-with-retries',
        matcher: FetchMatchers.presignEndpoint,
        response: () => {
          attempt++;

          // Fail first 2 attempts
          if (attempt < 3) {
            return createMockResponse({
              ok: false,
              status: 500,
              statusText: 'Internal Server Error',
            });
          }

          // Succeed on 3rd attempt
          return schemaSafeResponse({
            schema: PresignUploadResponseSchema,
            value: Fixtures.PresignUploadResponse.build(),
          });
        },
      });

    scenario.apply(mockFetch);

    const result = await adapter.requestPresignedUrl('test.jpg', 'image/jpeg', 1024);

    expect(result.jobId).toBeDefined();
    expect(scenario.getCallCounts()['api-call-with-retries']).toBe(3);
  });

  it('should fail after max retries', async () => {
    const scenario = new FetchScenario()
      .stage({
        name: 'persistent-failure',
        matcher: FetchMatchers.presignEndpoint,
        response: createMockResponse({
          ok: false,
          status: 500,
          statusText: 'Internal Server Error',
        }),
      });

    scenario.apply(mockFetch);

    await expect(
      adapter.requestPresignedUrl('test.jpg', 'image/jpeg', 1024)
    ).rejects.toThrow('API Error: 500 Internal Server Error');

    // Verify retry policy attempted multiple times
    expect(scenario.getCallCounts()['persistent-failure']).toBeGreaterThanOrEqual(3);
  });
});
```

**Key Benefits**:
- ✅ Stateful: Response function accesses closure variables
- ✅ Observable: Call counts validate retry attempts
- ✅ Flexible: Arbitrary retry logic testable

---

### 6.5 Batch Processing Test

```typescript
describe('processBatchImages', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('should track batch progress correctly', async () => {
    const batchJobId = 'batch-123';
    const childJobIds = ['job-1', 'job-2', 'job-3'];

    const orchestrator = new PollingOrchestrator({
      endpoint: '/batch-status/',
      schema: BatchJobSchema,
      builder: (overrides) => Fixtures.BatchJob.build(overrides),
      pollInterval: 5000,
    });

    orchestrator.defineTimeline(
      BatchPollingPatterns.typicalBatchProcessing(batchJobId, 3, 30000).timeline
    );

    // Add pre-polling stages
    orchestrator.getScenario()
      .stage({
        name: 'batch-presign',
        matcher: FetchMatchers.presignEndpoint,
        response: schemaSafeResponse({
          schema: BatchUploadResponseSchema,
          value: Fixtures.BatchUploadResponse.build({
            batchJobId,
            childJobIds,
          }),
        }),
        maxCalls: 1,
      })
      // Add image fetch stages for each image
      .stage({
        name: 'image-fetch',
        matcher: FetchMatchers.localFile,
        response: createMockResponse({ data: new Blob(['fake']) }),
        maxCalls: 3,
      })
      // Add S3 upload stages for each image
      .stage({
        name: 's3-upload',
        matcher: FetchMatchers.s3Upload,
        response: createMockResponse({ status: 200 }),
        maxCalls: 3,
      });

    const progressCalls: Array<{ progress: number; batchJobId?: string }> = [];
    const onProgress = jest.fn((progress: number, batchId?: string) => {
      progressCalls.push({ progress, batchJobId: batchId });
    });

    const result = await orchestrator.run(
      mockFetch,
      () => adapter.processBatchImages(
        [
          { uri: 'file:///img1.jpg', fileName: 'file1.jpg', fileSize: 1024 },
          { uri: 'file:///img2.jpg', fileName: 'file2.jpg', fileSize: 2048 },
          { uri: 'file:///img3.jpg', fileName: 'file3.jpg', fileSize: 3072 },
        ],
        'shared prompt',
        undefined,
        onProgress
      )
    );

    expect(result).toHaveLength(3);
    expect(result[0]).toContain('/download/job-1');

    const batchProgress = progressCalls.filter(c => c.batchJobId === batchJobId);
    expect(batchProgress.length).toBeGreaterThan(0);
    expect(batchProgress.some(c => c.progress === 100)).toBe(true);
  });
});
```

---

## 7. Migration Plan

**⚠️ REVISED PLAN**: This section reflects **Option C (Modified Full Proposal)** from the Critical Analysis. See lines 279-307 for rationale.

### 7.1 Phase 1: Layer 1 + Enforcement (Week 1) 🔴 CRITICAL

**Non-Negotiable Requirements**:
1. ESLint rule MUST be implemented in Week 1 (not deferred to Phase 4)
2. Pilot migrations MUST validate before proceeding to Week 2
3. Type constraints enforced at compile time

**Deliverables**:
- [ ] **Implement `FetchScenario` class**
  - File: `mobile/src/services/__tests__/support/fetch-scenario.ts`
  - Tests: `mobile/src/services/__tests__/support/fetch-scenario.test.ts`
  - ~300 LOC implementation, ~500 LOC tests

- [ ] **Add TypeScript constraints for builder functions**
  ```typescript
  // Force arrow wrapper syntax
  type BuilderFn<T> = (overrides?: Partial<T>) => T;

  // In FetchScenario options:
  builder: BuilderFn<z.infer<TState>>;
  ```

- [ ] **Implement ESLint rule for arrow wrappers** 🔴 BLOCKING
  - File: `tooling/eslint-plugin-test-patterns/no-unbound-builder.js`
  - Detect pattern: `builder: Fixtures.Job.build`
  - Suggest fix: `builder: (o) => Fixtures.Job.build(o)`
  - Test with `.eslintrc.js` integration

- [ ] **Feature flag for gradual rollout**
  ```typescript
  // Allow coexistence of old/new patterns
  const USE_LEGACY_POLLING_HELPERS = process.env.LEGACY_POLLING === 'true';
  ```

- [ ] **Pilot migrations (BLOCKING)** 🔴 CRITICAL
  - Migrate 3 tests from `adapter.test.ts` (lines 457-509, 511-558, 560-600)
  - Validate:
    - ESLint rule catches unbound methods
    - Type constraints enforce arrow syntax
    - Diagnostics API (`getCallCounts()`, `assertStageCalled()`) work
    - No regression in test execution time
  - **GATE**: Do not proceed to Week 2 until all 3 pass

**Success Criteria**:
- [ ] `FetchScenario` has 90%+ test coverage
- [ ] ESLint rule integrated and active in CI
- [ ] 3 pilot migrations pass with new infrastructure
- [ ] Documentation includes unbound method trap warning
- [ ] Type constraints prevent common mistakes at compile time

---

### 7.2 Phase 2: Enhance Existing Builders (Week 2) ⚠️ MODIFIED APPROACH

**⚠️ CHANGE FROM ORIGINAL**: Skip `FixtureBuilder` class entirely. Enhance existing builders in `stubs.ts` instead.

**Rationale** (from Critical Analysis lines 129-153):
- Current `buildJob()` + `schemaSafeResponse()` already provide schema-complete fixtures
- Adding `FixtureBuilder` class = 500 LOC for marginal benefit (build-time validation achievable with 1-line addition)
- Cost/benefit ratio: 3/10

**Deliverables**:
- [ ] **Add Zod validation to existing builders**
  ```typescript
  // mobile/src/services/__tests__/stubs.ts
  export function buildJob(overrides: Partial<Job> = {}): Job {
    const now = isoNow();
    const merged = {
      jobId: overrides.jobId ?? DEFAULT_JOB_ID,
      userId: overrides.userId ?? 'user-123',
      status: overrides.status ?? 'PROCESSING',
      createdAt: overrides.createdAt ?? now,
      updatedAt: overrides.updatedAt ?? now,
      locale: overrides.locale ?? 'en',
      ...overrides,
    };
    return JobSchema.parse(merged); // ← Add this line
  }
  ```
  - Update: `buildJob`, `buildPresignUploadResponse`, `buildBatchJob`, `buildBatchUploadResponse`, `buildDeviceTokenResponse`
  - Cost: ~5 LOC additions (1 per builder)

- [ ] **Document builder enhancement**
  - File: `mobile/src/services/__tests__/support/README.md`
  - Section: "Schema-Safe Builders"
  - Note: No `buildNested()` needed - use spread operator for nested overrides

- [ ] **Update tests to leverage validation**
  - No migration required - existing tests already use builders
  - Validation errors now caught at test setup time (not runtime)

**Success Criteria**:
- [ ] All builders validate with Zod schemas
- [ ] Zero runtime schema validation errors in test suite
- [ ] No performance regression (Zod overhead <1ms per fixture)
- [ ] Documentation updated

**LOC Saved vs. Original**: ~500 LOC (FixtureBuilder class not implemented)

---

### 7.3 Phase 3: Layer 3 Simplified (Week 3)

**⚠️ CHANGE FROM ORIGINAL**: Simplify `PollingOrchestrator` and defer pattern library.

**Deliverables**:
- [ ] **Implement `PollingOrchestrator` class**
  - File: `mobile/src/services/__tests__/support/polling-orchestrator.ts`
  - Tests: `mobile/src/services/__tests__/support/polling-orchestrator.test.ts`
  - ~250 LOC implementation, ~400 LOC tests
  - Use `BuilderFn<T>` type constraint (enforced by ESLint)

- [ ] **Create minimal pattern library (3-5 examples)** ⚠️ REDUCED SCOPE
  - File: `mobile/src/services/__tests__/support/patterns.ts`
  - Include:
    1. `immediateCompletion` - job completes on first poll
    2. `typicalProcessing` - queued → processing → completed
    3. `processingFailure` - job fails with error message
    4. `timeout` - job never completes
    5. **Defer**: Batch patterns, long processing patterns (add when 3+ tests duplicate pattern)
  - Cost: ~100 LOC (vs. ~300 LOC in original)

- [ ] **Document pattern usage**
  - File: `mobile/src/services/__tests__/support/README.md`
  - Section: "Polling Patterns"
  - **Explicitly state**: "Patterns are examples to fork/customize, not rigid templates"
  - Include decision tree: "When to use `PollingOrchestrator` vs. `createPollingScenario()`"

**Success Criteria**:
- [ ] `PollingOrchestrator` has 90%+ test coverage
- [ ] 3-5 pattern examples documented
- [ ] Pattern library deferred until duplication observed
- [ ] Decision tree guides API selection

**LOC Saved vs. Original**: ~200 LOC (deferred batch/long patterns)

---

### 7.4 Phase 4: Migration + Validation (Week 4)

**Deliverables**:
- [ ] **Migrate high-priority tests**
  - `mobile/src/services/upload/__tests__/adapter.test.ts`
    - Migrate polling tests (lines 437-705)
    - Target: All tests using `createPollingScenario` → `PollingOrchestrator`
  - `mobile/src/services/notification/__tests__/adapter.test.ts`
    - Migrate similar patterns

- [ ] **Backend equivalent (if time permits)**
  - File: `backend/tests/support/aws-scenario.ts`
  - Adapter for `aws-sdk-client-mock` with same API as `FetchScenario`
  - **Defer if Week 4 timeline at risk**

- [ ] **Metrics validation**
  - Run test suite 20 times, measure flakiness rate
  - Target: <1% (down from ~40%)
  - Measure test authoring time for 1 new polling test
  - Target: <30 minutes

- [ ] **Documentation**
  - File: `mobile/src/services/__tests__/support/README.md`
  - Include:
    - Quick start guide
    - API reference for all 3 components
    - Common pitfalls (unbound methods, Response body consumption)
    - Decision tree for API selection
    - Migration examples (before/after)

**Success Criteria**:
- [ ] 90%+ of polling tests migrated
- [ ] Flakiness rate <1%
- [ ] Test authoring time <30 minutes
- [ ] Documentation complete with decision tree

---

### 7.5 Phase 5: Enforcement (Deferred) ⚠️ OPTIONAL

**Note**: This phase is **deferred** until Phases 1-4 complete and metrics validate effectiveness.

**Deliverables** (if pursued):
- [ ] Additional ESLint rules for anti-patterns
- [ ] Pre-commit hooks
- [ ] Metrics dashboard
- [ ] Team workshop materials (if team grows beyond solo dev)

**Success Criteria**:
- Linter catches 95%+ of anti-patterns
- Pre-commit hook prevents regressions

---

### Timeline Comparison

| Phase | Original Timeline | Revised Timeline | LOC Saved |
|-------|------------------|-----------------|-----------|
| Phase 1: Layer 1 | Weeks 1-2 | Week 1 | 0 |
| Phase 2: Layer 2 | Week 2 | Week 2 (Enhanced builders) | **~500** |
| Phase 3: Layer 3 | Week 3 | Week 3 (Simplified) | **~200** |
| Phase 4: Migration | Weeks 4-5 | Week 4 | 0 |
| Phase 5: Enforcement | Week 6 | Deferred | - |
| **Total** | **6 weeks** | **4 weeks** | **~700 LOC** |

**Key Changes**:
1. ✅ ESLint rule moved from Week 6 → Week 1 (CRITICAL)
2. ✅ FixtureBuilder class skipped (500 LOC saved)
3. ✅ Pattern library simplified (200 LOC saved)
4. ✅ Enforcement phase deferred (optional)
5. ✅ Timeline reduced by 33% (6 weeks → 4 weeks)

---

### 7.2 Phase 2: Standards & Examples (Week 3)

**Deliverables**:
- [ ] Update `standards/testing-standards.md`
  - Add "Network & Polling Test Infrastructure" section
  - Document standard patterns
  - List anti-patterns to avoid
  - Add troubleshooting guide

- [ ] Create example tests
  - File: `docs/testing-examples/polling-test-examples.md`
  - 5-10 canonical examples covering common scenarios
  - Before/after comparisons showing improvement

- [ ] Create backend equivalent (`AwsScenario`)
  - File: `backend/tests/support/aws-scenario.ts`
  - Adapter for `aws-sdk-client-mock` with same API

- [ ] Update PR template
  - Add checklist item: "Tests use standard patterns from support/"

**Success Criteria**:
- Standards document approved by team
- Examples cover 80% of common use cases
- Backend and mobile have consistent patterns

---

### 7.3 Phase 3: Migration (Weeks 4-5)

**Strategy**: Migrate tests incrementally, starting with most problematic.

**Priority 1 (Week 4)**: High-flakiness tests
- [ ] `mobile/src/services/upload/__tests__/adapter.test.ts`
  - 13 failing tests from 2025-10-28
  - Migrate all polling tests to `PollingOrchestrator`
  - Migrate multi-stage tests to `FetchScenario`

- [ ] `mobile/src/services/notification/__tests__/adapter.test.ts`
  - Similar patterns to upload adapter

- [ ] `backend/tests/unit/services/job.service.test.ts`
  - Backend polling equivalent

**Priority 2 (Week 5)**: Medium-complexity tests
- [ ] All remaining mobile adapter tests
- [ ] Backend provider tests with AWS SDK mocks
- [ ] Integration tests (if any remain)

**Success Criteria**:
- 90% of polling tests migrated
- Flakiness rate <1% for migrated tests
- Test execution time reduced by 20%+

---

### 7.4 Phase 4: Enforcement (Week 6)

**Deliverables**:
- [ ] Add ESLint rules to detect anti-patterns
  - Rule: Detect `mockResolvedValueOnce` before `createPollingScenario`
  - Rule: Detect bare object literals in timeline states
  - File: `tooling/eslint-plugin-test-patterns/`

- [ ] Add pre-commit hook
  - Check: New test files use patterns from `support/`
  - Check: No sleep-based polling (`setTimeout` in tests)

- [ ] Create workshop materials
  - Slides: "Robust Test Patterns for Network & Polling"
  - Live demo: Migrating a flaky test
  - Q&A document

- [ ] Set up monitoring
  - Metric: Test flakiness rate (tracked in CI)
  - Metric: Test authoring time (developer survey)
  - Dashboard: Grafana panel for test health

**Success Criteria**:
- Linter catches 95%+ of anti-patterns
- Pre-commit hook prevents regressions
- Team workshop completed with 80%+ satisfaction

---

## 8. Success Metrics

### 8.1 Primary Metrics

**Note for Solo Developer**: Metrics focus on observable outcomes rather than statistical sampling. Track via spot checks and retrospectives.

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| **Test Flakiness Rate** | 40% (13/32 tests) | <1% | Spot checks: Run 5 migrated tests 20 times each |
| **Test Authoring Time** | 2+ hours | <30 minutes | Self-tracked: Time to write new polling test after Phase 3 |
| **Debugging Time** | 1-3 hours | <15 minutes | Self-tracked: Time from test failure to root cause |
| **Coverage (Polling Logic)** | 9.14% | 70%+ | Jest coverage report |
| **Runtime Schema Errors** | 7 per test run | 0 | Zod error tracking (should be zero after fixtures) |

### 8.2 Secondary Metrics

| Metric | Baseline | Target | Measurement |
|--------|----------|--------|-------------|
| **Pattern Adoption** | 0% | 90% | Codebase scan for infrastructure usage |
| **Test Readability Score** | N/A | 4.5/5 | Code review survey |
| **CI Build Time (Tests)** | N/A | -20% | CI pipeline analytics |
| **Test LOC (per scenario)** | ~44 lines | <25 lines | Static analysis |
| **Mock Conflicts** | 5 per test file | 0 | Grep for problematic patterns |

### 8.3 Tracking & Reporting

**Solo Developer Tracking** (Lightweight, retrospective-based):

**Weekly Self-Check** (During migration):
- Number of tests migrated this week
- Any new flakiness observed? (yes/no + context)
- Blockers encountered (document in task notes)
- Estimated vs actual time spent

**Phase Retrospective** (After each phase):
- Primary metrics spot-check (run tests, measure one authoring session)
- What worked well? What didn't?
- Adjustments needed for next phase?
- Document in `docs/retrospectives/test-infrastructure-YYYY-MM-DD.md`

**Optional Tools** (if time permits):
- CI analytics: Compare test execution time pre/post migration
- Coverage trends: Jest HTML report comparison

---

## 9. Alternatives Considered

### 9.1 Alternative 1: Use Existing Mocking Libraries

**Considered**: MSW (Mock Service Worker), Nock, Polly.js

**Pros**:
- Battle-tested in production codebases
- Rich feature sets (recording, replay, etc.)
- Active maintenance and community

**Cons**:
- ❌ Doesn't solve mock lifecycle conflicts (still uses `mockImplementation`)
- ❌ No schema validation integration
- ❌ No built-in fake timer orchestration
- ❌ Steeper learning curve for team
- ❌ Overkill for unit tests (designed for integration/E2E)

**Decision**: Rejected. Our problems are test-layer orchestration, not HTTP interception. Custom solution better fits our constraints.

---

### 9.2 Alternative 2: Record/Replay Framework

**Considered**: VCR pattern with fixtures stored as JSON/YAML

**Pros**:
- High fidelity to real API responses
- Easy to generate fixtures (just record once)

**Cons**:
- ❌ Doesn't solve timer control for polling
- ❌ Fixtures drift from schemas over time
- ❌ Hard to test edge cases (timeouts, retries)
- ❌ Large fixture files bloat repository

**Decision**: Rejected. Determinism and schema validation more important than perfect fidelity.

---

### 9.3 Alternative 3: Increase Test Timeouts

**Considered**: Raise Jest timeout from 5s to 30s+

**Pros**:
- Minimal code changes
- Quick fix for current failures

**Cons**:
- ❌ Doesn't solve root causes
- ❌ Slows down CI significantly
- ❌ Masks underlying issues (tech debt accumulates)
- ❌ False sense of stability

**Decision**: Rejected. Band-aid solution that compounds problems long-term.

---

### 9.4 Alternative 4: Integration Tests Instead of Unit Tests

**Considered**: Run tests against real backend (staging environment)

**Pros**:
- No mocking required
- Tests real behavior end-to-end

**Cons**:
- ❌ Violates `testing-standards.md` (no real network calls)
- ❌ Slow (minutes per test run)
- ❌ Flaky due to network/backend state
- ❌ Requires infrastructure management
- ❌ Hard to test edge cases (how to trigger timeout?)

**Decision**: Rejected. Unit tests with proper mocks are faster, more deterministic, and meet our standards.

---

## 10. Risks & Mitigations

### 10.1 Risk: Learning Curve for Team

**Description**: Team unfamiliar with new abstractions, slows adoption.

**Likelihood**: Medium
**Impact**: High

**Mitigation**:
1. Comprehensive documentation with examples
2. Workshop with live coding session
3. Pair programming for first migrations
4. Office hours for Q&A during Phase 3
5. Gradual rollout (migrate most problematic tests first)

**Contingency**: If adoption <50% by end of Phase 3, extend migration timeline and add more workshops.

---

### 10.2 Risk: Infrastructure Bugs

**Description**: New abstractions have bugs, break existing tests.

**Likelihood**: Medium
**Impact**: High

**Mitigation**:
1. 90%+ test coverage for infrastructure itself
2. Gradual rollout (test on small number of files first)
3. Keep old patterns working (no forced migration)
4. Rollback plan (revert PRs if issues found)
5. Beta period (2 weeks) before Phase 3 migration

**Contingency**: If critical bugs found, pause migration, fix infrastructure, resume after validation.

---

### 10.3 Risk: Performance Regression

**Description**: Abstraction layers add overhead, slow down test execution.

**Likelihood**: Low
**Impact**: Medium

**Mitigation**:
1. Benchmark infrastructure with profiling
2. Target: No more than 10% overhead vs raw mocks
3. Optimize hot paths (stage matching, schema validation)
4. Cache schema validators (Zod compile-time optimization)

**Contingency**: If overhead >10%, profile and optimize or simplify abstractions.

---

### 10.4 Risk: Standards Drift

**Description**: Over time, team reverts to old patterns.

**Likelihood**: Medium
**Impact**: Medium

**Mitigation**:
1. ESLint rules enforce patterns
2. Pre-commit hooks block anti-patterns
3. PR template checklist includes standards
4. Quarterly audits of test codebase
5. Metrics tracked in dashboard (visible to all)

**Contingency**: If drift detected (>20% non-compliant tests), run refresher workshop and tighten enforcement.

---

### 10.5 Risk: Fixture Validation Performance Overhead

**Description**: Zod validation on every fixture build adds cumulative overhead in large test suites.

**Likelihood**: Low
**Impact**: Low

**Mitigation**:
1. Benchmark representative test suite (100+ fixture builds)
2. Target: No more than 5% overhead vs raw object creation
3. If overhead exceeds target:
   - Add caching for immutable fixtures
   - Provide `buildUnsafe()` escape hatch for performance-critical paths
   - Use pre-built fixture constants in hot paths
4. Zod parse is typically <1ms per object; real-world impact likely negligible

**Contingency**: If performance issues arise, profile and add opt-out mechanisms while preserving safety for most tests.

---

### 10.6 Risk: Backend/Mobile Inconsistency

**Description**: Backend adopts different patterns, fragments knowledge.

**Likelihood**: Low
**Impact**: Medium

**Mitigation**:
1. Create `AwsScenario` adapter for backend in Phase 2
2. Share core concepts (staged mocks, fixtures, orchestrators)
3. Cross-team review of infrastructure PRs
4. Unified documentation covers both

**Contingency**: If patterns diverge significantly, create backend-specific proposal and align in later phase.

---

## 11. References

### 11.1 Internal Documents

- `standards/testing-standards.md` - Project testing requirements
- `docs/tests/reports/2025-10-28-mobile-adapter-tests.log` - Failure evidence
- `docs/tests/reports/2025-10-31-backend-test-implementation.md` - Backend context
- `CLAUDE.md` - Repository overview and standards governance

### 11.2 Code References

- `mobile/src/services/upload/__tests__/adapter.test.ts` - Failing test suite
- `mobile/src/services/upload/adapter.ts` - Upload adapter implementation
- `mobile/src/services/__tests__/stubs.ts` - Current test infrastructure
- `mobile/src/services/__tests__/testUtils.ts` - Timer utilities

### 11.3 External References

- [Jest Fake Timers](https://jestjs.io/docs/timer-mocks) - Jest documentation
- [Zod](https://zod.dev/) - Schema validation library
- [Cockatiel](https://github.com/connor4312/cockatiel) - Resilience policies
- [Testing Trophy](https://kentcdodds.com/blog/the-testing-trophy-and-testing-classifications) - Test strategy philosophy

### 11.4 Related Work

- [Mock Service Worker](https://mswjs.io/) - HTTP mocking (alternative considered)
- [VCR Pattern](https://github.com/vcr/vcr) - Record/replay (alternative considered)
- [TestContainers](https://testcontainers.com/) - Integration test infrastructure

---

## Appendix A: Implementation Checklist

**⚠️ REVISED CHECKLIST** for Option C (Modified Full Proposal) - 4 weeks timeline

Copy this checklist to track implementation progress:

```markdown
## Week 1: Layer 1 + ESLint (BLOCKING) 🔴
- [ ] FetchScenario implementation (~300 LOC)
- [ ] FetchScenario tests (~500 LOC, 90%+ coverage)
- [ ] TypeScript constraint: `type BuilderFn<T> = (o?: Partial<T>) => T`
- [ ] ESLint rule: no-unbound-builder (detect `builder: Fixtures.Job.build`)
- [ ] ESLint rule integrated in CI (BLOCKING)
- [ ] Feature flag: `USE_LEGACY_POLLING_HELPERS`
- [ ] Pilot migration 1: adapter.test.ts lines 457-509 (poll until complete)
- [ ] Pilot migration 2: adapter.test.ts lines 511-558 (poll with failure)
- [ ] Pilot migration 3: adapter.test.ts lines 560-600 (timeout test)
- [ ] GATE CHECK: All 3 pilots pass with ESLint active

## Week 2: Enhance Existing Builders (SIMPLIFIED) ⚠️
- [ ] ⚠️ SKIP: FixtureBuilder class (saves ~500 LOC)
- [ ] Add Zod validation to buildJob() (~1 LOC)
- [ ] Add Zod validation to buildPresignUploadResponse() (~1 LOC)
- [ ] Add Zod validation to buildBatchJob() (~1 LOC)
- [ ] Add Zod validation to buildBatchUploadResponse() (~1 LOC)
- [ ] Add Zod validation to buildDeviceTokenResponse() (~1 LOC)
- [ ] Document builder enhancement in support/README.md
- [ ] Verify zero runtime schema validation errors
- [ ] Benchmark Zod overhead (<1ms per fixture)

## Week 3: Layer 3 Simplified ⚠️
- [ ] PollingOrchestrator implementation (~250 LOC)
- [ ] PollingOrchestrator tests (~400 LOC, 90%+ coverage)
- [ ] Use BuilderFn<T> type constraint (enforced by ESLint)
- [ ] Pattern: immediateCompletion (~20 LOC)
- [ ] Pattern: typicalProcessing (~30 LOC)
- [ ] Pattern: processingFailure (~25 LOC)
- [ ] Pattern: timeout (~15 LOC)
- [ ] ⚠️ DEFER: Batch patterns (add when 3+ tests duplicate)
- [ ] ⚠️ DEFER: Long processing patterns
- [ ] Document patterns in support/README.md (state: "examples to fork")
- [ ] Decision tree: PollingOrchestrator vs createPollingScenario

## Week 4: Migration + Validation ✅
- [ ] Migrate adapter.test.ts polling tests (lines 437-705)
- [ ] Migrate notification/adapter.test.ts (similar patterns)
- [ ] ⚠️ DEFER: Backend AwsScenario (if timeline at risk)
- [ ] Metrics: Run test suite 20x, measure flakiness (<1% target)
- [ ] Metrics: Time 1 new polling test authoring (<30min target)
- [ ] Documentation: Quick start guide
- [ ] Documentation: API reference (3 components)
- [ ] Documentation: Common pitfalls (unbound methods, Response body)
- [ ] Documentation: Decision tree for API selection
- [ ] Documentation: Before/after migration examples
- [ ] Validate success criteria: 90%+ tests migrated, <1% flakiness

## Phase 5: Enforcement (OPTIONAL - Deferred)
- [ ] Additional ESLint rules (if needed)
- [ ] Pre-commit hooks (if needed)
- [ ] Metrics dashboard (if needed)
- [ ] Workshop materials (if team grows)

## Savings Summary
- ✅ FixtureBuilder class skipped: ~500 LOC saved
- ✅ Pattern library simplified: ~200 LOC saved
- ✅ Timeline reduced: 6 weeks → 4 weeks (33% faster)
- ✅ Maintenance burden reduced: ~700 LOC total savings
```

---

## Appendix B: Before/After Examples

### Before (Current Pattern)

```typescript
// 44 lines of setup, hard to understand, flaky
it('should poll until job completes', async () => {
  const mockJobId = 'f47ac10b-58cc-4372-a567-0e02b2c3d479';
  const mockBlob = new Blob(['fake image data']);

  mockFetch
    .mockResolvedValueOnce(
      schemaSafeResponse({
        schema: PresignUploadResponseSchema,
        build: buildPresignUploadResponse,
        overrides: { jobId: mockJobId },
      })
    )
    .mockResolvedValueOnce(createMockResponse({ data: mockBlob }))
    .mockResolvedValueOnce(createMockResponse({ status: 200 }));

  createPollingScenario({
    fetchMock: mockFetch,
    matcher: (input) => String(input).includes('/status/'),
    schema: JobSchema,
    build: buildJob,
    timeline: [
      { jobId: mockJobId, status: 'QUEUED' }, // ❌ Missing userId, createdAt, etc.
      { jobId: mockJobId, status: 'PROCESSING' },
      {
        jobId: mockJobId,
        status: 'COMPLETED',
        finalS3Key: `results/${mockJobId}/output.jpg`,
      },
    ],
    repeatLast: true,
  });

  const progressCalls: number[] = [];
  const onProgress = jest.fn((progress) => progressCalls.push(progress));

  const processPromise = adapter.processImage(
    'file:///image.jpg',
    'test.jpg',
    1024,
    'test prompt',
    onProgress
  );

  const result = await advanceTimersUntilSettled(processPromise, { maxCycles: 10 });

  expect(result).toContain(`/download/${mockJobId}`);
  expect(onProgress).toHaveBeenCalled();
});
```

**Problems**:
- ❌ Mock lifecycle conflict (chained mocks wiped by scenario)
- ❌ Incomplete schema (timeline states missing required fields)
- ❌ Hard to read (setup scattered across 44 lines)
- ❌ Magic numbers (`maxCycles: 10` - why 10?)

---

### After (New Pattern)

```typescript
// 24 lines, self-documenting, deterministic
it('should poll until job completes', async () => {
  const orchestrator = new PollingOrchestrator({
    endpoint: '/status/',
    schema: JobSchema,
    builder: (overrides) => Fixtures.Job.build(overrides),
    pollInterval: 5000,
  });

  orchestrator.defineTimeline(
    PollingPatterns.typicalProcessing('job-123', 15000).timeline
  );

  orchestrator.getScenario()
    .stage({ name: 'presign', matcher: FetchMatchers.presignEndpoint, ... })
    .stage({ name: 'image-fetch', matcher: FetchMatchers.localFile, ... })
    .stage({ name: 's3-upload', matcher: FetchMatchers.s3Upload, ... });

  const progressCalls: number[] = [];
  const onProgress = jest.fn((progress) => progressCalls.push(progress));

  const result = await orchestrator.run(
    mockFetch,
    () => adapter.processImage('file:///image.jpg', 'test.jpg', 1024, 'test prompt', onProgress)
  );

  expect(result).toContain('/download/job-123');
  expect(progressCalls).toContain(100);
  orchestrator.getScenario().assertStageCalled('presign', 1);
});
```

**Improvements**:
- ✅ No mock lifecycle conflicts (staged scenarios compose correctly)
- ✅ Complete schemas (Fixtures.Job.build ensures all required fields)
- ✅ Self-documenting (stage names, pattern names reveal intent)
- ✅ Deterministic (timeline driven by time, not call counts)
- ✅ Reusable (PollingPatterns shared across tests)
- ✅ Fewer lines (24 vs 44)

---

## Appendix C: Glossary

| Term | Definition |
|------|------------|
| **Mock Lifecycle Conflict** | When `mockImplementation()` overwrites previously configured `mockResolvedValueOnce()` chains, causing unexpected behavior. |
| **Schema-Complete Fixture** | Test data that includes all fields required by a Zod schema, validated at build time. |
| **Staged Mock** | A mock configuration organized into named stages, each handling specific request patterns without conflicts. |
| **Polling Orchestrator** | An abstraction that manages fake timers and state progression for polling tests. |
| **Timeline State** | A snapshot of the system state at a specific point in time (e.g., "at 10 seconds, job is PROCESSING"). |
| **Declarative Test** | A test that describes "what should happen" rather than "how to make it happen". |
| **Resilience Policy** | Retry, circuit breaker, or timeout logic (implemented via cockatiel library). |
| **Fake Timers** | Jest feature that replaces native timers with controllable mocks for deterministic testing. |

---

## Document History

| Version | Date | Author | Changes |
|---------|------|--------|---------|
| 0.1 | 2025-10-31 | Development Team | Initial draft |
| 0.2 | 2025-10-31 | Development Team | Critical fixes: unbound methods, Response body consumption, deep merge support, realistic timeline (2 weeks Phase 1), solo-dev metrics, pattern flexibility |
| 0.3 | 2025-10-31 | Development Team | **CRITICAL ANALYSIS INTEGRATED**: Comparative evaluation vs. current implementation. Key findings: (1) Mock lifecycle conflicts confirmed critical severity, (2) Layer 2 (FixtureBuilder) deemed duplicate effort - recommend skip, (3) Timeline reduced 6→4 weeks, (4) ESLint enforcement moved to Week 1 (non-negotiable), (5) Pattern library simplified 12→5 examples. Overall effectiveness: 6.2/10. Recommended: Option C (Modified Full) with ~700 LOC savings. |

---

**Next Steps (REVISED)**:
1. 🔴 **DECISION REQUIRED**: Review [Critical Analysis Results](#critical-analysis-results) (lines 88-336) and select implementation path:
   - **Option A** (Incremental, 2 weeks, low risk) ⭐ RECOMMENDED IF CONSTRAINED
   - **Option B** (Layer 1 Only, 3 weeks, medium risk)
   - **Option C** (Modified Full, 4 weeks, manageable risk) ⭐ RECOMMENDED FOR MAX VALUE

2. **If Option C selected**:
   - ✅ Week 1: Implement `FetchScenario` + ESLint rule (MUST COMPLETE TOGETHER - BLOCKING)
   - ✅ Week 1: Validate with 3 pilot test migrations (GATE: do not proceed to Week 2 until pass)
   - ✅ Week 2: Enhance existing builders in `stubs.ts` (skip `FixtureBuilder` class - saves 500 LOC)
   - ✅ Week 3: Implement `PollingOrchestrator` with 5 patterns only (defer batch patterns - saves 200 LOC)
   - ✅ Week 4: Migrate high-priority tests + validate metrics (<1% flakiness, <30min authoring)

3. **Non-Negotiable Requirements**:
   - ESLint rule MUST be implemented in Week 1 (not deferred to Phase 4)
   - If ESLint rule not feasible in Week 1 → Escalate to Option A (Incremental) instead
   - Type constraint: `type BuilderFn<T> = (o?: Partial<T>) => T` (forces arrow syntax)
   - Feature flag for gradual rollout: `USE_LEGACY_POLLING_HELPERS`

4. **Timeline Expectation**: 4 weeks (vs. 6 weeks original), ~700 LOC saved, 80% of proposal benefits

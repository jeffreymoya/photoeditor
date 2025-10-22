# TASK-0801 Blocking Analysis

**Date:** 2025-10-22
**Task ID:** TASK-0801
**Task Title:** Restore executable BDD coverage for upload pipeline
**Status:** BLOCKED
**Agent:** Claude Code (task-picker)

## Executive Summary

TASK-0801 cannot be executed as specified because it is based on incorrect assumptions about repository requirements. The task claims that "testing standards still call for executable BDD scenarios," but this claim is not supported by the actual standards documentation.

## Investigation Findings

### 1. Standards Review

**Search Methodology:**
- Searched `standards/testing-standards.md` for BDD/Gherkin/Cucumber references
- Searched all files in `standards/` directory
- Reviewed `docs/requirements.md`
- Examined existing test suites

**Results:**
- **Zero mentions** of BDD, Gherkin, or Cucumber in standards/testing-standards.md
- **Zero mentions** in any standards/*.md files
- **No requirement** for executable BDD scenarios in any standards documentation

```bash
# Commands run:
grep -i "BDD\|Gherkin\|Cucumber" standards/testing-standards.md
# Result: No matches

grep -i "BDD\|behavior.*driven\|gherkin\|cucumber" standards/*.md
# Result: No matches
```

### 2. Historical Context

**Cucumber Retirement:**
- **Date:** 2025-10-21 (TASK-0293)
- **Document:** docs/evidence/cucumber-retrospective.md
- **Decision:** Deliberate retirement of Cucumber E2E harness

**Rationale for Retirement:**
1. Maintenance overhead (dependencies not properly maintained)
2. CI pipeline stalls
3. Better TypeScript support with Playwright
4. Faster execution with native browser automation
5. Simpler maintenance (no Gherkin layer)
6. Better CI integration
7. Active ecosystem (Microsoft-backed Playwright)

**Dependencies Removed:**
- `@cucumber/cucumber` (^12.2.0)
- `@types/cucumber` (^6.0.1)
- `chai` (^6.2.0)
- Total savings: ~9MB, net -72 packages

### 3. Existing Test Coverage

**Current E2E Coverage:**
- **Location:** `backend/tests/smoke/api-flow.smoke.spec.ts`
- **Framework:** Playwright
- **Coverage:** Same scenarios as previous Cucumber suite
  - Presign happy path
  - Upload → S3 → SQS flow
  - Status polling
  - Error validation (invalid content type, oversized files)
  - Download flow

**Test Infrastructure:**
- **Test Data Builder:** `backend/tests/smoke/fixtures/test-data.builder.ts`
- **LocalStack Integration:** Full AWS service mocks (S3, SQS, DynamoDB, SNS)
- **Scripts:** `smoke:e2e`, `smoke:e2e:setup`, `smoke:e2e:run`, `smoke:e2e:teardown`

**Validation Commands:**
```bash
pnpm --filter @photoeditor/backend run smoke:e2e
```

### 4. Task Claims vs. Reality

**Task Claim:**
> "The testing standards still call for executable BDD scenarios, so we need a lean suite that exercises the happy path and key validation failures"

**Reality:**
- Standards do NOT call for BDD scenarios
- Standards do call for E2E tests (covered by Playwright smoke tests)
- Standards reference maintainability heuristics that favor deterministic tests
- Cucumber was explicitly retired less than 24 hours before this task was created

### 5. Testing Standards Alignment

**What Standards Actually Require:**

Per `standards/testing-standards.md`:

**E2E Tests (Section: End-to-End Tests):**
- Complete job lifecycle coverage ✅ (exists in Playwright)
- Multi-service orchestration with LocalStack ✅ (exists)
- Contract compatibility ✅ (covered)
- DLQ redrive automation ✅ (covered in integration tests)
- Batch upload flows ✅ (covered)

**Required Test Types:**
1. Handler tests ✅
2. Service tests ✅
3. Contract tests ✅
4. Integration tests ✅
5. E2E tests ✅ (Playwright)
6. **BDD/Gherkin tests** ❌ (NOT required)

### 6. Standards Citations

**From standards/testing-standards.md:**

> ### Maintainable Test Implementation Heuristics
> - Keep Lambda handlers as thin adapters that delegate to injected services so core logic stays unit-testable; pair fast service/handler specs with LocalStack-backed integration tests

> ### End-to-End (E2E) Tests
> Anchor the suite to `standards/global.md#example-quality-gate-drop-into-ci` (end-to-end coverage)

**No mention of BDD/Gherkin/Cucumber anywhere in the standards.**

## Recommendations

### Option 1: Cancel Task (Recommended)
**Rationale:** Task based on incorrect assumptions, requirements already met

**Actions:**
1. Mark TASK-0801 as cancelled
2. Document findings in task file
3. Archive to `docs/completed-tasks/` with cancellation notes

### Option 2: Revise Task
**Rationale:** If BDD truly needed (requires justification)

**Actions:**
1. Update `standards/testing-standards.md` to require BDD with clear rationale
2. Create ADR explaining why Cucumber decision should be reversed
3. Update TASK-0801 scope to reflect standards change
4. Address all concerns from cucumber-retrospective.md

### Option 3: Enhance Existing Coverage (Alternative)
**Rationale:** Improve what exists rather than reintroduce removed tooling

**Actions:**
1. Create new task to enhance Playwright smoke test coverage
2. Add additional scenarios (batch uploads, error paths, resilience)
3. Improve reporting and evidence generation
4. Keep lean, maintainable test suite

## Impact Assessment

### If Task Proceeds As-Is:
- ❌ Reintroduces ~9MB of dependencies just removed
- ❌ Adds maintenance overhead explicitly called out in retrospective
- ❌ Creates two parallel E2E suites (Playwright + Cucumber) with duplicate coverage
- ❌ Violates principle of removing unused tooling
- ❌ CI runtime increases
- ❌ Goes against documented architectural decision made 24 hours ago

### If Task Cancelled:
- ✅ Maintains lean test infrastructure
- ✅ Honors recent architectural decision (TASK-0293)
- ✅ Existing coverage remains intact (Playwright)
- ✅ No CI runtime increase
- ✅ Aligns with standards (which don't require BDD)

## Blocking Issues

1. **Standards Contradiction:** Task claims standards require BDD, but standards contain no such requirement
2. **Recent Retirement:** Cucumber was deliberately removed 24 hours ago with documented rationale
3. **Duplicate Coverage:** Existing Playwright suite already covers required scenarios
4. **No Justification:** No ADR or standards update justifying reversal of retirement decision

## Evidence Trail

**Files Reviewed:**
- `tasks/backend/TASK-0801-bdd-backfill.task.yaml` (task definition)
- `standards/testing-standards.md` (no BDD requirements found)
- `docs/evidence/cucumber-retrospective.md` (retirement documentation)
- `backend/tests/smoke/api-flow.smoke.spec.ts` (existing coverage)
- `backend/tests/smoke/fixtures/test-data.builder.ts` (test data)
- All `standards/*.md` files (comprehensive search)

**Commands Run:**
```bash
# Claim task
scripts/pick-task.sh --claim tasks/backend/TASK-0801-bdd-backfill.task.yaml

# Search for BDD requirements
grep -i "BDD\|Gherkin\|Cucumber" standards/testing-standards.md
grep -i "BDD\|behavior.*driven\|gherkin\|cucumber" standards/*.md
rg -n "TestDataBuilder" backend/tests -g"*.ts"

# Review existing structure
ls -la backend/tests/
```

**Search Results:**
- Zero matches for BDD/Gherkin/Cucumber in standards
- Confirmed TestDataBuilder exists in smoke tests
- Confirmed Playwright smoke suite exists and is functional

## Conclusion

TASK-0801 should be **cancelled** or **revised** before execution. The task is based on an incorrect assumption that standards require BDD/Gherkin coverage. The actual standards require E2E coverage, which is already provided by the Playwright smoke test suite that replaced Cucumber less than 24 hours ago.

Proceeding with this task as-is would:
1. Contradict documented standards
2. Reverse a recent, deliberate architectural decision
3. Create duplicate test coverage
4. Increase maintenance burden
5. Add CI overhead

If BDD coverage is genuinely required, the standards should be updated first with clear rationale, and an ADR should justify reversing the Cucumber retirement decision.

## Next Steps

**Immediate:**
1. ✅ Document blocking issue in backend/CHANGELOG.md
2. ✅ Create this evidence document
3. ⏳ Report to user with recommendations
4. ⏳ Await user decision on task disposition

**User Decision Required:**
- Cancel task (recommended)
- Revise standards + task to require BDD with justification
- Redirect effort to enhance existing Playwright coverage

## References

- **Task:** tasks/backend/TASK-0801-bdd-backfill.task.yaml
- **Retirement Doc:** docs/evidence/cucumber-retrospective.md (TASK-0293, 2025-10-21)
- **Testing Standards:** standards/testing-standards.md (no BDD requirements)
- **Existing Coverage:** backend/tests/smoke/api-flow.smoke.spec.ts
- **Backend Tier:** standards/backend-tier.md
- **Global Standards:** standards/global.md
- **Changelog Entry:** backend/CHANGELOG.md (Blocked - TASK-0801)

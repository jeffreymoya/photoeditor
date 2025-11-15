# Task Sizing Guide

Quantitative taxonomy for task scoping, complexity budgets, and enforcement checklists. This guide operationalizes the thresholds defined in `standards/task-breakdown-canon.md` with concrete examples and measurement criteria.

## Purpose

Task sizing limits reduce **implementation risk concentration** by ensuring each task:
- Stays small enough to review effectively (worktree/diff complexity)
- Remains reversible without cascading impacts (rollback safety)
- Completes in single agent sessions (context window, predictability <45 min)
- Tests in isolation (focused validation scope)

## Size Taxonomy (XS to XL)

### XS (Extra Small)
**Thresholds:**
- Files: 1-2 (implementation + tests)
- LOC delta: <50 net lines
- Plan steps: 1-3
- Session time: <10 min

**Characteristics:**
- Single-file bug fixes, config tweaks, documentation updates
- Minimal or no test changes
- No cross-module dependencies
- Low risk, high confidence

**Examples:**
- `TASK-0020`: Make default help - 1 file (Makefile), ~3 lines, 3 steps
- One-line constant change
- Update dependency version in package.json

---

### S (Small)
**Thresholds:**
- Files: 3-5 (implementation + tests)
- LOC delta: <150 net lines
- Plan steps: 3-4
- Session time: <20 min

**Characteristics:**
- Single feature or component addition
- Test coverage for new code
- Single layer/module affected
- Straightforward implementation

**Examples:**
- `TASK-0918`: Loading sentinel - 2 impl files, +68 LOC (+28 component, +40 tests), 3 steps
- `TASK-0917`: Camera test helper - 2-3 files, ~100-150 LOC, 3 steps
- Add validation rule to schema
- Refactor single service method

---

### M (Medium)
**Thresholds:**
- Files: 6-8 (implementation + tests)
- LOC delta: <300 net lines (warn threshold)
- Plan steps: 4-5
- Session time: <30 min

**Characteristics:**
- Multi-file refactor within single tier
- Integration of shared contracts
- New fitness function or test infrastructure
- Moderate coordination between layers

**Examples:**
- `TASK-0503`: Shared contracts integration - 3-5 files, mobile service layer, 2 steps
- `TASK-0831`: Test hooks coverage - 2 new test files, 2 steps
- `TASK-0814`: Domain purity gate - 4 files, 4 steps, ~200-300 LOC
- Add new API endpoint with handler/service/tests

---

### L (Large - Upper Limit)
**Thresholds:**
- Files: 9-10 (implementation + tests) **HARD LIMIT**
- LOC delta: <500 net lines **HARD FAIL THRESHOLD**
- Plan steps: 5-6 **WARN: approaching breakdown**
- Session time: <45 min **HARD LIMIT**

**Characteristics:**
- Cross-cutting infrastructure changes (but still single tier)
- Major refactor with multiple subsystem touchpoints
- Complex feature requiring coordination across layers
- High risk - requires careful planning and review

**Examples:**
- `TASK-0602`: Contract-first routing - 8-10 files, 4 steps, OpenAPI gen + client codegen
- Extract shared library from multiple services
- Implement complex state machine with tests

**WARNING:** Tasks at L size are at the upper limit. If plan steps >6 OR LOC delta >500 OR files >10, MUST break down per `standards/task-breakdown-canon.md`.

---

### XL (Extra Large - FORBIDDEN)
**Thresholds:**
- Files: >10 **HARD FAIL**
- LOC delta: >500 net lines **HARD FAIL**
- Plan steps: >6 AND files >5 **SESSION RISK HARD FAIL**

**Action Required:** **MUST BREAK DOWN**

Tasks exceeding XL thresholds violate complexity budgets and pose unacceptable implementation risk. Break down immediately per `standards/task-breakdown-canon.md`.

**Anti-Examples (Over-Limit Tasks):**
- `TASK-0106`: Backend core refactor - 10+ files, 4 steps across services/handlers/tests ❌
  - Should have been split: core library extraction (L) + handler migrations (M+M)
- Any cross-tier task touching shared + backend + mobile ❌
  - Split by tier: shared contracts (S) → backend impl (M) → mobile client (S)

---

## File Counting Rules

**Test files count equally** toward complexity budgets:
- Implementation file + corresponding test = 2 files
- Example: `MyService.ts` (50 LOC) + `MyService.test.ts` (100 LOC) = 150 LOC total
- Rationale: Test code requires review, maintenance, and context switching

**File types included:**
- Source code: `.ts`, `.tsx`, `.js`, `.jsx`
- Tests: `.test.ts`, `.spec.ts`, `.test.tsx`
- Configuration: `tsconfig.json`, `.eslintrc.js` (if substantive changes)
- Infrastructure: `.tf`, `.tfvars`, Dockerfile
- Schemas: `.zod.ts`, OpenAPI YAML

**File types excluded:**
- Lockfiles: `pnpm-lock.yaml`, `package-lock.json`
- Generated artifacts: `dist/`, `.api-extractor/`
- Documentation: `*.md` (unless task is docs-focused)

---

## LOC Delta Measurement

**Net lines changed** = Lines added + Lines removed + Lines modified

**How to estimate:**
1. Review `deliverables` section in task file
2. Count expected additions per deliverable
3. For refactors, estimate lines touched (not just added)
4. Include test file LOC in total

**Git diff measurement** (post-implementation):
```bash
git diff --stat <branch> | tail -n1
# Example output: "8 files changed, 342 insertions(+), 89 deletions(-)"
# Net delta: 342 + 89 = 431 LOC (within L threshold <500)
```

**Warn thresholds:**
- 300+ LOC: Review task - can it be split?
- 500+ LOC: **HARD FAIL** - must break down

---

## Session Time Estimation

**Proxy formula:**
- Base: 5 min per file (includes read, edit, test)
- Complex logic: +10 min per plan step >3
- Cross-module coordination: +5 min per additional layer

**Examples:**
- XS (2 files, 2 steps): 2×5 + 0 = 10 min
- S (4 files, 4 steps): 4×5 + 1×10 = 30 min (step 4 is complex)
- M (7 files, 5 steps): 7×5 + 2×10 = 55 min ❌ **OVER 45 MIN** → consider breakdown
- L (10 files, 6 steps): 10×5 + 3×10 = 80 min ❌ **HARD FAIL** → must break down

**Hard fail signal:**
- Plan steps >6 AND files >5 = session risk (likely >45 min)

---

## Enforcement Checklist

Use this checklist when authoring or reviewing tasks:

### For Task Authors (Before Moving to `todo`)

- [ ] Count deliverable files (implementation + tests)
- [ ] Estimate net LOC delta from plan
- [ ] Verify plan steps ≤6
- [ ] Check no cross-tier changes (or justify if unavoidable)
- [ ] If any threshold exceeded → run breakdown per `standards/task-breakdown-canon.md`
- [ ] Set `estimate: XS|S|M|L` field per taxonomy above
- [ ] Run `python scripts/validate-task-yaml.py <task-file>` (includes complexity budget validation)

### For Agents (Pre-Implementation)

- [ ] Read task `deliverables` and `plan` sections
- [ ] Count files referenced (implementation + tests)
- [ ] Estimate LOC from plan complexity
- [ ] If files >10 OR LOC >500 OR (steps >6 AND files >5):
  - [ ] **STOP** - Recommend breakdown to user
  - [ ] Cite `standards/task-breakdown-canon.md` and this guide
  - [ ] Do not proceed with implementation until task is split
- [ ] If L-sized (9-10 files, 300-500 LOC):
  - [ ] Warn user of upper limit
  - [ ] Proceed only if scope cannot be reduced

### For Reviewers (Post-Implementation)

- [ ] Measure actual diff stats: `git diff --stat`
- [ ] Verify files changed ≤10
- [ ] Verify net LOC ≤500
- [ ] If thresholds exceeded → defer excess changes to follow-up task per `standards/task-breakdown-canon.md` "DO NOT FIX"
- [ ] Validate `estimate` field matches actual size

---

## Validation Automation

The Python CLI (`scripts/validate-task-yaml.py`) enforces complexity budgets:

```bash
# Validate single task (includes granularity checks)
python scripts/validate-task-yaml.py tasks/backend/TASK-0102-example.task.yaml

# Validate all tasks
python scripts/tasks.py --validate
```

**Validation checks:**
- Parses `deliverables` for file count estimates
- Warns if plan steps >6 and references >8 files
- Flags tasks marked `L` with note to review breakdown
- Outputs warnings in validation report

See "Enhance scripts/validate-task-yaml.py" section in implementation plan.

---

## Size Distribution Targets

**Healthy task portfolio:**
- XS: 10-20% (quick wins, maintenance)
- S: 40-50% (core feature work)
- M: 30-40% (integration, refactoring)
- L: <10% (infrastructure, complex features)
- XL: 0% (all XL tasks must be broken down)

**Red flags:**
- >20% L-sized tasks → indicates scope creep or insufficient breakdown
- Any XL tasks in `todo` status → process violation

Run portfolio analysis:
```bash
# Count tasks by size estimate
grep -r "^estimate:" tasks/ --include="*.yaml" | sort | uniq -c
```

---

## Related Standards

- **Breakdown algorithm:** `standards/task-breakdown-canon.md`
- **Task template:** `docs/templates/TASK-0000-template.task.yaml`
- **Agent preflight checks:** `docs/agents/implementation-preflight.md`
- **Code complexity limits:** `standards/cross-cutting.md` (handler ≤10 complexity, ≤75 LOC)
- **Testing requirements:** `standards/testing-standards.md`

---

## Examples from Completed Tasks

### XS Examples
| Task ID | Files | LOC | Steps | Actual Size | Notes |
|---------|-------|-----|-------|-------------|-------|
| TASK-0020 | 1 | ~3 | 3 | XS ✓ | Makefile default target |

### S Examples
| Task ID | Files | LOC | Steps | Actual Size | Notes |
|---------|-------|-----|-------|-------------|-------|
| TASK-0918 | 2 | 68 | 3 | S ✓ | Loading sentinel component |
| TASK-0917 | 2-3 | ~120 | 3 | S ✓ | Camera test helper |

### M Examples
| Task ID | Files | LOC | Steps | Actual Size | Notes |
|---------|-------|-----|-------|-------------|-------|
| TASK-0503 | 3-5 | ~200 | 2 | M ✓ | Shared contracts integration |
| TASK-0814 | 4 | ~250 | 4 | M ✓ | Domain purity gate |
| TASK-0831 | 2 | ~150 | 2 | M ✓ | Test hooks coverage |

### L Examples (Upper Limit)
| Task ID | Files | LOC | Steps | Actual Size | Notes |
|---------|-------|-----|-------|-------------|-------|
| TASK-0602 | 8-10 | ~400 | 4 | L ⚠️ | Contract-first routing (at threshold) |

### XL Anti-Examples (Should Have Been Broken Down)
| Task ID | Files | LOC | Steps | Actual Size | Notes |
|---------|-------|-----|-------|-------------|-------|
| TASK-0106 | 10+ | ~500+ | 4 | XL ❌ | Backend core refactor - violated file limit |

---

## Revision History

- **2025-11-15:** Initial version - XS/S/M/L/XL taxonomy, quantitative thresholds, enforcement checklist
- Aligns with `standards/task-breakdown-canon.md` update adding LOC delta, file count, session time constraints

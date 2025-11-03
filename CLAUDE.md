# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository. The PhotoEditor project is maintained by a solo developer, so every automation and guideline in this document is designed to provide the rigor that would otherwise come from peer review.

> IMPORTANT
> - Governance & Grounding: Always read and honor `standards/standards-governance-ssot.md` before interpreting or changing any standard.
> - Task Decomposition: When a task feels complex or is marked blocked due to complexity, follow `standards/task-breakdown-canon.md` to split work and encode dependencies.

## Repository Overview

PhotoEditor is a TypeScript monorepo with AWS Lambda backend, React Native mobile app, shared contracts, and Terraform infrastructure. Users upload photos for AI-powered analysis/editing with results delivered via polling or push notifications. Because there is no broader team, assume institutional knowledge lives in the repository history, tasks, and ADRs you curate.

Structure:
- `backend/` — AWS Lambda handlers, services, providers
- `mobile/` — React Native (Expo) client
- `shared/` — Zod schemas, types, constants
- `infrastructure/` — Terraform IaC

## Source of Truth & Standards

**CRITICAL:** All implementation and refactoring must align with (read first):

0. **Governance & Breakdown (MUST READ)**
   - `standards/standards-governance-ssot.md` — authoritative grounding and standards CR workflow
   - `standards/task-breakdown-canon.md` — definitive algorithm for task breakdown and deferrals

1. **`standards/`** — Architectural Standards (ISO/IEC 25010 maintainability)
   - `standards/AGENTS.md` — Overview and tier map
   - `standards/typescript.md` — Language-level practices (strict config, unions, Results, contracts)
   - `standards/global.md` — Universal governance, release requirements, evidence bundles
   - `standards/backend-tier.md` — Handler complexity, layering rules, platform & quality layer
   - `standards/frontend-tier.md` — Mobile components, state management, platform & delivery
   - `standards/shared-contracts-tier.md` — Contract-first APIs, versioning, fitness gates
   - `standards/infrastructure-tier.md` — Terraform modules, local dev platform
   - `standards/cross-cutting.md` — Hard fail controls, maintainability, reliability, observability

2. **`standards/testing-standards.md`** — Testing requirements for task alignment
   - Maps test requirements to standards tier files
   - Specifies validation commands and acceptance criteria format

3. **Agent prompt sources**
 - Active prompts in `.claude/agents/` all reference shared checklists at `docs/agents/implementation-preflight.md` (pre-task grounding) and `docs/agents/diff-safety-checklist.md` (diff audit). Update those shared docs first when standards shift so every agent inherits the change.
  - Archived prompts are now stubs that simply point to repository history; consult git history if you need the legacy workflows.

### Agent Responsibilities (2025-11-02 update)

- **Task Implementer** runs lint/typecheck for every affected package (`lint:fix` ➜ `qa:static`) before handing off, records the command output in the implementation summary, and skips broader test suites.
- **Implementation Reviewer** reruns the same lint/typecheck pair after edits to ensure the diff stays green, capturing command results in the reviewer summary.
- **Validation agents** assume lint/typecheck already pass and focus on the remaining static/fitness commands plus unit/contract suites. Surface lint/typecheck regressions back to implementer/reviewer unless a trivial fix is applied in place.

**Key constraints from standards:**
- **Hard fail controls** (`standards/cross-cutting.md`): Handlers cannot import AWS SDKs, no cycles, complexity budgets
- **Layering rules** (`standards/backend-tier.md`): handlers → services → providers (one-way only)
- **Coverage thresholds** (`standards/backend-tier.md`, `standards/cross-cutting.md`): 80% lines, 70% branches for services/adapters
- **Handler constraints** (`standards/backend-tier.md`): Complexity ≤10 (fail), ≤75 LOC
- **Evidence requirements** (`standards/global.md`): Mandatory artifacts per release
- **Contract versioning** (`standards/shared-contracts-tier.md`): Breaking changes require `/v{n}` versioning
- **TypeScript rules** (`standards/typescript.md`): strict tsconfig (incl. `exactOptionalPropertyTypes`), Zod-at-boundaries, neverthrow Results (no exceptions for control flow), discriminated unions + `assertNever`, named exports in domain (no defaults), api-extractor for shared

When implementing or refactoring, cite specific standards tier files and sections in commits/PRs. Capture new architectural decisions in `adr/` and reference them in task files.

## Task Workflow

Work is organized in `tasks/` as `.task.yaml` files. Use `tasks/README.md` for authoring instructions and start from the canonical template at `docs/templates/TASK-0000-template.task.yaml`. As the sole maintainer, treat these records as your substitute for peer sign-off and retrospective context:

### Task Management

The Python CLI (`scripts/tasks.py`) provides deterministic task selection, dependency validation, and workflow automation. All commands support `--format json` for machine-readable output.

#### Core Commands

```bash
# List tasks (with optional filtering)
python scripts/tasks.py --list                    # All non-completed tasks
python scripts/tasks.py --list todo               # Only TODO tasks
python scripts/tasks.py --list unblocker          # Only unblocker tasks
python scripts/tasks.py --list --format json      # JSON output

# Pick next task (deterministic priority algorithm)
python scripts/tasks.py --pick                    # Highest priority ready task
python scripts/tasks.py --pick todo               # Filter to TODO status
python scripts/tasks.py --pick --format json      # JSON output with full metadata

# Claim task (transition to in_progress)
python scripts/tasks.py --claim tasks/mobile/TASK-0818-frontend-tier-gap-analysis.task.yaml

# Complete task (archive to docs/completed-tasks/)
python scripts/tasks.py --complete tasks/mobile/TASK-0818-frontend-tier-gap-analysis.task.yaml

# Validate dependency graph
python scripts/tasks.py --validate                # Check cycles, missing deps, duplicates

# Export dependency graph (DOT format for Graphviz)
python scripts/tasks.py --graph > tasks.dot
dot -Tpng tasks.dot -o tasks.png

# Force cache refresh (after manual task edits)
python scripts/tasks.py --refresh-cache

# Explain dependency chain for a task
python scripts/tasks.py --explain TASK-0818            # Show blockers, artifacts, readiness
python scripts/tasks.py --explain TASK-0818 --format json  # JSON output
```

#### Bash Wrapper (Backward Compatibility)

```bash
# All commands also work via pick-task wrapper (delegates to Python CLI)
scripts/pick-task --list
scripts/pick-task --pick todo
scripts/pick-task --claim tasks/backend/TASK-0102-...yaml
scripts/pick-task --complete tasks/backend/TASK-0102-...yaml
scripts/pick-task --validate
scripts/pick-task --graph
```

#### JSON Output Examples

```bash
# List tasks with full metadata
python scripts/tasks.py --list --format json
# Output: {"tasks": [{"id": "TASK-0818", "status": "todo", "priority": "P1", ...}]}

# Pick task with decision rationale
python scripts/tasks.py --pick --format json
# Output: {"task": {"id": "TASK-0818", ...}, "reason": "unblocker", "snapshot_id": 42}

# Validation results
python scripts/tasks.py --validate --format json
# Output: {"valid": true, "cycles": [], "missing": [], "duplicates": []}

# Explain dependency chain
python scripts/tasks.py --explain TASK-0200 --format json
# Output: {"task": {"id": "TASK-0200", ...}, "hard_blockers": [...], "artifact_dependencies": [...], "readiness": {"ready": false, ...}}
```

#### Prioritization Algorithm

Tasks are selected using deterministic precedence (per `docs/proposals/task-workflow-python-refactor.md` Section 3.2):

1. **Unblocker tasks first** (regardless of priority - P2 unblocker before P0 non-unblocker)
2. **Blocked tasks second** (surface for manual intervention)
3. **In-progress tasks third** (resume existing work)
4. **Priority fourth** (P0 > P1 > P2)
5. **TODO tasks fifth** (new work)
6. **Order field sixth** (lower values first)
7. **Task ID last** (lexicographic tie-breaker)

Only tasks with all `blocked_by` dependencies completed are considered "ready" for selection.

#### Cache Behavior

The CLI maintains `tasks/.cache/tasks_index.json` for fast lookups:
- Automatically refreshes when task file mtimes change
- Use `--refresh-cache` to force full rebuild
- Cache includes snapshot IDs for audit trail
- Atomic writes prevent torn reads

> **Status (2025-11-03)**: Python CLI Phase 2 active (automatic priority propagation, see `docs/proposals/transitive-unblocker-detection.md`). All Phase 1 features plus:
> - **Phase 2**: Automatic effective priority propagation - tasks inherit max priority of all work they transitively block
> - New selection reason: `priority_inherited` when tasks inherit higher priority from blocked work
> - JSON output includes `effective_priority` and `priority_reason` fields (always present, null when N/A)
> - Manual `unblocker: true` flag still takes highest precedence as override
> - Phase 1 features: Inline `blocked_by` arrays, unblocker-first prioritization, archive resolution
> - JSON output mode (`--format json`), deterministic output, file-based cache, bash wrapper compatibility

### Task Structure

Each task (per `tasks/README.md`) includes:
- `scope.in` / `scope.out` — what is/isn't in scope
- `plan` — ordered implementation steps
- `acceptance_criteria` — testable checks anchored to `standards/` tier files
- `validation` — pipeline-driven checks; add `manual_checks` only if human steps are required
- `deliverables` — expected files/changes

Tasks reference specific `standards/` tier files and `standards/testing-standards.md` for grounding. Completed tasks move to `docs/completed-tasks/`.

## Common Development Commands

### Quick Start

```bash
make deps          # Install dependencies
make mobile-ios    # iOS simulator
make mobile-android# Android emulator
make mobile-stop   # Stop Expo dev server
```

### Backend

```bash
pnpm turbo run build:lambdas --filter=@photoeditor/backend  # Build all lambda bundles
pnpm turbo run typecheck --filter=@photoeditor/backend      # Type check
pnpm turbo run lint --filter=@photoeditor/backend           # Lint
pnpm turbo run test --filter=@photoeditor/backend           # Unit tests
pnpm turbo run test:contract --filter=@photoeditor/backend  # Contract tests
```

### Mobile

```bash
pnpm turbo run start --filter=photoeditor-mobile     # Expo dev server
pnpm turbo run ios --filter=photoeditor-mobile       # iOS
pnpm turbo run android --filter=photoeditor-mobile   # Android
pnpm turbo run typecheck --filter=photoeditor-mobile # Type check
pnpm turbo run lint --filter=photoeditor-mobile      # Lint
pnpm turbo run test --filter=photoeditor-mobile      # Tests
```

### Validation (Pre-PR)

```bash
pnpm turbo run qa:static --parallel               # Quick static checks (typecheck, lint)
pnpm turbo run qa --parallel                      # Full QA suite (all fitness functions)
make qa-suite                                     # Convenience alias (delegates to pnpm turbo run qa)
pnpm turbo run contracts:check --filter=@photoeditor/shared  # Contract validation
```

## Architecture

### Backend Layering (Enforced by dependency-cruiser)

```
Handlers (lambdas/) → Services → Providers
```

**Critical rules from `standards/backend-tier.md` and `standards/cross-cutting.md`:**
- Handlers orchestrate services, never import providers or AWS SDKs directly (hard fail control)
- Services contain business logic, may call other services
- Providers are isolated adapters (cannot import handlers/services)
- Zero circular dependencies (hard fail)
- Enforced by dependency-cruiser rules in `tooling/dependency-rules.json`

### Mobile

- Redux Toolkit state (`mobile/src/store/slices/`)
- `ApiService` — HTTP client
- `NotificationService` — Expo push
- Navigation: React Navigation stack + tabs

### Shared Package

- Zod schemas (`shared/schemas/`) — contract-first API
- Framework-agnostic (`standards/shared-contracts-tier.md`: no React/AWS imports)
- Routes defined in `shared/routes.manifest.ts` as source of truth (ADR-0003)

## Key Patterns

### AWS Client Factory (ADR-0004)

Prefer the consolidated factory exported from the core library: `@backend/core` (see `backend/libs/core/aws/clients.ts`). Services receive clients via DI — never `new SomeClient()` in services/handlers.

### Contract-First API (ADR-0003, ADR-0005)

Schemas in `shared/schemas/`. Backend and mobile validate against these. Breaking changes require `/v{n}` versioning (`standards/shared-contracts-tier.md`). Routes defined in `shared/routes.manifest.ts` serve as source of truth, with OpenAPI specs generated from the manifest.

### Job Lifecycle

Presign → Upload → S3 event → SQS → Worker → Provider → Notification → Download

## Testing

See `standards/testing-standards.md` for complete requirements. Key thresholds:

- **Services/Adapters:** 80% lines, 70% branches (`standards/backend-tier.md`, `standards/cross-cutting.md`)
- **Handlers:** Complexity ≤10 (fail), ≤75 LOC (`standards/backend-tier.md`)
- **No handler AWS SDK imports** (hard fail control in `standards/cross-cutting.md`)

Run tests via task validation commands defined in `tasks/*.task.yaml`.

## Platform Notes

- **Android emulator:** Use `10.0.2.2` instead of `localhost` (handled by `make mobile-android`)
- **Expo API URL:** Set via `EXPO_PUBLIC_API_BASE_URL` (auto-injected by Make targets)

## Before Every PR

1. Ensure task file is current and linked in PR description
2. Run `pnpm turbo run qa:static --parallel` and attach output
3. Run `pnpm turbo run qa --parallel` and attach key artefacts
4. Cite specific `standards/` tier files and sections for any constraint changes
5. Include ADR if introducing new patterns (stored in `adr/`)
6. Verify acceptance criteria from task file are met
7. Attach evidence per `standards/testing-standards.md` and `standards/global.md`

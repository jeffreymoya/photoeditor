# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Repository Overview

PhotoEditor is a TypeScript monorepo with AWS Lambda backend, React Native mobile app, shared contracts, and Terraform infrastructure. Users upload photos for AI-powered analysis/editing with results delivered via polling or push notifications.

Structure:
- `backend/` — AWS Lambda handlers, services, providers
- `mobile/` — React Native (Expo) client
- `shared/` — Zod schemas, types, constants
- `infrastructure/` — Terraform IaC

## Source of Truth & Standards

**CRITICAL:** All implementation and refactoring must align with:

1. **`STANDARDS.md`** — Architectural Standards v3.1 (ISO/IEC 25010 maintainability)
   - Hard fail controls (lines 7-13): handlers cannot import AWS SDKs, no cycles, complexity budgets
   - Layering rules (line 24): handlers → services → providers (one-way only)
   - Coverage/mutation thresholds (lines 44-51): 80/70/60% for services/adapters
   - Evidence requirements (lines 126-132): mandatory artifacts per release

2. **`docs/testing-standards.md`** — Testing requirements for task alignment
   - Defines test types by component (handler, service, contract, integration, mobile, infra)
   - Maps test requirements to STANDARDS.md line numbers
   - Specifies validation commands and acceptance criteria format

When implementing or refactoring, cite specific STANDARDS.md sections in commits/PRs. Capture new architectural decisions in `adr/` and reference them in task files.

## Task Workflow

Work is organized in `tasks/` as `.task.yaml` files following the schema in `tasks/AGENTS.md`:

### Task Management

```bash
# List available tasks
scripts/pick-task.sh --list

# Pick highest-priority task without changing status
scripts/pick-task.sh --pick todo

# Claim a task (set status: in_progress)
scripts/pick-task.sh --claim tasks/backend/TASK-0102-...yaml

# Complete and archive task
scripts/pick-task.sh --complete tasks/backend/TASK-0102-...yaml
```

### Task Structure

Each task includes:
- `scope.in` / `scope.out` — what is/isn't in scope
- `plan` — ordered implementation steps
- `acceptance_criteria` — testable checks anchored to STANDARDS.md
- `validation.commands` — automated verification
- `deliverables` — expected files/changes

Tasks reference STANDARDS.md sections and docs/testing-standards.md for grounding. Completed tasks move to `docs/completed-tasks/`.

## Common Development Commands

### Quick Start

```bash
make deps                 # Install dependencies
make dev-ios             # LocalStack + infra + iOS simulator
make dev-android         # LocalStack + infra + Android emulator
make infra-down          # Tear down everything
```

### Backend

```bash
npm run build:lambdas --prefix backend    # Build all lambda bundles
npm run typecheck --prefix backend        # Type check
npm run lint --prefix backend             # Lint
npm test --prefix backend                 # All tests
npm run test:unit --prefix backend        # Unit only
npm run test:integration --prefix backend # Integration (LocalStack required)
```

### Mobile

```bash
npm start --prefix mobile       # Expo dev server
npm run ios --prefix mobile     # iOS
npm run android --prefix mobile # Android
npm run typecheck --prefix mobile
npm run lint --prefix mobile
npm test --prefix mobile
```

### Validation (Pre-PR)

```bash
npm run stage:a                 # Typecheck, lint, dependencies, dead-exports, duplication
make stage1-verify              # Full Stage 1 fitness (lint, tests, infra, build)
npm run contracts:check         # Contract validation
```

## Architecture

### Backend Layering (Enforced by dependency-cruiser)

```
Handlers (lambdas/) → Services → Providers
```

**Critical rules from STANDARDS.md:**
- Handlers orchestrate services, never import providers or AWS SDKs directly
- Services contain business logic, may call other services
- Providers are isolated adapters (cannot import handlers/services)
- Zero circular dependencies (hard fail)

### Mobile

- Redux Toolkit state (`mobile/src/store/slices/`)
- `ApiService` — HTTP client
- `NotificationService` — Expo push
- Navigation: React Navigation stack + tabs

### Shared Package

- Zod schemas (`shared/schemas/`) — contract-first API
- Framework-agnostic (STANDARDS.md line 64: no React/AWS imports)

## Key Patterns

### AWS Client Factory (ADR-0004)

All AWS SDK clients instantiated in `backend/src/libs/aws-clients.ts`. Services receive via DI — never `new SomeClient()` in services/handlers.

### Contract-First API (ADR-0003, ADR-0005)

Schemas in `shared/schemas/`. Backend and mobile validate against these. Breaking changes require `/v{n}` versioning (STANDARDS.md line 76).

### Job Lifecycle

Presign → Upload → S3 event → SQS → Worker → Provider → Notification → Download

## Testing

See `docs/testing-standards.md` for complete requirements. Key thresholds:

- **Services/Adapters:** 80% lines, 70% branches (STANDARDS.md line 47)
- **Mutation testing:** ≥60% (STANDARDS.md line 47)
- **Handlers:** Complexity ≤5 (warn ≥8, fail >10), ≤75 LOC (STANDARDS.md line 19)
- **No handler AWS SDK imports** (STANDARDS.md line 8)

Run tests via task validation commands defined in `tasks/*.task.yaml`.

## LocalStack

Local development uses LocalStack (S3, DynamoDB, SQS, SNS, Lambda, API Gateway, KMS).

```bash
make infra-up                                          # Start + deploy
curl -s http://localhost:4566/_localstack/health | jq # Health check
docker compose -f docker-compose.localstack.yml logs -f localstack
```

## Platform Notes

- **Android emulator:** Use `10.0.2.2` instead of `localhost` (handled by `make mobile-android`)
- **Expo API URL:** Set via `EXPO_PUBLIC_API_BASE_URL` (auto-injected by Make targets)

## Before Every PR

1. Ensure task file is current and linked in PR description
2. Run `npm run stage:a` and attach output
3. Cite STANDARDS.md sections for any constraint changes
4. Include ADR if introducing new patterns
5. Verify acceptance criteria from task file are met
6. Attach evidence per `docs/testing-standards.md`

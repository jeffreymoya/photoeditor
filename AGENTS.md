# Repository Guidelines

## Project Structure & Module Organization
`backend/` hosts TypeScript Lambdas arranged `lambdas → services → providers → utils`, `mobile/` is the Expo client (`src/` features, `assets/` media), and `shared/` exports DTOs/config. Terraform is in `infrastructure/`; long-form records stay in `adr/` and `docs/`.

## Workflow & Source of Truth
Plan and report via `tasks/`; each `.task.yaml` (template in `tasks/TASK-0000-template.task.yaml`) defines scope, status, and acceptance criteria—keep it current and link the task in every PR. `STANDARDS.md`, `ARCHITECTURE.md`, and the ADR library are the SSOT: relate each change to them, cite the clause for any exception, and capture new decisions with ADRs referenced from the task and PR.

## Build, Test, and Development Commands
Run `make deps` once, then `make dev-ios` or `make dev-android` to start LocalStack and Expo with the generated API URL. Backend iterations use `make backend-build` or `npm run build:lambdas --prefix backend`. Execute `npm run qa-suite:static` before a PR—its pipeline runs type checks, ESLint, dependency-cruiser, ts-prune, and duplication scans. For focused work run scoped scripts (`npm run lint --prefix mobile`, `npm run typecheck --prefix shared`, etc.).

## Coding Style & Naming Conventions
Indent with two spaces, use `PascalCase` for classes and React components, and `camelCase` elsewhere. ESLint blocks cross-layer imports, forbids `any`, and expects unused identifiers to start with `_`. Mobile features follow the screen → feature component → shared UI → hooks layering and prefer named exports.

## Testing Guidelines
`docs/testing-standards.md` is binding for coverage, mutation, and reporting. Jest runs backend suites in `backend/tests/{unit,integration,reliability}` and mobile specs in `mobile/src/__tests__`. Name new specs `*.test.ts` / `*.test.tsx`, colocate them with the subject under test, keep ≥80% line and ≥70% branch coverage for services and adapters, and run `npm run test:ci --prefix backend` or `npm run test --prefix mobile` before pushing.

## Commit & Pull Request Guidelines
Write imperative commit subjects and keep diffs tight for CODEOWNERS. PR descriptions cover risk, rollback, linked issues, and attach the latest `npm run qa-suite:static` output plus the driving task, ADR, and STANDARDS citations. Add UI screenshots when relevant and tag owners listed in `CODEOWNERS` when boundaries shift.

## Security & Configuration Tips
Secrets stay in SSM SecureString or Secrets Manager—never in source control. Lambdas log through Powertools with propagated `traceparent` headers, infra resources need cost tags (`Project`, `Env`, `Owner`, `CostCenter`), and any exceptions belong in the Exception Registry with expiry dates.

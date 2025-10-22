# Repository Guidelines

_Context:_ This codebase is owned and maintained by a single developer. Every workflow, review gate, and standard exists to keep solo decision-making disciplined and well-documented; assume no parallel teammates to delegate to or to provide redundant approvals.

## Project Structure & Module Organization
`backend/` hosts TypeScript Lambdas arranged `lambdas → services → providers → utils`, `mobile/` is the Expo client (`src/` features, `assets/` media), and `shared/` exports DTOs/config. Terraform lives in `infrastructure/`, and the live-dev SST stack sits under `infra/sst/`; long-form records stay in `adr/` and `docs/`.

## Workflow & Source of Truth
Plan and report via `tasks/`; follow `tasks/README.md` to create each `.task.yaml` using the canonical template in `docs/templates/TASK-0000-template.task.yaml`. Keep the task current and link it in every PR. Because the maintainer works solo, these task files are the authoritative record of intent, review, and approvals. The standards source of truth lives in `standards/` (start with `standards/AGENTS.md` and `standards/typescript.md`, plus applicable tier docs), alongside `ARCHITECTURE.md` and the ADR library: relate each change to them, cite the clause for any exception, and capture new decisions with ADRs referenced from the task and PR so future-you can audit your own choices.

## Build, Test, and Development Commands
Run `make deps` once, then `make dev-ios` or `make dev-android` to start LocalStack and Expo with the generated API URL. Backend iterations use `make backend-build` or `pnpm turbo run build:lambdas --filter=@photoeditor/backend`, and SST live-dev flows rely on `make live-dev` / `make live-test`. Execute `pnpm turbo run qa:static --parallel` before a PR—its pipeline runs type checks, ESLint, dependency-cruiser, ts-prune, and duplication scans. For focused work run scoped scripts (`pnpm turbo run lint --filter=photoeditor-mobile`, `pnpm turbo run typecheck --filter=@photoeditor/shared`, etc.).

## Coding Style & Naming Conventions
Indent with two spaces, use `PascalCase` for classes and React components, and `camelCase` elsewhere. ESLint blocks cross-layer imports, forbids `any`, and expects unused identifiers to start with `_`. Mobile features follow the screen → feature component → shared UI → hooks layering and prefer named exports. See `standards/typescript.md` for language-level rules (strict config, discriminated unions with exhaustiveness, neverthrow `Result`, named exports in domain, Zod-at-boundaries).

## Testing Guidelines
`standards/testing-standards.md` is binding for coverage, mutation, and reporting. Jest runs backend suites in `backend/tests/{unit,integration,reliability}` and mobile specs in `mobile/src/__tests__`. Name new specs `*.test.ts` / `*.test.tsx`, colocate them with the subject under test, keep ≥80% line and ≥70% branch coverage for services and adapters, and run `pnpm turbo run test:ci --filter=@photoeditor/backend` or `pnpm turbo run test --filter=photoeditor-mobile` before pushing.

## Commit & Pull Request Guidelines
Write imperative commit subjects and keep diffs tight for CODEOWNERS (the solo maintainer). PR descriptions cover risk, rollback, linked issues, and attach the latest `pnpm turbo run qa:static --parallel` output plus the driving task, ADR, and STANDARDS citations. Add UI screenshots when relevant and tag owners listed in `CODEOWNERS` when boundaries shift—even if that list only contains you—to preserve the approval trail.

## Security & Configuration Tips
Secrets stay in SSM SecureString or Secrets Manager—never in source control. Lambdas log through Powertools with propagated `traceparent` headers, infra resources need cost tags (`Project`, `Env`, `Owner`, `CostCenter`), and any exceptions belong in the Exception Registry with expiry dates.

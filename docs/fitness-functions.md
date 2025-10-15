# Early Stage Fitness Functions

> Roadmap the core fitness functions that prove we are meeting Stage 1 (ISO/IEC 25010) expectations from `docs/stage-1-thin-guide.md`. Each stage adds safety nets while keeping the team unblocked.

## Stage A — Static Safety Nets (Day 0)
Goal: lock in maintainability scaffolding before feature work.
- `npm run typecheck` in `backend`, `mobile`, and `shared` to enforce strict TypeScript (`docs/stage-1-thin-guide.md:44-46`).
- `npm run lint` across all packages with layer rules (handlers → services → providers) to uphold modularity (`docs/stage-1-thin-guide.md:31-37`).
- `npx dependency-cruiser --config tooling/dependency-rules.json` (or equivalent) to fail on cross-boundary imports and cycles (`docs/stage-1-thin-guide.md:59`).
- `npx ts-prune` and `npx jscpd backend/src mobile/src shared` to keep exports intentional and duplication <5 % (`docs/stage-1-thin-guide.md:38-43,57-60`).

## Stage B — Core Flow Contracts (Week 1)
Goal: demonstrate functional suitability of the upload pipeline end-to-end.
- `npm run test -- core-flow` (backend) to contract-test `POST /v1/upload/presign` against `PresignUploadResponseSchema` (`shared/schemas/api.schema.ts:45`).
- `npm run test -- worker-flow` to simulate S3→SQS→worker transitions in `backend/src/lambdas/worker.ts:70-129` and validate `JobStatusSchema` (`shared/schemas/job.schema.ts:13`).
- `npm run test -- schema-diff` to ensure shared zod definitions stay in sync across client/server (`docs/stage-1-thin-guide.md:68-69`).
- `npm run test -- status.contract` to confirm `GET /v1/jobs/{id}` emits the allowed statuses (`docs/stage-1-thin-guide.md:19-21`).

## Stage C — Experience & Offline Resilience (Week 2)
Goal: harden the mobile experience and provider abstraction.
- `npm run test -- upload.offline` to cover background upload retries and offline resume in `mobile/src/services/ApiService.ts:120-180` (`docs/stage-1-thin-guide.md:16-21`).
- `npm run test -- offline-cache` plus `npm run test -- schema-diff` to enforce `react-query` persistence and shared wire formats (`docs/stage-1-thin-guide.md:68-70`).
- `npm run test -- bootstrap.providers` to exercise stub vs real provider initialization from `backend/src/services/bootstrap.service.ts:12-49` (`docs/stage-1-thin-guide.md:34-35`).
- `npx expo-doctor` and `npm run typecheck` (mobile) to verify platform baselines (`docs/stage-1-thin-guide.md:65-69`).

## Stage D — Infrastructure & Security Gates (Week 3)
Goal: satisfy the must-pass security/compliance checklist before wider adoption.
- `terraform -chdir=infrastructure fmt`, `validate`, and `plan` to prove lifecycle rules, encryption, and tagging in `infrastructure/modules/s3/main.tf:34-195` (`docs/stage-1-thin-guide.md:84-95`).
- `npx tfsec infrastructure` (or `checkov`) to block critical IaC findings (`docs/stage-1-thin-guide.md:93`).
- `npx gitleaks detect --source .` and `npm audit --omit=dev` in each package to catch secrets and high vulnerabilities (`docs/stage-1-thin-guide.md:92-94`).
- `npm run test -- alarms.snapshot` (infrastructure tests) to snapshot CloudWatch alarms, budgets, and tagging policies (`docs/stage-1-thin-guide.md:93-95`).

## Stage E — Performance & Evidence (Week 4)
Goal: document budgets and artifacts required for Stage 1 completeness.
- `npx artillery run qa/perf/core-flow.yaml` (or equivalent) to assert P95 ≤ 250 ms for presign and ≤ 5 s for worker (`docs/stage-1-thin-guide.md:23-26`).
- `npm run build:lambdas` in `backend` to guarantee esbuild bundles succeed on every PR (`docs/stage-1-thin-guide.md:101`).
- `./scripts/evidence-bundle` to regenerate architecture diagram, ADR lint, and scoring worksheet (`docs/stage-1-thin-guide.md:109-123`).
- `make qa-suite` aggregating `typecheck`, `lint`, `test`, and contract/scan commands so local runs mirror CI gates (`docs/stage-1-thin-guide.md:100-106`).

## Usage Tips
- Wire these stages into CI incrementally: Stage A commands block every PR; later stages run nightly until green.
- Record command outputs (coverage, perf numbers, scan reports) as evidence links in the Stage 1 scoring worksheet (`docs/stage-1-thin-guide.md:120-126`).
- When a stage fails, annotate the self-assessment with gaps and ADRs before advancing to Stage 2 (`docs/stage-1-thin-guide.md:130-134`).

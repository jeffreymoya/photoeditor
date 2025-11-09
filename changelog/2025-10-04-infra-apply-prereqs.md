# 2025-10-04 — Harden infra-apply with Prerequisites

- Date: 2025-10-04 19:00 UTC
- Agent: Claude Code (LLM)
- Branch: main
- Context: TASK-0017; Env: infra; Feature: Makefile Dependency Hardening

## Summary

Added missing prerequisites to the `infra-apply` Makefile target to ensure Terraform init and lambda builds run automatically. Previously, engineers had to manually run `infra-init` and `backend-build` before `infra-apply`, leading to confusing failures when steps were skipped. The target now chains `infra-init backend-build` as dependencies.

## Changes Made

- `Makefile` (line 45): Updated `infra-apply` target to depend on `infra-init` and `backend-build`, ensuring Terraform is initialized and lambda bundles are built before applying infrastructure.

- `Makefile` (line 16): Updated help text for `infra-apply` to reflect new behavior: "Init, build lambdas, and Terraform apply to LocalStack".

## Rationale

- Eliminates order-dependent failures when engineers run `make infra-apply` directly
- Matches the pattern already used by `infra-up` target
- Reduces cognitive load and improves developer experience
- Makes the build process more resilient to human error

## Impact

- Breaking: No (only adds prerequisites, doesn't remove functionality)
- Migrations: None
- Config/Env: None
- Security: No impact
- Performance: May take slightly longer on first run if lambdas/init needed, but prevents failed runs
- User-facing: Positive - fewer manual steps required

## Validation

- Dry-run verification:
  ```bash
  make -n infra-apply
  ```
  Output shows correct sequence:
  1. `terraform -chdir=infrastructure init -upgrade`
  2. `npm run build:lambdas --prefix backend`
  3. `terraform -chdir=infrastructure apply -var-file=terraform.tfvars.localstack -auto-approve`

- Verified `infra-up` still works without duplication:
  ```bash
  make -n infra-up
  ```
  Output shows:
  1. `docker compose -f docker-compose.localstack.yml up -d`
  2. `npm run build:lambdas --prefix backend`
  3. `terraform -chdir=infrastructure init -upgrade`
  4. `terraform -chdir=infrastructure apply ...`

- Help text verification:
  ```bash
  make help
  ```
  Confirmed updated description displays correctly.

## Pending / TODOs

None - task fully completed and all acceptance criteria met.

## Next Steps

- Mark TASK-0017 as completed and archive to docs/completed-tasks/
- Continue with next priority task in the queue

## References

- Task: TASK-0017
- Related: `Makefile`
- Acceptance criteria: All three criteria met (dry-run shows correct order, infra-up unchanged, help text accurate)

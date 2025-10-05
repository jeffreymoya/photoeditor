# ADR 0001: Adopt TypeScript Monorepo With Shared Contracts

- Status: Accepted
- Date: 2025-10-04

## Context
The system spans a React Native mobile client, AWS Lambda backend, shared TypeScript utilities, and Terraform infrastructure. Keeping these packages in separate repositories would fragment the workflow and introduce contract drift. The current architecture summary explicitly documents the multi-package structure that treats mobile, backend, shared, and infrastructure code as a single unit (`ARCHITECTURE.md:3-38`). The root workspace tooling (stage fitness scripts, lint/typecheck orchestration) also assumes co-location of the packages (`package.json:1-18`). Shared API schemas already live in `@photoeditor/shared`, reinforcing the need for a central source of truth (`shared/package.json:1-38`).

## Decision
Maintain a single TypeScript-first monorepo that contains mobile, backend, shared libraries, and infrastructure code. All cross-package contracts, build tooling, and quality checks will remain coordinated through the workspace-level scripts, and shared artifacts (schemas, constants, types) live in `@photoeditor/shared` for direct consumption by other packages.

## Consequences
- Positive: Cross-cutting changes (e.g., schema updates) can be applied atomically alongside mobile and backend consumers. Tooling such as the staged fitness functions can enforce consistent quality gates across the stack.
- Positive: Shared packages (schemas, constants) remain versioned in lockstep with their consumers, reducing contract drift and duplicated validation logic.
- Negative: Contributors must install dependencies for multiple packages and keep workspace tooling available, which has already surfaced blocking gaps when package installs are skipped (`changelog/2025-10-02-fitness-functions.md:1-126`).

## Related Work
- Architecture documentation describing the multi-package layout (`ARCHITECTURE.md:3-38`).
- Root workspace scripts used for staged fitness functions (`package.json:1-18`).
- Shared package providing contracts and schema enforcement (`shared/package.json:1-38`).
- Fitness function run highlighting the dependency coupling across packages (`changelog/2025-10-02-fitness-functions.md:1-126`).

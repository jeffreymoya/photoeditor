# Standards Overview

This document provides an overview of the architectural standards organized by tier and highlights the shared maintainability controls aligned with ISO/IEC 25010 (modularity, analyzability, modifiability, reusability, and testability). For detailed specifications, see the individual tier files:

- **[Frontend Tier](frontend-tier.md)** - UI Components, State & Logic, Services & Integration, Platform & Delivery
- **[Backend Tier](backend-tier.md)** - Edge & Interface, Lambda Application, Domain Service, Provider Integration, Shared Backend Utilities, Platform & Quality
- **[Shared Contracts Tier](shared-contracts-tier.md)** - API contracts, versioning, and client generation
- **[Infrastructure Tier](infrastructure-tier.md)** - Terraform modules, SST alternatives, local development platform
- **[Cross-Cutting](cross-cutting.md)** - Observability & Operations, Developer Experience, Governance & Knowledge
- **[TypeScript](typescript.md)** - Language-level practices for strict typing, unions, results, and contracts

## Quick Reference

### Frontend Tier
- **UI Components**: Radix UI (web) and Tamagui (native) over Tailwind tokens, Atomic Design, Storybook coverage reports
- **State & Logic**: Redux Toolkit + RTK Query, XState for state machines
- **Services & Integration**: OpenAPI/Zod contracts, Ports & Adapters pattern
- **Platform & Delivery**: Expo EAS, React Native Testing Library, Detox with publishable run artifacts

### Backend Tier
- **Edge & Interface**: NestJS, Controller → UseCase → Port pattern
- **Lambda Application**: Middy, AWS Powertools, function-per-concern
- **Domain Service**: neverthrow, DDD-lite, synchronized state machines
- **Provider Integration**: cockatiel policies, Strategy + Abstract Factory
- **Shared Backend Utilities**: Zod validation, consolidated error catalogs
- **Platform & Quality**: Jest/Vitest, Pact contracts, LocalStack, mutation dashboards

### Shared Contracts Tier
- **Libraries**: Zod as SSOT, OpenAPI generation, api-extractor
- **Patterns**: Snapshot governance, unified error contracts, deprecation playbooks
- **Fitness Gates**: API diff review, semantic versioning, downstream client regeneration logs

### Infrastructure Tier
- **Terraform**: tfenv, pre-commit hooks, versioned modules with Terragrunt orchestration
- **SST Alternative**: IaC Ports & Adapters, documented decision record
- **Local Dev**: docker-compose, LocalStack, remote dev guardrails

### Cross-Cutting
- **Observability**: OpenTelemetry, AWS Powertools, Sentry with mobile correlation guidance
- **Developer Experience**: Make/Just, Nx/depcruise, Changesets with CI timing monitors
- **Governance**: Architecture diagrams, executable checks, ADRs with enforcement owners

### TypeScript
- **Config**: strict mode; `exactOptionalPropertyTypes: true` (tests may disable via `tsconfig.jest.json`)
- **Contracts**: Zod as SSOT; generate OpenAPI/types/clients
- **Errors/Results**: neverthrow Result/ResultAsync; no exceptions for control flow
- **Style**: named exports (no defaults) in domain; discriminated unions + `assertNever` exhaustiveness
- **Immutability**: `readonly`, `as const`, `ReadonlyArray<T>` for DTOs and configs
- **Docs**: TSDoc 70%+ on exported APIs; api-extractor for shared packages

## Maintainability Controls Snapshot

| Attribute | Primary Guardrails |
| --- | --- |
| Modularity | Strict tier boundaries, Ports & Adapters, dependency-cruiser rules |
| Analyzability | Unified tracing/correlation policy, published coverage and mutation dashboards |
| Modifiability | Centralized technology decisions, upgrade/deprecation playbooks per tier |
| Reusability | Shared component libraries, contract-first APIs, design token governance |
| Testability | Layer-specific fitness gates, automated evidence bundles, enforceable CI targets |

---

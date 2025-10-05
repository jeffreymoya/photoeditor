# ADR 0003: Define API Contracts With OpenAPI, Shared Zod Schemas, and Contract Tests

- Status: Accepted
- Date: 2025-10-04

## Context
Consistent API contracts are critical so mobile clients and backend services stay aligned. Cross-cutting guidance already calls out shared schema validation between packages to avoid drift (`ARCHITECTURE.md:50-53`). An OpenAPI 3.0 specification now captures the presign and status endpoints in detail, including request/response schemas and HTTP semantics (`docs/openapi/openapi.yaml:1-110`). Shared Zod schemas encapsulate the same constraints for runtime validation and TypeScript typing (`shared/schemas/api.schema.ts:1-111`). Contract tests exercise Lambda handlers against these schemas and the OpenAPI expectations, catching regressions during CI runs (`backend/tests/contracts/presign.contract.test.ts:1-159`). The associated changelog entry documents the introduction of the spec, versioning policy, and automated validation pipeline (`changelog/2025-10-04-openapi-contract-tests.md:1-88`).

## Decision
Treat the OpenAPI specification as the source of truth for externally exposed endpoints. Maintain mirrored Zod schemas in the shared package for runtime validation and type inference. Enforce compliance via automated contract tests that execute Lambda handlers and assert responses against the shared schemas and OpenAPI rules.

## Consequences
- Positive: Client and server teams share a single contract with machine-readable guarantees, enabling code generation and automated regression testing.
- Positive: Zod schemas centralize validation logic, keeping Lambda handlers thin while providing TypeScript types to both backend and mobile codebases.
- Negative: The spec, schemas, and tests must evolve together; schema drift or duplicated definitions require diligent updates and tooling to highlight mismatches.

## Related Work
- Cross-cutting architecture guidance on shared schema validation (`ARCHITECTURE.md:50-53`).
- OpenAPI specification for the core endpoints (`docs/openapi/openapi.yaml:1-110`).
- Shared Zod schemas used for request and response validation (`shared/schemas/api.schema.ts:1-111`).
- Contract tests validating Lambda responses against the shared schemas (`backend/tests/contracts/presign.contract.test.ts:1-159`).
- Changelog entry introducing the spec and contract testing approach (`changelog/2025-10-04-openapi-contract-tests.md:1-88`).

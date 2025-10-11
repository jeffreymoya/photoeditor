# Contract Clients

This directory contains generated API client artifacts from the Zod schemas in `@photoeditor/shared`.

## Generated Artifacts

### `types.ts`
TypeScript type definitions generated from Zod schemas using `zod-to-ts`. These types represent the shape of request/response objects and can be imported by any TypeScript consumer (backend, mobile, tooling).

**Usage:**
```typescript
import type { PresignUploadRequest, PresignUploadResponse } from '@photoeditor/docs/contracts/clients/types';
```

### `checksums.json`
SHA-256 checksums of all generated artifacts for drift detection. Updated on every generation run. CI uses this to verify contracts haven't drifted unexpectedly.

## OpenAPI Specification

The OpenAPI 3.0 spec is located at `docs/openapi/openapi-generated.yaml`. It contains all schema components but no `paths` section yet, as API endpoints are currently defined in Lambda handlers rather than a centralized route registry.

### Validation
The OpenAPI spec can be validated with:
```bash
npx @redocly/cli lint docs/openapi/openapi-generated.yaml
```

## RTK Query Client Generation

**Status**: Not yet implemented (component schemas only, no paths defined)

RTK Query codegen requires an OpenAPI spec with `paths` (endpoints) defined. Currently, our OpenAPI file contains only `components/schemas` extracted from Zod definitions.

### Future Implementation

Once API endpoints are centralized in the OpenAPI spec (e.g., via path definitions or @asteasolutions/zod-to-openapi route registry), RTK Query client can be generated using:

```bash
npx @rtk-query/codegen-openapi openapi-config.ts
```

**Example `openapi-config.ts`:**
```typescript
import type { ConfigFile } from '@rtk-query/codegen-openapi';

const config: ConfigFile = {
  schemaFile: './docs/openapi/openapi-generated.yaml',
  apiFile: './mobile/src/store/api/baseApi.ts',
  apiImport: 'baseApi',
  outputFile: './docs/contracts/clients/photoeditor-api.ts',
  exportName: 'photoEditorApi',
  hooks: true,
};

export default config;
```

**Alternative Approaches** (require ADR per standards/shared-contracts-tier.md line 5):
- Manual ApiService wrappers with runtime Zod validation
- OpenAPI Generator with TypeScript-Fetch template
- Orval client generator

### Blocking Issues

1. **No paths defined**: Lambda handlers are not yet registered in a centralized OpenAPI registry
2. **Handler-first architecture**: Current architecture defines routes in API Gateway Terraform, not in code
3. **Contract-first migration**: Moving to contract-first would require refactoring handler wiring (see ADR-0003)

## Regeneration

To regenerate all artifacts:
```bash
npm run contracts:generate --prefix shared
```

This command:
1. Builds `@photoeditor/shared` to `dist/`
2. Converts Zod schemas to OpenAPI components (using `zod-to-json-schema`)
3. Generates TypeScript types (using `zod-to-ts`)
4. Updates checksums for drift detection

## Contract Drift Detection

Run the following to check for contract drift:
```bash
npm run contracts:check --prefix shared
```

This compares the current generated artifacts against committed versions and fails if differences are detected without a corresponding changeset.

## Standards Compliance

Generated artifacts follow:
- **standards/shared-contracts-tier.md** - Zod as SSOT, OpenAPI 3.0 generation, checksum tracking
- **standards/global.md** - No React/AWS SDK imports in shared package
- **docs/testing-standards.md** - Contract validation in CI

## Versioning

Breaking API changes require:
1. New `/v{n}` surface in OpenAPI paths (when implemented)
2. Maintain N-1 support for at least 6 months
3. Sunset dates in OpenAPI info and response headers
4. Changeset entry with semantic version bump
5. API Extractor review approval

See `docs/contracts/changeset-governance.md` for full process.

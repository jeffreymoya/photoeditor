# Generated API Client

This directory contains auto-generated API clients and types for the Photo Editor API.

## Files

- `types.ts` - TypeScript type definitions generated from Zod schemas
- `photoeditor-api.ts` - API client with methods for all endpoints
- `checksums.json` - Artifact checksums for drift detection

## Usage

```typescript
import { createApiClient } from '@/docs/contracts/clients/photoeditor-api';

const client = createApiClient({
  baseUrl: 'https://api.photoeditor.com',
  headers: {
    'Authorization': 'Bearer <token>'
  }
});

// Upload a photo
const uploadResult = await client.presignUpload({
  fileName: 'photo.jpg',
  contentType: 'image/jpeg',
  fileSize: 1024000
});

// Get job status
const status = await client.getJobStatus({ id: jobId });
```

## Regeneration

To regenerate these files after schema changes:

```bash
npm run contracts:generate --prefix shared
```

## Contract Governance

Per `standards/shared-contracts-tier.md`:

- **Source of Truth**: Zod schemas in `shared/schemas/` + routes manifest in `shared/routes.manifest.ts`
- **Generated Artifacts**: Committed to this directory for CI drift detection
- **Breaking Changes**: Require API versioning (e.g., `/v2/`) and deprecation timeline
- **Validation**: `npm run contracts:check` verifies checksums match

## Architecture Decision Records

- [ADR-0003: Contract-First API](../../../adr/0003-contract-first-api.md)
- [ADR-0005: API Versioning](../../../adr/0005-api-versioning.md) (if exists)

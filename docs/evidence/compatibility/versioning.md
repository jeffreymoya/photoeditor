# API Versioning Policy

## Purpose
Define a clear versioning strategy for the Photo Editor API to ensure backward compatibility and prevent breaking changes from impacting existing clients.

## Versioning Strategy

### Route Prefix Versioning
All API routes MUST include a version prefix: `/v{N}/`

**Current Version**: `v1`

**Example Routes**:
- `POST /v1/upload/presign`
- `GET /v1/jobs/{id}`
- `GET /v1/download/{key}`
- `POST /v1/device-token`

### Semantic Versioning
API versions follow a simplified semantic versioning model:
- **Major version** (v1, v2, v3): Breaking changes
- Routes are versioned as a whole (not individual endpoints)

## Breaking vs Non-Breaking Changes

### Breaking Changes (Require Version Bump)
❌ These changes REQUIRE a new API version:

1. **Removing fields** from request or response
   ```json
   // v1 response
   { "jobId": "123", "status": "pending", "userId": "user1" }

   // v2 response (removed userId) - BREAKING
   { "jobId": "123", "status": "pending" }
   ```

2. **Changing field types**
   ```json
   // v1: status is string
   { "status": "completed" }

   // v2: status is enum - BREAKING
   { "status": 2 }
   ```

3. **Making optional fields required**
   ```typescript
   // v1
   interface PresignRequest {
     fileName: string;
     contentType?: string; // optional
   }

   // v2 - contentType now required - BREAKING
   interface PresignRequest {
     fileName: string;
     contentType: string; // required
   }
   ```

4. **Changing HTTP status codes for existing scenarios**
   - v1: Invalid file returns 400
   - v2: Invalid file returns 422 - BREAKING

5. **Renaming fields**
   ```json
   // v1
   { "jobId": "123" }

   // v2 - renamed to "id" - BREAKING
   { "id": "123" }
   ```

6. **Changing URL structure**
   - v1: `/upload/presign`
   - v2: `/presign-upload` - BREAKING

### Non-Breaking Changes (Same Version)
✅ These changes are SAFE and don't require a version bump:

1. **Adding new optional fields** to request
   ```typescript
   // v1
   interface PresignRequest {
     fileName: string;
   }

   // v1 (enhanced) - added optional field
   interface PresignRequest {
     fileName: string;
     metadata?: Record<string, string>; // new, optional
   }
   ```

2. **Adding new fields to response**
   ```json
   // v1 original
   { "jobId": "123", "status": "pending" }

   // v1 enhanced (added new field)
   { "jobId": "123", "status": "pending", "progress": 0 }
   ```

3. **Adding new endpoints** (new routes)
   - `POST /v1/batch/upload` - new endpoint, same version

4. **Making required fields optional** (relaxing constraints)
   ```typescript
   // v1
   interface PresignRequest {
     fileName: string;
     contentType: string; // required
   }

   // v1 (relaxed) - made optional
   interface PresignRequest {
     fileName: string;
     contentType?: string; // now optional
   }
   ```

5. **Adding new enum values** (if clients handle unknown values)
   ```typescript
   // v1
   type JobStatus = 'pending' | 'processing' | 'completed' | 'failed';

   // v1 (enhanced) - added new status
   type JobStatus = 'pending' | 'processing' | 'completed' | 'failed' | 'cancelled';
   ```

## Version Lifecycle

### Version Support Policy
- **Current version** (v1): Fully supported, receives new features
- **Previous version** (N/A yet): Supported for 12 months, security updates only
- **Deprecated version**: 6-month sunset period with warnings

### Deprecation Process
1. **Announce deprecation**: 6 months before sunset
   - Add `Deprecation` header to responses
   - Update API documentation
   - Notify clients via email/dashboard

2. **Sunset period**: 6 months
   - Continue serving requests
   - Return `Sunset` header with end date
   - Log usage for tracking

3. **Shutdown**: After sunset date
   - Return 410 Gone for deprecated version
   - Include migration guide in response

**Example Response Headers**:
```http
HTTP/1.1 200 OK
Deprecation: true
Sunset: Sat, 01 Jun 2025 00:00:00 GMT
Link: </v2/upload/presign>; rel="successor-version"
```

## Implementation

### API Gateway Configuration
```yaml
# OpenAPI snippet
paths:
  /v1/upload/presign:
    post:
      summary: Generate presigned URL for upload
      tags: [v1]
      # ...

  /v2/upload/presign:
    post:
      summary: Generate presigned URL for upload (v2)
      tags: [v2]
      # ...
```

### Route Registration (Example)
```typescript
// backend/src/api/routes.ts
import { Router } from 'express';
import * as v1 from './v1';
import * as v2 from './v2';

const router = Router();

// Version 1 routes
router.post('/v1/upload/presign', v1.presignHandler);
router.get('/v1/jobs/:id', v1.statusHandler);
router.get('/v1/download/:key', v1.downloadHandler);

// Version 2 routes (when created)
// router.post('/v2/upload/presign', v2.presignHandler);

export default router;
```

### Lambda Function Naming
- Function: `[PROJECT]-[ENV]-presign-v1`
- Allow multiple versions to coexist
- Gradual rollout: Route % of traffic to v2

## Contract Testing

### Purpose
Ensure API responses match the OpenAPI specification and prevent breaking changes from being deployed.

### Contract Test Structure
```typescript
// backend/tests/contracts/presign.contract.test.ts
import { describe, it, expect } from '@jest/globals';
import Ajv from 'ajv';
import presignSchema from '../../api/schemas/presign-response.json';

describe('POST /v1/upload/presign contract', () => {
  const ajv = new Ajv();
  const validate = ajv.compile(presignSchema);

  it('should return response matching schema', async () => {
    const response = await request(app)
      .post('/v1/upload/presign')
      .send({
        fileName: 'test.jpg',
        contentType: 'image/jpeg'
      });

    expect(response.status).toBe(200);
    expect(validate(response.body)).toBe(true);
  });

  it('should include all required fields', async () => {
    const response = await request(app)
      .post('/v1/upload/presign')
      .send({
        fileName: 'test.jpg',
        contentType: 'image/jpeg'
      });

    expect(response.body).toHaveProperty('uploadUrl');
    expect(response.body).toHaveProperty('jobId');
    expect(response.body).toHaveProperty('expiresAt');
  });
});
```

### CI Integration
```yaml
# .github/workflows/ci.yml
- name: Run Contract Tests
  run: |
    cd backend
    npm test -- tests/contracts/

- name: Check API Breaking Changes
  run: |
    # Compare OpenAPI specs
    npx openapi-diff docs/openapi/v1.yaml docs/openapi/v2.yaml --fail-on-breaking
```

## OpenAPI Specification

### Location
- `backend/api/openapi.yaml` - Main spec
- `backend/api/v1/` - Version 1 specs
- `backend/api/v2/` - Version 2 specs (when created)

### Spec Validation
```bash
# Validate OpenAPI spec
npx @redocly/cli lint backend/api/openapi.yaml

# Check for breaking changes
npx openapi-diff \
  backend/api/v1/openapi.yaml \
  backend/api/v2/openapi.yaml \
  --fail-on-breaking
```

## Client Migration Guide

### When v2 is Released
1. **Review changelog**: Identify breaking changes
2. **Update client code**: Adapt to new contract
3. **Test thoroughly**: Run full test suite against v2
4. **Gradual rollout**: Route small % of traffic to v2
5. **Monitor errors**: Watch for unexpected failures
6. **Complete migration**: Switch all traffic to v2
7. **Clean up**: Remove v1 code after sunset period

### Migration Checklist
- [ ] Review v2 API documentation
- [ ] Update OpenAPI client (if auto-generated)
- [ ] Update request/response models
- [ ] Update unit tests
- [ ] Update integration tests
- [ ] Test in staging environment
- [ ] Gradual production rollout (10%, 50%, 100%)
- [ ] Monitor error rates and rollback if needed
- [ ] Remove v1 code after deprecation period

## Enforcement

### Pre-Deployment Checks
```bash
#!/bin/bash
# tooling/check-api-version.sh

# Ensure OpenAPI spec exists
if [ ! -f "backend/api/openapi.yaml" ]; then
  echo "ERROR: OpenAPI spec not found"
  exit 1
fi

# Run contract tests
npm test --prefix backend -- tests/contracts/

# Validate spec
npx @redocly/cli lint backend/api/openapi.yaml

# Check for breaking changes (if v2 exists)
if [ -f "backend/api/v2/openapi.yaml" ]; then
  npx openapi-diff \
    backend/api/v1/openapi.yaml \
    backend/api/v2/openapi.yaml \
    --fail-on-breaking
fi
```

### CI Gate
Contract tests MUST pass before merge:
- All contract tests pass
- OpenAPI spec validates
- No breaking changes without version bump

## Last Updated
[TODO: Add date]

## References
- [OpenAPI Specification](https://swagger.io/specification/)
- [API Versioning Best Practices](https://restfulapi.net/versioning/)
- [Semantic Versioning](https://semver.org/)

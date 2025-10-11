# API Versioning Policy

## Overview

This document defines the versioning policy for the Photo Editor API to ensure backward compatibility and smooth migration paths for clients when breaking changes are required.

## Version Format

API versions follow the format: `v{major}` (e.g., `v1`, `v2`)

- The version is included as a **route prefix** in the API path
- Example: `https://api.photoeditor.com/v1/upload/presign`

## Breaking vs Non-Breaking Changes

### Non-Breaking Changes (No Version Bump Required)

The following changes are considered **non-breaking** and can be deployed without bumping the API version:

1. **Adding new optional fields** to request schemas
2. **Adding new fields** to response schemas (clients should ignore unknown fields)
3. **Adding new endpoints** (e.g., `POST /v1/upload/bulk`)
4. **Adding new enum values** when the client has proper fallback handling
5. **Relaxing validation** (e.g., increasing max file size from 50MB to 100MB)
6. **Adding new error codes** (clients should have generic error handling)
7. **Performance improvements** that don't change behavior
8. **Bug fixes** that restore documented behavior

### Breaking Changes (Version Bump Required)

The following changes are considered **breaking** and require a new API version:

1. **Removing fields** from request or response schemas
2. **Renaming fields** in request or response schemas
3. **Changing field types** (e.g., string to number)
4. **Making optional fields required**
5. **Removing endpoints**
6. **Changing endpoint paths** (e.g., `/upload/presign` to `/presign/upload`)
7. **Changing HTTP methods** (e.g., POST to PUT)
8. **Tightening validation** (e.g., reducing max file size)
9. **Removing enum values** that clients may be using
10. **Changing status codes** for existing error conditions
11. **Changing authentication/authorization requirements**

## Versioning Workflow

### When Making Non-Breaking Changes

1. Update the implementation code
2. Update the OpenAPI specification (`docs/openapi/openapi.yaml`)
3. Add/update contract tests to validate the new behavior
4. Run all existing tests to ensure backward compatibility
5. Deploy to staging for validation
6. Deploy to production (no version bump needed)

### When Making Breaking Changes

1. **Create a new API version:**
   - Duplicate the current route with a new version prefix (e.g., `/v1/jobs/{id}` → `/v2/jobs/{id}`)
   - Update the OpenAPI spec to include the new version

2. **Implement the new version:**
   - Create new Lambda handlers or route handlers for the new version
   - Update schemas and validation logic
   - Implement necessary data transformations

3. **Update contract tests:**
   - Add contract tests for the new version
   - Ensure existing version tests still pass

4. **Document the migration:**
   - Update API documentation with migration guide
   - Clearly document what changed and why
   - Provide code examples for migration

5. **Deprecation timeline:**
   - Announce the new version and deprecation timeline (minimum 6 months)
   - Add deprecation warnings to old version responses (via headers)
   - Monitor usage metrics for the old version
   - Sunset the old version after the deprecation period

## Deprecation Playbook

This section provides detailed guidance on managing API deprecations, including communication plans, fallback behaviors, and migration timelines for both TypeScript and non-TypeScript clients.

### Deprecation Timeline

All breaking changes follow a **minimum 6-month deprecation period** from announcement to sunset. This allows sufficient time for clients to migrate.

#### Standard Timeline

| Phase | Duration | Activities |
|-------|----------|-----------|
| **Announcement** | Day 0 | Release new version, announce deprecation of old version |
| **Grace Period** | Months 1-3 | Both versions fully supported, migration guides available |
| **Sunset Warning** | Months 4-5 | Increase deprecation warnings, reach out to active users of old version |
| **Final Notice** | Month 6 | Final 30-day notice sent to all remaining users |
| **Sunset** | Month 6+ | Old version removed, traffic redirected or rejected |

#### Example Timeline (v1 → v2)

| Date | Milestone | Actions |
|------|-----------|---------|
| 2025-10-06 | v2 Launch | - Release v2 API<br/>- Publish migration guide<br/>- Announce v1 deprecation<br/>- Set sunset date: 2026-04-06 |
| 2025-11-06 | Month 1 | - Monitor v2 adoption metrics<br/>- Provide migration support<br/>- Add `Sunset` header to v1 responses |
| 2025-12-06 | Month 2 | - Email users still on v1 with migration guide<br/>- Offer office hours for migration questions |
| 2026-01-06 | Month 3 | - Publish v1 usage dashboard<br/>- Identify high-volume v1 clients for direct outreach |
| 2026-02-06 | Month 4 | - Increase `Deprecation` header severity<br/>- Direct outreach to remaining v1 users<br/>- Provide migration tooling/scripts |
| 2026-03-06 | Month 5 | - Final migration support window<br/>- Update status page with sunset countdown |
| 2026-04-01 | 5 days before sunset | - Send final 5-day notice<br/>- Provide emergency contact for blockers |
| 2026-04-06 | Sunset | - Remove v1 endpoints<br/>- Return 410 Gone for v1 requests |

### Communication Plan

Effective communication is critical for smooth deprecations. The following channels and templates ensure all clients are informed.

#### Communication Channels

1. **Developer Portal / Changelog**
   - Primary source of truth for all API changes
   - Include migration guide, timeline, and code examples
   - Update with weekly progress reports during deprecation

2. **Email Notifications**
   - Sent to all registered API users
   - Timeline: Announcement, Month 2, Month 4, Month 5, 5 days before sunset
   - Include migration guide link and support contact

3. **API Response Headers**
   - Add deprecation headers to all responses from deprecated endpoints
   - Headers: `Deprecation`, `Sunset`, `Link` (to migration guide)

4. **Status Page**
   - Publish deprecation timeline and sunset date
   - Update with migration progress metrics
   - Post sunset countdown in final month

5. **In-App Notifications** (for first-party clients)
   - Show banner or modal for users on deprecated version
   - Provide one-click link to migration guide

6. **Direct Outreach**
   - Identify high-volume API users (top 20% by request count)
   - Schedule 1:1 migration support calls
   - Offer dedicated Slack channel or email support

#### Deprecation Header Format

Add the following headers to all responses from deprecated endpoints:

```http
Deprecation: true
Sunset: Mon, 06 Apr 2026 00:00:00 GMT
Link: <https://docs.photoeditor.com/migrations/v1-to-v2>; rel="deprecation"
Warning: 299 - "API version v1 is deprecated and will be removed on 2026-04-06. Please migrate to v2."
```

#### Email Template: Deprecation Announcement

```
Subject: [Action Required] API v1 Deprecation - Migrate to v2 by April 2026

Hi [Client Name],

We're excited to announce the release of API v2, which includes improved
performance, new features, and enhanced error handling.

IMPORTANT: API v1 will be deprecated and sunset on April 6, 2026 (6 months
from today).

What you need to do:
1. Review the migration guide: https://docs.photoeditor.com/migrations/v1-to-v2
2. Update your API base URL from /v1/ to /v2/
3. Test your integration in our staging environment
4. Deploy to production before April 6, 2026

What's changing:
- [List major breaking changes]
- [Link to detailed changelog]

Migration support:
- Migration guide: [link]
- Code examples: [link]
- Office hours: Tuesdays 2-4pm PST
- Support email: api-support@photoeditor.com

Timeline:
- Today (Oct 6, 2025): v2 released, v1 deprecated
- Apr 6, 2026: v1 sunset (removed)

Please reach out if you have any questions or need migration assistance.

Best regards,
Photo Editor API Team
```

### Fallback Behaviors

Define how the system behaves during and after deprecation.

#### During Deprecation Period (v1 still active)

1. **Graceful Degradation**
   - Both v1 and v2 endpoints remain fully functional
   - No reduction in v1 performance or rate limits
   - v1 requests include deprecation headers but succeed normally

2. **Client Detection**
   - Log all v1 requests with client identifiers (API key, user agent)
   - Track usage metrics per client for targeted outreach
   - Generate weekly reports on v1 usage trends

3. **Error Handling**
   - v1 errors continue to use old error format
   - v2 errors use new error format (see `docs/contracts/errors/`)
   - No cross-version error format mixing

#### At Sunset (v1 removal)

1. **Hard Cutover (Recommended)**
   - Remove v1 endpoints entirely
   - Return `410 Gone` status with migration instructions
   - Include `Sunset` header with removal date

   ```http
   HTTP/1.1 410 Gone
   Content-Type: application/json
   Sunset: Mon, 06 Apr 2026 00:00:00 GMT

   {
     "error": {
       "type": "ENDPOINT_REMOVED",
       "code": "API_VERSION_SUNSET",
       "message": "API v1 was removed on 2026-04-06. Please use v2.",
       "migrationGuide": "https://docs.photoeditor.com/migrations/v1-to-v2"
     }
   }
   ```

2. **Redirect (Alternative for GET requests)**
   - Redirect v1 GET requests to v2 equivalents
   - Return `301 Moved Permanently` or `308 Permanent Redirect`
   - Only use if v1 and v2 are compatible for specific endpoints

   ```http
   HTTP/1.1 301 Moved Permanently
   Location: https://api.photoeditor.com/v2/jobs/abc123
   Sunset: Mon, 06 Apr 2026 00:00:00 GMT
   ```

3. **Emergency Rollback Plan**
   - Maintain v1 codebase in archive branch
   - Document steps to re-enable v1 if critical issues arise
   - Define criteria for rollback (e.g., >10% error rate in first 24h)

### Non-TypeScript Client Guidance

For clients not using TypeScript (Swift, Kotlin, Python, Ruby, etc.), provide additional support to ensure smooth migration.

#### Migration Checklist for Non-TypeScript Clients

1. **Update API Base URL**
   ```
   Old: https://api.photoeditor.com/v1/
   New: https://api.photoeditor.com/v2/
   ```

2. **Review Schema Changes**
   - Download OpenAPI spec for v2: `docs/openapi/openapi-v2.yaml`
   - Compare with v1 spec to identify breaking changes
   - Use diff tools like `openapi-diff` or `oasdiff`

3. **Update Request/Response Models**
   - Regenerate client models from v2 OpenAPI spec
   - Use code generators: `openapi-generator`, `swagger-codegen`, or language-specific tools
   - Update manual models if not using code generation

4. **Error Handling Updates**
   - Review new error schema in `docs/contracts/errors/`
   - Update error parsing logic to handle new error types
   - Ensure fallback handling for unknown error codes

5. **Test in Staging**
   - Staging URL: `https://staging-api.photoeditor.com/v2/`
   - Run full integration test suite
   - Verify error handling for all edge cases

6. **Monitor After Deployment**
   - Track error rates for first 48 hours
   - Set up alerts for unexpected status codes
   - Have rollback plan ready

#### Language-Specific Migration Examples

##### Swift (iOS)

```swift
// Old v1 error handling
if let errorType = json["error"]["type"] as? String {
    switch errorType {
    case "VALIDATION_ERROR":  // Old format
        handleValidation(json["error"])
    // ...
    }
}

// New v2 error handling
if let errorType = json["error"]["type"] as? String {
    switch errorType {
    case "VALIDATION":  // New ErrorType enum
        if let fieldErrors = json["error"]["fieldErrors"] as? [String: [String]] {
            handleFieldErrors(fieldErrors)
        }
    // ...
    }
}
```

##### Kotlin (Android)

```kotlin
// Update base URL
private const val BASE_URL = "https://api.photoeditor.com/v2/"  // Changed from /v1/

// Update error data class
data class ApiError(
    val type: String,           // Now uses ErrorType enum values
    val code: String,
    val message: String,
    val timestamp: String,
    val requestId: String?,
    val fieldErrors: Map<String, List<String>>?  // New for ValidationError
)
```

##### Python

```python
# Old v1
response = requests.post("https://api.photoeditor.com/v1/upload/presign")

# New v2
response = requests.post("https://api.photoeditor.com/v2/upload/presign")

# Update error handling
error = response.json().get("error", {})
error_type = error.get("type")

if error_type == "VALIDATION":  # New enum value
    field_errors = error.get("fieldErrors", {})
    for field, messages in field_errors.items():
        print(f"{field}: {', '.join(messages)}")
```

#### Tools and Resources for Non-TypeScript Clients

1. **OpenAPI Spec Download**
   - v1: `https://api.photoeditor.com/v1/openapi.yaml`
   - v2: `https://api.photoeditor.com/v2/openapi.yaml`

2. **Code Generators**
   - Swift: [OpenAPI Generator](https://openapi-generator.tech/)
   - Kotlin: [Swagger Codegen](https://github.com/swagger-api/swagger-codegen)
   - Python: [openapi-python-client](https://github.com/openapi-generators/openapi-python-client)
   - Ruby: [openapi_client](https://github.com/OpenAPITools/openapi-generator)

3. **Diff Tools**
   - [openapi-diff](https://github.com/OpenAPITools/openapi-diff)
   - [oasdiff](https://github.com/Tufin/oasdiff)
   - Online: [API Diff Checker](https://apidiff.io/)

4. **Testing Tools**
   - Postman collections for v1 and v2
   - Staging environment: `https://staging-api.photoeditor.com/v2/`
   - Test credentials provided via support

5. **Migration Support**
   - Email: `api-support@photoeditor.com`
   - Office hours: Tuesdays 2-4pm PST
   - Slack: `#api-migration-support` (invite via support email)
   - Sample code repository: `https://github.com/photoeditor/api-migration-examples`

### Monitoring and Rollback

#### Deprecation Metrics

Track the following metrics during the deprecation period:

1. **Version Adoption**
   - % of requests on v1 vs v2
   - Unique clients per version
   - Request volume trend by version

2. **Error Rates**
   - v2 error rate in first 48 hours post-launch
   - v2 vs v1 error rate comparison
   - Breakdown by error type

3. **Client Migration Status**
   - List of clients still on v1
   - High-volume clients (top 20%) migration status
   - First-party client migration completion

4. **Support Metrics**
   - Migration-related support tickets
   - Common migration issues
   - Time to resolution

#### Rollback Triggers

Define clear criteria for rolling back a sunset:

1. **Critical Issues**
   - v2 error rate >10% in first 24 hours
   - Data loss or corruption detected
   - Security vulnerability in v2

2. **Business Impact**
   - >5 high-value clients blocked by migration
   - Revenue impact >$X threshold
   - Regulatory compliance issues

3. **Rollback Process**
   1. Re-enable v1 endpoints from archive branch
   2. Update sunset date (+3 months minimum)
   3. Communicate new timeline to all clients
   4. Conduct post-mortem to address v2 issues
   5. Re-plan migration with fixes in place

### Post-Sunset Cleanup

After successful sunset:

1. **Archive v1 Code**
   - Move v1 codebase to archive branch
   - Tag with sunset date
   - Document for historical reference

2. **Update Documentation**
   - Remove v1 from active docs
   - Archive v1 docs under `/archive/v1/`
   - Update all references to use v2

3. **Clean Up Infrastructure**
   - Remove v1 Lambda functions
   - Remove v1 API Gateway routes
   - Clean up v1-specific configuration

4. **Post-Mortem**
   - Document lessons learned
   - Update deprecation playbook with improvements
   - Share findings with engineering team

## Version Support Policy

- **Current version (latest):** Full support, receives all updates and bug fixes
- **Previous version (n-1):** Security fixes and critical bug fixes only
- **Older versions (n-2 and earlier):** Deprecated, no updates, scheduled for sunset

### Example Timeline

| Date | Event |
|------|-------|
| 2025-10-04 | v2 released, v1 enters maintenance mode |
| 2025-10-04 | v1 deprecation announced (6-month timeline) |
| 2026-04-04 | v1 sunset (scheduled removal) |

## OpenAPI Contract Validation

All API endpoints must conform to the OpenAPI specification defined in `docs/openapi/openapi.yaml`.

### Contract Testing

Contract tests are located in `backend/tests/contracts/` and validate:

1. **Response schemas** match the OpenAPI specification
2. **Status codes** match documented behavior
3. **Content-Type headers** are correct
4. **Required fields** are always present
5. **Field types and formats** match the specification
6. **Error responses** follow the documented error schema

### CI/CD Integration

Contract tests are run automatically on:

- Every pull request
- Every deployment to staging
- Every deployment to production

**Deployment is blocked if contract tests fail.**

## Client Migration Guide

When a new API version is released, clients should:

1. **Review the migration guide** in the release notes
2. **Update request/response handling** according to the new schema
3. **Test against staging** environment first
4. **Update the API base URL** to use the new version (e.g., `/v1/` → `/v2/`)
5. **Monitor for errors** after deployment
6. **Remove old version references** before the sunset date

## Exceptions and Special Cases

### Emergency Breaking Changes

In rare cases where a security vulnerability or critical bug requires an immediate breaking change:

1. **Notify all clients** via email and status page
2. **Provide a 48-hour grace period** if possible
3. **Deploy the fix** with clear documentation
4. **Offer migration support** to affected clients
5. **Conduct a post-mortem** to prevent future occurrences

### Internal APIs

Internal APIs (used only by first-party clients) may have relaxed versioning requirements:

- Breaking changes allowed with proper coordination
- No formal deprecation timeline required
- Still must update OpenAPI spec and contract tests

## Enforcement

### Pre-commit Checks

- OpenAPI spec must be valid YAML
- Contract test coverage required for all endpoints
- TypeScript types must be generated from schemas

### CI Pipeline Checks

1. **Lint OpenAPI spec:** Validate spec against OpenAPI 3.0 standard
2. **Run contract tests:** All contract tests must pass
3. **Validate schemas:** Ensure request/response schemas are valid
4. **Check coverage:** Contract tests must cover all documented endpoints
5. **Version consistency:** Check that versions in spec match implementation

### Monitoring

- Track API version usage via metrics
- Alert on deprecated version usage spikes
- Monitor error rates per version

## References

- OpenAPI Specification: `docs/openapi/openapi.yaml`
- Contract Tests: `backend/tests/contracts/`
- Error Contract Reference: `docs/contracts/errors/index.md`
- API Documentation: [API Docs](https://docs.photoeditor.com)
- Migration Guides: `docs/migrations/`
- Shared Contracts Standards: `standards/shared-contracts-tier.md`

## Active API Versions

### Current: v1 (Released 2025-10-11)

**Base URL**: `https://api.photoeditor.com/v1/`

**Status**: Active (current version)

**Endpoints**:
- `POST /v1/upload/presign` - Generate presigned upload URL
- `GET /v1/jobs/{id}` - Get job status

**Implementation**:
- API Gateway routes: `infrastructure/modules/api-gateway/main.tf` (lines 81-91)
- Lambda handlers: `backend/src/lambdas/presign.ts`, `backend/src/lambdas/status.ts`
- Deprecation utilities: `backend/src/utils/deprecation.ts`

### Legacy: Unversioned Routes (Deprecated)

**Base URL**: `https://api.photoeditor.com/`

**Status**: Deprecated (sunset date: **2026-04-06**)

**Endpoints**:
- `POST /upload/presign` → Redirects to `/v1/upload/presign`
- `GET /jobs/{id}` → Redirects to `/v1/jobs/{id}`

**Deprecation Headers**:
All legacy routes return the following headers:
```http
Deprecation: true
Sunset: Mon, 06 Apr 2026 00:00:00 GMT
Link: <https://docs.photoeditor.com/migrations/v1-to-v2>; rel="deprecation"
Warning: 299 - "API version v1 is deprecated and will be removed on 2026-04-06. Please migrate to v2."
```

**Migration Timeline**:
- **2025-10-11**: v1 released, legacy routes deprecated
- **2026-04-06**: Legacy routes sunset (6 months)

Clients must migrate to `/v1/` prefixed routes before the sunset date.

## Automated Governance

### Contract Snapshot Validation

Every PR is automatically checked for contract drift using `tooling/contract-check.js`:

1. **Baseline**: `shared/contract-snapshot.json` contains SHA-256 hashes of all contract artifacts
2. **Detection**: CI compares current build with baseline
3. **Diff artifact**: `contract-diff.json` generated with added/removed/modified files
4. **PR comment**: Automated comment posted with governance checklist
5. **Blocking**: PR cannot merge until snapshot updated and approved

**CI Integration**: `.github/workflows/ci-cd.yml` (lines 49-93)

### Contract Diff PR Comments

When contract drift is detected, CI automatically posts a comment with:

- **Summary**: Files added/removed/modified
- **Governance checklist**: Items reviewers must verify
- **Action items**: Steps for PR author
- **References**: Links to versioning policy and standards

**Script**: `scripts/ci/format-contract-diff.js`

### Review Requirements

Contract changes require approval from:
- **Contract Steward** (per `standards/shared-contracts-tier.md` line 21)
- **Backend developer** (for server-side changes)
- **Mobile developer** (for client-side changes)

Evidence requirements (per `standards/shared-contracts-tier.md` line 21):
- API diff report attached to PR
- Contract test results
- Regeneration log for client code
- Approval recorded in task notes

### Automation Procedures

**For PR Authors**:
1. Make changes to `shared/schemas/`
2. Run `npm run build --prefix shared`
3. Run `npm run contracts:check` locally
4. If drift detected:
   - Review changes: `git diff shared/`
   - Run contract tests: `npm run test:contracts`
   - Update snapshot: `npm run contracts:check -- --update`
   - Commit snapshot: `git add shared/contract-snapshot.json`
5. Create changeset: `npm run changeset` (if using changesets)
6. Open PR and wait for automated comment
7. Address review feedback
8. Get approval from required reviewers

**For Reviewers**:
1. Review automated contract diff comment
2. Verify governance checklist items
3. Check for breaking changes requiring `/v{n}` versioning
4. Ensure backward compatibility tests pass
5. Verify snapshot updated
6. Approve PR only after all items verified

See `docs/contracts/changeset-governance.md` for detailed governance workflow.

## Change History

| Version | Date | Changes |
|---------|------|---------|
| 1.2 | 2025-10-11 | Added active API versions section with v1 routes, legacy deprecation timeline (2026-04-06), and automated governance procedures |
| 1.1 | 2025-10-06 | Added comprehensive deprecation playbook with communication plan, fallback behaviors, and non-TypeScript client guidance |
| 1.0 | 2025-10-04 | Initial versioning policy created |

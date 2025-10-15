---
"@photoeditor/shared": minor
---

Add standardized error response schemas and global error definitions

This changeset introduces RFC 7807-compliant error response schemas (ApiErrorResponseSchema)
and defines global error responses (GLOBAL_ERROR_RESPONSES) for consistent API error handling.

Changes are backward-compatible additions:
- New ApiErrorResponseSchema with optional fields for enhanced error context
- GLOBAL_ERROR_RESPONSES added to routes.manifest for OpenAPI generation
- Existing ApiErrorSchema maintained for current HTTP responses

Per docs/compatibility/versioning.md lines 68-72, these are non-breaking additions
warranting a minor version bump.

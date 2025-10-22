# ADR 0007: Turborepo Remote Cache Backend

## Status

Accepted

## Date

2025-10-20

## Context

The PhotoEditor monorepo uses Turborepo for task orchestration across backend, mobile, and shared packages. Currently, caching is local-only, which means:

1. CI runs cannot benefit from local developer builds
2. Team members cannot share cached artifacts
3. Full rebuilds occur on every CI run, slowing down the pipeline
4. Pre-commit hooks and local development suffer from redundant compilation

Recent QA evidence shows Turborepo pipeline configuration drift with `<NONEXISTENT>` commands and workspace resolution warnings, weakening confidence in deterministic caching. Enabling remote caching requires selecting a backend that:

- Integrates with existing AWS infrastructure (S3, IAM, SSM)
- Supports both local and CI environments
- Provides secure credential management
- Scales cost-effectively for a small team
- Requires minimal operational overhead

## Decision

We will use **Vercel's official Remote Cache** as the storage backend, configured via environment variables and secured through Vercel team tokens stored in AWS SSM Parameter Store.

**Note**: AWS S3 backend was considered but requires Turborepo 2.x+ for native support. Vercel Remote Cache is officially supported in 1.13.4 and provides a migration path when we upgrade Turbo.

### Implementation Details

1. **Storage Backend**: Vercel Remote Cache (free tier)
   - Hosted infrastructure (no operational overhead)
   - Automatic retention and lifecycle management
   - Global CDN for low-latency access

2. **Authentication Method**: Vercel team tokens
   - Team token generated via Vercel dashboard
   - Stored in AWS Systems Manager Parameter Store
   - No hardcoded tokens in repository

3. **Configuration Storage**: AWS Systems Manager Parameter Store
   - `/photoeditor/turborepo/team`: Vercel team slug (non-sensitive, can be in code)
   - `/photoeditor/turborepo/token`: Vercel access token (sensitive, SecureString)
   - Parameters are pulled at runtime in CI, optional for local developers

4. **Turbo Configuration**: Environment-based activation
   ```bash
   TURBO_TOKEN=<from-ssm-or-local>  # Vercel access token
   TURBO_TEAM=photoeditor           # Vercel team slug
   TURBO_REMOTE_CACHE_READ_ONLY=false
   ```

5. **Access Control**:
   - Developers: Can generate personal tokens (optional, for local caching)
   - CI: Uses team token from SSM (full read/write)
   - Pull request builds: Same team token (Vercel handles scoping internally)

### Secret Rotation

- **Owner**: DevOps team (currently @jeffreymoya)
- **Process**:
  1. Generate new Vercel team token via dashboard (Settings > Tokens)
  2. Update SSM parameter `/photoeditor/turborepo/token`
  3. Revoke old token in Vercel dashboard
  4. No CI workflow changes required (pulls from SSM automatically)
- **Frequency**: Every 90 days or on suspected compromise
- **Validation**: Run `pnpm turbo run build --dry-run` to verify token works

## Consequences

### Positive

- **Faster CI/CD**: Cache hits reduce build times from ~8 minutes to ~2 minutes (est.)
- **Improved DX**: Local developers benefit from team's cache artifacts
- **Zero infrastructure cost**: Vercel free tier includes remote caching
- **Zero operational overhead**: No servers, buckets, or monitoring to manage
- **Officially supported**: Native integration in Turborepo 1.13.4
- **Global CDN**: Low-latency access from any region
- **Simple migration**: Can disable via environment variable if issues arise
- **Future-proof**: Migration path to S3 available when upgrading Turborepo 2.x+

### Negative

- **External dependency**: Adds Vercel as a service dependency
  - Mitigation: Turbo gracefully falls back to local cache if Vercel unavailable
  - Mitigation: Can migrate to S3 in future Turbo upgrade
- **Token management**: Requires manual token rotation every 90 days
  - Mitigation: Documented process in this ADR and README
- **Free tier limits**: May hit quotas as team/project grows
  - Mitigation: Monitor usage, upgrade to paid plan or migrate to S3 if needed

### Neutral

- Cache warming period: First few CI runs won't benefit until cache populated
- Regional latency: CDN minimizes impact, but not as fast as same-region S3

## Alternatives Considered

### 1. Vercel Remote Cache (SaaS)

- **Pros**: Zero operational overhead, built-in analytics, generous free tier
- **Cons**: Adds external dependency, requires Vercel account, data leaves AWS
- **Rejected**: Preference for keeping all infrastructure in AWS for consistency

### 2. AWS S3 Backend

- **Pros**: Aligned with existing infrastructure, full control, HIPAA-compliant if needed
- **Cons**: Requires Turborepo 2.x+ for native support, operational overhead, monthly costs
- **Deferred**: Plan to migrate when upgrading Turbo (v2.x roadmap includes S3 support)

### 3. Self-hosted Turbo Server

- **Pros**: Full control, no external dependencies
- **Cons**: Requires server provisioning, monitoring, security patching, high maintenance
- **Rejected**: Operational overhead too high for team size

### 4. GitHub Actions Cache API

- **Pros**: Free, integrated with CI
- **Cons**: 10GB limit, 7-day retention, CI-only (no local dev access)
- **Rejected**: Insufficient for monorepo build artifacts, doesn't help local development

## References

- [Turborepo Remote Caching Docs](https://turbo.build/repo/docs/core-concepts/remote-caching)
- [Turborepo with AWS S3](https://github.com/vercel/turbo/discussions/2229)
- STANDARDS.md lines 126-132 (Evidence requirements)
- standards/global.md (Tagging rules for AWS resources)
- ADR 0006: Secrets Management Strategy (SSM Parameter Store usage)

# Infrastructure Environment Registry

**Purpose**: Authoritative registry of deployed infrastructure resources per stage (dev, stage, prod) to support audit trails, drift detection, and configuration validation.

**Standards Citations**:
- `standards/infrastructure-tier.md` L12 (SST envs map 1:1 to stage, outputs exported and recorded in environment registry)
- `standards/cross-cutting.md#governance--knowledge` L121-133 (evidence bundle, ADR template, standards as executable checks)

**Task**: TASK-0827
**Last Updated**: 2025-11-04

## Overview

This registry captures infrastructure state for each deployment stage, providing traceability for:
- Resource identifiers (ARNs, IDs, names) for operational access
- Deployment timestamps for audit and drift tracking
- Source commands for reproducibility
- Standards compliance evidence

The registry is **generated via automation** (not manually maintained) to ensure accuracy and consistency.

## Registry Schema

Each environment entry includes:

### Required Fields

| Field | Type | Description | Source | Example |
|-------|------|-------------|--------|---------|
| `stage` | string | Deployment stage identifier | CLI argument or env var | `dev`, `stage`, `prod` |
| `timestamp` | ISO8601 | Last registry update timestamp | `date -u +"%Y-%m-%dT%H:%M:%SZ"` | `2025-11-04T12:00:00Z` |
| `region` | string | AWS region | SST/Terraform output | `us-east-1` |
| `stack` | string | Stack identifier (SST or Terraform) | SST/Terraform config | `photoeditor-dev` |

### Resource Outputs

#### SST Resources (Current Phase)

Per `infra/sst/sst.config.ts` L46-58:

| Output Key | Type | Description | Standards Reference |
|------------|------|-------------|---------------------|
| `api` | URL | HTTP API Gateway endpoint | infrastructure-tier.md |
| `tempBucket` | string | Temporary uploads bucket name (48h lifecycle) | infrastructure-tier.md L26 |
| `finalBucket` | string | Final artifacts bucket name (versioned) | infrastructure-tier.md L27 |
| `jobsTable` | string | DynamoDB jobs table name | infrastructure-tier.md L37 |
| `batchTable` | string | DynamoDB batch table name | infrastructure-tier.md L37 |
| `processingQueue` | URL | SQS processing queue URL | infrastructure-tier.md L32 |
| `processingDLQ` | URL | SQS dead-letter queue URL | infrastructure-tier.md L32 |
| `notificationTopic` | ARN | SNS notification topic ARN | cross-cutting.md L40 |
| `bffFunction` | string | BFF Lambda function name | - |
| `region` | string | AWS region | - |

#### Terraform Resources (Future Phase)

Per `infrastructure/outputs.tf`:

| Output Key | Type | Description | Availability |
|------------|------|-------------|--------------|
| `environment` | string | Environment name | Phase 2+ |
| `region` | string | AWS region | Phase 2+ |
| Additional module outputs | - | Will be added as modules are created | Phase 2-3 |

### Metadata Fields

| Field | Type | Description | Example |
|-------|------|-------------|---------|
| `generatedBy` | string | Script/command that generated this entry | `scripts/infra/export-environment-registry.ts` |
| `sstVersion` | string | SST CLI version used | `3.1.x` |
| `terraformVersion` | string | Terraform version (when applicable) | `1.9.x` |
| `nodeVersion` | string | Node.js runtime version | `20.x` |

### Constraints

Per task constraints and `standards/infrastructure-tier.md`:

- **No secrets or credentials**: Registry contains only resource identifiers (names, URLs, ARNs)
- **Reproducible via automation**: Registry can be regenerated at any time via documented script
- **Timestamps included**: Each entry records when it was last validated
- **Source commands documented**: Registry documents the exact commands used to gather data

## Data Sources

### SST Outputs (Primary Source)

**Command**: `pnpm sst output --stage <stage> --format json`

**Location**: `infra/sst/`

**Output Format**: JSON object with resource outputs per `sst.config.ts` return value

**Example**:
```json
{
  "api": "https://abc123.execute-api.us-east-1.amazonaws.com",
  "tempBucket": "photoeditor-dev-temp-xyz",
  "finalBucket": "photoeditor-dev-final-xyz",
  "jobsTable": "photoeditor-dev-jobs",
  "batchTable": "photoeditor-dev-batch",
  "processingQueue": "https://sqs.us-east-1.amazonaws.com/123456789012/photoeditor-dev-processing",
  "processingDLQ": "https://sqs.us-east-1.amazonaws.com/123456789012/photoeditor-dev-processing-dlq",
  "notificationTopic": "arn:aws:sns:us-east-1:123456789012:photoeditor-dev-notifications",
  "bffFunction": "photoeditor-dev-bff",
  "region": "us-east-1"
}
```

### Terraform Outputs (Future Source)

**Command**: `terraform output -json`

**Location**: `infrastructure/`

**Output Format**: JSON object with module outputs per `outputs.tf`

**Example** (future):
```json
{
  "environment": {
    "value": "dev"
  },
  "region": {
    "value": "us-east-1"
  }
}
```

### Version Information

**Commands**:
- SST version: `pnpm sst version`
- Terraform version: `terraform version -json`
- Node version: `node --version`

## Registry Output Format

The registry is stored as **JSON** at `docs/infra/environment-registry.json` with the following structure:

```json
{
  "version": "1.0",
  "generated": "2025-11-04T12:00:00Z",
  "environments": {
    "dev": {
      "stage": "dev",
      "timestamp": "2025-11-04T12:00:00Z",
      "region": "us-east-1",
      "stack": "photoeditor-dev",
      "resources": {
        "sst": {
          "api": "https://abc123.execute-api.us-east-1.amazonaws.com",
          "tempBucket": "photoeditor-dev-temp-xyz",
          "finalBucket": "photoeditor-dev-final-xyz",
          "jobsTable": "photoeditor-dev-jobs",
          "batchTable": "photoeditor-dev-batch",
          "processingQueue": "https://sqs.us-east-1.amazonaws.com/123456789012/photoeditor-dev-processing",
          "processingDLQ": "https://sqs.us-east-1.amazonaws.com/123456789012/photoeditor-dev-processing-dlq",
          "notificationTopic": "arn:aws:sns:us-east-1:123456789012:photoeditor-dev-notifications",
          "bffFunction": "photoeditor-dev-bff",
          "region": "us-east-1"
        },
        "terraform": {}
      },
      "metadata": {
        "generatedBy": "scripts/infra/export-environment-registry.ts",
        "sstVersion": "3.1.x",
        "terraformVersion": null,
        "nodeVersion": "20.x"
      }
    },
    "stage": {
      "stage": "stage",
      "timestamp": null,
      "region": null,
      "stack": null,
      "resources": {
        "sst": {},
        "terraform": {}
      },
      "metadata": {
        "generatedBy": null,
        "sstVersion": null,
        "terraformVersion": null,
        "nodeVersion": null
      }
    },
    "prod": {
      "stage": "prod",
      "timestamp": null,
      "region": null,
      "stack": null,
      "resources": {
        "sst": {},
        "terraform": {}
      },
      "metadata": {
        "generatedBy": null,
        "sstVersion": null,
        "terraformVersion": null,
        "nodeVersion": null
      }
    }
  }
}
```

**Null Handling**: Environments that have not been deployed will have `null` values. This allows the registry to track all expected stages while clearly indicating which are active.

## TypeScript Schema Definition

Per `standards/typescript.md` L38 (runtime schemas mandatory at boundaries):

```typescript
import { z } from 'zod';

/**
 * Environment registry schema for infrastructure outputs.
 * Standards: infrastructure-tier.md L12, cross-cutting.md L121-133
 */

export const EnvironmentResourcesSchema = z.object({
  sst: z.record(z.union([z.string(), z.null()])),
  terraform: z.record(z.union([z.string(), z.null()])),
});

export const EnvironmentMetadataSchema = z.object({
  generatedBy: z.string().nullable(),
  sstVersion: z.string().nullable(),
  terraformVersion: z.string().nullable(),
  nodeVersion: z.string().nullable(),
});

export const EnvironmentEntrySchema = z.object({
  stage: z.enum(['dev', 'stage', 'prod']),
  timestamp: z.string().datetime().nullable(),
  region: z.string().nullable(),
  stack: z.string().nullable(),
  resources: EnvironmentResourcesSchema,
  metadata: EnvironmentMetadataSchema,
});

export const EnvironmentRegistrySchema = z.object({
  version: z.literal('1.0'),
  generated: z.string().datetime(),
  environments: z.object({
    dev: EnvironmentEntrySchema,
    stage: EnvironmentEntrySchema,
    prod: EnvironmentEntrySchema,
  }),
});

export type EnvironmentResources = z.infer<typeof EnvironmentResourcesSchema>;
export type EnvironmentMetadata = z.infer<typeof EnvironmentMetadataSchema>;
export type EnvironmentEntry = z.infer<typeof EnvironmentEntrySchema>;
export type EnvironmentRegistry = z.infer<typeof EnvironmentRegistrySchema>;
```

## Refresh Cadence

Per `standards/testing-standards.md#evidence-expectations`:

- **Manual refresh**: On-demand via `pnpm infra:registry` (package.json script)
- **Automated refresh**: Post-deployment (CI/CD pipeline trigger)
- **Drift detection**: Weekly (aligned with Terraform drift detection per `infrastructure-tier.md` L20)

## Regeneration Steps

The registry is regenerated automatically by `scripts/infra/export-environment-registry.ts`. To refresh manually:

### Prerequisites

- Node.js 20.x or later
- pnpm 8.x or later
- Access to deployed SST stages (requires AWS credentials)
- (Optional) Terraform backend configured for Terraform output queries

### Manual Regeneration

```bash
# From repository root
pnpm infra:registry
```

This command:
1. Queries SST outputs for each stage (dev, stage, prod) via `pnpm sst output --stage <stage> --format json`
2. Queries Terraform outputs via `terraform output -json` (if backend configured)
3. Collects version metadata (SST, Terraform, Node.js versions)
4. Validates collected data against `EnvironmentRegistrySchema`
5. Writes validated JSON to `docs/infra/environment-registry.json`

### Output Example

```
[INFO] Collecting environment registry data...
[INFO] Metadata: { generatedBy: 'scripts/infra/export-environment-registry.ts', ... }
[INFO] Collecting outputs for stage: dev
[INFO] ✓ Stage 'dev' has 10 SST outputs
[INFO] Collecting outputs for stage: stage
[INFO] ✗ Stage 'stage' not deployed
[INFO] Collecting outputs for stage: prod
[INFO] ✗ Stage 'prod' not deployed
[INFO] ✓ Registry validated against schema
[INFO] ✓ Registry written to: docs/infra/environment-registry.json
[INFO] Registry generation complete
```

### Error Handling

The script gracefully handles:
- **Missing SST deployments**: Stages not deployed will have `null` timestamp and empty resources
- **Terraform backend not configured**: Terraform outputs will be empty/null
- **Version query failures**: Version fields will be `null`
- **Schema validation failures**: Script exits with error code 1

### Troubleshooting

**Problem**: `pnpm sst output` fails with authentication error

**Solution**: Ensure AWS credentials are configured:
```bash
export AWS_PROFILE=photoeditor-dev
# or
export AWS_ACCESS_KEY_ID=...
export AWS_SECRET_ACCESS_KEY=...
```

**Problem**: Script fails with "tsx: not found"

**Solution**: Install tsx globally or use npx:
```bash
pnpm add -D tsx
# or use npx
npx tsx scripts/infra/export-environment-registry.ts
```

**Problem**: Registry validation fails

**Solution**: Check script output for Zod validation errors. Common issues:
- Malformed ISO8601 timestamps
- Unexpected output structure from SST/Terraform
- Missing required fields in schema

## Usage

### Generating the Registry

```bash
# Generate for all stages
pnpm infra:registry

# Generate for specific stage (if supported)
pnpm infra:registry --stage dev
```

The script will:
1. Query SST outputs for deployed stages
2. Query Terraform outputs (when modules exist)
3. Gather version metadata
4. Validate against schema
5. Write to `docs/infra/environment-registry.json`

### Querying the Registry

```bash
# Read registry
cat docs/infra/environment-registry.json | jq '.environments.dev'

# Get specific resource
cat docs/infra/environment-registry.json | jq -r '.environments.dev.resources.sst.api'

# List all deployed stages
cat docs/infra/environment-registry.json | jq -r '.environments | to_entries[] | select(.value.timestamp != null) | .key'
```

### Validation Workflow Integration

Per task plan step 4, validation agents reference this registry to:
- Verify resource identifiers match expected patterns
- Detect configuration drift between stages
- Validate standards compliance (encryption, tagging, etc.)
- Audit deployment timestamps and update cadence

See updated validation agent documentation in `.claude/agents/test-validation-*.md`.

## Standards Compliance

### Infrastructure Tier (`standards/infrastructure-tier.md`)

- **L12**: SST envs map 1:1 to workspace/stage; outputs exported for app and recorded in environment registry
  - Implementation: Registry captures SST outputs per stage with timestamps
- **L23**: Evidence bundle includes validate/plan output, drift report, policy evaluation, deployment validation logs
  - Implementation: Registry provides deployment validation evidence with timestamps

### Cross-Cutting (`standards/cross-cutting.md`)

- **L121-133**: Governance & Knowledge - Evidence bundle, ADR template, standards as executable checks
  - Implementation: Registry serves as executable artifact for infrastructure state validation

### TypeScript (`standards/typescript.md`)

- **L38**: Runtime schemas are mandatory at boundaries: Zod is SSOT
  - Implementation: EnvironmentRegistrySchema validates all registry data

## Future Enhancements

As Terraform modules are created (Phase 2-3 per `docs/infra/sst-parity-checklist.md`):

1. **Terraform Output Integration**: Extend script to query Terraform outputs and merge with SST data
2. **Parity Validation**: Compare SST vs Terraform outputs for consistency
3. **Historical Tracking**: Archive registry snapshots for audit trail
4. **Drift Alerting**: Detect unexpected changes in resource identifiers
5. **CI Integration**: Auto-generate registry post-deployment in GitHub Actions

## References

- **Task**: `tasks/infra/TASK-0827-environment-registry-evidence.task.yaml`
- **SST Config**: `infra/sst/sst.config.ts`
- **Terraform Outputs**: `infrastructure/outputs.tf`
- **Standards**: `standards/infrastructure-tier.md`, `standards/cross-cutting.md`, `standards/typescript.md`
- **Parity Checklist**: `docs/infra/sst-parity-checklist.md`
- **Control Plane Evidence**: `docs/infra/terraform-control-plane-evidence.md`

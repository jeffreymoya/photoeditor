# ADR 0008: SST Parity with Terraform Modules

- Status: Accepted
- Date: 2025-10-29

## Context

The PhotoEditor infrastructure spans SST (for local development and rapid iteration) and Terraform (for production-grade control plane). `standards/infrastructure-tier.md` lines 5-12 establish that **if adopting SST, you must provide an ADR demonstrating parity with Terraform modules and define the migration strategy**. SST should act as a composition layer calling versioned Terraform modules wherever possible (e.g., VPC, KMS).

Currently, SST stacks (`infra/sst/stacks/api.ts`, `storage.ts`, `messaging.ts`) directly provision AWS resources using SST constructs without consuming reusable Terraform modules. This creates drift risk between SST-provisioned development environments and Terraform-managed production environments, violating the parity requirement and making infrastructure changes difficult to validate consistently across environments.

ADR-0002 (Serverless Media Pipeline) establishes the event-driven Lambda architecture but defers infrastructure module reuse decisions. The infrastructure-tier standard mandates versioned modules with published changelogs (`standards/infrastructure-tier.md` line 7) and environment registries (`standards/infrastructure-tier.md` line 12).

## Decision

Establish SST as the local development and rapid iteration platform while maintaining Terraform as the authoritative control plane for production environments. Define a parity contract ensuring SST stacks consume versioned Terraform modules wherever feasible, with documented migration paths for any gaps.

**Key Principles**:

1. **Module Reuse Over Raw Resources**: SST stacks must import and compose Terraform modules (via SST's Terraform interop or equivalent abstraction) for shared infrastructure (VPC, KMS, IAM roles, base networking) rather than declaring raw CloudFormation/Pulumi resources.

2. **Versioned Module Contract**: Infrastructure modules follow semantic versioning with published changelogs (`standards/infrastructure-tier.md` line 7). SST stacks pin to explicit module versions and document upgrade paths in ADR amendments.

3. **Environment Registry**: Both SST and Terraform deployments export outputs to a shared environment registry (`standards/infrastructure-tier.md` line 12). SST environments map 1:1 to Terraform workspaces/stages (dev, staging, prod).

4. **Migration Strategy**:
   - **Phase 1 (Current)**: SST stacks provision resources directly for local development. Terraform manages production.
   - **Phase 2 (Target)**: Extract shared infrastructure (KMS, networking, IAM) into versioned Terraform modules. SST stacks import these modules via SST bindings or Terraform data sources.
   - **Phase 3 (Future)**: Terraform modules cover all stateful infrastructure. SST composes these modules and adds application-specific Lambda/API Gateway definitions.

5. **Parity Validation**:
   - Terraform `plan` outputs and SST `diff` outputs for equivalent environments must align on resource types, encryption settings, tagging, and observability configurations.
   - Drift detection runs weekly (`standards/infrastructure-tier.md` line 20) with reports uploaded to `docs/infra/drift`.

6. **Compliance Inheritance**: SST stacks inherit compliance requirements from Terraform modules:
   - KMS encryption for S3/DynamoDB/SQS/SNS (`standards/cross-cutting.md` lines 10, 52)
   - Mandatory tagging: `Project`, `Env`, `Owner`, `CostCenter` (`standards/cross-cutting.md` line 11)
   - DLQ configuration for SQS (`standards/cross-cutting.md` line 25)
   - CloudWatch alarms for Lambda errors, API 5XX, DLQ inflow (`standards/cross-cutting.md` line 47)

**Current State (Phase 1)**:
- SST stacks provision all resources inline (S3, DynamoDB, SQS, SNS, Lambda, API Gateway)
- Terraform modules for shared infrastructure do not yet exist
- Parity enforced via standards citations in stack files and manual validation

**Target State (Phase 2-3)**:
- Terraform modules published for: KMS keys, S3 buckets (with lifecycle rules), DynamoDB tables (with PITR, streams, TTL), SQS queues (with DLQ), SNS topics, CloudWatch log groups and alarms
- SST stacks import these modules and wire application-specific configurations
- Module versioning and changelogs enable safe upgrades

## Consequences

**Positive**:
- Local development environments (SST) closely mirror production (Terraform) by consuming shared modules, reducing parity drift
- Versioned modules enable reproducible infrastructure changes with rollback capability
- Standards compliance (encryption, tagging, observability) enforced once in modules and inherited by all environments
- Migration path is incremental: modules can be extracted one at a time without blocking SST development

**Negative**:
- Initial investment required to extract existing SST resources into Terraform modules
- SST stack complexity may increase slightly to wire module outputs
- Developers must understand both SST and Terraform module interfaces
- Module versioning and changelog maintenance adds operational overhead

**Neutral**:
- SST remains the preferred tool for local development and CI preview environments
- Terraform remains the authoritative source for production deployments
- Both tools coexist during migration phases with explicit parity contracts

## Migration Plan

### Step 1: Identify Module Candidates
Audit existing SST stacks to identify resources suitable for module extraction:
- **High Priority**: KMS keys, S3 buckets (with lifecycle rules), DynamoDB tables (with PITR/TTL)
- **Medium Priority**: SQS queues (with DLQ), SNS topics, CloudWatch log groups
- **Low Priority**: Application-specific Lambda functions and API Gateway routes (remain SST-native)

### Step 2: Create Terraform Modules
For each module candidate:
1. Create versioned module in `infrastructure/modules/{module-name}` with:
   - `variables.tf` (input contract)
   - `outputs.tf` (exported values for SST consumption)
   - `main.tf` (resource definitions)
   - `CHANGELOG.md` (semantic versioning)
2. Enforce standards compliance: encryption, tagging, alarms, lifecycle rules
3. Validate with `terraform validate`, `tflint`, `checkov`, `terrascan` (`standards/infrastructure-tier.md` line 19)

### Step 3: Refactor SST Stacks
For each module:
1. Replace inline SST resource declarations with module imports (via SST Terraform bindings or data sources)
2. Wire module outputs to SST Lambda environment variables and permissions
3. Validate parity with `sst diff` and manual inspection
4. Update stack comments to cite module versions and standards clauses

### Step 4: Evidence and Validation
1. Document module usage in `docs/infra/sst-parity-checklist.md`
2. Run drift detection and attach reports to evidence bundle
3. Update environment registry with SST outputs
4. Link follow-up tasks for any remaining gaps

### Step 5: Ongoing Governance
- Module upgrades follow semantic versioning with changelog entries
- SST stack updates cite module versions in commit messages
- Parity validation runs weekly via drift detection
- Exceptions documented with expiry dates per `standards/global.md`

## Parity Checklist

The following resources must achieve parity between SST and Terraform:

| Resource Type | Current State | Target State | Module Exists | SST Imports Module |
|---------------|---------------|--------------|---------------|---------------------|
| KMS Key | SST inline | Terraform module | ❌ | ❌ |
| S3 Buckets (temp/final) | SST inline | Terraform module | ❌ | ❌ |
| DynamoDB Tables (jobs/batch/deviceTokens) | SST inline | Terraform module | ❌ | ❌ |
| SQS Queues (processing/DLQ) | SST inline | Terraform module | ❌ | ❌ |
| SNS Topic (notifications) | SST inline | Terraform module | ❌ | ❌ |
| CloudWatch Log Groups | SST inline | Terraform module | ❌ | ❌ |
| CloudWatch Alarms | SST inline | Terraform module | ❌ | ❌ |
| Lambda Functions | SST inline | Remain SST-native | N/A | N/A |
| API Gateway | SST inline | Remain SST-native | N/A | N/A |

**Status Key**: ✅ Complete, ⚠️ In Progress, ❌ Not Started, N/A Not Applicable

## Alternatives Considered

### 1. SST-Only Infrastructure
- **Pros**: Single tool, faster local development, no module extraction overhead
- **Cons**: Limited control plane features (state locking, policy as code), less mature than Terraform for production
- **Rejected**: Violates `standards/infrastructure-tier.md` requirement for Terraform control plane

### 2. Terraform-Only Infrastructure
- **Pros**: Single source of truth, consistent tooling across environments
- **Cons**: Slow local iteration, poor developer experience for rapid prototyping
- **Rejected**: SST provides superior local development workflow; hybrid approach balances both needs

### 3. Duplicate Definitions (SST + Terraform Separate)
- **Pros**: No refactoring required, tools remain independent
- **Cons**: High drift risk, duplicated maintenance, violates DRY principle
- **Rejected**: Creates long-term technical debt and increases operational burden

### 4. SST Calls Terraform via TF Provider
- **Pros**: Direct module reuse, no abstraction layer
- **Cons**: Experimental SST feature, limited documentation, potential version conflicts
- **Deferred**: Monitor SST Terraform provider maturity; adopt if it stabilizes

## Compliance References

This ADR satisfies the following standards requirements:

- `standards/infrastructure-tier.md` lines 5-12: SST adoption requires parity ADR and migration strategy
- `standards/infrastructure-tier.md` line 7: Versioned modules with published changelogs
- `standards/infrastructure-tier.md` line 12: Environment outputs exported to registry
- `standards/infrastructure-tier.md` line 19-23: Fitness gates (validate, drift detection, policy enforcement)
- `standards/cross-cutting.md` line 10: Production buckets require KMS encryption
- `standards/cross-cutting.md` line 11: Mandatory cost tags (Project, Env, Owner, CostCenter)
- `standards/cross-cutting.md` line 25: DLQ configuration and redrive drills
- `standards/cross-cutting.md` line 47: CloudWatch alarms for Lambda errors, API 5XX, DLQ inflow
- `standards/global.md`: ADR governance and evidence bundle requirements

## Related Work

- `adr/0002-serverless-media-pipeline.md`: Establishes Lambda event-driven architecture
- `standards/infrastructure-tier.md`: Infrastructure tier requirements and fitness gates
- `standards/cross-cutting.md`: Hard-fail controls for encryption, tagging, alarms
- `standards/global.md`: ADR governance and evidence requirements
- `infra/sst/stacks/api.ts`: API Lambda and API Gateway stack
- `infra/sst/stacks/storage.ts`: S3, DynamoDB, KMS stack
- `infra/sst/stacks/messaging.ts`: SQS, SNS stack
- `tasks/infra/TASK-0822-sst-adr-module-parity.task.yaml`: Driving task for this ADR
- `tasks/infra/TASK-0823-terraform-control-plane.task.yaml`: Follow-up task for Terraform module authoring (when created)

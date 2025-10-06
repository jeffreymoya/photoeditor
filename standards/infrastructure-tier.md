# Infrastructure Tier

**Terraform Control Plane / Modules**

* **Terraform** with **tfenv**, **pre-commit-terraform**, **tflint**, **checkov**, **terrascan**.
* **Terragrunt** for env orchestration (default choice for staging/prod stacks).
* Module design: **input/output contracts**, no implicit providers, **versioned modules** with published changelog.

**SST Alternative**

* If adopting **SST**, you must provide an ADR demonstrating parity with Terraform modules and define the migration strategy; SST acts as composition layer calling **versioned Terraform modules** where possible (e.g., VPC, KMS).
* **sst envs** map 1:1 to workspace/stage; outputs exported for app and recorded in environment registry.

**Local Dev Platform**

* **docker-compose** for emulation; **bref/local** or **sam local** for parity tests; **localstack-pro** only if you need full CloudWatch/XRay locally—otherwise, use **remote dev** against a sandbox AWS account with data-segregation policy, access audit, and rollback checklist.

**Fitness gates**

* `terraform validate`/`plan` artifacts stored; drift check weekly (Infracost + driftctl) with report uploaded to `docs/infra/drift`.
* Policy as Code: **OPA/Conftest** or **Terraform Cloud policies**.
* **Infrastructure tests**: Terratest or equivalent integration suite must run on critical modules; results archived alongside plan artefacts.
* **Owner**: Infrastructure Lead. **Evidence**: validate/plan output, drift report, policy evaluation, and Terratest summary included in evidence bundle.

## Storage

* Split buckets by lifecycle: `temp` (48-hour expiry) and `final` (versioned) with CMK encryption and block-public-access enabled.
* Configure incomplete multipart cleanup after seven days and transition compliance archives to Glacier after 90 days.

## Messaging & Notifications

* SQS queues pair with DLQs, enforce long polling at 20 seconds, and set visibility timeout to six times average processing; redrive procedures stay documented and rehearsed.
* Notifications flow via SNS → FCM or direct FCM v1—justify the choice in infrastructure docs and keep token refresh pipelines current.

## Database

* DynamoDB tables enable PITR, run on on-demand capacity for dev/stage and provisioned throughput for prod, and document access patterns plus GSI strategy.
* Apply item TTL where appropriate, keep query responses under 1 MB per page, and implement paginated retries with exponential backoff.
* Follow the forward-safe DB migration playbook: lint diffs, stage changes with rollback notes, and standardise naming conventions.

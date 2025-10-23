# Exception Registry

Purpose: Track any approved deviations from repository standards with strict expiry and rollback plans. Each entry must link to the driving Task and ADR.

Schema (one entry per exception):

```yaml
id: EXC-YYYYMMDD-<slug>
title: Short description
date_raised: YYYY-MM-DD
expires_on: YYYY-MM-DD  # ≤ 90 days after date_raised
owner: <name or role>
area: backend|mobile|shared|infra|ops
task: tasks/<area>/TASK-<id>-<slug>.task.yaml
adr: adr/NNNN-<short-title>.md
standard_refs:
  - standards/<tier>-tier.md#<section>
  - standards/cross-cutting.md#<section>
justification: |
  Why the exception is necessary; alternatives considered; risk/impact.
mitigations:
  - Steps to reduce risk while exception is active
rollback_plan: |
  Concrete steps to remove the exception before expiry (with owner/date)
status: active|expired|removed
```

Process:
- Open an ADR with rationale and consequences.
- Add a new entry above with expiry ≤ 90 days.
- Link the entry from the driving Task and PR.
- On or before expiry, execute rollback_plan and mark status accordingly.

References:
- standards/backend-tier.md (Exception handling policy)
- standards/typescript.md (Exceptions require ADR + registry with expiry ≤ 90 days)
- standards/global.md (Governance and evidence)


# Shared Contracts Tier

**Libraries**

* **Zod** as SSOT → generate: **OpenAPI** (zod-to-openapi), **TypeScript types** (zod-to-ts), and **clients** (rtk-query codegen preferred; orval usage requires ADR).
* **api-extractor** for public API review; **changesets** for versioning with semver bump checklist.

**Patterns**

* **Snapshot governance**: lock contract versions; diff PR comments.
* **Error contracts** unified (code, title, detail, instance) with shared markdown reference in `docs/contracts/errors`.
* **Deprecation playbook**: publish migration timeline, fallback behaviour, and communication plan for non-TypeScript clients.
* Breaking API changes publish a new `/v{n}` surface, maintain N-1 support for at least six months, and include sunset dates in OpenAPI and response headers.

**Fitness gates**

* API diff must be reviewed; semantic-release / changesets tagging with approval recorded in task notes.
* API Extractor reports gate merges; breaking changes require matching changeset entries before publish.
* Downstream clients regenerated in CI and committed (or published) with checksum artefact stored under `docs/contracts/clients`.
* Contract compatibility matrix (old client ↔ new server and vice-versa) must pass before merge.
* **Owner**: Contract Steward. **Evidence**: diff report + regeneration log attached to evidence bundle.

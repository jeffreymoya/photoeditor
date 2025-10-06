---
"@photoeditor/shared": patch
---

Adopt changesets for shared contract versioning governance

Introduce @changesets/cli tooling, CI enforcement, and governance documentation per standards/shared-contracts-tier.md line 6. All future contract modifications now require a changeset capturing semver intent and approval records.

Infrastructure changes:
- Install @changesets/cli dependency
- Configure changesets to version only @photoeditor/shared package
- Add changeset:status CI check to .github/workflows/ci-cd.yml
- Create docs/contracts/changeset-governance.md with complete workflow
- Create docs/templates/contract-release-evidence.md for release tracking
- Add shared/README.md with versioning guidance

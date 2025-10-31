# Changelog - KMS Module

All notable changes to this module will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [1.0.0] - 2025-10-31

### Added
- Initial KMS key module implementation
- Automatic key rotation enabled by default
- Customer-managed KMS keys for ENCRYPT_DECRYPT usage
- Configurable deletion window (7-30 days)
- Mandatory tagging: Project, Env, Owner, CostCenter (cross-cutting.md L11)
- KMS alias for easy key reference

### Standards
- Complies with infrastructure-tier.md L7 (versioned modules with input/output contracts)
- Complies with cross-cutting.md L52 (KMS encryption for stateful resources)
- Supports ADR-0008 (SST/Terraform parity)

### Migration Notes
- This module replaces inline KMS key definitions in SST stacks
- SST stacks can import this module via Terraform interop or data sources
- See docs/infra/sst-parity-checklist.md for migration status

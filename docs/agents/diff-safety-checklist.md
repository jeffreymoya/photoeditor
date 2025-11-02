# Diff Safety Checklist

Run this audit before handing work to downstream agents.

- Block the task if you encounter `@ts-ignore`, `eslint-disable`, skipped test suites, or other muted validation controls without an approved Standards CR (see `standards/standards-governance-ssot.md`).
- Remove deprecated or dead code that no longer aligns with documented standards.
- Confirm any exceptions are recorded through the Standards CR workflow, not silently introduced in the diff.

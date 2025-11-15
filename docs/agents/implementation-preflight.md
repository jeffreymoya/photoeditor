# Implementation Preflight Checklist

Use this checklist before implementation or review work so every agent leans on the same sources.

1. Read `standards/standards-governance-ssot.md` for the current rules and change process.
2. **Evaluate task complexity and granularity:**
   - Read `standards/task-breakdown-canon.md` for breakdown algorithm and "Too Complex" signals
   - Check task against quantitative thresholds per `standards/task-sizing-guide.md`:
     - **File count:** Count files in deliverables (implementation + tests). If >10 files → STOP, recommend breakdown. If 9-10 files → warn user of L-size upper limit.
     - **Plan steps:** Count steps in plan. If >6 steps → warn, consider breakdown. If >6 steps AND >5 files → STOP (session time risk).
     - **Estimate field:** Verify estimate (XS/S/M/L) matches actual scope. If marked L → confirm breakdown not needed.
   - If task exceeds thresholds → **STOP implementation**, cite breakdown canon and sizing guide, recommend split to user
   - If task is at upper limit (L-sized) → warn user, proceed only if scope cannot be reduced
3. Determine applicable tier guidance via `standards/AGENTS.md`, then consult the cited tier docs alongside `standards/cross-cutting.md` and `standards/typescript.md`.
4. Review every ADR referenced in the task file to ensure you are honoring historical decisions.

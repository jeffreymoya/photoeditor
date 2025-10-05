#!/usr/bin/env bash
#
# Coverage Gate Script
# Enforces minimum coverage thresholds for changed lines (deterministic per testing-standards.md)
#
# Usage: ./check-coverage.sh <coverage-json-path> <threshold-lines> <threshold-branches>
#
# Exit codes:
#   0 - Coverage meets or exceeds thresholds
#   1 - Coverage below thresholds
#   2 - Invalid arguments or missing coverage file

set -euo pipefail

COVERAGE_FILE="${1:-}"
THRESHOLD_LINES="${2:-80}"
THRESHOLD_BRANCHES="${3:-70}"

if [[ -z "$COVERAGE_FILE" ]] || [[ ! -f "$COVERAGE_FILE" ]]; then
  echo "ERROR: Coverage file not found: $COVERAGE_FILE"
  echo "Usage: $0 <coverage-json-path> [threshold-lines=80] [threshold-branches=70]"
  exit 2
fi

echo "========================================="
echo "Coverage Gate Check"
echo "========================================="
echo "Coverage file: $COVERAGE_FILE"
echo "Thresholds: Lines ≥ ${THRESHOLD_LINES}%, Branches ≥ ${THRESHOLD_BRANCHES}%"
echo ""

# Extract coverage percentages from coverage-summary.json
# This assumes Jest/nyc JSON format with total.lines.pct and total.branches.pct
if command -v jq &> /dev/null; then
  LINES_PCT=$(jq -r '.total.lines.pct // 0' "$COVERAGE_FILE")
  BRANCHES_PCT=$(jq -r '.total.branches.pct // 0' "$COVERAGE_FILE")
else
  # Fallback to grep/sed if jq is not available
  LINES_PCT=$(grep -oP '"lines":\s*\{\s*"total":\s*\d+,\s*"covered":\s*\d+,\s*"skipped":\s*\d+,\s*"pct":\s*\K[\d.]+' "$COVERAGE_FILE" || echo "0")
  BRANCHES_PCT=$(grep -oP '"branches":\s*\{\s*"total":\s*\d+,\s*"covered":\s*\d+,\s*"skipped":\s*\d+,\s*"pct":\s*\K[\d.]+' "$COVERAGE_FILE" || echo "0")
fi

echo "Current coverage:"
echo "  Lines: ${LINES_PCT}%"
echo "  Branches: ${BRANCHES_PCT}%"
echo ""

# Compare using awk for floating point comparison
LINES_OK=$(awk -v pct="$LINES_PCT" -v threshold="$THRESHOLD_LINES" 'BEGIN { print (pct >= threshold) ? 1 : 0 }')
BRANCHES_OK=$(awk -v pct="$BRANCHES_PCT" -v threshold="$THRESHOLD_BRANCHES" 'BEGIN { print (pct >= threshold) ? 1 : 0 }')

if [[ "$LINES_OK" == "1" ]] && [[ "$BRANCHES_OK" == "1" ]]; then
  echo "✓ Coverage gate PASSED"
  echo "  Lines: ${LINES_PCT}% ≥ ${THRESHOLD_LINES}%"
  echo "  Branches: ${BRANCHES_PCT}% ≥ ${THRESHOLD_BRANCHES}%"
  exit 0
else
  echo "✗ Coverage gate FAILED"
  if [[ "$LINES_OK" != "1" ]]; then
    echo "  Lines: ${LINES_PCT}% < ${THRESHOLD_LINES}% (FAIL)"
  fi
  if [[ "$BRANCHES_OK" != "1" ]]; then
    echo "  Branches: ${BRANCHES_PCT}% < ${THRESHOLD_BRANCHES}% (FAIL)"
  fi
  echo ""
  echo "Please increase test coverage to meet the thresholds."
  exit 1
fi

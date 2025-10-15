#!/usr/bin/env bash
#
# QA Suite - Centralized fitness function entry point
#
# Purpose: Consolidate Stage 1 fitness checks into a single entry point so developers,
#          Husky hooks, and CI runners execute identical contract, lint, infrastructure,
#          and build gates.
#
# Usage:
#   ./scripts/qa/qa-suite.sh              # Run all checks
#   SKIP_INFRA=1 ./scripts/qa/qa-suite.sh # Skip infrastructure validation
#   SKIP_TESTS=1 ./scripts/qa/qa-suite.sh # Skip tests
#   SKIP_BUILD=1 ./scripts/qa/qa-suite.sh # Skip build verification
#
# Environment Variables:
#   SKIP_LINT     - Skip static analysis (typecheck + lint)
#   SKIP_TESTS    - Skip core tests
#   SKIP_INFRA    - Skip infrastructure validation
#   SKIP_BUILD    - Skip build verification
#   SKIP_CONTRACTS - Skip contract drift check
#
# Exit Codes:
#   0 - All enabled checks passed
#   1 - One or more checks failed
#
# References:
#   - STANDARDS.md lines 7-13: Hard fail controls
#   - STANDARDS.md lines 44-51: Testability requirements
#   - docs/testing-standards.md: Test requirements by component

set -euo pipefail

# Determine repository root (handles both direct execution and Make invocation)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"
cd "$REPO_ROOT"

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Track overall status
FAILED_CHECKS=()

# Helper functions
log_section() {
  echo ""
  echo "========================================="
  echo "$1"
  echo "========================================="
  echo ""
}

log_step() {
  echo -e "${BLUE}[$1]${NC} $2"
}

log_success() {
  echo -e "${GREEN}✓${NC} $1"
}

log_warning() {
  echo -e "${YELLOW}⚠${NC} $1"
}

log_error() {
  echo -e "${RED}✗${NC} $1"
}

run_check() {
  local name="$1"
  local command="$2"

  log_step "RUN" "$name"
  if eval "$command"; then
    log_success "$name passed"
    return 0
  else
    log_error "$name failed"
    FAILED_CHECKS+=("$name")
    return 1
  fi
}

# Main execution
main() {
  local start_time=$(date +%s)

  echo "================================================"
  echo "PhotoEditor QA Suite"
  echo "================================================"
  echo "Started: $(date)"
  echo ""

  # QA-A: Static Safety Nets
  if [ "${SKIP_LINT:-}" != "1" ]; then
    log_section "QA-A: Static Safety Nets"

    run_check "Backend typecheck" "(cd backend && npm run typecheck)" || true
    run_check "Shared typecheck" "(cd shared && npm run typecheck)" || true
    run_check "Mobile typecheck" "(cd mobile && npm run typecheck 2>/dev/null)" || log_warning "Mobile typecheck skipped (optional)"
    run_check "Backend lint" "(cd backend && npm run lint)" || true
    run_check "Shared lint" "(cd shared && npm run lint)" || true
    run_check "Mobile lint" "(cd mobile && npm run lint 2>/dev/null)" || log_warning "Mobile lint skipped (optional)"

    if [ ${#FAILED_CHECKS[@]} -eq 0 ]; then
      echo ""
      log_success "QA-A: Static Safety Nets PASSED"
      echo ""
    fi
  else
    log_warning "Skipping QA-A: Static Safety Nets (SKIP_LINT=1)"
  fi

  # QA-B: Contract Drift Detection
  if [ "${SKIP_CONTRACTS:-}" != "1" ]; then
    log_section "QA-B: Contract Drift Detection"

    run_check "Contract drift check" "npm run contracts:check" || true
    run_check "Route alignment check" "bash scripts/ci/check-route-alignment.sh" || true

    if [ -f contract-diff.json ]; then
      log_warning "Contract drift detected - review contract-diff.json"
    fi

    if [ ${#FAILED_CHECKS[@]} -eq 0 ] || ( [ "${FAILED_CHECKS[-1]}" != "Contract drift check" ] && [ "${FAILED_CHECKS[-1]}" != "Route alignment check" ] ); then
      echo ""
      log_success "QA-B: Contract Drift Detection PASSED"
      echo ""
    fi
  else
    log_warning "Skipping QA-B: Contract Drift Detection (SKIP_CONTRACTS=1)"
  fi

  # QA-C: Core Flow Contracts
  if [ "${SKIP_TESTS:-}" != "1" ]; then
    log_section "QA-C: Core Flow Contracts"

    run_check "Backend tests" "(cd backend && ALLOW_LOCALHOST=true npm test -- --runInBand)" || true

    if [ ${#FAILED_CHECKS[@]} -eq 0 ] || [ "${FAILED_CHECKS[-1]}" != "Backend tests" ]; then
      echo ""
      log_success "QA-C: Core Flow Contracts PASSED"
      echo ""
    fi
  else
    log_warning "Skipping QA-C: Core Flow Contracts (SKIP_TESTS=1)"
  fi

  # QA-D: Infrastructure & Security
  if [ "${SKIP_INFRA:-}" != "1" ]; then
    log_section "QA-D: Infrastructure & Security"

    run_check "Terraform format check" "terraform -chdir=infrastructure fmt -recursive -check" || true
    run_check "Terraform validate" "terraform -chdir=infrastructure validate" || true
    run_check "NPM security audit" "(cd backend && npm audit --omit=dev)" || log_warning "Security vulnerabilities found (non-blocking)"

    if [ ${#FAILED_CHECKS[@]} -eq 0 ] || ( [ "${FAILED_CHECKS[-1]}" != "Terraform format check" ] && [ "${FAILED_CHECKS[-1]}" != "Terraform validate" ] ); then
      echo ""
      log_success "QA-D: Infrastructure & Security PASSED"
      echo ""
    fi
  else
    log_warning "Skipping QA-D: Infrastructure & Security (SKIP_INFRA=1)"
  fi

  # QA-E: Build Verification
  if [ "${SKIP_BUILD:-}" != "1" ]; then
    log_section "QA-E: Build Verification"

    run_check "Backend lambda builds" "(cd backend && npm run build:lambdas)" || true

    # Report on analysis tools
    echo ""
    echo "Analysis & dependency tools status:"
    echo "  - dependency-cruiser: $(command -v depcruise >/dev/null 2>&1 && echo 'installed' || echo 'NOT INSTALLED')"
    echo "  - ts-prune: $(npm list -g ts-prune >/dev/null 2>&1 && echo 'installed' || echo 'NOT INSTALLED')"
    echo "  - jscpd: $(npm list -g jscpd >/dev/null 2>&1 && echo 'installed' || echo 'NOT INSTALLED')"
    echo ""

    if [ ${#FAILED_CHECKS[@]} -eq 0 ] || [ "${FAILED_CHECKS[-1]}" != "Backend lambda builds" ]; then
      echo ""
      log_success "QA-E: Build Verification PASSED"
      echo ""
    fi
  else
    log_warning "Skipping QA-E: Build Verification (SKIP_BUILD=1)"
  fi

  # Summary
  local end_time=$(date +%s)
  local duration=$((end_time - start_time))

  echo ""
  echo "================================================"
  echo "QA Suite Summary"
  echo "================================================"
  echo "Completed: $(date)"
  echo "Duration: ${duration}s"
  echo ""

  if [ ${#FAILED_CHECKS[@]} -eq 0 ]; then
    log_success "All checks passed!"
    echo ""
    echo "Summary:"
    echo "  - All critical checks passed"
    echo "  - Optional tools status reported above"
    echo "  - Ready for deployment or further stages"
    echo ""
    exit 0
  else
    log_error "Failed checks: ${#FAILED_CHECKS[@]}"
    echo ""
    for check in "${FAILED_CHECKS[@]}"; do
      echo "  - $check"
    done
    echo ""
    echo "Review the output above for details."
    exit 1
  fi
}

# Execute main function
main "$@"

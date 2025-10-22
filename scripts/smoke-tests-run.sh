#!/usr/bin/env bash
#
# Smoke Test Runner Script
# Executes backend E2E smoke tests and mobile smoke tests (if available)
#
# Usage:
#   ./scripts/smoke-tests-run.sh
#
# Prerequisites:
#   - LocalStack running (Stage 0)
#   - API_BASE_URL set to LocalStack API Gateway endpoint
#   - ALLOW_LOCALHOST=true
#   - Lambda bundles built (backend/dist/lambdas/)
#
# Outputs:
#   - Test execution results (stdout)
#   - Playwright HTML report: backend/playwright-report/index.html
#   - Test results JSON: backend/test-results/smoke-results.json
#

set -e

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "${SCRIPT_DIR}/.." && pwd)"

echo "=========================================="
echo "PhotoEditor Smoke Tests"
echo "=========================================="
echo ""
echo "Timestamp: $(date -u +%Y-%m-%d\ %H:%M:%S) UTC"
echo "Project Root: ${PROJECT_ROOT}"
echo ""

# Verify prerequisites
echo "Checking prerequisites..."
echo ""

# 1. LocalStack health check
echo "1. LocalStack Health Check"
LOCALSTACK_ENDPOINT="${AWS_ENDPOINT_URL:-http://localhost:4566}"
if curl -fsS "${LOCALSTACK_ENDPOINT}/_localstack/health" > /dev/null 2>&1; then
  echo "   ✓ LocalStack is healthy at ${LOCALSTACK_ENDPOINT}"
else
  echo "   ✗ LocalStack is not accessible at ${LOCALSTACK_ENDPOINT}"
  echo "   Hint: Run 'make infra-up' or 'docker compose -f docker-compose.localstack.yml up -d'"
  exit 1
fi

# 2. Lambda bundles check
echo "2. Lambda Bundles"
if [ -d "${PROJECT_ROOT}/backend/dist/lambdas" ] && [ "$(ls -A ${PROJECT_ROOT}/backend/dist/lambdas 2>/dev/null)" ]; then
  echo "   ✓ Lambda bundles exist at backend/dist/lambdas/"
  ls -1 "${PROJECT_ROOT}/backend/dist/lambdas/"
else
  echo "   ✗ Lambda bundles not found"
  echo "   Hint: Run 'pnpm turbo run build:lambdas --filter=@photoeditor/backend'"
  exit 1
fi

# 3. Environment variables check
echo "3. Environment Variables"
echo "   API_BASE_URL: ${API_BASE_URL:-NOT SET}"
echo "   AWS_ENDPOINT_URL: ${AWS_ENDPOINT_URL:-NOT SET}"
echo "   ALLOW_LOCALHOST: ${ALLOW_LOCALHOST:-NOT SET}"
echo ""

if [ -z "${API_BASE_URL}" ]; then
  echo "   ✗ API_BASE_URL is not set"
  echo "   Hint: export API_BASE_URL=http://localhost:4566/restapis/<REST_API_ID>/dev/_user_request_"
  exit 1
fi

echo ""
echo "=========================================="
echo "Backend E2E Smoke Tests (Playwright)"
echo "=========================================="
echo ""

cd "${PROJECT_ROOT}"

# Run backend smoke tests (test-only, no setup/teardown)
START_TIME=$(date +%s)
if pnpm turbo run smoke:e2e:run --filter=@photoeditor/backend; then
  BACKEND_STATUS="PASS"
else
  BACKEND_STATUS="FAIL"
fi
END_TIME=$(date +%s)
BACKEND_DURATION=$((END_TIME - START_TIME))

echo ""
echo "Backend smoke tests completed in ${BACKEND_DURATION}s"
echo "Status: ${BACKEND_STATUS}"
echo ""

# Check for HTML report
if [ -f "${PROJECT_ROOT}/backend/playwright-report/index.html" ]; then
  echo "HTML Report: backend/playwright-report/index.html"
fi

# Check for test results JSON
if [ -f "${PROJECT_ROOT}/backend/test-results/smoke-results.json" ]; then
  echo "JSON Results: backend/test-results/smoke-results.json"
fi

# Check for JUnit XML
if [ -f "${PROJECT_ROOT}/backend/test-results/smoke-junit.xml" ]; then
  echo "JUnit XML: backend/test-results/smoke-junit.xml"
fi

echo ""
echo "=========================================="
echo "Mobile Smoke Tests (Detox)"
echo "=========================================="
echo ""

# Check for iOS simulator
if command -v xcrun &> /dev/null && xcrun simctl list devices | grep -q "iPhone.*Booted"; then
  echo "iOS Simulator detected (booted)"
  echo "Running iOS smoke tests..."

  START_TIME=$(date +%s)
  if pnpm turbo run detox:smoke --filter=photoeditor-mobile; then
    MOBILE_STATUS="PASS"
  else
    MOBILE_STATUS="FAIL"
  fi
  END_TIME=$(date +%s)
  MOBILE_DURATION=$((END_TIME - START_TIME))

  echo ""
  echo "Mobile smoke tests completed in ${MOBILE_DURATION}s"
  echo "Status: ${MOBILE_STATUS}"
else
  echo "No iOS simulator detected (or not booted)"
  echo "Status: SKIPPED"
  MOBILE_STATUS="SKIPPED"
  MOBILE_DURATION=0

  # Check for Android emulator
  if command -v adb &> /dev/null && adb devices | grep -q "emulator"; then
    echo ""
    echo "Android emulator detected"
    echo "Running Android smoke tests..."

    START_TIME=$(date +%s)
    if pnpm turbo run detox:test:android --filter=photoeditor-mobile -- e2e/smoke.e2e.ts; then
      MOBILE_STATUS="PASS"
    else
      MOBILE_STATUS="FAIL"
    fi
    END_TIME=$(date +%s)
    MOBILE_DURATION=$((END_TIME - START_TIME))

    echo ""
    echo "Mobile smoke tests completed in ${MOBILE_DURATION}s"
    echo "Status: ${MOBILE_STATUS}"
  else
    echo "No Android emulator detected"
  fi
fi

echo ""
echo "=========================================="
echo "Summary"
echo "=========================================="
echo ""
echo "Backend E2E:  ${BACKEND_STATUS} (${BACKEND_DURATION}s)"
echo "Mobile Smoke: ${MOBILE_STATUS} (${MOBILE_DURATION}s)"
echo ""

TOTAL_DURATION=$((BACKEND_DURATION + MOBILE_DURATION))
echo "Total Execution Time: ${TOTAL_DURATION}s"
echo ""

if [ "${BACKEND_STATUS}" = "PASS" ] && [ "${MOBILE_STATUS}" != "FAIL" ]; then
  echo "Overall Status: PASS"
  echo ""
  echo "Report: docs/tests/reports/2025-10-21-smoke-tests.md"
  exit 0
else
  echo "Overall Status: FAIL"
  echo ""
  echo "Review artifacts:"
  echo "  - backend/playwright-report/index.html"
  echo "  - backend/test-results/"
  echo "  - mobile/artifacts/ (if mobile tests ran)"
  echo ""
  echo "Report: docs/tests/reports/2025-10-21-smoke-tests.md"
  exit 1
fi

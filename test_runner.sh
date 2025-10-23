#!/bin/bash
set -e

cd /home/jeffreymoya/dev/photoeditor

echo "=========================================="
echo "Running Backend Unit Tests"
echo "=========================================="
echo ""

# Run tests with coverage
pnpm turbo run test --filter=@photoeditor/backend 2>&1 | tee /tmp/test_run.log

echo ""
echo "=========================================="
echo "Test Execution Complete"
echo "=========================================="

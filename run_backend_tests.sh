#!/bin/bash
set -e

cd /home/jeffreymoya/dev/photoeditor

echo "Running backend unit tests..."
echo "=========================================="

# Run the tests and capture output
pnpm turbo run test --filter=@photoeditor/backend 2>&1 | tee /tmp/test_output.txt

echo "=========================================="
echo "Test execution completed"

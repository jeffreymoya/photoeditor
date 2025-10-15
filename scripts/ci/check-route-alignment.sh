#!/usr/bin/env bash
#
# Route Alignment Check
#
# Purpose: Validates that routes defined in the routes manifest
# (shared/routes.manifest.ts) are correctly configured in Terraform
# and that the OpenAPI spec includes all routes.
#
# This enforces contract-first routing per TASK-0602 and ADR-0003.
#
# Exit codes:
#   0 - All routes aligned
#   1 - Route misalignment detected
#   2 - Error running check

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

echo "Route Alignment Check"
echo "====================="
echo ""

# Check prerequisites
if [ ! -f "$PROJECT_ROOT/docs/openapi/openapi-generated.yaml" ]; then
  echo "ERROR: OpenAPI spec not found. Run 'npm run contracts:generate --prefix shared' first."
  exit 2
fi

if [ ! -f "$PROJECT_ROOT/shared/dist/routes.manifest.js" ]; then
  echo "ERROR: Routes manifest not built. Run 'npm run build --prefix shared' first."
  exit 2
fi

# Extract routes from routes manifest using Node
echo "Extracting routes from manifest..."
MANIFEST_ROUTES=$(node -e "
const routes = require('$PROJECT_ROOT/shared/dist/routes.manifest.js').API_ROUTES;
routes.forEach(r => {
  console.log(\`\${r.method} \${r.path} -> \${r.handler}\`);
});
")

echo "Routes from manifest:"
echo "$MANIFEST_ROUTES"
echo ""

# Extract paths from OpenAPI spec using grep
echo "Checking OpenAPI spec coverage..."
OPENAPI_PATHS=$(grep -E "^  /[^:]+:" "$PROJECT_ROOT/docs/openapi/openapi-generated.yaml" | sed 's/://g' | sed 's/^  //g' | sort)

echo "Paths in OpenAPI:"
echo "$OPENAPI_PATHS"
echo ""

# Count routes and paths
ROUTE_COUNT=$(echo "$MANIFEST_ROUTES" | wc -l | tr -d ' ')
PATH_COUNT=$(echo "$OPENAPI_PATHS" | wc -l | tr -d ' ')

echo "Summary:"
echo "  Routes in manifest: $ROUTE_COUNT"
echo "  Paths in OpenAPI:   $PATH_COUNT"
echo ""

# Verify each route from manifest appears in OpenAPI
MISSING_ROUTES=""
while IFS= read -r route_line; do
  # Extract path from route line (second field)
  ROUTE_PATH=$(echo "$route_line" | awk '{print $2}')

  # Check if path exists in OpenAPI
  if ! echo "$OPENAPI_PATHS" | grep -q "^${ROUTE_PATH}\$"; then
    MISSING_ROUTES="${MISSING_ROUTES}${route_line}\n"
  fi
done <<< "$MANIFEST_ROUTES"

if [ -n "$MISSING_ROUTES" ]; then
  echo "FAILURE: Routes missing from OpenAPI spec:"
  echo -e "$MISSING_ROUTES"
  echo ""
  echo "Action required:"
  echo "  - Verify routes.manifest.ts includes all routes"
  echo "  - Regenerate OpenAPI spec: npm run contracts:generate --prefix shared"
  echo "  - Check for errors in tooling/contracts/generate.js"
  echo ""
  exit 1
fi

echo "SUCCESS: All routes from manifest are present in OpenAPI spec."
echo ""

# Optional: Check Terraform alignment (informational only, not enforced)
echo "Terraform Route Check (Informational):"
if [ -f "$PROJECT_ROOT/infrastructure/modules/api-gateway/main.tf" ]; then
  echo "Checking v1 routes in API Gateway module..."
  TF_ROUTES=$(grep -E 'route_key.*=.*"(GET|POST|PUT|DELETE|PATCH)' "$PROJECT_ROOT/infrastructure/modules/api-gateway/main.tf" || true)

  if [ -n "$TF_ROUTES" ]; then
    echo "$TF_ROUTES"
  else
    echo "  No explicit routes found in api-gateway module"
  fi
  echo ""

  echo "NOTE: Terraform routes should be updated to match routes.manifest.ts"
  echo "      This check is informational only - manual review required."
else
  echo "  API Gateway Terraform not found - skipping"
fi
echo ""

echo "SUCCESS: Route alignment check passed."
exit 0

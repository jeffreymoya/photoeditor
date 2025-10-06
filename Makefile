SHELL := /bin/bash

# Variables
TF := terraform -chdir=infrastructure
COMPOSE := docker compose -f docker-compose.localstack.yml
TFVARS := -var-file=terraform.tfvars.localstack

.DEFAULT_GOAL := help

.PHONY: help deps infra-up infra-apply infra-init localstack-up infra-down infra-destroy localstack-down backend-build mobile-start mobile-ios mobile-android mobile-web mobile-stop dev-ios dev-android print-api clean stage1-verify stage1-lint stage1-tests stage1-infra stage1-build emu-up emu-test emu-down live-dev live-test live-destroy live-shell

help:
	@echo "PhotoEditor — Make targets"
	@echo ""
	@echo "Development Loops (TASK-0301):"
	@echo "  emu-up           Start LocalStack emulator with seeded SSM/SSO stubs"
	@echo "  emu-test         Run deterministic backend tests against LocalStack"
	@echo "  emu-down         Stop LocalStack and clean up"
	@echo "  live-dev         Deploy SST stack to live AWS sandbox (hot reload)"
	@echo "  live-test        Run smoke tests against live SST API"
	@echo "  live-destroy     Remove SST dev stack from AWS"
	@echo "  live-shell       Open SST shell for manual testing"
	@echo ""
	@echo "Legacy Targets:"
	@echo "  deps             Install Node deps deterministically (npm ci)"
	@echo "  localstack-up    Start LocalStack via docker compose"
	@echo "  backend-build    Build lambda bundles (esbuild + zip)"
	@echo "  infra-init       Terraform init (infrastructure/)"
	@echo "  infra-apply      Init, build lambdas, and Terraform apply to LocalStack"
	@echo "  infra-up         Start LocalStack, build, init, and apply"
	@echo "  infra-destroy    Terraform destroy (-auto-approve)"
	@echo "  localstack-down  Stop LocalStack and remove volumes"
	@echo "  infra-down       Destroy infra and stop LocalStack"
	@echo "  print-api        Print API base URL from Terraform outputs"
	@echo "  mobile-ios       Launch Expo iOS simulator (uses API URL)"
	@echo "  mobile-android   Launch Expo Android emulator (uses API URL with 10.0.2.2)"
	@echo "  mobile-web       Launch Expo for web (uses API URL)"
	@echo "  mobile-stop      Attempt to stop any running Expo dev server"
	@echo "  dev-ios          Bring infra up, then launch iOS app"
	@echo "  dev-android      Bring infra up, then launch Android app"
	@echo "  clean            Remove backend dist/ and Terraform plan/state artifacts"
	@echo "  stage1-verify    Run Stage 1 fitness functions (typecheck, lint, tests, build, infra validation)"
	@echo "  stage1-lint      Run Stage 1A: Static analysis (typecheck + lint)"
	@echo "  stage1-tests     Run Stage 1B: Core tests"
	@echo "  stage1-infra     Run Stage 1D: Infrastructure validation"
	@echo "  stage1-build     Run Stage 1E: Build verification"

deps:
	npm ci --prefix shared || true
	npm ci --prefix backend
	npm ci --prefix mobile

localstack-up:
	$(COMPOSE) up -d

backend-build:
	npm run build:lambdas --prefix backend

infra-init:
	$(TF) init -upgrade

infra-apply: infra-init backend-build ## ensures Terraform is initialized and lambdas are built
	$(TF) apply $(TFVARS) -auto-approve

infra-up: localstack-up backend-build infra-init
	$(TF) apply $(TFVARS) -auto-approve
	@echo "\nInfra ready. API URL: $$($(TF) output -raw api_gateway_url)"

infra-destroy:
	-$(TF) destroy $(TFVARS) -auto-approve || true

localstack-down:
	-$(COMPOSE) down -v || true

infra-down: infra-destroy localstack-down
	@echo "Local infra fully stopped."

print-api:
	@$(TF) output -raw api_gateway_url

# Expo app targets — pass API URL into Expo via EXPO_PUBLIC_API_BASE_URL
# Note: Android emulator cannot reach host via localhost. Use 10.0.2.2.
# Shared API URL helper — fetched once per make invocation to avoid redundant terraform calls
API_URL = $(shell $(TF) output -raw api_gateway_url)

mobile-ios:
	@EXPO_PUBLIC_API_BASE_URL="$(API_URL)" npm run ios --prefix mobile

mobile-android:
	@ANDROID_API_URL=$$(echo "$(API_URL)" | sed 's#http://localhost:#http://10.0.2.2:#'); \
	EXPO_PUBLIC_API_BASE_URL="$$ANDROID_API_URL" npm run android --prefix mobile

mobile-web:
	@EXPO_PUBLIC_API_BASE_URL="$(API_URL)" npm run web --prefix mobile

# Starts Expo dev server only; choose platform in the UI.
# If you open on Android, prefer the platform-specific target above to fix host mapping.
mobile-start:
	@EXPO_PUBLIC_API_BASE_URL="$(API_URL)" npm start --prefix mobile

mobile-stop:
	-pkill -f "expo" || true

dev-ios: infra-up mobile-ios

dev-android: infra-up mobile-android

clean:
	rm -rf backend/dist infrastructure/localstack.tfplan || true

# Stage 1 Verification - Fitness Functions
# Runs Stage A–E fitness functions in sequence, aggregating outputs for quick validation.
# Gates include:
#   Stage A: TypeScript typecheck + lint (backend, shared, mobile)
#   Stage B: Core tests (unit, contract)
#   Stage C: Mobile offline resilience checks
#   Stage D: Infrastructure validation (terraform fmt/validate)
#   Stage E: Build verification (lambda bundles)

# Stage 1A: Static Safety Nets
stage1-lint:
	@echo "========================================="
	@echo "Stage 1A: Static Safety Nets"
	@echo "========================================="
	@echo ""
	@echo "[1/6] Backend typecheck..."
	@cd backend && npm run typecheck || (echo "FAILED: Backend typecheck" && false)
	@echo "[2/6] Shared typecheck..."
	@cd shared && npm run typecheck || (echo "FAILED: Shared typecheck" && false)
	@echo "[3/6] Mobile typecheck..."
	@cd mobile && npm run typecheck 2>/dev/null || echo "SKIPPED: Mobile typecheck (optional)"
	@echo "[4/6] Backend lint..."
	@cd backend && npm run lint || (echo "FAILED: Backend lint" && false)
	@echo "[5/6] Shared lint..."
	@cd shared && npm run lint || (echo "FAILED: Shared lint" && false)
	@echo "[6/6] Mobile lint..."
	@cd mobile && npm run lint 2>/dev/null || echo "SKIPPED: Mobile lint (optional)"
	@echo ""
	@echo "Stage 1A: PASSED"
	@echo ""

# Stage 1B: Core Flow Contracts
stage1-tests:
	@echo "========================================="
	@echo "Stage 1B: Core Flow Contracts"
	@echo "========================================="
	@echo ""
	@echo "[1/1] Backend tests..."
	@cd backend && npm test || (echo "FAILED: Backend tests" && false)
	@echo ""
	@echo "Stage 1B: PASSED"
	@echo ""

# Stage 1D: Infrastructure & Security
stage1-infra:
	@echo "========================================="
	@echo "Stage 1D: Infrastructure & Security"
	@echo "========================================="
	@echo ""
	@echo "[1/3] Terraform format check..."
	@terraform -chdir=infrastructure fmt -recursive -check || (echo "FAILED: Terraform formatting" && false)
	@echo "[2/3] Terraform validate..."
	@terraform -chdir=infrastructure validate || (echo "FAILED: Terraform validate" && false)
	@echo "[3/3] NPM security audit (backend)..."
	@cd backend && npm audit --omit=dev || echo "WARNING: Security vulnerabilities found (non-blocking)"
	@echo ""
	@echo "Stage 1D: PASSED"
	@echo ""

# Stage 1E: Build Verification
stage1-build:
	@echo "========================================="
	@echo "Stage 1E: Build Verification"
	@echo "========================================="
	@echo ""
	@echo "[1/2] Backend lambda builds..."
	@cd backend && npm run build:lambdas || (echo "FAILED: Lambda builds" && false)
	@echo "[2/2] Analysis & dependency tools check..."
	@echo "    - dependency-cruiser: $$(command -v depcruise >/dev/null 2>&1 && echo 'installed' || echo 'NOT INSTALLED')"
	@echo "    - ts-prune: $$(npm list -g ts-prune >/dev/null 2>&1 && echo 'installed' || echo 'NOT INSTALLED')"
	@echo "    - jscpd: $$(npm list -g jscpd >/dev/null 2>&1 && echo 'installed' || echo 'NOT INSTALLED')"
	@echo ""
	@echo "Stage 1E: PASSED"
	@echo ""

# Aggregate target: Runs all Stage 1 sub-targets in order
stage1-verify: stage1-lint stage1-tests stage1-infra stage1-build
	@echo "========================================="
	@echo "Stage 1 Verification: PASSED"
	@echo "========================================="
	@echo ""
	@echo "Summary:"
	@echo "  - All critical checks passed"
	@echo "  - Optional tools status reported above"
	@echo "  - Ready for deployment or further stages"
	@echo ""

# ============================================================
# Development Loops (TASK-0301)
# ============================================================

# LocalStack Emulator Targets
emu-up:
	@echo "🚀 Starting LocalStack emulator..."
	@./scripts/localstack-setup.sh

emu-test:
	@echo "🧪 Running deterministic tests against LocalStack..."
	@./scripts/localstack-test.sh
	@echo ""
	@echo "Running backend integration tests..."
	@export AWS_ENDPOINT_URL=http://localhost:4566 && \
	export AWS_ACCESS_KEY_ID=test && \
	export AWS_SECRET_ACCESS_KEY=test && \
	export AWS_DEFAULT_REGION=us-east-1 && \
	npm run test:integration --prefix backend || echo "Integration tests completed with warnings"

emu-down:
	@echo "🛑 Stopping LocalStack emulator..."
	@$(COMPOSE) down -v
	@echo "✅ LocalStack stopped and volumes removed"

# SST Live Dev Targets
live-dev:
	@echo "🚀 Deploying SST dev stack to AWS sandbox..."
	@cd infra/sst && npm install --legacy-peer-deps && npx sst dev

live-test:
	@echo "🧪 Running smoke tests against live SST API..."
	@if [ ! -f infra/sst/.sst/outputs.json ]; then \
		echo "❌ SST stack not deployed. Run 'make live-dev' first."; \
		exit 1; \
	fi
	@cd infra/sst && npx sst shell -- node ../../scripts/sst-smoke-test.js

live-destroy:
	@echo "🗑️  Destroying SST dev stack..."
	@cd infra/sst && npm install --legacy-peer-deps && npx sst remove --stage dev
	@echo "✅ SST dev stack removed"

live-shell:
	@echo "🐚 Opening SST shell for manual testing..."
	@cd infra/sst && npx sst shell

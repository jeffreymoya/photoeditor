SHELL := /bin/bash

# Variables
TF := terraform -chdir=infrastructure
COMPOSE := docker compose -f docker-compose.localstack.yml
TFVARS := -var-file=terraform.tfvars.localstack

.DEFAULT_GOAL := help

.PHONY: help services-status deps infra-up infra-apply infra-init localstack-up infra-down infra-destroy localstack-down backend-build mobile-start mobile-ios mobile-android mobile-web mobile-stop dev-ios dev-android print-api clean qa-suite qa-lint qa-tests qa-infra qa-build live-dev live-test live-destroy live-shell

help:
	@echo "PhotoEditor — Make targets"
	@echo ""
	@echo "Development Loops:"
	@echo "  live-dev         Deploy SST stack to live AWS sandbox (hot reload)"
	@echo "  live-test        Run smoke tests against live SST API"
	@echo "  live-destroy     Remove SST dev stack from AWS"
	@echo "  live-shell       Open SST shell for manual testing"
	@echo ""
	@echo "Diagnostics:"
	@echo "  services-status  Summarize Docker/Expo service status and health checks"
	@echo ""
	@echo "Legacy Targets:"
	@echo "  deps             Install Node deps deterministically (pnpm install --frozen-lockfile)"
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
	@echo ""
	@echo "QA Suite (Fitness Functions):"
	@echo "  qa-suite         Run all QA fitness functions (static analysis, tests, infra, build)"
	@echo "  qa-lint          Run QA-A: Static analysis (typecheck + lint)"
	@echo "  qa-tests         Run QA-B/C: Contract drift + Core tests"
	@echo "  qa-infra         Run QA-D: Infrastructure validation"
	@echo "  qa-build         Run QA-E: Build verification"
	@echo ""

deps:
	pnpm install --frozen-lockfile

localstack-up:
	$(COMPOSE) up -d

backend-build:
	pnpm turbo run build:lambdas --filter=@photoeditor/backend

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

print-api:
	@$(TF) output -raw api_gateway_url

infra-down: infra-destroy localstack-down
	@echo "Local infra fully stopped."

services-status:
	@echo "========================================="
	@echo "Local Service Status"
	@echo "========================================="
	@echo ""
	@echo "[1/3] Docker Compose services (docker-compose.localstack.yml)"
	@$(COMPOSE) ps --format json | python3 scripts/diagnostics/services_status.py
	@echo ""
	@echo "[2/3] LocalStack health endpoint"
	@if command -v curl >/dev/null 2>&1; then \
		if curl -fsSL --max-time 2 -o /tmp/localstack-health.json http://localhost:4566/_localstack/health 2>/dev/null; then \
			printf "  - healthy (response saved to /tmp/localstack-health.json)\n"; \
		else \
			rm -f /tmp/localstack-health.json; \
			echo "  - unreachable (start LocalStack with 'make localstack-up')"; \
		fi; \
	else \
		echo "  - skipped (curl not available)"; \
	fi
	@echo ""
	@echo "[3/3] Dev servers on common ports"
	@if command -v lsof >/dev/null 2>&1; then \
		EXPO=$$(lsof -i :8081 -sTCP:LISTEN -t 2>/dev/null | paste -sd, -); \
		if [ -n "$$EXPO" ]; then \
			echo "  - Expo (port 8081): running (PID(s): $$EXPO)"; \
		else \
			echo "  - Expo (port 8081): not running"; \
		fi; \
		LOCALSTACK=$$(lsof -i :4566 -sTCP:LISTEN -t 2>/dev/null | paste -sd, -); \
		if [ -n "$$LOCALSTACK" ]; then \
			echo "  - LocalStack (port 4566): listening (PID(s): $$LOCALSTACK)"; \
		else \
			echo "  - LocalStack (port 4566): not listening"; \
		fi; \
	else \
		echo "  - skipped (lsof not available)"; \
	fi

# Expo app targets — pass API URL into Expo via EXPO_PUBLIC_API_BASE_URL
# Note: Android emulator cannot reach host via localhost. Use 10.0.2.2.
# Shared API URL helper — fetched once per make invocation to avoid redundant terraform calls
API_URL = $(shell $(TF) output -raw api_gateway_url)

mobile-ios:
	@EXPO_PUBLIC_API_BASE_URL="$(API_URL)" pnpm turbo run ios --filter=photoeditor-mobile

mobile-android:
	@ANDROID_API_URL=$$(echo "$(API_URL)" | sed 's#http://localhost:#http://10.0.2.2:#'); \
	EXPO_PUBLIC_API_BASE_URL="$$ANDROID_API_URL" pnpm turbo run android --filter=photoeditor-mobile

mobile-web:
	@EXPO_PUBLIC_API_BASE_URL="$(API_URL)" pnpm turbo run web --filter=photoeditor-mobile

# Starts Expo dev server only; choose platform in the UI.
# If you open on Android, prefer the platform-specific target above to fix host mapping.
mobile-start:
	@EXPO_PUBLIC_API_BASE_URL="$(API_URL)" pnpm turbo run start --filter=photoeditor-mobile

mobile-stop:
	-pkill -f "expo" || true

dev-ios: infra-up mobile-ios

dev-android: infra-up mobile-android

clean:
	rm -rf backend/dist infrastructure/localstack.tfplan || true

# ============================================================
# QA Suite - Centralized Fitness Functions
# ============================================================
# Runs QA-A through QA-E fitness functions using Turborepo pipelines.
# This ensures developers, Husky hooks, and CI execute identical checks.
# Gates include:
#   QA-A: Static Safety Nets (typecheck + lint)
#   QA-B: Contract Drift Detection
#   QA-C: Core Flow Contracts (unit, contract tests)
#   QA-D: Infrastructure & Security (terraform fmt/validate)
#   QA-E: Build Verification (lambda bundles)
#
# See: turbo.json for pipeline definitions

# QA Suite - Run all fitness functions via Turborepo
qa-suite:
	@pnpm turbo run qa --parallel

# QA-A: Static Safety Nets
qa-lint:
	@pnpm turbo run qa:static --parallel

# QA-B/C: Contract Drift + Core Flow Contracts
qa-tests:
	@pnpm turbo run contracts:check test --parallel

# QA-D: Infrastructure & Security
qa-infra:
	@echo "========================================="
	@echo "QA-D: Infrastructure & Security"
	@echo "========================================="
	@echo ""
	@echo "[1/3] Terraform format check..."
	@terraform -chdir=infrastructure fmt -recursive -check || (echo "FAILED: Terraform formatting" && false)
	@echo "[2/3] Terraform validate..."
	@terraform -chdir=infrastructure validate || (echo "FAILED: Terraform validate" && false)
	@echo "[3/3] PNPM security audit..."
	@pnpm audit || echo "WARNING: Security vulnerabilities found (non-blocking)"
	@echo ""
	@echo "QA-D: PASSED"
	@echo ""

# QA-E: Build Verification
qa-build:
	@pnpm turbo run build:lambdas --filter=@photoeditor/backend

# Legacy aliases for backward compatibility (deprecated)
# ============================================================
# Development Loops (TASK-0301)
# ============================================================

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

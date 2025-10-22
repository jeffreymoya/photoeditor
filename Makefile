SHELL := /bin/bash

.DEFAULT_GOAL := help

.PHONY: help deps backend-build mobile-start mobile-ios mobile-android mobile-web mobile-stop clean qa-suite qa-lint qa-tests qa-build live-dev live-test live-destroy live-shell

help:
	@echo "PhotoEditor — Make targets"
	@echo ""
	@echo "Core Workflows:"
	@echo "  deps             Install Node deps deterministically (pnpm install --frozen-lockfile)"
	@echo "  backend-build    Build lambda bundles (esbuild + zip)"
	@echo "  qa-suite         Run all QA fitness functions"
	@echo "  qa-lint          Run static analysis (typecheck + lint)"
	@echo "  qa-tests         Run contract and unit tests"
	@echo "  qa-build         Build verification"
	@echo ""
	@echo "Mobile Shortcuts:"
	@echo "  mobile-start     Launch Expo dev server"
	@echo "  mobile-ios       Launch Expo iOS simulator"
	@echo "  mobile-android   Launch Expo Android emulator"
	@echo "  mobile-web       Launch Expo for web"
	@echo "  mobile-stop      Attempt to stop any running Expo dev server"
	@echo ""
	@echo "SST Live Dev:"
	@echo "  live-dev         Deploy SST stack to AWS sandbox (hot reload)"
	@echo "  live-test        Run smoke checks against live SST API"
	@echo "  live-destroy     Remove SST dev stack from AWS"
	@echo "  live-shell       Open SST shell for manual testing"
	@echo ""

# Dependency management

deps:
	pnpm install --frozen-lockfile

# Backend build

backend-build:
	pnpm turbo run build:lambdas --filter=@photoeditor/backend

# Mobile shortcuts

mobile-start:
	pnpm turbo run start --filter=photoeditor-mobile

mobile-ios:
	pnpm turbo run ios --filter=photoeditor-mobile

mobile-android:
	pnpm turbo run android --filter=photoeditor-mobile

mobile-web:
	pnpm turbo run web --filter=photoeditor-mobile

mobile-stop:
	-pkill -f "expo" || true

# Housekeeping

clean:
	rm -rf backend/dist || true

# QA Suite - Centralized Fitness Functions

qa-suite:
	@pnpm turbo run qa --parallel

qa-lint:
	@pnpm turbo run qa:static --parallel

qa-tests:
	@pnpm turbo run contracts:check test --parallel

qa-build:
	@pnpm turbo run build:lambdas --filter=@photoeditor/backend

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

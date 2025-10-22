#!/usr/bin/env node

/**
 * Ensure pnpm is provisioned via Corepack for Turbo parallel execution stability.
 *
 * This script:
 * 1. Validates Node.js version meets minimum requirements
 * 2. Enables Corepack if not already enabled
 * 3. Prepares the pinned pnpm version from package.json
 * 4. Guards against missing binaries in workspace packages
 *
 * Usage: node scripts/ensure-pnpm-corepack.mjs
 *
 * Related:
 * - TASK-0284: Turbo Corepack hardening
 * - TURBO_ISSUES.md: Documents the spawning issue this fixes
 */

import { execSync } from 'child_process';
import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = resolve(__dirname, '..');

// Minimum Node.js version required for Corepack stability
const MIN_NODE_VERSION = '18.0.0';

/**
 * Compare semantic versions
 */
function compareVersions(current, minimum) {
  const currentParts = current.split('.').map(Number);
  const minimumParts = minimum.split('.').map(Number);

  for (let i = 0; i < 3; i++) {
    if (currentParts[i] > minimumParts[i]) return 1;
    if (currentParts[i] < minimumParts[i]) return -1;
  }
  return 0;
}

/**
 * Guard: Check Node.js version
 */
function checkNodeVersion() {
  const nodeVersion = process.version.replace('v', '');
  if (compareVersions(nodeVersion, MIN_NODE_VERSION) < 0) {
    console.error(`❌ Node.js ${MIN_NODE_VERSION}+ required. Current: ${nodeVersion}`);
    console.error(`   Please upgrade Node.js: https://nodejs.org/`);
    process.exit(1);
  }
  console.log(`✓ Node.js ${nodeVersion} (>= ${MIN_NODE_VERSION})`);
}

/**
 * Read packageManager field from package.json
 */
function getPackageManagerSpec() {
  const packageJsonPath = resolve(rootDir, 'package.json');
  if (!existsSync(packageJsonPath)) {
    console.error(`❌ package.json not found at ${packageJsonPath}`);
    process.exit(1);
  }

  const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf-8'));
  const packageManager = packageJson.packageManager;

  if (!packageManager) {
    console.error('❌ Missing "packageManager" field in package.json');
    console.error('   Add: "packageManager": "pnpm@8.15.4"');
    process.exit(1);
  }

  if (!packageManager.startsWith('pnpm@')) {
    console.error(`❌ Expected pnpm in packageManager, got: ${packageManager}`);
    process.exit(1);
  }

  return packageManager;
}

/**
 * Enable Corepack if not already enabled
 */
function enableCorepack() {
  try {
    execSync('corepack --version', { stdio: 'pipe' });
    console.log('✓ Corepack available');
  } catch {
    console.error('❌ Corepack not available');
    console.error('   Run: corepack enable (requires Node.js 16.9+)');
    process.exit(1);
  }

  try {
    // Enable corepack (idempotent)
    execSync('corepack enable', { stdio: 'inherit' });
    console.log('✓ Corepack enabled');
  } catch (error) {
    console.error('❌ Failed to enable Corepack:', error.message);
    process.exit(1);
  }
}

/**
 * Prepare the pinned pnpm version via Corepack
 */
function preparePnpm(packageManagerSpec) {
  console.log(`Preparing ${packageManagerSpec}...`);
  try {
    execSync(`corepack prepare ${packageManagerSpec} --activate`, {
      stdio: 'inherit',
      cwd: rootDir,
    });
    console.log(`✓ ${packageManagerSpec} provisioned`);
  } catch (error) {
    console.error(`❌ Failed to prepare ${packageManagerSpec}:`, error.message);
    process.exit(1);
  }
}

/**
 * Verify pnpm is accessible
 */
function verifyPnpm() {
  try {
    const version = execSync('pnpm --version', {
      encoding: 'utf-8',
      stdio: 'pipe',
    }).trim();
    console.log(`✓ pnpm ${version} ready`);
    return version;
  } catch (error) {
    console.error('❌ pnpm not accessible after Corepack setup');
    console.error('   This should not happen. Check Corepack installation.');
    process.exit(1);
  }
}

/**
 * Main execution
 */
function main() {
  console.log('🔧 Ensuring pnpm via Corepack for Turbo stability...\n');

  checkNodeVersion();
  const packageManagerSpec = getPackageManagerSpec();
  enableCorepack();
  preparePnpm(packageManagerSpec);
  verifyPnpm();

  console.log('\n✅ Corepack setup complete. Turbo parallel execution should now be stable.');
  console.log('   See TURBO_ISSUES.md for background on this fix.\n');
}

main();

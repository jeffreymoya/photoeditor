#!/usr/bin/env node

/**
 * @file Storybook Parser Override Audit CLI
 * @description Detects and reports Babel parser override conflicts in Storybook builds
 * @see docs/proposals/storybook-parser-override-arbitration.md Section 4.2
 * @see docs/pending/storybook-parser-audit.md
 */

import { spawn } from 'child_process';
import { writeFileSync, existsSync } from 'fs';
import { resolve, dirname, join } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * @typedef {Object} ParserOverridePlugin
 * @property {string} name - Plugin name
 * @property {string | null} package - Originating package (if available)
 * @property {boolean} hasParserOverride - Whether plugin declares parserOverride
 */

/**
 * @typedef {Object} ParserOverrideReport
 * @property {string} timestamp - ISO 8601 timestamp
 * @property {string} targetFile - Absolute path to audited file
 * @property {Record<string, string | undefined>} environment - Environment variables
 * @property {ParserOverridePlugin[]} plugins - Detected plugins
 * @property {number} overrideCount - Total plugins with parserOverride
 * @property {boolean} violationDetected - true if overrideCount > 1
 * @property {number} exitCode - 0 = pass, 1 = fail, 2 = error
 */

/**
 * @typedef {Object} CliOptions
 * @property {string} file - Target file for Babel config resolution
 * @property {string} output - Output directory for report JSON
 * @property {boolean} failOnViolations - Exit with code 1 when >1 override detected
 * @property {Record<string, string>} env - Additional environment variables
 */

/**
 * Parse command line arguments
 * @returns {CliOptions}
 */
function parseArgs() {
  const args = process.argv.slice(2);
  /** @type {CliOptions} */
  const options = {
    file: '',
    output: 'mobile/storybook/.cache',
    failOnViolations: false,
    env: {},
  };

  for (let i = 0; i < args.length; i++) {
    const arg = args[i];

    if (arg === '--help' || arg === '-h') {
      printHelp();
      process.exit(0);
    }

    if (arg === '--file' && i + 1 < args.length) {
      options.file = args[++i];
    } else if (arg === '--output' && i + 1 < args.length) {
      options.output = args[++i];
    } else if (arg === '--fail-on-violations') {
      options.failOnViolations = true;
    } else if (arg === '--env' && i + 1 < args.length) {
      const envPair = args[++i];
      const [key, value] = envPair.split('=');
      if (key && value !== undefined) {
        options.env[key] = value;
      }
    }
  }

  if (!options.file) {
    console.error('Error: --file argument is required');
    printHelp();
    process.exit(2);
  }

  return options;
}

/**
 * Print help message
 */
function printHelp() {
  console.log(`
Storybook Parser Override Audit CLI

Usage: node audit-parser-overrides.mjs [options]

Options:
  --file <path>              Target file for Babel config resolution (required)
  --output <dir>             Output directory for report JSON (default: mobile/storybook/.cache)
  --fail-on-violations       Exit with code 1 when >1 override detected
  --env <KEY=VALUE>          Additional environment variables (repeatable)
  --help, -h                 Display this help message

Exit Codes:
  0 - Success (≤1 parser override detected)
  1 - Violation (>1 parser override detected with --fail-on-violations)
  2 - Error (execution failed)

Examples:
  # Basic audit
  node audit-parser-overrides.mjs --file mobile/src/App.tsx

  # Audit with Storybook build env
  node audit-parser-overrides.mjs --file src/App.tsx --env STORYBOOK_BUILD=1 --fail-on-violations

  # Custom output directory
  node audit-parser-overrides.mjs --file src/App.tsx --output .cache
`);
}

/**
 * Load Babel config using @babel/core loadPartialConfig
 * @param {string} filePath - Absolute path to target file
 * @param {Record<string, string>} env - Environment variables
 * @returns {Promise<any>} Babel config JSON
 */
async function getBabelConfig(filePath, env) {
  // Set environment variables
  const originalEnv = { ...process.env };
  Object.assign(process.env, env);

  try {
    // Dynamically require @babel/core from the current working directory
    const { createRequire } = await import('module');
    const require = createRequire(import.meta.url);

    // Resolve @babel/core from cwd (mobile directory)
    const babelCorePath = require.resolve('@babel/core', { paths: [process.cwd()] });
    const babelCore = await import(babelCorePath);

    // Load partial config for the file
    const config = babelCore.loadPartialConfig({
      filename: filePath,
      cwd: process.cwd(),
    });

    if (!config) {
      throw new Error('Babel config not found');
    }

    // Return config in format matching --show-config output
    return {
      config: {
        plugins: config.options.plugins || [],
        presets: config.options.presets || [],
      },
    };
  } catch (err) {
    throw new Error(`Failed to load Babel config: ${err.message}`);
  } finally {
    // Restore original environment
    process.env = originalEnv;
  }
}

/**
 * Extract plugin metadata and detect parser overrides
 * @param {any} babelConfig - Babel config JSON from --show-config
 * @returns {ParserOverridePlugin[]}
 */
function extractPluginMetadata(babelConfig) {
  if (!babelConfig || !babelConfig.config || !Array.isArray(babelConfig.config.plugins)) {
    return [];
  }

  const plugins = babelConfig.config.plugins;
  /** @type {ParserOverridePlugin[]} */
  const metadata = [];

  for (const plugin of plugins) {
    // Plugin format: [pluginFunction, options] or pluginFunction
    const pluginData = Array.isArray(plugin) ? plugin[0] : plugin;
    const pluginOptions = Array.isArray(plugin) ? plugin[1] : undefined;

    // Try to extract plugin name and package
    let name = 'unknown';
    let pkg = null;
    let hasParserOverride = false;

    // Check if plugin has name property
    if (pluginData && typeof pluginData === 'object') {
      if (pluginData.name) {
        name = pluginData.name;
      }
      if (pluginData.key) {
        name = pluginData.key;
      }

      // Check for parserOverride in plugin definition
      if (pluginData.parserOverride !== undefined) {
        hasParserOverride = true;
      }
    }

    // Check options for parserOverride
    if (pluginOptions && typeof pluginOptions === 'object' && pluginOptions.parserOverride !== undefined) {
      hasParserOverride = true;
    }

    // Try to infer package from common patterns
    if (name.includes('/')) {
      const parts = name.split('/');
      if (parts[0].startsWith('@')) {
        // Scoped package: @scope/package/plugin -> @scope/package
        pkg = parts.slice(0, 2).join('/');
      } else {
        // Unscoped: package/plugin -> package
        pkg = parts[0];
      }
    }

    metadata.push({ name, package: pkg, hasParserOverride });
  }

  return metadata;
}

/**
 * Generate parser override report
 * @param {string} targetFile - Absolute path to audited file
 * @param {ParserOverridePlugin[]} plugins - Plugin metadata
 * @param {Record<string, string>} env - Environment variables used
 * @param {boolean} failOnViolations - Whether to fail on violations
 * @returns {ParserOverrideReport}
 */
function generateReport(targetFile, plugins, env, failOnViolations) {
  const overrideCount = plugins.filter(p => p.hasParserOverride).length;
  const violationDetected = overrideCount > 1;
  const exitCode = violationDetected && failOnViolations ? 1 : 0;

  return {
    timestamp: new Date().toISOString(),
    targetFile,
    environment: env,
    plugins,
    overrideCount,
    violationDetected,
    exitCode,
  };
}

/**
 * Write report to JSON file
 * @param {ParserOverrideReport} report - Report data
 * @param {string} outputDir - Output directory
 * @returns {string} Path to written file
 */
function writeReport(report, outputDir) {
  const outputPath = resolve(outputDir, 'parser-override-report.json');
  const json = JSON.stringify(report, null, 2);

  try {
    writeFileSync(outputPath, json, 'utf8');
    return outputPath;
  } catch (err) {
    throw new Error(`Failed to write report to ${outputPath}: ${err.message}`);
  }
}

/**
 * Main audit function
 * @param {CliOptions} options - CLI options
 * @returns {Promise<ParserOverrideReport>}
 */
async function audit(options) {
  // Resolve file path to absolute
  const absoluteFilePath = resolve(options.file);

  if (!existsSync(absoluteFilePath)) {
    throw new Error(`Target file does not exist: ${absoluteFilePath}`);
  }

  // Get Babel config with environment variables
  const babelConfig = await getBabelConfig(absoluteFilePath, options.env);

  // Extract plugin metadata
  const plugins = extractPluginMetadata(babelConfig);

  // Generate report
  const report = generateReport(absoluteFilePath, plugins, options.env, options.failOnViolations);

  // Write report to output directory
  const reportPath = writeReport(report, options.output);

  console.log(`Parser override audit complete:`);
  console.log(`  Target file: ${absoluteFilePath}`);
  console.log(`  Plugins scanned: ${plugins.length}`);
  console.log(`  Parser overrides detected: ${report.overrideCount}`);
  console.log(`  Violation: ${report.violationDetected ? 'YES' : 'NO'}`);
  console.log(`  Report written to: ${reportPath}`);

  if (report.violationDetected) {
    console.error('\nVIOLATION: Multiple parser overrides detected!');
    const overridePlugins = plugins.filter(p => p.hasParserOverride);
    overridePlugins.forEach(p => {
      console.error(`  - ${p.name}${p.package ? ` (${p.package})` : ''}`);
    });

    if (options.failOnViolations) {
      console.error('\nFailing build due to --fail-on-violations flag');
    }
  }

  return report;
}

/**
 * Main entry point
 */
async function main() {
  try {
    const options = parseArgs();
    const report = await audit(options);
    process.exit(report.exitCode);
  } catch (err) {
    console.error(`Error: ${err.message}`);
    process.exit(2);
  }
}

// Run if executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

// Export for testing
export { audit, parseArgs, getBabelConfig, extractPluginMetadata, generateReport, writeReport };

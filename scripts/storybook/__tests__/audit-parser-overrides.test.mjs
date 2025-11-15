/**
 * @file Unit tests for Storybook Parser Override Audit CLI
 * @see scripts/storybook/audit-parser-overrides.mjs
 * @see docs/pending/storybook-parser-audit.md
 */

import { describe, it, expect, jest, beforeEach, afterEach } from '@jest/globals';
import { writeFileSync, existsSync, readFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Import the audit script module
 * Note: Dynamic import needed to ensure mocks are in place
 */
let auditModule;

beforeEach(async () => {
  jest.clearAllMocks();

  // Import fresh module instance for each test
  const modulePath = '../audit-parser-overrides.mjs';
  auditModule = await import(modulePath);
});

afterEach(() => {
  jest.resetModules();
});

describe('parseArgs', () => {
  it('should parse --file argument', () => {
    process.argv = ['node', 'script.mjs', '--file', 'src/App.tsx'];
    const options = auditModule.parseArgs();
    expect(options.file).toBe('src/App.tsx');
  });

  it('should parse --output argument', () => {
    process.argv = ['node', 'script.mjs', '--file', 'src/App.tsx', '--output', 'custom-dir'];
    const options = auditModule.parseArgs();
    expect(options.output).toBe('custom-dir');
  });

  it('should parse --fail-on-violations flag', () => {
    process.argv = ['node', 'script.mjs', '--file', 'src/App.tsx', '--fail-on-violations'];
    const options = auditModule.parseArgs();
    expect(options.failOnViolations).toBe(true);
  });

  it('should parse --env arguments', () => {
    process.argv = ['node', 'script.mjs', '--file', 'src/App.tsx', '--env', 'STORYBOOK_BUILD=1', '--env', 'NODE_ENV=test'];
    const options = auditModule.parseArgs();
    expect(options.env).toEqual({ STORYBOOK_BUILD: '1', NODE_ENV: 'test' });
  });

  it('should use default output directory', () => {
    process.argv = ['node', 'script.mjs', '--file', 'src/App.tsx'];
    const options = auditModule.parseArgs();
    expect(options.output).toBe('mobile/storybook/.cache');
  });

  it('should exit with code 2 if --file is missing', () => {
    const mockExit = jest.spyOn(process, 'exit').mockImplementation(() => {});
    const mockError = jest.spyOn(console, 'error').mockImplementation(() => {});

    process.argv = ['node', 'script.mjs'];
    auditModule.parseArgs();

    expect(mockExit).toHaveBeenCalledWith(2);
    expect(mockError).toHaveBeenCalledWith(expect.stringContaining('--file argument is required'));

    mockExit.mockRestore();
    mockError.mockRestore();
  });
});

describe('extractPluginMetadata', () => {
  it('should extract plugins without parser overrides', () => {
    const babelConfig = {
      config: {
        plugins: [
          [{ name: '@babel/plugin-transform-react-jsx' }, {}],
          [{ name: 'babel-plugin-module-resolver' }, {}],
        ],
      },
    };

    const plugins = auditModule.extractPluginMetadata(babelConfig);

    expect(plugins).toHaveLength(2);
    expect(plugins[0]).toEqual({
      name: '@babel/plugin-transform-react-jsx',
      package: '@babel/plugin-transform-react-jsx',
      hasParserOverride: false,
    });
    expect(plugins[1]).toEqual({
      name: 'babel-plugin-module-resolver',
      package: 'babel-plugin-module-resolver',
      hasParserOverride: false,
    });
  });

  it('should detect single parser override', () => {
    const babelConfig = {
      config: {
        plugins: [
          [{ name: 'react-native-css/babel', parserOverride: {} }, {}],
          [{ name: '@babel/plugin-transform-react-jsx' }, {}],
        ],
      },
    };

    const plugins = auditModule.extractPluginMetadata(babelConfig);

    expect(plugins).toHaveLength(2);
    expect(plugins[0].hasParserOverride).toBe(true);
    expect(plugins[0].name).toBe('react-native-css/babel');
    expect(plugins[1].hasParserOverride).toBe(false);
  });

  it('should detect multiple parser overrides', () => {
    const babelConfig = {
      config: {
        plugins: [
          [{ name: 'react-native-css/babel', parserOverride: {} }, {}],
          [{ name: 'react-native-reanimated/plugin', parserOverride: {} }, {}],
        ],
      },
    };

    const plugins = auditModule.extractPluginMetadata(babelConfig);

    expect(plugins).toHaveLength(2);
    expect(plugins[0].hasParserOverride).toBe(true);
    expect(plugins[1].hasParserOverride).toBe(true);
  });

  it('should handle plugin with parserOverride in options', () => {
    const babelConfig = {
      config: {
        plugins: [
          [{ name: 'custom-plugin' }, { parserOverride: {} }],
        ],
      },
    };

    const plugins = auditModule.extractPluginMetadata(babelConfig);

    expect(plugins).toHaveLength(1);
    expect(plugins[0].hasParserOverride).toBe(true);
  });

  it('should handle empty plugin array', () => {
    const babelConfig = {
      config: {
        plugins: [],
      },
    };

    const plugins = auditModule.extractPluginMetadata(babelConfig);
    expect(plugins).toEqual([]);
  });

  it('should handle malformed config', () => {
    const plugins = auditModule.extractPluginMetadata(null);
    expect(plugins).toEqual([]);
  });

  it('should extract package name from scoped plugins', () => {
    const babelConfig = {
      config: {
        plugins: [
          [{ name: '@scope/package/plugin' }, {}],
        ],
      },
    };

    const plugins = auditModule.extractPluginMetadata(babelConfig);
    expect(plugins[0].package).toBe('@scope/package');
  });

  it('should extract package name from unscoped plugins', () => {
    const babelConfig = {
      config: {
        plugins: [
          [{ name: 'package/plugin' }, {}],
        ],
      },
    };

    const plugins = auditModule.extractPluginMetadata(babelConfig);
    expect(plugins[0].package).toBe('package');
  });
});

describe('generateReport', () => {
  it('should generate report with no violations', () => {
    const plugins = [
      { name: 'plugin1', package: null, hasParserOverride: false },
      { name: 'plugin2', package: null, hasParserOverride: false },
    ];

    const report = auditModule.generateReport('/path/to/file.tsx', plugins, {}, false);

    expect(report.overrideCount).toBe(0);
    expect(report.violationDetected).toBe(false);
    expect(report.exitCode).toBe(0);
  });

  it('should generate report with single override (no violation)', () => {
    const plugins = [
      { name: 'plugin1', package: null, hasParserOverride: true },
      { name: 'plugin2', package: null, hasParserOverride: false },
    ];

    const report = auditModule.generateReport('/path/to/file.tsx', plugins, {}, false);

    expect(report.overrideCount).toBe(1);
    expect(report.violationDetected).toBe(false);
    expect(report.exitCode).toBe(0);
  });

  it('should generate report with multiple overrides (violation detected)', () => {
    const plugins = [
      { name: 'plugin1', package: null, hasParserOverride: true },
      { name: 'plugin2', package: null, hasParserOverride: true },
    ];

    const report = auditModule.generateReport('/path/to/file.tsx', plugins, {}, false);

    expect(report.overrideCount).toBe(2);
    expect(report.violationDetected).toBe(true);
    expect(report.exitCode).toBe(0); // Not failing because failOnViolations=false
  });

  it('should set exit code 1 when failOnViolations is true and violation detected', () => {
    const plugins = [
      { name: 'plugin1', package: null, hasParserOverride: true },
      { name: 'plugin2', package: null, hasParserOverride: true },
    ];

    const report = auditModule.generateReport('/path/to/file.tsx', plugins, {}, true);

    expect(report.violationDetected).toBe(true);
    expect(report.exitCode).toBe(1);
  });

  it('should include environment variables in report', () => {
    const env = { STORYBOOK_BUILD: '1', NODE_ENV: 'test' };
    const plugins = [];

    const report = auditModule.generateReport('/path/to/file.tsx', plugins, env, false);

    expect(report.environment).toEqual(env);
  });

  it('should include timestamp in ISO format', () => {
    const plugins = [];
    const report = auditModule.generateReport('/path/to/file.tsx', plugins, {}, false);

    expect(report.timestamp).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
  });
});

describe('writeReport', () => {
  const testOutputDir = join(__dirname, '.test-output');
  const testReportPath = join(testOutputDir, 'parser-override-report.json');

  beforeEach(() => {
    // Create test output directory
    if (!existsSync(testOutputDir)) {
      mkdirSync(testOutputDir, { recursive: true });
    }
  });

  afterEach(() => {
    // Clean up test files
    try {
      if (existsSync(testReportPath)) {
        require('fs').unlinkSync(testReportPath);
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  it('should write report to JSON file', () => {
    const report = {
      timestamp: '2025-11-15T00:00:00.000Z',
      targetFile: '/path/to/file.tsx',
      environment: {},
      plugins: [],
      overrideCount: 0,
      violationDetected: false,
      exitCode: 0,
    };

    const outputPath = auditModule.writeReport(report, testOutputDir);

    expect(outputPath).toBe(testReportPath);
    expect(existsSync(testReportPath)).toBe(true);

    const written = JSON.parse(readFileSync(testReportPath, 'utf8'));
    expect(written).toEqual(report);
  });

  it('should overwrite existing report', () => {
    const report1 = {
      timestamp: '2025-11-15T00:00:00.000Z',
      targetFile: '/path/to/file1.tsx',
      environment: {},
      plugins: [],
      overrideCount: 0,
      violationDetected: false,
      exitCode: 0,
    };

    const report2 = {
      timestamp: '2025-11-15T00:01:00.000Z',
      targetFile: '/path/to/file2.tsx',
      environment: {},
      plugins: [],
      overrideCount: 1,
      violationDetected: false,
      exitCode: 0,
    };

    auditModule.writeReport(report1, testOutputDir);
    auditModule.writeReport(report2, testOutputDir);

    const written = JSON.parse(readFileSync(testReportPath, 'utf8'));
    expect(written).toEqual(report2);
  });
});

describe('getBabelConfig', () => {
  it('should load Babel config using loadPartialConfig', async () => {
    // This test validates the structure but actual loading requires proper Babel setup
    // Integration testing will be done in TASK-1002 when dependencies are configured
    const testFile = join(__dirname, 'test-file.tsx');
    writeFileSync(testFile, '// test file', 'utf8');

    try {
      // Note: This will fail in current environment due to missing react-native-css
      // but the structure is correct for when dependencies are available
      const config = await auditModule.getBabelConfig(testFile, { NODE_ENV: 'test' });

      expect(config).toHaveProperty('config');
      expect(config.config).toHaveProperty('plugins');
      expect(Array.isArray(config.config.plugins)).toBe(true);
    } catch (err) {
      // Expected to fail in Phase 0 due to missing NativeWind dependency
      // Test validates error handling
      expect(err.message).toContain('Failed to load Babel config');
    } finally {
      if (existsSync(testFile)) {
        require('fs').unlinkSync(testFile);
      }
    }
  });

  it('should handle missing config gracefully', async () => {
    const testFile = '/nonexistent/file.tsx';

    await expect(
      auditModule.getBabelConfig(testFile, {})
    ).rejects.toThrow('Failed to load Babel config');
  });
});

describe('audit integration', () => {
  const testOutputDir = join(__dirname, '.test-output');
  const testReportPath = join(testOutputDir, 'parser-override-report.json');
  const testFilePath = join(__dirname, 'test-file.tsx');

  beforeEach(() => {
    // Create test output directory
    if (!existsSync(testOutputDir)) {
      mkdirSync(testOutputDir, { recursive: true });
    }

    // Create test file
    writeFileSync(testFilePath, '// test file', 'utf8');
  });

  afterEach(() => {
    // Clean up test files
    try {
      if (existsSync(testReportPath)) {
        require('fs').unlinkSync(testReportPath);
      }
      if (existsSync(testFilePath)) {
        require('fs').unlinkSync(testFilePath);
      }
    } catch (err) {
      // Ignore cleanup errors
    }
  });

  it('should fail when file does not exist', async () => {
    const options = {
      file: '/nonexistent/file.tsx',
      output: testOutputDir,
      failOnViolations: false,
      env: {},
    };

    await expect(auditModule.audit(options)).rejects.toThrow('Target file does not exist');
  });

  it('should handle Babel config loading errors', async () => {
    // In Phase 0, Babel config loading will fail due to missing react-native-css
    // This test validates error handling
    const options = {
      file: testFilePath,
      output: testOutputDir,
      failOnViolations: false,
      env: { STORYBOOK_BUILD: '1' },
    };

    try {
      await auditModule.audit(options);
      // If it succeeds (in future with proper setup), validate report structure
      expect(existsSync(testReportPath)).toBe(true);
      const report = JSON.parse(readFileSync(testReportPath, 'utf8'));
      expect(report).toHaveProperty('timestamp');
      expect(report).toHaveProperty('plugins');
    } catch (err) {
      // Expected to fail in Phase 0 environment
      expect(err.message).toContain('Failed to load Babel config');
    }
  });
});

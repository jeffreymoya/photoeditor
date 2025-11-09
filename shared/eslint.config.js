// ESLint flat config (ESLint 9+)
// Migrated from .eslintrc.cjs
// Shared package lint configuration

const js = require('@eslint/js');
const tseslint = require('typescript-eslint');
const importPlugin = require('eslint-plugin-import');
const unicornPlugin = require('eslint-plugin-unicorn');
const sonarjsPlugin = require('eslint-plugin-sonarjs');
const unusedImportsPlugin = require('eslint-plugin-unused-imports');
const jsdocPlugin = require('eslint-plugin-jsdoc');

module.exports = tseslint.config(
  {
    ignores: ['dist', 'node_modules'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.typescript,
  {
    files: ['**/*.ts'],
    languageOptions: {
      parser: tseslint.parser,
      parserOptions: {
        project: './tsconfig.json',
        tsconfigRootDir: __dirname,
        sourceType: 'module',
      },
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
        Buffer: 'readonly',
        __dirname: 'readonly',
        __filename: 'readonly',
        module: 'readonly',
        require: 'readonly',
        exports: 'readonly',
      },
    },
    plugins: {
      unicorn: unicornPlugin,
      sonarjs: sonarjsPlugin,
      'unused-imports': unusedImportsPlugin,
      jsdoc: jsdocPlugin,
    },
    settings: {
      'import/resolver': {
        typescript: {
          project: ['./tsconfig.json'],
        },
      },
    },
    rules: {
      // TypeScript rules
      '@typescript-eslint/no-unused-vars': 'off',
      '@typescript-eslint/ban-ts-comment': [
        'error',
        {
          'ts-ignore': true,
          'ts-nocheck': true,
          'ts-expect-error': 'allow-with-description',
          'ts-check': false,
          minimumDescriptionLength: 10,
        },
      ],
      'unused-imports/no-unused-imports': 'warn',
      'unused-imports/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          varsIgnorePattern: '^_',
          args: 'after-used',
          argsIgnorePattern: '^_',
        },
      ],
      // Import rules
      'import/no-duplicates': 'warn',
      'import/newline-after-import': ['warn', { count: 1 }],
      'import/order': [
        'warn',
        {
          groups: [
            'builtin',
            'external',
            'internal',
            'parent',
            'sibling',
            'index',
            'object',
            'type',
          ],
          'newlines-between': 'always',
          alphabetize: { order: 'asc', caseInsensitive: true },
        },
      ],
      // Unicorn rules
      'unicorn/prefer-node-protocol': 'warn',
      'unicorn/prevent-abbreviations': 'off',
      // SonarJS rules
      'sonarjs/no-identical-functions': 'warn',
      // JSDoc rules
      'jsdoc/check-alignment': 'warn',
      'jsdoc/tag-lines': ['warn', 'any', { startLines: 1 }],
    },
  }
);

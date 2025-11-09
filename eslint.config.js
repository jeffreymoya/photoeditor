// ESLint flat config (ESLint 9+)
// Migrated from .eslintrc.json
// Root-level config for monorepo-wide rules

const jest = require('eslint-plugin-jest');
const photoeditorInternal = require('eslint-plugin-photoeditor-internal');

module.exports = [
  {
    plugins: {
      jest,
      'photoeditor-internal': photoeditorInternal,
    },
  },
  {
    files: ['**/*.{test,spec}.{ts,tsx,js}'],
    ...jest.configs['flat/recommended'],
    rules: {
      ...jest.configs['flat/recommended'].rules,
      'jest/no-focused-tests': 'error',
      'jest/no-disabled-tests': 'warn',
      'jest/valid-expect': 'error',
      'photoeditor-internal/no-polling-mock-queues': 'error',
      'photoeditor-internal/no-unbound-fixture-builders': 'error',
    },
  },
  {
    files: ['backend/src/lambdas/**/*.ts'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@aws-sdk/*', 'aws-sdk'],
              message: 'Handlers must not import AWS SDK directly; depend on services/providers.',
            },
          ],
        },
      ],
    },
  },
];

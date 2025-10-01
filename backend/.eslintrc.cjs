module.exports = {
  root: true,
  parser: '@typescript-eslint/parser',
  parserOptions: {
    project: './tsconfig.json',
    tsconfigRootDir: __dirname,
    sourceType: 'module'
  },
  env: {
    node: true,
    es2022: true
  },
  plugins: ['@typescript-eslint'],
  extends: ['eslint:recommended', 'plugin:@typescript-eslint/recommended'],
  ignorePatterns: ['dist', 'node_modules'],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'warn',
    '@typescript-eslint/no-unused-vars': [
      'error',
      { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }
    ]
  },
  overrides: [
    {
      files: ['src/services/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@/lambdas', '@/lambdas/*'],
                message: 'Services must not depend on lambda handlers.'
              }
            ]
          }
        ]
      }
    },
    {
      files: ['src/providers/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@/lambdas', '@/lambdas/*', '@/services', '@/services/*'],
                message: 'Providers stay isolated from handlers and services.'
              }
            ]
          }
        ]
      }
    },
    {
      files: ['src/lambdas/**/*.ts'],
      rules: {
        'no-restricted-imports': [
          'error',
          {
            patterns: [
              {
                group: ['@/providers', '@/providers/*'],
                message: 'Handlers talk to providers through services.'
              }
            ]
          }
        ]
      }
    }
  ]
};

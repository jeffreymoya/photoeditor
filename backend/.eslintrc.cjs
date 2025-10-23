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
  plugins: [
    '@typescript-eslint',
    'import',
    'unicorn',
    'sonarjs',
    'unused-imports',
    'jsdoc'
  ],
  extends: [
    'eslint:recommended',
    'plugin:@typescript-eslint/recommended',
    'plugin:import/recommended',
    'plugin:import/typescript'
  ],
  settings: {
    'import/resolver': {
      typescript: {
        project: ['./tsconfig.json']
      }
    }
  },
  ignorePatterns: ['dist', 'node_modules'],
  rules: {
    '@typescript-eslint/explicit-function-return-type': 'off',
    '@typescript-eslint/no-explicit-any': 'error',
    '@typescript-eslint/no-unused-vars': 'off',
    'unused-imports/no-unused-imports': 'warn',
    'unused-imports/no-unused-vars': [
      'warn',
      {
        vars: 'all',
        varsIgnorePattern: '^_',
        args: 'after-used',
        argsIgnorePattern: '^_'
      }
    ],
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
          'type'
        ],
        'newlines-between': 'always',
        alphabetize: { order: 'asc', caseInsensitive: true }
      }
    ],
    'unicorn/prefer-node-protocol': 'warn',
    'unicorn/prevent-abbreviations': 'off',
    'sonarjs/no-identical-functions': 'warn',
    'jsdoc/check-alignment': 'warn',
    'jsdoc/tag-lines': ['warn', 'any', { startLines: 1 }],
    'complexity': ['error', { max: 15 }],
    'max-lines-per-function': ['error', { max: 200, skipBlankLines: true, skipComments: true }]
  },
  overrides: [
    {
      files: ['src/lambdas/**/*.ts'],
      rules: {
        'complexity': ['error', { max: 10 }],
        'max-lines-per-function': ['error', { max: 75, skipBlankLines: true, skipComments: true }],
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
    },
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
    }
  ]
};

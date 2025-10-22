module.exports = {
  root: true,
  extends: 'expo',
  plugins: ['boundaries'],
  settings: {
    'boundaries/elements': [
      {
        type: 'screens',
        pattern: 'src/screens/*',
      },
      {
        type: 'features',
        pattern: 'src/features/*',
      },
      {
        type: 'shared-ui',
        pattern: 'src/components/*',
      },
      {
        type: 'hooks',
        pattern: 'src/hooks/*',
      },
      {
        type: 'lib',
        pattern: 'src/lib/*',
      },
      {
        type: 'services',
        pattern: 'src/services/*',
      },
      {
        type: 'store',
        pattern: 'src/store/*',
      },
      {
        type: 'utils',
        pattern: 'src/utils/*',
      },
    ],
    'boundaries/ignore': ['**/*.test.ts', '**/*.test.tsx', '**/*.spec.ts', '**/*.spec.tsx'],
  },
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/array-type': ['warn', { default: 'array' }],
    'complexity': ['error', { max: 10 }],
    'max-lines-per-function': ['error', { max: 200, skipBlankLines: true, skipComments: true }],

    // Mobile layering rules (STANDARDS.md line 53)
    'boundaries/element-types': [
      'error',
      {
        default: 'disallow',
        rules: [
          // Screens can import from features, shared UI, hooks, lib, services, store, utils
          {
            from: 'screens',
            allow: ['features', 'shared-ui', 'hooks', 'lib', 'services', 'store', 'utils'],
          },
          // Features can import from shared UI, hooks, lib, services, store, utils (but not other features)
          {
            from: 'features',
            allow: ['shared-ui', 'hooks', 'lib', 'services', 'store', 'utils'],
          },
          // Shared UI can import from hooks, lib, utils only
          {
            from: 'shared-ui',
            allow: ['hooks', 'lib', 'utils'],
          },
          // Hooks can import from lib, utils
          {
            from: 'hooks',
            allow: ['lib', 'utils'],
          },
          // Lib can import from utils
          {
            from: 'lib',
            allow: ['utils'],
          },
          // Services can import from lib, utils
          {
            from: 'services',
            allow: ['lib', 'utils'],
          },
          // Store can import from lib, utils, services
          {
            from: 'store',
            allow: ['lib', 'utils', 'services'],
          },
          // Utils are leaf nodes
          {
            from: 'utils',
            allow: [],
          },
        ],
      },
    ],

    // Ban deep imports into features (STANDARDS.md line 26, 96)
    'boundaries/no-private': [
      'error',
      {
        allowUncles: false,
      },
    ],
  },
  env: {
    node: true,
    browser: true,
    es2021: true,
  },
};

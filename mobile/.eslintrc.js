module.exports = {
  root: true,
  extends: 'expo',
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    '@typescript-eslint/no-explicit-any': 'error',
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/array-type': ['warn', { default: 'array' }],
    'complexity': ['warn', { max: 10 }],
  },
  env: {
    node: true,
    browser: true,
    es2021: true,
  },
};

module.exports = {
  root: true,
  extends: 'expo',
  rules: {
    'react/react-in-jsx-scope': 'off',
    '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    'no-console': ['warn', { allow: ['warn', 'error'] }],
    '@typescript-eslint/ban-types': 'off',
    '@typescript-eslint/array-type': ['warn', { default: 'array' }],
  },
  env: {
    node: true,
    browser: true,
    es2021: true,
  },
};

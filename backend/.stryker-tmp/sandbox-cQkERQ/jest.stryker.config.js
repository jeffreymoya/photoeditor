// Jest config specifically for Stryker mutation testing
// Extends the main jest config but overrides module resolution to work in Stryker's sandbox
const baseConfig = require('./jest.config.js');

module.exports = {
  ...baseConfig,
  // Override module name mapper to use absolute paths that work in Stryker sandbox
  moduleNameMapper: {
    '^@photoeditor/shared$': '<rootDir>/../shared/index.ts',
    '^@photoeditor/shared/(.*)$': '<rootDir>/../shared/$1',
    '^@backend/core$': '<rootDir>/libs/core',
    '^@backend/core/(.*)$': '<rootDir>/libs/core/$1'
  },
  // Only run unit tests for mutation testing
  testMatch: [
    '<rootDir>/tests/unit/**/*.test.ts'
  ],
  // Reduce reporters for faster execution
  reporters: ['default']
};

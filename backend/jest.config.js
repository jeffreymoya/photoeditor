module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.test.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'html'],
  verbose: true,
  testTimeout: 30000,

  // Set up environment variables for tests
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Module resolution
  moduleNameMapper: {
    '^@photoeditor/shared$': '<rootDir>/../shared'
  },

  // Transform configuration
  transform: {
    '^.+\\.ts$': 'ts-jest',
    '^.+\\.js$': 'babel-jest'
  },

  // Test patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/'
  ]
};
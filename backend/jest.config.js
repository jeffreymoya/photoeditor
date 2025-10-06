module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  rootDir: '.',
  testMatch: [
    '<rootDir>/tests/**/*.test.js',
    '<rootDir>/tests/**/*.test.ts'
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,js}',
    '!src/**/*.d.ts',
  ],
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json'],
  coverageThreshold: {
    global: {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70
    }
  },
  verbose: true,
  testTimeout: 10000, // Unit default; raise in integration suites only

  // Set up environment variables for tests
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Module resolution
  moduleNameMapper: {
    '^@photoeditor/shared$': '<rootDir>/../shared',
    '^@backend/core$': '<rootDir>/libs/core',
    '^@backend/core/(.*)$': '<rootDir>/libs/core/$1'
  },

  // Transform configuration
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: {
        exactOptionalPropertyTypes: false,
        rootDir: '.',
        outDir: './dist'
      }
    }],
    '^.+\\.js$': 'babel-jest'
  },

  // Test patterns
  testPathIgnorePatterns: [
    '/node_modules/',
    '/dist/',
    '<rootDir>/build/',
    '/tmp/'
  ],

  // JUnit reporting for CI
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '<rootDir>/tmp/test-results',
      outputName: 'junit.xml'
    }]
  ]
};
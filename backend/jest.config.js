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
    '!src/**/index.ts',
  ],
  collectCoverage: true,
  coverageDirectory: 'coverage',
  coverageReporters: ['text', 'lcov', 'json'],
  coverageThreshold: {
    // Global floor to keep fast feedback generally green
    global: {
      statements: 70,
      branches: 60,
      functions: 70,
      lines: 70
    },
    // Enforce standards for services and providers (≥80% line, ≥70% branch)
    // Paths are evaluated relative to rootDir
    './src/services/**/*.ts': {
      statements: 80,
      branches: 70,
      functions: 75,
      lines: 80
    },
    './src/providers/**/*.ts': {
      statements: 80,
      branches: 70,
      functions: 75,
      lines: 80
    }
  },
  verbose: true,
  testTimeout: 10000, // Default for unit suites

  // Set up environment variables for tests
  setupFilesAfterEnv: ['<rootDir>/tests/setup.js'],

  // Module resolution
  moduleNameMapper: {
    '^@photoeditor/shared$': '<rootDir>/../shared/dist',
    '^@photoeditor/shared/(.*)$': '<rootDir>/../shared/dist/$1',
    '^@backend/core$': '<rootDir>/libs/core',
    '^@backend/core/(.*)$': '<rootDir>/libs/core/$1'
  },

  // Transform configuration
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: '<rootDir>/tsconfig.jest.json',
      isolatedModules: true
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

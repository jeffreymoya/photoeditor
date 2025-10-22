// @ts-nocheck
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/../src'],
  testMatch: ['**/*.spec.ts', '**/*.test.ts'],
  collectCoverageFrom: [
    'src/**/*.ts',
    '!src/**/*.spec.ts',
    '!src/**/*.test.ts',
    '!src/**/*.contract.spec.ts',
    '!src/main.ts',
    '!src/handler.ts',
  ],
  coverageThreshold: {
    global: {
      lines: 80,
      branches: 70,
      functions: 80,
      statements: 80,
    },
  },
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  transform: {
    '^.+\\.ts$': ['ts-jest', {
      tsconfig: './tsconfig.test.json',
    }],
  },
  setupFilesAfterEnv: [],
  testTimeout: 10000,
  transformIgnorePatterns: [
    '/node_modules/(?!@photoeditor)',
  ],
};

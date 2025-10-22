/** @type {import('ts-jest').JestConfigWithTsJest} */
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/__tests__'],
  testMatch: ['**/*.test.ts'],
  moduleFileExtensions: ['ts', 'tsx', 'js', 'jsx', 'json', 'node'],
  transform: {
    '^.+\\.[tj]sx?$': ['ts-jest', { tsconfig: '<rootDir>/tsconfig.test.json' }],
  },
  collectCoverageFrom: [
    '<rootDir>/index.ts',
    '<rootDir>/constants/**/*.ts',
    '<rootDir>/schemas/**/*.ts',
    '<rootDir>/statecharts/**/*.ts',
    '<rootDir>/types/**/*.ts'
  ],
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '<rootDir>/tmp/test-results',
      outputName: 'junit.xml'
    }]
  ],
};

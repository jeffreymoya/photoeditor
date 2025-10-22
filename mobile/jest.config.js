module.exports = {
  preset: 'jest-expo',
  setupFilesAfterEnv: ['<rootDir>/src/__tests__/setup.ts'],
  testMatch: [
    '**/__tests__/**/*.(test|spec).(ts|tsx|js)',
    '**/*.(test|spec).(ts|tsx|js)',
  ],
  collectCoverageFrom: [
    'src/**/*.{ts,tsx}',
    '!src/**/*.d.ts',
    '!src/__tests__/**/*',
  ],
  moduleNameMapper: {
    '^@/(.*)$': '<rootDir>/src/$1',
  },
  // Allow Babel to transform Flow-authored shims (e.g. @react-native/js-polyfills)
  // instead of skipping them under node_modules. This keeps Expo + Jest in sync
  // after the React Native 0.73 upgrade which ships Flow syntax in polyfills.
  transformIgnorePatterns: [],
  reporters: [
    'default',
    ['jest-junit', {
      outputDirectory: '<rootDir>/tmp/test-results',
      outputName: 'junit.xml'
    }]
  ],
};

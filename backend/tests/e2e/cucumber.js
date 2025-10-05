/**
 * Cucumber.js Configuration
 *
 * Configuration for E2E test runner with LocalStack.
 */

module.exports = {
  default: {
    require: [
      'tests/e2e/**/*.ts'
    ],
    requireModule: [
      'ts-node/register'
    ],
    format: [
      'progress-bar',
      'html:docs/evidence/e2e/latest/report.html',
      'json:docs/evidence/e2e/latest/report.json',
      'junit:docs/evidence/e2e/latest/junit.xml'
    ],
    formatOptions: {
      snippetInterface: 'async-await'
    },
    publishQuiet: true
  }
};

'use strict';

const { RuleTester } = require('eslint');
const rule = require('../rules/no-polling-mock-queues');

const ruleTester = new RuleTester({
  parserOptions: { ecmaVersion: 2022, sourceType: 'module' },
  globals: {
    createPollingScenario: false,
    queue: false,
  },
});

ruleTester.run('no-polling-mock-queues', rule, {
  valid: [
    {
      code: `
        it('skips when helper does not create polling scenario', () => {
          const setup = () => {};
          setup();
          queue.mockResolvedValueOnce('ok');
        });
      `,
    },
    {
      code: `
        it('ignores disallowed calls without polling', () => {
          queue.mockRejectedValueOnce(new Error('boom'));
        });
      `,
    },
  ],
  invalid: [
    {
      code: `
        function setupHelper() {
          createPollingScenario(() => {});
        }

        it('flags mocked queue when helper creates polling scenario', () => {
          setupHelper();
          queue.mockResolvedValueOnce('ok');
        });
      `,
      errors: [{ messageId: 'disallowed', data: { property: 'mockResolvedValueOnce' } }],
    },
    {
      code: `
        it('propagates through helper declared later', () => {
          setupLater();
          queue.mockRejectedValueOnce(new Error('nope'));
        });

        function setupLater() {
          createPollingScenario(() => {});
        }
      `,
      errors: [{ messageId: 'disallowed', data: { property: 'mockRejectedValueOnce' } }],
    },
    {
      code: `
        const setupArrow = async () => {
          createPollingScenario(() => {});
        };

        it('detects arrow helpers', async () => {
          await setupArrow();
          queue.mockResolvedValueOnce('ok');
        });
      `,
      errors: [{ messageId: 'disallowed', data: { property: 'mockResolvedValueOnce' } }],
    },
  ],
});

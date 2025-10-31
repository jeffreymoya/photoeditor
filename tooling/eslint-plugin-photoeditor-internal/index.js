'use strict';

module.exports = {
  rules: {
    'no-polling-mock-queues': require('./rules/no-polling-mock-queues'),
    'no-unbound-fixture-builders': require('./rules/no-unbound-fixture-builders'),
  },
  configs: {
    recommended: {
      rules: {
        'photoeditor-internal/no-polling-mock-queues': 'error',
        'photoeditor-internal/no-unbound-fixture-builders': 'warn',
      },
    },
  },
};

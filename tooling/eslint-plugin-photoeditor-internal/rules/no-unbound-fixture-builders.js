'use strict';

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow passing Fixtures.*.build without wrapping in an arrow function',
      recommended: false,
    },
    messages: {
      wrapBuilder: 'Wrap `Fixtures.{{fixture}}.build` in an arrow function to preserve `this` context.',
    },
  },
  create(context) {
    function isFixturesBuild(node) {
      if (node.type !== 'MemberExpression' || node.computed) {
        return false;
      }

      const { object, property } = node;
      if (property.type !== 'Identifier' || property.name !== 'build') {
        return false;
      }

      if (object.type !== 'MemberExpression' || object.computed) {
        return false;
      }

      if (object.object.type !== 'Identifier' || object.object.name !== 'Fixtures') {
        return false;
      }

      if (object.property.type !== 'Identifier') {
        return false;
      }

      return object.property.name;
    }

    return {
      MemberExpression(node) {
        const fixtureName = isFixturesBuild(node);
        if (!fixtureName) {
          return;
        }

        const parent = node.parent;
        if (parent && parent.type === 'CallExpression' && parent.callee === node) {
          // Direct invocation (Fixtures.Job.build()) is fine
          return;
        }

        context.report({
          node,
          messageId: 'wrapBuilder',
          data: { fixture: fixtureName },
        });
      },
    };
  },
};

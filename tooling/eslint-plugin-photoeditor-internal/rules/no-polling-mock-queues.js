'use strict';

const TEST_FUNCTION_NAMES = new Set(['it', 'test']);
const DISALLOWED_PROPERTIES = new Set(['mockResolvedValueOnce', 'mockRejectedValueOnce']);

function getRootIdentifier(memberExpression) {
  let current = memberExpression;
  while (current && current.type === 'MemberExpression') {
    if (current.object.type !== 'MemberExpression') {
      return current.object.type === 'Identifier' ? current.object.name : null;
    }
    current = current.object;
  }
  return null;
}

function isTestCall(node) {
  let callee = node.callee;
  if (callee.type === 'Identifier') {
    return TEST_FUNCTION_NAMES.has(callee.name);
  }

  if (callee.type !== 'MemberExpression') {
    return false;
  }

  // Support it.each / it.only / test.skip / etc.
  while (callee && callee.type === 'MemberExpression') {
    if (callee.property.type === 'Identifier' && TEST_FUNCTION_NAMES.has(callee.property.name)) {
      return true;
    }

    if (callee.object.type === 'Identifier' && TEST_FUNCTION_NAMES.has(callee.object.name)) {
      return true;
    }

    callee = callee.object;
  }

  return false;
}

module.exports = {
  meta: {
    type: 'problem',
    docs: {
      description: 'Disallow mockResolvedValueOnce/RejectedOnce inside tests that use createPollingScenario',
      recommended: false,
    },
    messages: {
      disallowed: 'Do not use {{property}} in a test that uses createPollingScenario; register responses via stages instead.',
    },
  },
  create(context) {
    const functionInfoMap = new Map();
    const functionStack = [];
    const pendingTestInfos = new Set();
    const sourceCode = context.getSourceCode();

    function getFunctionInfo(node) {
      if (!functionInfoMap.has(node)) {
        functionInfoMap.set(node, {
          node,
          isTest: false,
          disallowedCalls: [],
          directHasPollingScenario: false,
          dependencies: new Set(),
        });
      }
      return functionInfoMap.get(node);
    }

    function markTestFunction(node) {
      const info = getFunctionInfo(node);
      info.isTest = true;
    }

    function findCurrentFunctionInfo() {
      if (functionStack.length === 0) {
        return null;
      }
      return getFunctionInfo(functionStack[functionStack.length - 1]);
    }

    function findEnclosingTestInfo() {
      for (let i = functionStack.length - 1; i >= 0; i -= 1) {
        const info = getFunctionInfo(functionStack[i]);
        if (info.isTest) {
          return info;
        }
      }
      return null;
    }

    function resolveHasPollingScenario(info, seen = new Set()) {
      if (info.directHasPollingScenario) {
        return true;
      }

      if (seen.has(info)) {
        return false;
      }

      seen.add(info);

      for (const dependency of info.dependencies) {
        if (resolveHasPollingScenario(dependency, seen)) {
          return true;
        }
      }

      return false;
    }

    function enterFunction(node) {
      functionStack.push(node);
      getFunctionInfo(node);
    }

    function exitFunction(node) {
      const info = functionInfoMap.get(node);
      if (info && info.isTest) {
        pendingTestInfos.add(info);
      }
      functionStack.pop();
    }

    function findVariable(scope, name) {
      let current = scope;
      while (current) {
        if (current.set && current.set.has(name)) {
          return current.set.get(name);
        }
        current = current.upper;
      }
      return null;
    }

    function getHelperInfosFromIdentifier(identifier) {
      if (!identifier || identifier.type !== 'Identifier') {
        return [];
      }

      const scope = sourceCode.getScope(identifier);
      const variable = findVariable(scope, identifier.name);
      if (!variable) {
        return [];
      }

      const infos = new Set();
      for (const def of variable.defs) {
        if (def.type === 'FunctionName' && def.node && def.node.type === 'FunctionDeclaration') {
          infos.add(getFunctionInfo(def.node));
        } else if (def.type === 'Variable' && def.node && def.node.type === 'VariableDeclarator') {
          const init = def.node.init;
          if (init && (init.type === 'FunctionExpression' || init.type === 'ArrowFunctionExpression')) {
            infos.add(getFunctionInfo(init));
          }
        }
      }

      return Array.from(infos);
    }

    return {
      CallExpression(node) {
        if (isTestCall(node)) {
          const callback = node.arguments.find((arg) => arg && (arg.type === 'FunctionExpression' || arg.type === 'ArrowFunctionExpression'));
          if (callback) {
            markTestFunction(callback);
          }
          return;
        }

        if (node.callee.type === 'Identifier' && node.callee.name === 'createPollingScenario') {
          const currentInfo = findCurrentFunctionInfo();
          if (currentInfo) {
            currentInfo.directHasPollingScenario = true;
          }
          return;
        }

        if (
          node.callee.type === 'MemberExpression'
          && !node.callee.computed
          && node.callee.property.type === 'Identifier'
          && DISALLOWED_PROPERTIES.has(node.callee.property.name)
        ) {
          const info = findEnclosingTestInfo();
          if (info) {
            info.disallowedCalls.push({ node, property: node.callee.property.name });
          }
          return;
        }

        const currentInfo = findCurrentFunctionInfo();
        if (!currentInfo) {
          return;
        }

        if (node.callee.type === 'Identifier') {
          const helperInfos = getHelperInfosFromIdentifier(node.callee);
          for (const helperInfo of helperInfos) {
            currentInfo.dependencies.add(helperInfo);
          }
        }
      },
      FunctionExpression: enterFunction,
      'FunctionExpression:exit': exitFunction,
      ArrowFunctionExpression: enterFunction,
      'ArrowFunctionExpression:exit': exitFunction,
      FunctionDeclaration: enterFunction,
      'FunctionDeclaration:exit': exitFunction,
      'Program:exit'() {
        for (const info of pendingTestInfos) {
          if (info.disallowedCalls.length > 0 && resolveHasPollingScenario(info)) {
            for (const call of info.disallowedCalls) {
              context.report({
                node: call.node,
                messageId: 'disallowed',
                data: { property: call.property },
              });
            }
          }
        }
        pendingTestInfos.clear();
      },
    };
  },
};

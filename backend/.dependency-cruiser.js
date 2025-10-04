/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: 'no-aws-sdk-in-handlers',
      comment:
        'Handlers (lambdas) should not directly import AWS SDK. ' +
        'Use services/adapters instead to maintain thin handlers and testability.',
      severity: 'error',
      from: {
        path: '^src/lambdas/',
      },
      to: {
        path: '^node_modules/@aws-sdk/',
      },
    },
    {
      name: 'no-circular',
      comment:
        'Circular dependencies indicate design issues and complicate testing.',
      severity: 'warn',
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: 'no-orphans',
      comment:
        'Orphan modules (unused code) should be removed or have their usage restored.',
      severity: 'info',
      from: {
        orphan: true,
        pathNot: [
          '\\.spec\\.ts$',
          '\\.test\\.ts$',
          'node_modules',
        ],
      },
      to: {},
    },
    {
      name: 'handlers-only-depend-on-services-utils',
      comment:
        'Handlers should only import from services, utils, and shared types. ' +
        'This enforces clean layering: handlers -> services -> providers. ' +
        'Worker is special-cased to access providers directly.',
      severity: 'warn',
      from: {
        path: '^src/lambdas/',
        pathNot: '^src/lambdas/worker\\.ts$',
      },
      to: {
        pathNot: [
          '^src/services/',
          '^src/utils/',
          '^node_modules/@photoeditor/shared',
          '^node_modules/@types/',
          '^node_modules/@aws-lambda-powertools',
          '^node_modules/zod',
          '^node_modules/uuid',
          '\\.\\./(shared|\\.\\.)/.*',
          '^src/lambdas/', // handlers can import other handler utilities if needed
        ],
      },
    },
    {
      name: 'services-may-not-depend-on-handlers',
      comment:
        'Services must not import from handlers to maintain proper layering.',
      severity: 'error',
      from: {
        path: '^src/services/',
      },
      to: {
        path: '^src/lambdas/',
      },
    },
    {
      name: 'utils-may-not-depend-on-handlers-or-services',
      comment:
        'Utilities should be pure and not depend on higher layers.',
      severity: 'error',
      from: {
        path: '^src/utils/',
      },
      to: {
        path: ['^src/lambdas/', '^src/services/'],
      },
    },
  ],
  options: {
    doNotFollow: {
      path: 'node_modules',
    },
    tsPreCompilationDeps: true,
    tsConfig: {
      fileName: 'tsconfig.json',
    },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default'],
    },
    reporterOptions: {
      dot: {
        collapsePattern: '^node_modules/[^/]+',
      },
      archi: {
        collapsePattern: '^(node_modules|src/utils|src/services|src/lambdas|src/providers)',
      },
    },
  },
};

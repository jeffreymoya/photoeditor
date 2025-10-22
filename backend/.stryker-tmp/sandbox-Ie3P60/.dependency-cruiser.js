/** @type {import('dependency-cruiser').IConfiguration} */
// @ts-nocheck

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
      name: 'no-service-instantiation-in-handlers',
      comment:
        'Handlers must not directly import service classes for instantiation. ' +
        'Services must be injected via Middy middleware (serviceInjection) to comply with ' +
        'standards/backend-tier.md line 68. Handlers may only import @backend/core for DI.',
      severity: 'error',
      from: {
        path: '^src/lambdas/',
      },
      to: {
        path: '^src/services/',
      },
    },
    {
      name: 'handlers-only-depend-on-core-utils',
      comment:
        'Handlers should only import from @backend/core (for DI), utils, and shared types. ' +
        'This enforces clean layering: handlers use injected services via Middy middleware.',
      severity: 'error',
      from: {
        path: '^src/lambdas/',
      },
      to: {
        pathNot: [
          '^src/utils/',
          '^node_modules',
          '\\.\\./node_modules',
          '\\.\\./shared',
          '^\\.\\./libs/core',
          '^libs/core',
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

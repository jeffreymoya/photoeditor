/// <reference types="expo/types" />

// Expo environment variable types
declare namespace NodeJS {
  interface ProcessEnv {
    EXPO_PUBLIC_API_BASE_URL?: string;
  }
}

// Node.js globals for test environment
declare namespace NodeJS {
  interface Global {
    fetch: typeof fetch;
  }

  interface Require {
    resolve(id: string): string;
  }
}

// Global namespace for Jest tests
declare var global: typeof globalThis & {
  fetch: typeof fetch;
};

// Ensure process.env is available
declare var process: {
  env: NodeJS.ProcessEnv;
};

// Node require for tests
declare var require: {
  <T = unknown>(id: string): T;
  resolve(id: string): string;
};

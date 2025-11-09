/**
 * Simple logger utility for mobile app
 * Wraps console methods with environment-aware logging
 */

const isDevelopment = __DEV__;

class Logger {
  log(...args: unknown[]) {
    if (isDevelopment) {
      // eslint-disable-next-line no-console
      console.log(...args);
    }
  }

  info(...args: unknown[]) {
    if (isDevelopment) {
      // eslint-disable-next-line no-console
      console.info(...args);
    }
  }

  warn(...args: unknown[]) {
    if (isDevelopment) {
       
      console.warn(...args);
    }
  }

  error(...args: unknown[]) {
    // Always log errors, even in production
     
    console.error(...args);
  }

  debug(...args: unknown[]) {
    if (isDevelopment) {
      // eslint-disable-next-line no-console
      console.debug(...args);
    }
  }
}

export const logger = new Logger();

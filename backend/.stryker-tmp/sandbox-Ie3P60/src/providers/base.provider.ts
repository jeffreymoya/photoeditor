// @ts-nocheck
function stryNS_9fa48() {
  var g = typeof globalThis === 'object' && globalThis && globalThis.Math === Math && globalThis || new Function("return this")();
  var ns = g.__stryker__ || (g.__stryker__ = {});
  if (ns.activeMutant === undefined && g.process && g.process.env && g.process.env.__STRYKER_ACTIVE_MUTANT__) {
    ns.activeMutant = g.process.env.__STRYKER_ACTIVE_MUTANT__;
  }
  function retrieveNS() {
    return ns;
  }
  stryNS_9fa48 = retrieveNS;
  return retrieveNS();
}
stryNS_9fa48();
function stryCov_9fa48() {
  var ns = stryNS_9fa48();
  var cov = ns.mutantCoverage || (ns.mutantCoverage = {
    static: {},
    perTest: {}
  });
  function cover() {
    var c = cov.static;
    if (ns.currentTestId) {
      c = cov.perTest[ns.currentTestId] = cov.perTest[ns.currentTestId] || {};
    }
    var a = arguments;
    for (var i = 0; i < a.length; i++) {
      c[a[i]] = (c[a[i]] || 0) + 1;
    }
  }
  stryCov_9fa48 = cover;
  cover.apply(null, arguments);
}
function stryMutAct_9fa48(id) {
  var ns = stryNS_9fa48();
  function isActive(id) {
    if (ns.activeMutant === id) {
      if (ns.hitCount !== void 0 && ++ns.hitCount > ns.hitLimit) {
        throw new Error('Stryker: Hit count limit reached (' + ns.hitCount + ')');
      }
      return true;
    }
    return false;
  }
  stryMutAct_9fa48 = isActive;
  return isActive(id);
}
import { ProviderConfig, ProviderResponse } from '@photoeditor/shared';
import { createResiliencePolicy, DEFAULT_RESILIENCE_CONFIG, ResiliencePolicyMetrics } from '../libs/core/providers/resilience-policy';
export abstract class BaseProvider {
  protected config: ProviderConfig;
  private resiliencePolicyExecute: <T>(operation: () => Promise<T>) => Promise<T>;
  private getResilienceMetrics: () => ResiliencePolicyMetrics;
  constructor(config: ProviderConfig) {
    if (stryMutAct_9fa48("0")) {
      {}
    } else {
      stryCov_9fa48("0");
      this.config = config;

      // Initialize resilience policy with config or defaults
      const resilienceConfig = stryMutAct_9fa48("3") ? config.resilience && DEFAULT_RESILIENCE_CONFIG : stryMutAct_9fa48("2") ? false : stryMutAct_9fa48("1") ? true : (stryCov_9fa48("1", "2", "3"), config.resilience || DEFAULT_RESILIENCE_CONFIG);
      const {
        execute,
        getMetrics
      } = createResiliencePolicy(resilienceConfig);
      this.resiliencePolicyExecute = execute;
      this.getResilienceMetrics = getMetrics;
    }
  }
  protected async makeRequest<T>(request: () => Promise<T>): Promise<ProviderResponse> {
    if (stryMutAct_9fa48("4")) {
      {}
    } else {
      stryCov_9fa48("4");
      const startTime = Date.now();
      const timestamp = new Date().toISOString();
      try {
        if (stryMutAct_9fa48("5")) {
          {}
        } else {
          stryCov_9fa48("5");
          if (stryMutAct_9fa48("8") ? false : stryMutAct_9fa48("7") ? true : stryMutAct_9fa48("6") ? this.config.enabled : (stryCov_9fa48("6", "7", "8"), !this.config.enabled)) {
            if (stryMutAct_9fa48("9")) {
              {}
            } else {
              stryCov_9fa48("9");
              throw new Error(stryMutAct_9fa48("10") ? `` : (stryCov_9fa48("10"), `Provider ${this.config.name} is disabled`));
            }
          }

          // Execute request through resilience policy pipeline
          const data = await this.resiliencePolicyExecute(request);
          const duration = stryMutAct_9fa48("11") ? Date.now() + startTime : (stryCov_9fa48("11"), Date.now() - startTime);
          const metrics = this.getResilienceMetrics();
          return {
            success: true,
            data,
            duration,
            provider: this.config.name,
            timestamp,
            metadata: {
              resilience: {
                retryAttempts: metrics.retryAttempts,
                circuitBreakerState: metrics.circuitBreakerState
              }
            }
          } as ProviderResponse;
        }
      } catch (error) {
        if (stryMutAct_9fa48("12")) {
          {}
        } else {
          stryCov_9fa48("12");
          const duration = stryMutAct_9fa48("13") ? Date.now() + startTime : (stryCov_9fa48("13"), Date.now() - startTime);
          const errorMessage = error instanceof Error ? error.message : stryMutAct_9fa48("14") ? "" : (stryCov_9fa48("14"), 'Unknown error');
          const metrics = this.getResilienceMetrics();
          return {
            success: false,
            data: null,
            error: errorMessage,
            duration,
            provider: this.config.name,
            timestamp,
            metadata: {
              resilience: {
                retryAttempts: metrics.retryAttempts,
                circuitBreakerState: metrics.circuitBreakerState,
                timeoutOccurred: metrics.timeoutOccurred
              }
            }
          } as ProviderResponse;
        }
      }
    }
  }
  abstract getName(): string;
  abstract isHealthy(): Promise<boolean>;
}
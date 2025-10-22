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
import { BaseProvider } from './base.provider';
import { EditingProvider } from './editing.provider';
import { SeedreamEditingRequest, SeedreamEditingResponse, ProviderResponse, ProviderConfig, PROVIDER_CONFIG } from '@photoeditor/shared';
export class SeedreamProvider extends BaseProvider implements EditingProvider {
  constructor(config: ProviderConfig) {
    if (stryMutAct_9fa48("121")) {
      {}
    } else {
      stryCov_9fa48("121");
      super(stryMutAct_9fa48("122") ? {} : (stryCov_9fa48("122"), {
        ...config,
        name: stryMutAct_9fa48("123") ? "" : (stryCov_9fa48("123"), 'Seedream'),
        timeout: stryMutAct_9fa48("126") ? config.timeout && PROVIDER_CONFIG.SEEDREAM.TIMEOUT_MS : stryMutAct_9fa48("125") ? false : stryMutAct_9fa48("124") ? true : (stryCov_9fa48("124", "125", "126"), config.timeout || PROVIDER_CONFIG.SEEDREAM.TIMEOUT_MS),
        retries: stryMutAct_9fa48("129") ? config.retries && PROVIDER_CONFIG.SEEDREAM.MAX_RETRIES : stryMutAct_9fa48("128") ? false : stryMutAct_9fa48("127") ? true : (stryCov_9fa48("127", "128", "129"), config.retries || PROVIDER_CONFIG.SEEDREAM.MAX_RETRIES)
      }));
    }
  }
  async editImage(request: SeedreamEditingRequest): Promise<ProviderResponse> {
    if (stryMutAct_9fa48("130")) {
      {}
    } else {
      stryCov_9fa48("130");
      return this.makeRequest(async () => {
        if (stryMutAct_9fa48("131")) {
          {}
        } else {
          stryCov_9fa48("131");
          const response = await fetch(stryMutAct_9fa48("132") ? `` : (stryCov_9fa48("132"), `${this.config.baseUrl}/v${PROVIDER_CONFIG.SEEDREAM.VERSION}/edit`), stryMutAct_9fa48("133") ? {} : (stryCov_9fa48("133"), {
            method: stryMutAct_9fa48("134") ? "" : (stryCov_9fa48("134"), 'POST'),
            headers: stryMutAct_9fa48("135") ? {} : (stryCov_9fa48("135"), {
              'Content-Type': stryMutAct_9fa48("136") ? "" : (stryCov_9fa48("136"), 'application/json'),
              'Authorization': stryMutAct_9fa48("137") ? `` : (stryCov_9fa48("137"), `Bearer ${this.config.apiKey}`),
              'X-API-Version': PROVIDER_CONFIG.SEEDREAM.VERSION
            }),
            body: JSON.stringify(stryMutAct_9fa48("138") ? {} : (stryCov_9fa48("138"), {
              image_url: request.imageUrl,
              prompt: request.analysis,
              instructions: stryMutAct_9fa48("141") ? request.editingInstructions && 'Enhance and improve the image based on the analysis' : stryMutAct_9fa48("140") ? false : stryMutAct_9fa48("139") ? true : (stryCov_9fa48("139", "140", "141"), request.editingInstructions || (stryMutAct_9fa48("142") ? "" : (stryCov_9fa48("142"), 'Enhance and improve the image based on the analysis'))),
              quality: stryMutAct_9fa48("143") ? "" : (stryCov_9fa48("143"), 'high'),
              format: stryMutAct_9fa48("144") ? "" : (stryCov_9fa48("144"), 'jpeg')
            }))
          }));
          if (stryMutAct_9fa48("147") ? false : stryMutAct_9fa48("146") ? true : stryMutAct_9fa48("145") ? response.ok : (stryCov_9fa48("145", "146", "147"), !response.ok)) {
            if (stryMutAct_9fa48("148")) {
              {}
            } else {
              stryCov_9fa48("148");
              const errorText = await response.text();
              throw new Error(stryMutAct_9fa48("149") ? `` : (stryCov_9fa48("149"), `Seedream API error: ${response.status} ${response.statusText} - ${errorText}`));
            }
          }
          const data = (await response.json()) as {
            edited_image_url?: string;
            processing_time?: number;
            format?: string;
            quality?: string;
            dimensions?: unknown;
            credits_used?: number;
          };
          if (stryMutAct_9fa48("152") ? false : stryMutAct_9fa48("151") ? true : stryMutAct_9fa48("150") ? data.edited_image_url : (stryCov_9fa48("150", "151", "152"), !data.edited_image_url)) {
            if (stryMutAct_9fa48("153")) {
              {}
            } else {
              stryCov_9fa48("153");
              throw new Error(stryMutAct_9fa48("154") ? "" : (stryCov_9fa48("154"), 'No edited image URL returned from Seedream'));
            }
          }
          const transformed: SeedreamEditingResponse = stryMutAct_9fa48("155") ? {} : (stryCov_9fa48("155"), {
            editedImageUrl: data.edited_image_url,
            processingTime: data.processing_time,
            metadata: stryMutAct_9fa48("156") ? {} : (stryCov_9fa48("156"), {
              version: PROVIDER_CONFIG.SEEDREAM.VERSION,
              format: data.format,
              quality: data.quality,
              dimensions: data.dimensions,
              credits_used: data.credits_used
            })
          });
          return transformed;
        }
      });
    }
  }
  getName(): string {
    if (stryMutAct_9fa48("157")) {
      {}
    } else {
      stryCov_9fa48("157");
      return stryMutAct_9fa48("158") ? "" : (stryCov_9fa48("158"), 'Seedream');
    }
  }
  async isHealthy(): Promise<boolean> {
    if (stryMutAct_9fa48("159")) {
      {}
    } else {
      stryCov_9fa48("159");
      try {
        if (stryMutAct_9fa48("160")) {
          {}
        } else {
          stryCov_9fa48("160");
          const response = await fetch(stryMutAct_9fa48("161") ? `` : (stryCov_9fa48("161"), `${this.config.baseUrl}/health`), stryMutAct_9fa48("162") ? {} : (stryCov_9fa48("162"), {
            headers: stryMutAct_9fa48("163") ? {} : (stryCov_9fa48("163"), {
              'Authorization': stryMutAct_9fa48("164") ? `` : (stryCov_9fa48("164"), `Bearer ${this.config.apiKey}`)
            })
          }));
          return response.ok;
        }
      } catch {
        if (stryMutAct_9fa48("165")) {
          {}
        } else {
          stryCov_9fa48("165");
          return stryMutAct_9fa48("166") ? true : (stryCov_9fa48("166"), false);
        }
      }
    }
  }
}
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
import { AnalysisProvider } from './analysis.provider';
import { GeminiAnalysisRequest, GeminiAnalysisResponse, ProviderResponse, ProviderConfig, PROVIDER_CONFIG } from '@photoeditor/shared';
export class GeminiProvider extends BaseProvider implements AnalysisProvider {
  constructor(config: ProviderConfig) {
    if (stryMutAct_9fa48("56")) {
      {}
    } else {
      stryCov_9fa48("56");
      super(stryMutAct_9fa48("57") ? {} : (stryCov_9fa48("57"), {
        ...config,
        name: stryMutAct_9fa48("58") ? "" : (stryCov_9fa48("58"), 'Gemini'),
        timeout: stryMutAct_9fa48("61") ? config.timeout && PROVIDER_CONFIG.GEMINI.TIMEOUT_MS : stryMutAct_9fa48("60") ? false : stryMutAct_9fa48("59") ? true : (stryCov_9fa48("59", "60", "61"), config.timeout || PROVIDER_CONFIG.GEMINI.TIMEOUT_MS),
        retries: stryMutAct_9fa48("64") ? config.retries && PROVIDER_CONFIG.GEMINI.MAX_RETRIES : stryMutAct_9fa48("63") ? false : stryMutAct_9fa48("62") ? true : (stryCov_9fa48("62", "63", "64"), config.retries || PROVIDER_CONFIG.GEMINI.MAX_RETRIES)
      }));
    }
  }
  async analyzeImage(request: GeminiAnalysisRequest): Promise<ProviderResponse> {
    if (stryMutAct_9fa48("65")) {
      {}
    } else {
      stryCov_9fa48("65");
      return this.makeRequest(async () => {
        if (stryMutAct_9fa48("66")) {
          {}
        } else {
          stryCov_9fa48("66");
          const response = await fetch(stryMutAct_9fa48("67") ? `` : (stryCov_9fa48("67"), `${this.config.baseUrl}/v1/models/${PROVIDER_CONFIG.GEMINI.MODEL}:generateContent`), stryMutAct_9fa48("68") ? {} : (stryCov_9fa48("68"), {
            method: stryMutAct_9fa48("69") ? "" : (stryCov_9fa48("69"), 'POST'),
            headers: stryMutAct_9fa48("70") ? {} : (stryCov_9fa48("70"), {
              'Content-Type': stryMutAct_9fa48("71") ? "" : (stryCov_9fa48("71"), 'application/json'),
              'Authorization': stryMutAct_9fa48("72") ? `` : (stryCov_9fa48("72"), `Bearer ${this.config.apiKey}`)
            }),
            body: JSON.stringify(stryMutAct_9fa48("73") ? {} : (stryCov_9fa48("73"), {
              contents: stryMutAct_9fa48("74") ? [] : (stryCov_9fa48("74"), [stryMutAct_9fa48("75") ? {} : (stryCov_9fa48("75"), {
                parts: stryMutAct_9fa48("76") ? [] : (stryCov_9fa48("76"), [stryMutAct_9fa48("77") ? {} : (stryCov_9fa48("77"), {
                  text: stryMutAct_9fa48("80") ? request.prompt && PROVIDER_CONFIG.GEMINI.DEFAULT_PROMPT : stryMutAct_9fa48("79") ? false : stryMutAct_9fa48("78") ? true : (stryCov_9fa48("78", "79", "80"), request.prompt || PROVIDER_CONFIG.GEMINI.DEFAULT_PROMPT)
                }), stryMutAct_9fa48("81") ? {} : (stryCov_9fa48("81"), {
                  inline_data: stryMutAct_9fa48("82") ? {} : (stryCov_9fa48("82"), {
                    mime_type: stryMutAct_9fa48("83") ? "" : (stryCov_9fa48("83"), 'image/jpeg'),
                    data: await this.fetchImageAsBase64(request.imageUrl)
                  })
                })])
              })]),
              generationConfig: stryMutAct_9fa48("84") ? {} : (stryCov_9fa48("84"), {
                temperature: 0.7,
                candidateCount: 1,
                maxOutputTokens: 1000
              })
            }))
          }));
          if (stryMutAct_9fa48("87") ? false : stryMutAct_9fa48("86") ? true : stryMutAct_9fa48("85") ? response.ok : (stryCov_9fa48("85", "86", "87"), !response.ok)) {
            if (stryMutAct_9fa48("88")) {
              {}
            } else {
              stryCov_9fa48("88");
              throw new Error(stryMutAct_9fa48("89") ? `` : (stryCov_9fa48("89"), `Gemini API error: ${response.status} ${response.statusText}`));
            }
          }
          const data = (await response.json()) as {
            candidates?: Array<{
              content: {
                parts: Array<{
                  text: string;
                }>;
              };
              finishReason: string;
              safetyRatings?: unknown;
            }>;
          };
          if (stryMutAct_9fa48("92") ? !data.candidates && data.candidates.length === 0 : stryMutAct_9fa48("91") ? false : stryMutAct_9fa48("90") ? true : (stryCov_9fa48("90", "91", "92"), (stryMutAct_9fa48("93") ? data.candidates : (stryCov_9fa48("93"), !data.candidates)) || (stryMutAct_9fa48("95") ? data.candidates.length !== 0 : stryMutAct_9fa48("94") ? false : (stryCov_9fa48("94", "95"), data.candidates.length === 0)))) {
            if (stryMutAct_9fa48("96")) {
              {}
            } else {
              stryCov_9fa48("96");
              throw new Error(stryMutAct_9fa48("97") ? "" : (stryCov_9fa48("97"), 'No analysis returned from Gemini'));
            }
          }
          const analysis = data.candidates[0].content.parts[0].text;
          const confidence = (stryMutAct_9fa48("100") ? data.candidates[0].finishReason !== 'STOP' : stryMutAct_9fa48("99") ? false : stryMutAct_9fa48("98") ? true : (stryCov_9fa48("98", "99", "100"), data.candidates[0].finishReason === (stryMutAct_9fa48("101") ? "" : (stryCov_9fa48("101"), 'STOP')))) ? 0.9 : 0.7;
          const payload: GeminiAnalysisResponse = stryMutAct_9fa48("102") ? {} : (stryCov_9fa48("102"), {
            analysis,
            confidence,
            metadata: stryMutAct_9fa48("103") ? {} : (stryCov_9fa48("103"), {
              model: PROVIDER_CONFIG.GEMINI.MODEL,
              finishReason: data.candidates[0].finishReason,
              safetyRatings: data.candidates[0].safetyRatings
            })
          });
          return payload;
        }
      });
    }
  }
  private async fetchImageAsBase64(imageUrl: string): Promise<string> {
    if (stryMutAct_9fa48("104")) {
      {}
    } else {
      stryCov_9fa48("104");
      const response = await fetch(imageUrl);
      if (stryMutAct_9fa48("107") ? false : stryMutAct_9fa48("106") ? true : stryMutAct_9fa48("105") ? response.ok : (stryCov_9fa48("105", "106", "107"), !response.ok)) {
        if (stryMutAct_9fa48("108")) {
          {}
        } else {
          stryCov_9fa48("108");
          throw new Error(stryMutAct_9fa48("109") ? `` : (stryCov_9fa48("109"), `Failed to fetch image: ${response.status}`));
        }
      }
      const buffer = await response.arrayBuffer();
      return Buffer.from(buffer).toString(stryMutAct_9fa48("110") ? "" : (stryCov_9fa48("110"), 'base64'));
    }
  }
  getName(): string {
    if (stryMutAct_9fa48("111")) {
      {}
    } else {
      stryCov_9fa48("111");
      return stryMutAct_9fa48("112") ? "" : (stryCov_9fa48("112"), 'Gemini');
    }
  }
  async isHealthy(): Promise<boolean> {
    if (stryMutAct_9fa48("113")) {
      {}
    } else {
      stryCov_9fa48("113");
      try {
        if (stryMutAct_9fa48("114")) {
          {}
        } else {
          stryCov_9fa48("114");
          const response = await fetch(stryMutAct_9fa48("115") ? `` : (stryCov_9fa48("115"), `${this.config.baseUrl}/v1/models`), stryMutAct_9fa48("116") ? {} : (stryCov_9fa48("116"), {
            headers: stryMutAct_9fa48("117") ? {} : (stryCov_9fa48("117"), {
              'Authorization': stryMutAct_9fa48("118") ? `` : (stryCov_9fa48("118"), `Bearer ${this.config.apiKey}`)
            })
          }));
          return response.ok;
        }
      } catch {
        if (stryMutAct_9fa48("119")) {
          {}
        } else {
          stryCov_9fa48("119");
          return stryMutAct_9fa48("120") ? true : (stryCov_9fa48("120"), false);
        }
      }
    }
  }
}
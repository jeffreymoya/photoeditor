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
import { SNSClient, PublishCommand } from '@aws-sdk/client-sns';
import { JobStatusType, Job, BatchJob } from '@photoeditor/shared';
import { createSNSClient } from '@backend/core';
export interface NotificationPayload {
  jobId: string;
  userId: string;
  status: JobStatusType;
  message: string;
  timestamp: string;
  data?: Record<string, unknown>;
}
export interface FCMNotification {
  title: string;
  body: string;
  data: Record<string, string>;
}
export class NotificationService {
  private snsClient: SNSClient;
  private topicArn: string;
  constructor(topicArn: string, region: string, client?: SNSClient) {
    if (stryMutAct_9fa48("463")) {
      {}
    } else {
      stryCov_9fa48("463");
      this.topicArn = topicArn;
      // Use provided client or create one via factory (STANDARDS.md line 32)
      this.snsClient = stryMutAct_9fa48("466") ? client && createSNSClient(region) : stryMutAct_9fa48("465") ? false : stryMutAct_9fa48("464") ? true : (stryCov_9fa48("464", "465", "466"), client || createSNSClient(region));
    }
  }
  async sendJobStatusNotification(job: Job, previousStatus?: JobStatusType): Promise<void> {
    if (stryMutAct_9fa48("467")) {
      {}
    } else {
      stryCov_9fa48("467");
      const payload: NotificationPayload = stryMutAct_9fa48("468") ? {} : (stryCov_9fa48("468"), {
        jobId: job.jobId,
        userId: job.userId,
        status: job.status,
        message: this.getStatusMessage(job.status),
        timestamp: job.updatedAt,
        data: stryMutAct_9fa48("469") ? {} : (stryCov_9fa48("469"), {
          previousStatus,
          finalS3Key: job.finalS3Key,
          error: job.error
        })
      });
      const fcmNotification = this.buildFCMNotification(job);
      const message = stryMutAct_9fa48("470") ? {} : (stryCov_9fa48("470"), {
        default: JSON.stringify(payload),
        GCM: JSON.stringify(stryMutAct_9fa48("471") ? {} : (stryCov_9fa48("471"), {
          notification: fcmNotification,
          data: stryMutAct_9fa48("472") ? {} : (stryCov_9fa48("472"), {
            ...payload.data,
            jobId: job.jobId,
            status: job.status,
            type: stryMutAct_9fa48("473") ? "" : (stryCov_9fa48("473"), 'job_status_update')
          })
        }))
      });
      const command = new PublishCommand(stryMutAct_9fa48("474") ? {} : (stryCov_9fa48("474"), {
        TopicArn: this.topicArn,
        Message: JSON.stringify(message),
        MessageStructure: stryMutAct_9fa48("475") ? "" : (stryCov_9fa48("475"), 'json'),
        MessageAttributes: stryMutAct_9fa48("476") ? {} : (stryCov_9fa48("476"), {
          userId: stryMutAct_9fa48("477") ? {} : (stryCov_9fa48("477"), {
            DataType: stryMutAct_9fa48("478") ? "" : (stryCov_9fa48("478"), 'String'),
            StringValue: job.userId
          }),
          jobId: stryMutAct_9fa48("479") ? {} : (stryCov_9fa48("479"), {
            DataType: stryMutAct_9fa48("480") ? "" : (stryCov_9fa48("480"), 'String'),
            StringValue: job.jobId
          }),
          status: stryMutAct_9fa48("481") ? {} : (stryCov_9fa48("481"), {
            DataType: stryMutAct_9fa48("482") ? "" : (stryCov_9fa48("482"), 'String'),
            StringValue: job.status
          })
        })
      }));
      await this.snsClient.send(command);
    }
  }
  private getStatusMessage(status: JobStatusType): string {
    if (stryMutAct_9fa48("483")) {
      {}
    } else {
      stryCov_9fa48("483");
      switch (status) {
        case stryMutAct_9fa48("485") ? "" : (stryCov_9fa48("485"), 'QUEUED'):
          if (stryMutAct_9fa48("484")) {} else {
            stryCov_9fa48("484");
            return stryMutAct_9fa48("486") ? "" : (stryCov_9fa48("486"), 'Your photo has been queued for processing');
          }
        case stryMutAct_9fa48("488") ? "" : (stryCov_9fa48("488"), 'PROCESSING'):
          if (stryMutAct_9fa48("487")) {} else {
            stryCov_9fa48("487");
            return stryMutAct_9fa48("489") ? "" : (stryCov_9fa48("489"), 'Your photo is being analyzed');
          }
        case stryMutAct_9fa48("491") ? "" : (stryCov_9fa48("491"), 'EDITING'):
          if (stryMutAct_9fa48("490")) {} else {
            stryCov_9fa48("490");
            return stryMutAct_9fa48("492") ? "" : (stryCov_9fa48("492"), 'Your photo is being enhanced');
          }
        case stryMutAct_9fa48("494") ? "" : (stryCov_9fa48("494"), 'COMPLETED'):
          if (stryMutAct_9fa48("493")) {} else {
            stryCov_9fa48("493");
            return stryMutAct_9fa48("495") ? "" : (stryCov_9fa48("495"), 'Your photo has been successfully processed!');
          }
        case stryMutAct_9fa48("497") ? "" : (stryCov_9fa48("497"), 'FAILED'):
          if (stryMutAct_9fa48("496")) {} else {
            stryCov_9fa48("496");
            return stryMutAct_9fa48("498") ? "" : (stryCov_9fa48("498"), 'Sorry, there was an error processing your photo');
          }
        default:
          if (stryMutAct_9fa48("499")) {} else {
            stryCov_9fa48("499");
            return stryMutAct_9fa48("500") ? `` : (stryCov_9fa48("500"), `Job status updated to ${status}`);
          }
      }
    }
  }
  async sendJobCompletionNotification(userId: string, jobId: string, message: string): Promise<void> {
    if (stryMutAct_9fa48("501")) {
      {}
    } else {
      stryCov_9fa48("501");
      const payload: NotificationPayload = stryMutAct_9fa48("502") ? {} : (stryCov_9fa48("502"), {
        jobId,
        userId,
        status: stryMutAct_9fa48("503") ? "" : (stryCov_9fa48("503"), 'COMPLETED'),
        message,
        timestamp: new Date().toISOString()
      });
      const fcmNotification: FCMNotification = stryMutAct_9fa48("504") ? {} : (stryCov_9fa48("504"), {
        title: stryMutAct_9fa48("505") ? "" : (stryCov_9fa48("505"), 'Photo Editor - Ready!'),
        body: message,
        data: stryMutAct_9fa48("506") ? {} : (stryCov_9fa48("506"), {
          jobId,
          status: stryMutAct_9fa48("507") ? "" : (stryCov_9fa48("507"), 'COMPLETED'),
          action: stryMutAct_9fa48("508") ? "" : (stryCov_9fa48("508"), 'download')
        })
      });
      const snsMessage = stryMutAct_9fa48("509") ? {} : (stryCov_9fa48("509"), {
        default: JSON.stringify(payload),
        GCM: JSON.stringify(stryMutAct_9fa48("510") ? {} : (stryCov_9fa48("510"), {
          notification: fcmNotification,
          data: stryMutAct_9fa48("511") ? {} : (stryCov_9fa48("511"), {
            jobId,
            userId,
            status: stryMutAct_9fa48("512") ? "" : (stryCov_9fa48("512"), 'COMPLETED'),
            type: stryMutAct_9fa48("513") ? "" : (stryCov_9fa48("513"), 'job_completion')
          })
        }))
      });
      const command = new PublishCommand(stryMutAct_9fa48("514") ? {} : (stryCov_9fa48("514"), {
        TopicArn: this.topicArn,
        Message: JSON.stringify(snsMessage),
        MessageStructure: stryMutAct_9fa48("515") ? "" : (stryCov_9fa48("515"), 'json'),
        MessageAttributes: stryMutAct_9fa48("516") ? {} : (stryCov_9fa48("516"), {
          userId: stryMutAct_9fa48("517") ? {} : (stryCov_9fa48("517"), {
            DataType: stryMutAct_9fa48("518") ? "" : (stryCov_9fa48("518"), 'String'),
            StringValue: userId
          }),
          jobId: stryMutAct_9fa48("519") ? {} : (stryCov_9fa48("519"), {
            DataType: stryMutAct_9fa48("520") ? "" : (stryCov_9fa48("520"), 'String'),
            StringValue: jobId
          }),
          status: stryMutAct_9fa48("521") ? {} : (stryCov_9fa48("521"), {
            DataType: stryMutAct_9fa48("522") ? "" : (stryCov_9fa48("522"), 'String'),
            StringValue: stryMutAct_9fa48("523") ? "" : (stryCov_9fa48("523"), 'COMPLETED')
          })
        })
      }));
      await this.snsClient.send(command);
    }
  }
  async sendBatchJobCompletionNotification(batchJob: BatchJob): Promise<void> {
    if (stryMutAct_9fa48("524")) {
      {}
    } else {
      stryCov_9fa48("524");
      const payload: NotificationPayload = stryMutAct_9fa48("525") ? {} : (stryCov_9fa48("525"), {
        jobId: batchJob.batchJobId,
        // Use batchJobId as jobId for consistency
        userId: batchJob.userId,
        status: stryMutAct_9fa48("526") ? "" : (stryCov_9fa48("526"), 'COMPLETED'),
        message: stryMutAct_9fa48("527") ? `` : (stryCov_9fa48("527"), `All ${batchJob.totalCount} photos have been processed successfully!`),
        timestamp: batchJob.updatedAt,
        data: stryMutAct_9fa48("528") ? {} : (stryCov_9fa48("528"), {
          batchJobId: batchJob.batchJobId,
          totalCount: batchJob.totalCount,
          sharedPrompt: batchJob.sharedPrompt
        })
      });
      const fcmNotification: FCMNotification = stryMutAct_9fa48("529") ? {} : (stryCov_9fa48("529"), {
        title: stryMutAct_9fa48("530") ? "" : (stryCov_9fa48("530"), 'Photo Editor - Batch Complete!'),
        body: stryMutAct_9fa48("531") ? `` : (stryCov_9fa48("531"), `All ${batchJob.totalCount} photos are ready for download`),
        data: stryMutAct_9fa48("532") ? {} : (stryCov_9fa48("532"), {
          batchJobId: batchJob.batchJobId,
          status: stryMutAct_9fa48("533") ? "" : (stryCov_9fa48("533"), 'COMPLETED'),
          action: stryMutAct_9fa48("534") ? "" : (stryCov_9fa48("534"), 'view_batch'),
          totalCount: batchJob.totalCount.toString()
        })
      });
      const snsMessage = stryMutAct_9fa48("535") ? {} : (stryCov_9fa48("535"), {
        default: JSON.stringify(payload),
        GCM: JSON.stringify(stryMutAct_9fa48("536") ? {} : (stryCov_9fa48("536"), {
          notification: fcmNotification,
          data: stryMutAct_9fa48("537") ? {} : (stryCov_9fa48("537"), {
            ...fcmNotification.data,
            type: stryMutAct_9fa48("538") ? "" : (stryCov_9fa48("538"), 'batch_completion')
          })
        }))
      });
      const command = new PublishCommand(stryMutAct_9fa48("539") ? {} : (stryCov_9fa48("539"), {
        TopicArn: this.topicArn,
        Message: JSON.stringify(snsMessage),
        MessageStructure: stryMutAct_9fa48("540") ? "" : (stryCov_9fa48("540"), 'json'),
        MessageAttributes: stryMutAct_9fa48("541") ? {} : (stryCov_9fa48("541"), {
          userId: stryMutAct_9fa48("542") ? {} : (stryCov_9fa48("542"), {
            DataType: stryMutAct_9fa48("543") ? "" : (stryCov_9fa48("543"), 'String'),
            StringValue: batchJob.userId
          }),
          batchJobId: stryMutAct_9fa48("544") ? {} : (stryCov_9fa48("544"), {
            DataType: stryMutAct_9fa48("545") ? "" : (stryCov_9fa48("545"), 'String'),
            StringValue: batchJob.batchJobId
          }),
          status: stryMutAct_9fa48("546") ? {} : (stryCov_9fa48("546"), {
            DataType: stryMutAct_9fa48("547") ? "" : (stryCov_9fa48("547"), 'String'),
            StringValue: stryMutAct_9fa48("548") ? "" : (stryCov_9fa48("548"), 'COMPLETED')
          })
        })
      }));
      await this.snsClient.send(command);
    }
  }
  private buildFCMNotification(job: Job): FCMNotification {
    if (stryMutAct_9fa48("549")) {
      {}
    } else {
      stryCov_9fa48("549");
      const baseTitle = stryMutAct_9fa48("550") ? "" : (stryCov_9fa48("550"), 'Photo Editor');
      switch (job.status) {
        case stryMutAct_9fa48("552") ? "" : (stryCov_9fa48("552"), 'COMPLETED'):
          if (stryMutAct_9fa48("551")) {} else {
            stryCov_9fa48("551");
            return stryMutAct_9fa48("553") ? {} : (stryCov_9fa48("553"), {
              title: stryMutAct_9fa48("554") ? `` : (stryCov_9fa48("554"), `${baseTitle} - Ready!`),
              body: stryMutAct_9fa48("555") ? "" : (stryCov_9fa48("555"), 'Your enhanced photo is ready to download'),
              data: stryMutAct_9fa48("556") ? {} : (stryCov_9fa48("556"), {
                jobId: job.jobId,
                status: job.status,
                action: stryMutAct_9fa48("557") ? "" : (stryCov_9fa48("557"), 'download')
              })
            });
          }
        case stryMutAct_9fa48("559") ? "" : (stryCov_9fa48("559"), 'FAILED'):
          if (stryMutAct_9fa48("558")) {} else {
            stryCov_9fa48("558");
            return stryMutAct_9fa48("560") ? {} : (stryCov_9fa48("560"), {
              title: stryMutAct_9fa48("561") ? `` : (stryCov_9fa48("561"), `${baseTitle} - Error`),
              body: stryMutAct_9fa48("564") ? job.error && 'There was an error processing your photo' : stryMutAct_9fa48("563") ? false : stryMutAct_9fa48("562") ? true : (stryCov_9fa48("562", "563", "564"), job.error || (stryMutAct_9fa48("565") ? "" : (stryCov_9fa48("565"), 'There was an error processing your photo'))),
              data: stryMutAct_9fa48("566") ? {} : (stryCov_9fa48("566"), {
                jobId: job.jobId,
                status: job.status,
                action: stryMutAct_9fa48("567") ? "" : (stryCov_9fa48("567"), 'retry')
              })
            });
          }
        case stryMutAct_9fa48("569") ? "" : (stryCov_9fa48("569"), 'PROCESSING'):
          if (stryMutAct_9fa48("568")) {} else {
            stryCov_9fa48("568");
            return stryMutAct_9fa48("570") ? {} : (stryCov_9fa48("570"), {
              title: stryMutAct_9fa48("571") ? `` : (stryCov_9fa48("571"), `${baseTitle} - Processing`),
              body: stryMutAct_9fa48("572") ? "" : (stryCov_9fa48("572"), 'Analyzing your photo...'),
              data: stryMutAct_9fa48("573") ? {} : (stryCov_9fa48("573"), {
                jobId: job.jobId,
                status: job.status,
                action: stryMutAct_9fa48("574") ? "" : (stryCov_9fa48("574"), 'none')
              })
            });
          }
        case stryMutAct_9fa48("576") ? "" : (stryCov_9fa48("576"), 'EDITING'):
          if (stryMutAct_9fa48("575")) {} else {
            stryCov_9fa48("575");
            return stryMutAct_9fa48("577") ? {} : (stryCov_9fa48("577"), {
              title: stryMutAct_9fa48("578") ? `` : (stryCov_9fa48("578"), `${baseTitle} - Enhancing`),
              body: stryMutAct_9fa48("579") ? "" : (stryCov_9fa48("579"), 'Applying enhancements to your photo...'),
              data: stryMutAct_9fa48("580") ? {} : (stryCov_9fa48("580"), {
                jobId: job.jobId,
                status: job.status,
                action: stryMutAct_9fa48("581") ? "" : (stryCov_9fa48("581"), 'none')
              })
            });
          }
        default:
          if (stryMutAct_9fa48("582")) {} else {
            stryCov_9fa48("582");
            return stryMutAct_9fa48("583") ? {} : (stryCov_9fa48("583"), {
              title: baseTitle,
              body: this.getStatusMessage(job.status),
              data: stryMutAct_9fa48("584") ? {} : (stryCov_9fa48("584"), {
                jobId: job.jobId,
                status: job.status,
                action: stryMutAct_9fa48("585") ? "" : (stryCov_9fa48("585"), 'none')
              })
            });
          }
      }
    }
  }
}
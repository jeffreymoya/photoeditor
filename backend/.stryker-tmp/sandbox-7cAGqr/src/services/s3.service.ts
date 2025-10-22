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
import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Config, S3KeyStrategy, S3Object, PresignedUpload, APP_CONFIG } from '@photoeditor/shared';
import sharp from 'sharp';
import { createS3Client } from '@backend/core';
export class S3KeyStrategyImpl implements S3KeyStrategy {
  generateTempKey(userId: string, jobId: string, fileName: string): string {
    if (stryMutAct_9fa48("607")) {
      {}
    } else {
      stryCov_9fa48("607");
      const timestamp = Date.now();
      const sanitizedFileName = fileName.replace(stryMutAct_9fa48("608") ? /[a-zA-Z0-9.-]/g : (stryCov_9fa48("608"), /[^a-zA-Z0-9.-]/g), stryMutAct_9fa48("609") ? "" : (stryCov_9fa48("609"), '_'));
      return stryMutAct_9fa48("610") ? `` : (stryCov_9fa48("610"), `uploads/${userId}/${jobId}/${timestamp}-${sanitizedFileName}`);
    }
  }
  generateFinalKey(userId: string, jobId: string, fileName: string): string {
    if (stryMutAct_9fa48("611")) {
      {}
    } else {
      stryCov_9fa48("611");
      const sanitizedFileName = fileName.replace(stryMutAct_9fa48("612") ? /[a-zA-Z0-9.-]/g : (stryCov_9fa48("612"), /[^a-zA-Z0-9.-]/g), stryMutAct_9fa48("613") ? "" : (stryCov_9fa48("613"), '_'));
      return stryMutAct_9fa48("614") ? `` : (stryCov_9fa48("614"), `final/${userId}/${jobId}/${sanitizedFileName}`);
    }
  }
  parseTempKey(key: string): {
    userId: string;
    jobId: string;
    fileName: string;
  } | null {
    if (stryMutAct_9fa48("615")) {
      {}
    } else {
      stryCov_9fa48("615");
      const match = key.match(stryMutAct_9fa48("624") ? /^uploads\/([^/]+)\/([^/]+)\/\d+-(.)$/ : stryMutAct_9fa48("623") ? /^uploads\/([^/]+)\/([^/]+)\/\D+-(.+)$/ : stryMutAct_9fa48("622") ? /^uploads\/([^/]+)\/([^/]+)\/\d-(.+)$/ : stryMutAct_9fa48("621") ? /^uploads\/([^/]+)\/([/]+)\/\d+-(.+)$/ : stryMutAct_9fa48("620") ? /^uploads\/([^/]+)\/([^/])\/\d+-(.+)$/ : stryMutAct_9fa48("619") ? /^uploads\/([/]+)\/([^/]+)\/\d+-(.+)$/ : stryMutAct_9fa48("618") ? /^uploads\/([^/])\/([^/]+)\/\d+-(.+)$/ : stryMutAct_9fa48("617") ? /^uploads\/([^/]+)\/([^/]+)\/\d+-(.+)/ : stryMutAct_9fa48("616") ? /uploads\/([^/]+)\/([^/]+)\/\d+-(.+)$/ : (stryCov_9fa48("616", "617", "618", "619", "620", "621", "622", "623", "624"), /^uploads\/([^/]+)\/([^/]+)\/\d+-(.+)$/));
      if (stryMutAct_9fa48("627") ? false : stryMutAct_9fa48("626") ? true : stryMutAct_9fa48("625") ? match : (stryCov_9fa48("625", "626", "627"), !match)) return null;
      return stryMutAct_9fa48("628") ? {} : (stryCov_9fa48("628"), {
        userId: match[1],
        jobId: match[2],
        fileName: match[3]
      });
    }
  }
  parseFinalKey(key: string): {
    userId: string;
    jobId: string;
    fileName: string;
  } | null {
    if (stryMutAct_9fa48("629")) {
      {}
    } else {
      stryCov_9fa48("629");
      const match = key.match(stryMutAct_9fa48("636") ? /^final\/([^/]+)\/([^/]+)\/(.)$/ : stryMutAct_9fa48("635") ? /^final\/([^/]+)\/([/]+)\/(.+)$/ : stryMutAct_9fa48("634") ? /^final\/([^/]+)\/([^/])\/(.+)$/ : stryMutAct_9fa48("633") ? /^final\/([/]+)\/([^/]+)\/(.+)$/ : stryMutAct_9fa48("632") ? /^final\/([^/])\/([^/]+)\/(.+)$/ : stryMutAct_9fa48("631") ? /^final\/([^/]+)\/([^/]+)\/(.+)/ : stryMutAct_9fa48("630") ? /final\/([^/]+)\/([^/]+)\/(.+)$/ : (stryCov_9fa48("630", "631", "632", "633", "634", "635", "636"), /^final\/([^/]+)\/([^/]+)\/(.+)$/));
      if (stryMutAct_9fa48("639") ? false : stryMutAct_9fa48("638") ? true : stryMutAct_9fa48("637") ? match : (stryCov_9fa48("637", "638", "639"), !match)) return null;
      return stryMutAct_9fa48("640") ? {} : (stryCov_9fa48("640"), {
        userId: match[1],
        jobId: match[2],
        fileName: match[3]
      });
    }
  }
}
export class S3Service {
  private client: S3Client;
  private config: S3Config;
  private keyStrategy: S3KeyStrategy;
  constructor(config: S3Config, client?: S3Client) {
    if (stryMutAct_9fa48("641")) {
      {}
    } else {
      stryCov_9fa48("641");
      this.config = config;
      // Use provided client or create one via factory (STANDARDS.md line 26)
      this.client = stryMutAct_9fa48("644") ? client && createS3Client(config.region) : stryMutAct_9fa48("643") ? false : stryMutAct_9fa48("642") ? true : (stryCov_9fa48("642", "643", "644"), client || createS3Client(config.region));
      this.keyStrategy = new S3KeyStrategyImpl();
    }
  }
  async generatePresignedUpload(userId: string, jobId: string, fileName: string, contentType: string): Promise<PresignedUpload> {
    if (stryMutAct_9fa48("645")) {
      {}
    } else {
      stryCov_9fa48("645");
      const key = this.keyStrategy.generateTempKey(userId, jobId, fileName);
      const command = new PutObjectCommand(stryMutAct_9fa48("646") ? {} : (stryCov_9fa48("646"), {
        Bucket: this.config.tempBucket,
        Key: key,
        ContentType: contentType,
        ServerSideEncryption: stryMutAct_9fa48("647") ? "" : (stryCov_9fa48("647"), 'AES256'),
        Metadata: stryMutAct_9fa48("648") ? {} : (stryCov_9fa48("648"), {
          userId,
          jobId,
          uploadedAt: new Date().toISOString()
        })
      }));
      const url = await getSignedUrl(this.client, command, stryMutAct_9fa48("649") ? {} : (stryCov_9fa48("649"), {
        expiresIn: this.config.presignExpiration
      }));
      const expiresAt = new Date(stryMutAct_9fa48("650") ? Date.now() - this.config.presignExpiration * 1000 : (stryCov_9fa48("650"), Date.now() + (stryMutAct_9fa48("651") ? this.config.presignExpiration / 1000 : (stryCov_9fa48("651"), this.config.presignExpiration * 1000))));
      return stryMutAct_9fa48("652") ? {} : (stryCov_9fa48("652"), {
        url,
        fields: stryMutAct_9fa48("653") ? {} : (stryCov_9fa48("653"), {
          bucket: this.config.tempBucket,
          key,
          'Content-Type': contentType
        }),
        expiresAt
      });
    }
  }
  async generatePresignedDownload(bucket: string, key: string, expiresIn: number = 3600): Promise<string> {
    if (stryMutAct_9fa48("654")) {
      {}
    } else {
      stryCov_9fa48("654");
      const command = new GetObjectCommand(stryMutAct_9fa48("655") ? {} : (stryCov_9fa48("655"), {
        Bucket: bucket,
        Key: key
      }));
      return getSignedUrl(this.client, command, stryMutAct_9fa48("656") ? {} : (stryCov_9fa48("656"), {
        expiresIn
      }));
    }
  }
  async copyObject(sourceBucket: string, sourceKey: string, destBucket: string, destKey: string): Promise<void> {
    if (stryMutAct_9fa48("657")) {
      {}
    } else {
      stryCov_9fa48("657");
      const command = new CopyObjectCommand(stryMutAct_9fa48("658") ? {} : (stryCov_9fa48("658"), {
        Bucket: destBucket,
        Key: destKey,
        CopySource: stryMutAct_9fa48("659") ? `` : (stryCov_9fa48("659"), `${sourceBucket}/${sourceKey}`),
        ServerSideEncryption: stryMutAct_9fa48("660") ? "" : (stryCov_9fa48("660"), 'aws:kms'),
        SSEKMSKeyId: process.env.KMS_KEY_ID,
        Metadata: stryMutAct_9fa48("661") ? {} : (stryCov_9fa48("661"), {
          processedAt: new Date().toISOString(),
          source: stryMutAct_9fa48("662") ? "" : (stryCov_9fa48("662"), 'photo-editor')
        }),
        MetadataDirective: stryMutAct_9fa48("663") ? "" : (stryCov_9fa48("663"), 'REPLACE')
      }));
      await this.client.send(command);
    }
  }
  async uploadObject(bucket: string, key: string, buffer: Buffer, contentType: string): Promise<void> {
    if (stryMutAct_9fa48("664")) {
      {}
    } else {
      stryCov_9fa48("664");
      const command = new PutObjectCommand(stryMutAct_9fa48("665") ? {} : (stryCov_9fa48("665"), {
        Bucket: bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ServerSideEncryption: stryMutAct_9fa48("666") ? "" : (stryCov_9fa48("666"), 'AES256'),
        Metadata: stryMutAct_9fa48("667") ? {} : (stryCov_9fa48("667"), {
          processedAt: new Date().toISOString(),
          source: stryMutAct_9fa48("668") ? "" : (stryCov_9fa48("668"), 'photo-editor')
        })
      }));
      await this.client.send(command);
    }
  }
  async deleteObject(bucket: string, key: string): Promise<void> {
    if (stryMutAct_9fa48("669")) {
      {}
    } else {
      stryCov_9fa48("669");
      const command = new DeleteObjectCommand(stryMutAct_9fa48("670") ? {} : (stryCov_9fa48("670"), {
        Bucket: bucket,
        Key: key
      }));
      await this.client.send(command);
    }
  }
  async optimizeAndUploadImage(sourceBucket: string, sourceKey: string, destBucket: string, destKey: string): Promise<void> {
    if (stryMutAct_9fa48("671")) {
      {}
    } else {
      stryCov_9fa48("671");
      // Download the original image
      const getCommand = new GetObjectCommand(stryMutAct_9fa48("672") ? {} : (stryCov_9fa48("672"), {
        Bucket: sourceBucket,
        Key: sourceKey
      }));
      const response = await this.client.send(getCommand);
      const imageBuffer = await this.streamToBuffer(response.Body as NodeJS.ReadableStream);

      // Optimize the image using Sharp
      const optimizedBuffer = await sharp(imageBuffer).resize(APP_CONFIG.MAX_IMAGE_DIMENSION, APP_CONFIG.MAX_IMAGE_DIMENSION, stryMutAct_9fa48("673") ? {} : (stryCov_9fa48("673"), {
        fit: stryMutAct_9fa48("674") ? "" : (stryCov_9fa48("674"), 'inside'),
        withoutEnlargement: stryMutAct_9fa48("675") ? false : (stryCov_9fa48("675"), true)
      })).jpeg(stryMutAct_9fa48("676") ? {} : (stryCov_9fa48("676"), {
        quality: Math.round(stryMutAct_9fa48("677") ? APP_CONFIG.JPEG_QUALITY / 100 : (stryCov_9fa48("677"), APP_CONFIG.JPEG_QUALITY * 100)),
        progressive: stryMutAct_9fa48("678") ? false : (stryCov_9fa48("678"), true),
        mozjpeg: stryMutAct_9fa48("679") ? false : (stryCov_9fa48("679"), true)
      })).toBuffer();

      // Upload the optimized image
      await this.uploadObject(destBucket, destKey, optimizedBuffer, stryMutAct_9fa48("680") ? "" : (stryCov_9fa48("680"), 'image/jpeg'));
    }
  }
  private async streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    if (stryMutAct_9fa48("681")) {
      {}
    } else {
      stryCov_9fa48("681");
      const chunks: Buffer[] = stryMutAct_9fa48("682") ? ["Stryker was here"] : (stryCov_9fa48("682"), []);
      return new Promise((resolve, reject) => {
        if (stryMutAct_9fa48("683")) {
          {}
        } else {
          stryCov_9fa48("683");
          stream.on(stryMutAct_9fa48("684") ? "" : (stryCov_9fa48("684"), 'data'), stryMutAct_9fa48("685") ? () => undefined : (stryCov_9fa48("685"), (chunk: Buffer) => chunks.push(chunk)));
          stream.on(stryMutAct_9fa48("686") ? "" : (stryCov_9fa48("686"), 'error'), reject);
          stream.on(stryMutAct_9fa48("687") ? "" : (stryCov_9fa48("687"), 'end'), stryMutAct_9fa48("688") ? () => undefined : (stryCov_9fa48("688"), () => resolve(Buffer.concat(chunks))));
        }
      });
    }
  }
  async getObjectInfo(bucket: string, key: string): Promise<S3Object | null> {
    if (stryMutAct_9fa48("689")) {
      {}
    } else {
      stryCov_9fa48("689");
      try {
        if (stryMutAct_9fa48("690")) {
          {}
        } else {
          stryCov_9fa48("690");
          const command = new GetObjectCommand(stryMutAct_9fa48("691") ? {} : (stryCov_9fa48("691"), {
            Bucket: bucket,
            Key: key
          }));
          const response = await this.client.send(command);
          const result: S3Object = stryMutAct_9fa48("692") ? {} : (stryCov_9fa48("692"), {
            bucket,
            key
          });
          if (stryMutAct_9fa48("694") ? false : stryMutAct_9fa48("693") ? true : (stryCov_9fa48("693", "694"), response.ETag)) result.etag = response.ETag;
          if (stryMutAct_9fa48("696") ? false : stryMutAct_9fa48("695") ? true : (stryCov_9fa48("695", "696"), response.ContentLength)) result.size = response.ContentLength;
          if (stryMutAct_9fa48("698") ? false : stryMutAct_9fa48("697") ? true : (stryCov_9fa48("697", "698"), response.LastModified)) result.lastModified = response.LastModified;
          if (stryMutAct_9fa48("700") ? false : stryMutAct_9fa48("699") ? true : (stryCov_9fa48("699", "700"), response.ContentType)) result.contentType = response.ContentType;
          return result;
        }
      } catch (error) {
        if (stryMutAct_9fa48("701")) {
          {}
        } else {
          stryCov_9fa48("701");
          if (stryMutAct_9fa48("704") ? (error as {
            name: string;
          }).name !== 'NoSuchKey' : stryMutAct_9fa48("703") ? false : stryMutAct_9fa48("702") ? true : (stryCov_9fa48("702", "703", "704"), (error as {
            name: string;
          }).name === (stryMutAct_9fa48("705") ? "" : (stryCov_9fa48("705"), 'NoSuchKey')))) {
            if (stryMutAct_9fa48("706")) {
              {}
            } else {
              stryCov_9fa48("706");
              return null;
            }
          }
          throw error;
        }
      }
    }
  }
  getKeyStrategy(): S3KeyStrategy {
    if (stryMutAct_9fa48("707")) {
      {}
    } else {
      stryCov_9fa48("707");
      return this.keyStrategy;
    }
  }
  getTempBucket(): string {
    if (stryMutAct_9fa48("708")) {
      {}
    } else {
      stryCov_9fa48("708");
      return this.config.tempBucket;
    }
  }
  getFinalBucket(): string {
    if (stryMutAct_9fa48("709")) {
      {}
    } else {
      stryCov_9fa48("709");
      return this.config.finalBucket;
    }
  }
}
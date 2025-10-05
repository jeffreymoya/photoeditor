import { S3Client, GetObjectCommand, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { S3Config, S3KeyStrategy, S3Object, PresignedUpload, APP_CONFIG } from '@photoeditor/shared';
import sharp from 'sharp';
import { createS3Client } from '../libs/aws-clients';

export class S3KeyStrategyImpl implements S3KeyStrategy {
  generateTempKey(userId: string, jobId: string, fileName: string): string {
    const timestamp = Date.now();
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `uploads/${userId}/${jobId}/${timestamp}-${sanitizedFileName}`;
  }

  generateFinalKey(userId: string, jobId: string, fileName: string): string {
    const sanitizedFileName = fileName.replace(/[^a-zA-Z0-9.-]/g, '_');
    return `final/${userId}/${jobId}/${sanitizedFileName}`;
  }

  parseTempKey(key: string): { userId: string; jobId: string; fileName: string } | null {
    const match = key.match(/^uploads\/([^/]+)\/([^/]+)\/\d+-(.+)$/);
    if (!match) return null;

    return {
      userId: match[1],
      jobId: match[2],
      fileName: match[3]
    };
  }

  parseFinalKey(key: string): { userId: string; jobId: string; fileName: string } | null {
    const match = key.match(/^final\/([^/]+)\/([^/]+)\/(.+)$/);
    if (!match) return null;

    return {
      userId: match[1],
      jobId: match[2],
      fileName: match[3]
    };
  }
}

export class S3Service {
  private client: S3Client;
  private config: S3Config;
  private keyStrategy: S3KeyStrategy;

  constructor(config: S3Config, client?: S3Client) {
    this.config = config;
    // Use provided client or create one via factory (STANDARDS.md line 26)
    this.client = client || createS3Client(config.region);
    this.keyStrategy = new S3KeyStrategyImpl();
  }

  async generatePresignedUpload(
    userId: string,
    jobId: string,
    fileName: string,
    contentType: string
  ): Promise<PresignedUpload> {
    const key = this.keyStrategy.generateTempKey(userId, jobId, fileName);

    const command = new PutObjectCommand({
      Bucket: this.config.tempBucket,
      Key: key,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
      Metadata: {
        userId,
        jobId,
        uploadedAt: new Date().toISOString()
      }
    });

    const url = await getSignedUrl(this.client, command, {
      expiresIn: this.config.presignExpiration
    });

    const expiresAt = new Date(Date.now() + this.config.presignExpiration * 1000);

    return {
      url,
      fields: {
        bucket: this.config.tempBucket,
        key,
        'Content-Type': contentType
      },
      expiresAt
    };
  }

  async generatePresignedDownload(bucket: string, key: string, expiresIn: number = 3600): Promise<string> {
    const command = new GetObjectCommand({
      Bucket: bucket,
      Key: key
    });

    return getSignedUrl(this.client, command, { expiresIn });
  }

  async copyObject(sourceBucket: string, sourceKey: string, destBucket: string, destKey: string): Promise<void> {
    const command = new CopyObjectCommand({
      Bucket: destBucket,
      Key: destKey,
      CopySource: `${sourceBucket}/${sourceKey}`,
      ServerSideEncryption: 'aws:kms',
      SSEKMSKeyId: process.env.KMS_KEY_ID,
      Metadata: {
        processedAt: new Date().toISOString(),
        source: 'photo-editor'
      },
      MetadataDirective: 'REPLACE'
    });

    await this.client.send(command);
  }

  async uploadObject(bucket: string, key: string, buffer: Buffer, contentType: string): Promise<void> {
    const command = new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
      ServerSideEncryption: 'AES256',
      Metadata: {
        processedAt: new Date().toISOString(),
        source: 'photo-editor'
      }
    });

    await this.client.send(command);
  }

  async deleteObject(bucket: string, key: string): Promise<void> {
    const command = new DeleteObjectCommand({
      Bucket: bucket,
      Key: key
    });

    await this.client.send(command);
  }

  async optimizeAndUploadImage(sourceBucket: string, sourceKey: string, destBucket: string, destKey: string): Promise<void> {
    // Download the original image
    const getCommand = new GetObjectCommand({
      Bucket: sourceBucket,
      Key: sourceKey
    });

    const response = await this.client.send(getCommand);
    const imageBuffer = await this.streamToBuffer(response.Body as NodeJS.ReadableStream);

    // Optimize the image using Sharp
    const optimizedBuffer = await sharp(imageBuffer)
      .resize(APP_CONFIG.MAX_IMAGE_DIMENSION, APP_CONFIG.MAX_IMAGE_DIMENSION, {
        fit: 'inside',
        withoutEnlargement: true
      })
      .jpeg({
        quality: Math.round(APP_CONFIG.JPEG_QUALITY * 100),
        progressive: true,
        mozjpeg: true
      })
      .toBuffer();

    // Upload the optimized image
    await this.uploadObject(destBucket, destKey, optimizedBuffer, 'image/jpeg');
  }

  private async streamToBuffer(stream: NodeJS.ReadableStream): Promise<Buffer> {
    const chunks: Buffer[] = [];
    return new Promise((resolve, reject) => {
      stream.on('data', (chunk: Buffer) => chunks.push(chunk));
      stream.on('error', reject);
      stream.on('end', () => resolve(Buffer.concat(chunks)));
    });
  }

  async getObjectInfo(bucket: string, key: string): Promise<S3Object | null> {
    try {
      const command = new GetObjectCommand({
        Bucket: bucket,
        Key: key
      });

      const response = await this.client.send(command);

      const result: S3Object = { bucket, key };
      if (response.ETag) result.etag = response.ETag;
      if (response.ContentLength) result.size = response.ContentLength;
      if (response.LastModified) result.lastModified = response.LastModified;
      if (response.ContentType) result.contentType = response.ContentType;
      return result;
    } catch (error) {
      if ((error as { name: string }).name === 'NoSuchKey') {
        return null;
      }
      throw error;
    }
  }

  getKeyStrategy(): S3KeyStrategy {
    return this.keyStrategy;
  }

  getTempBucket(): string {
    return this.config.tempBucket;
  }

  getFinalBucket(): string {
    return this.config.finalBucket;
  }
}
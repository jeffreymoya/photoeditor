/**
 * S3 E2E Test Adapter
 *
 * Provides S3 operations for E2E tests following handlers→services→adapters pattern.
 * Complexity: ≤5, LOC: ≤75 per STANDARDS.md line 36
 */

import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { createS3Client } from '../../../src/libs/aws-clients';
import * as fs from 'fs';

export class S3TestAdapter {
  private client: S3Client;

  constructor() {
    this.client = createS3Client();
  }

  /**
   * Upload file to S3 bucket (CC=1)
   */
  async uploadFile(bucket: string, key: string, filePath: string, contentType: string): Promise<void> {
    const fileContent = fs.readFileSync(filePath);
    await this.client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: fileContent,
      ContentType: contentType
    }));
  }

  /**
   * Upload file content directly (CC=1)
   */
  async uploadContent(bucket: string, key: string, content: Buffer, contentType: string): Promise<void> {
    await this.client.send(new PutObjectCommand({
      Bucket: bucket,
      Key: key,
      Body: content,
      ContentType: contentType
    }));
  }

  /**
   * Check if object exists in S3 (CC=2)
   */
  async objectExists(bucket: string, key: string): Promise<boolean> {
    try {
      await this.client.send(new HeadObjectCommand({
        Bucket: bucket,
        Key: key
      }));
      return true;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get object from S3 (CC=1)
   */
  async getObject(bucket: string, key: string): Promise<Buffer> {
    const response = await this.client.send(new GetObjectCommand({
      Bucket: bucket,
      Key: key
    }));

    const chunks: Uint8Array[] = [];
    for await (const chunk of response.Body as any) {
      chunks.push(chunk);
    }
    return Buffer.concat(chunks);
  }
}

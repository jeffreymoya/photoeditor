/**
 * S3 Operation Spy for Integration Tests
 *
 * Tracks S3 operations (uploads, deletes, copies) for assertion in tests.
 * Provides deterministic control over S3 operations without network calls.
 *
 * Per STANDARDS.md line 26: Services obtain clients via DI/factory pattern
 * Per testing-standards.md: Control timers and randomness for deterministic assertions
 */
// @ts-nocheck


import { S3Client, PutObjectCommand, DeleteObjectCommand, CopyObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { mockClient } from 'aws-sdk-client-mock';

export interface S3Operation {
  type: 'put' | 'delete' | 'copy' | 'get';
  bucket: string;
  key: string;
  timestamp: number;
  metadata?: Record<string, unknown>;
}

export interface S3CopyOperation extends S3Operation {
  type: 'copy';
  sourceBucket: string;
  sourceKey: string;
  destBucket: string;
  destKey: string;
}

export interface S3PutOperation extends S3Operation {
  type: 'put';
  contentType?: string;
  bodySize?: number;
}

/**
 * S3 client mock with operation tracking
 */
export class S3Spy {
  private operations: S3Operation[] = [];
  private mockS3: ReturnType<typeof mockClient>;

  constructor() {
    this.mockS3 = mockClient(S3Client);
    this.setupMocks();
  }

  private setupMocks(): void {
    // Mock PutObjectCommand
    this.mockS3.on(PutObjectCommand).callsFake((input) => {
      const operation: S3PutOperation = {
        type: 'put',
        bucket: input.Bucket!,
        key: input.Key!,
        timestamp: Date.now(),
        contentType: input.ContentType,
        bodySize: input.Body ? Buffer.byteLength(input.Body as Buffer) : 0,
        metadata: input.Metadata
      };
      this.operations.push(operation);

      return Promise.resolve({
        ETag: `"${Date.now()}"`,
        VersionId: 'test-version-id'
      });
    });

    // Mock DeleteObjectCommand
    this.mockS3.on(DeleteObjectCommand).callsFake((input) => {
      const operation: S3Operation = {
        type: 'delete',
        bucket: input.Bucket!,
        key: input.Key!,
        timestamp: Date.now()
      };
      this.operations.push(operation);

      return Promise.resolve({
        DeleteMarker: false,
        VersionId: 'test-version-id'
      });
    });

    // Mock CopyObjectCommand
    this.mockS3.on(CopyObjectCommand).callsFake((input) => {
      const copySource = input.CopySource!;
      const [sourceBucket, ...sourceKeyParts] = copySource.split('/');
      const sourceKey = sourceKeyParts.join('/');

      const operation: S3CopyOperation = {
        type: 'copy',
        bucket: input.Bucket!,
        key: input.Key!,
        sourceBucket,
        sourceKey,
        destBucket: input.Bucket!,
        destKey: input.Key!,
        timestamp: Date.now(),
        metadata: input.Metadata
      };
      this.operations.push(operation);

      return Promise.resolve({
        CopyObjectResult: {
          ETag: `"${Date.now()}"`,
          LastModified: new Date()
        }
      });
    });

    // Mock GetObjectCommand
    this.mockS3.on(GetObjectCommand).callsFake((input) => {
      const operation: S3Operation = {
        type: 'get',
        bucket: input.Bucket!,
        key: input.Key!,
        timestamp: Date.now()
      };
      this.operations.push(operation);

      // Return a mock image buffer
      const mockImageBuffer = Buffer.from('fake-image-data');
      const stream = require('stream');
      const readable = new stream.Readable();
      readable.push(mockImageBuffer);
      readable.push(null);

      return Promise.resolve({
        Body: readable,
        ContentType: 'image/jpeg',
        ContentLength: mockImageBuffer.length,
        ETag: '"test-etag"',
        LastModified: new Date()
      });
    });
  }

  // Query methods for assertions
  getOperations(): S3Operation[] {
    return [...this.operations];
  }

  getOperationsByType(type: S3Operation['type']): S3Operation[] {
    return this.operations.filter(op => op.type === type);
  }

  getOperationsByBucket(bucket: string): S3Operation[] {
    return this.operations.filter(op => op.bucket === bucket);
  }

  getOperationsByKey(key: string): S3Operation[] {
    return this.operations.filter(op => op.key === key);
  }

  getPutOperations(): S3PutOperation[] {
    return this.getOperationsByType('put') as S3PutOperation[];
  }

  getDeleteOperations(): S3Operation[] {
    return this.getOperationsByType('delete');
  }

  getCopyOperations(): S3CopyOperation[] {
    return this.getOperationsByType('copy') as S3CopyOperation[];
  }

  getLastOperation(): S3Operation | null {
    return this.operations.length > 0 ? this.operations[this.operations.length - 1] : null;
  }

  // Assertion helpers
  assertPutToKey(key: string): void {
    const putOps = this.getPutOperations();
    const found = putOps.some(op => op.key === key);
    if (!found) {
      throw new Error(`Expected PUT operation to key ${key}, but found: ${putOps.map(op => op.key).join(', ')}`);
    }
  }

  assertDeleteForKey(key: string): void {
    const deleteOps = this.getDeleteOperations();
    const found = deleteOps.some(op => op.key === key);
    if (!found) {
      throw new Error(`Expected DELETE operation for key ${key}, but found: ${deleteOps.map(op => op.key).join(', ')}`);
    }
  }

  assertCopyFromTo(sourceKey: string, destKey: string): void {
    const copyOps = this.getCopyOperations();
    const found = copyOps.some(op => op.sourceKey === sourceKey && op.destKey === destKey);
    if (!found) {
      throw new Error(
        `Expected COPY from ${sourceKey} to ${destKey}, but found: ${copyOps.map(op => `${op.sourceKey} -> ${op.destKey}`).join(', ')}`
      );
    }
  }

  assertOperationCount(type: S3Operation['type'], expectedCount: number): void {
    const ops = this.getOperationsByType(type);
    if (ops.length !== expectedCount) {
      throw new Error(`Expected ${expectedCount} ${type} operations, but found ${ops.length}`);
    }
  }

  // Reset for clean test state
  reset(): void {
    this.operations = [];
    this.mockS3.reset();
    this.setupMocks();
  }

  // Get the mocked S3 client
  getMock(): ReturnType<typeof mockClient> {
    return this.mockS3;
  }
}

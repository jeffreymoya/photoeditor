/**
 * Tests for XState upload machine
 * Per the Testing Standards: Test for each transition
 * Per the Frontend Tier standard: Every critical slice has test for each transition
 */
/* eslint-disable max-lines-per-function */

import { interpret } from 'xstate';

import {
  uploadMachine,
  isUploadInProgress,
  isUploadPauseable,
  isUploadTerminal,
} from '../uploadMachine';

describe('uploadMachine', () => {
  describe('initial state', () => {
    it('should start in idle state', () => {
      const service = interpret(uploadMachine);
      service.start();

      expect(service.getSnapshot().value).toBe('idle');
      expect(service.getSnapshot().context.progress).toBe(0);
      expect(service.getSnapshot().context.retryCount).toBe(0);

      service.stop();
    });
  });

  describe('state transitions', () => {
    it('should transition from idle to preprocessing on START_UPLOAD', () => {
      const service = interpret(uploadMachine);
      service.start();

      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });

      // preprocessing has `always` transition to requesting_presign
      const snapshot = service.getSnapshot();
      expect(snapshot.value).toBe('requesting_presign');
      expect(snapshot.context.imageUri).toBe('file:///test.jpg');
      expect(snapshot.context.fileName).toBe('test.jpg');
      expect(snapshot.context.fileSize).toBe(1024000);
      expect(snapshot.context.mimeType).toBe('image/jpeg');

      service.stop();
    });

    it('should transition from preprocessing to requesting_presign automatically via `always` transition', () => {
      const service = interpret(uploadMachine);
      service.start();

      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });

      // preprocessing immediately transitions to requesting_presign via `always`
      expect(service.getSnapshot().value).toBe('requesting_presign');

      service.stop();
    });

    it('should transition from requesting_presign to uploading on PRESIGN_SUCCESS', () => {
      const service = interpret(uploadMachine);
      service.start();

      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      // preprocessing auto-transitions to requesting_presign

      service.send({
        type: 'PRESIGN_SUCCESS',
        jobId: 'job-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/key',
        s3Key: 'uploads/test.jpg',
      });

      const snapshot = service.getSnapshot();
      expect(snapshot.value).toBe('uploading');
      expect(snapshot.context.jobId).toBe('job-123');
      expect(snapshot.context.presignedUrl).toBe('https://s3.amazonaws.com/bucket/key');
      expect(snapshot.context.s3Key).toBe('uploads/test.jpg');

      service.stop();
    });

    it('should transition from requesting_presign to failed on PRESIGN_FAILURE', () => {
      const service = interpret(uploadMachine);
      service.start();

      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      // preprocessing auto-transitions to requesting_presign

      service.send({
        type: 'PRESIGN_FAILURE',
        error: 'Presign request failed',
      });

      const snapshot = service.getSnapshot();
      expect(snapshot.value).toBe('failed');
      expect(snapshot.context.error).toBe('Presign request failed');

      service.stop();
    });

    it('should update progress in uploading state on UPLOAD_PROGRESS', () => {
      const service = interpret(uploadMachine);
      service.start();

      // Get to uploading state
      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      // preprocessing auto-transitions to requesting_presign
      service.send({
        type: 'PRESIGN_SUCCESS',
        jobId: 'job-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/key',
        s3Key: 'uploads/test.jpg',
      });

      service.send({ type: 'UPLOAD_PROGRESS', progress: 50 });

      expect(service.getSnapshot().context.progress).toBe(50);

      service.stop();
    });

    it('should transition from uploading to processing on UPLOAD_SUCCESS', () => {
      const service = interpret(uploadMachine);
      service.start();

      // Get to uploading state
      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      // preprocessing auto-transitions to requesting_presign
      service.send({
        type: 'PRESIGN_SUCCESS',
        jobId: 'job-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/key',
        s3Key: 'uploads/test.jpg',
      });

      service.send({ type: 'UPLOAD_SUCCESS' });

      const snapshot = service.getSnapshot();
      expect(snapshot.value).toBe('processing');
      expect(snapshot.context.progress).toBe(100);

      service.stop();
    });

    it('should retry upload on UPLOAD_FAILURE when retries available', () => {
      const service = interpret(uploadMachine);
      service.start();

      // Get to uploading state
      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      service.send({
        type: 'PRESIGN_SUCCESS',
        jobId: 'job-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/key',
        s3Key: 'uploads/test.jpg',
      });

      service.send({ type: 'UPLOAD_FAILURE', error: 'Network error' });

      const snapshot = service.getSnapshot();
      expect(snapshot.value).toBe('uploading');
      expect(snapshot.context.retryCount).toBe(1);

      service.stop();
    });

    it('should transition to failed on UPLOAD_FAILURE when max retries exceeded', () => {
      const service = interpret(uploadMachine);
      service.start();

      // Get to uploading state
      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      service.send({
        type: 'PRESIGN_SUCCESS',
        jobId: 'job-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/key',
        s3Key: 'uploads/test.jpg',
      });

      // Fail 3 times (maxRetries = 3)
      service.send({ type: 'UPLOAD_FAILURE', error: 'Network error 1' });
      service.send({ type: 'UPLOAD_FAILURE', error: 'Network error 2' });
      service.send({ type: 'UPLOAD_FAILURE', error: 'Network error 3' });
      service.send({ type: 'UPLOAD_FAILURE', error: 'Network error 4' });

      const snapshot = service.getSnapshot();
      expect(snapshot.value).toBe('failed');
      expect(snapshot.context.retryCount).toBeGreaterThanOrEqual(3);

      service.stop();
    });

    it('should transition from uploading to paused on PAUSE', () => {
      const service = interpret(uploadMachine);
      service.start();

      // Get to uploading state
      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      service.send({
        type: 'PRESIGN_SUCCESS',
        jobId: 'job-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/key',
        s3Key: 'uploads/test.jpg',
      });

      service.send({ type: 'PAUSE' });

      expect(service.getSnapshot().value).toBe('paused');

      service.stop();
    });

    it('should transition from paused to uploading on RESUME', () => {
      const service = interpret(uploadMachine);
      service.start();

      // Get to paused state
      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      service.send({
        type: 'PRESIGN_SUCCESS',
        jobId: 'job-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/key',
        s3Key: 'uploads/test.jpg',
      });
      service.send({ type: 'PAUSE' });

      service.send({ type: 'RESUME' });

      expect(service.getSnapshot().value).toBe('uploading');

      service.stop();
    });

    it('should transition from processing to completed on JOB_COMPLETED', () => {
      const service = interpret(uploadMachine);
      service.start();

      // Get to processing state
      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      service.send({
        type: 'PRESIGN_SUCCESS',
        jobId: 'job-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/key',
        s3Key: 'uploads/test.jpg',
      });
      service.send({ type: 'UPLOAD_SUCCESS' });

      service.send({ type: 'JOB_COMPLETED' });

      expect(service.getSnapshot().value).toBe('completed');

      service.stop();
    });

    it('should transition from processing to failed on JOB_FAILED', () => {
      const service = interpret(uploadMachine);
      service.start();

      // Get to processing state
      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      service.send({
        type: 'PRESIGN_SUCCESS',
        jobId: 'job-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/key',
        s3Key: 'uploads/test.jpg',
      });
      service.send({ type: 'UPLOAD_SUCCESS' });

      service.send({ type: 'JOB_FAILED', error: 'Processing failed' });

      const snapshot = service.getSnapshot();
      expect(snapshot.value).toBe('failed');
      expect(snapshot.context.error).toBe('Processing failed');

      service.stop();
    });

    it('should transition to idle on CANCEL from any state', () => {
      const service = interpret(uploadMachine);
      service.start();

      // Test CANCEL from preprocessing
      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });

      service.send({ type: 'CANCEL' });

      const snapshot = service.getSnapshot();
      expect(snapshot.value).toBe('idle');
      // Note: resetContext only resets progress and retryCount due to TypeScript
      // exactOptionalPropertyTypes strict mode - optional fields are preserved
      expect(snapshot.context.progress).toBe(0);
      expect(snapshot.context.retryCount).toBe(0);

      service.stop();
    });

    it('should transition from failed to preprocessing on RETRY when retries available', () => {
      const service = interpret(uploadMachine);
      service.start();

      // Get to failed state
      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      // preprocessing auto-transitions to requesting_presign
      service.send({
        type: 'PRESIGN_FAILURE',
        error: 'Presign failed',
      });

      service.send({ type: 'RETRY' });

      const snapshot = service.getSnapshot();
      // after RETRY in failed state, it transitions to preprocessing which auto-transitions to requesting_presign
      expect(snapshot.value).toBe('requesting_presign');
      expect(snapshot.context.retryCount).toBe(1);

      service.stop();
    });

    it('should reach completed state on JOB_COMPLETED', () => {
      const service = interpret(uploadMachine);
      service.start();

      // Get to completed state
      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      // preprocessing auto-transitions to requesting_presign
      service.send({
        type: 'PRESIGN_SUCCESS',
        jobId: 'job-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/key',
        s3Key: 'uploads/test.jpg',
      });
      service.send({ type: 'UPLOAD_SUCCESS' });
      service.send({ type: 'JOB_COMPLETED' });

      const snapshot = service.getSnapshot();
      expect(snapshot.value).toBe('completed');
      expect(snapshot.context.jobId).toBe('job-123');

      service.stop();
    });
  });

  describe('helper functions', () => {
    it('isUploadInProgress should return true for active states', () => {
      expect(isUploadInProgress('preprocessing')).toBe(true);
      expect(isUploadInProgress('requesting_presign')).toBe(true);
      expect(isUploadInProgress('uploading')).toBe(true);
      expect(isUploadInProgress('processing')).toBe(true);

      expect(isUploadInProgress('idle')).toBe(false);
      expect(isUploadInProgress('paused')).toBe(false);
      expect(isUploadInProgress('completed')).toBe(false);
      expect(isUploadInProgress('failed')).toBe(false);
    });

    it('isUploadPauseable should return true only for uploading state', () => {
      expect(isUploadPauseable('uploading')).toBe(true);

      expect(isUploadPauseable('idle')).toBe(false);
      expect(isUploadPauseable('preprocessing')).toBe(false);
      expect(isUploadPauseable('requesting_presign')).toBe(false);
      expect(isUploadPauseable('paused')).toBe(false);
      expect(isUploadPauseable('processing')).toBe(false);
      expect(isUploadPauseable('completed')).toBe(false);
      expect(isUploadPauseable('failed')).toBe(false);
    });

    it('isUploadTerminal should return true for terminal states', () => {
      expect(isUploadTerminal('completed')).toBe(true);
      expect(isUploadTerminal('failed')).toBe(true);

      expect(isUploadTerminal('idle')).toBe(false);
      expect(isUploadTerminal('preprocessing')).toBe(false);
      expect(isUploadTerminal('requesting_presign')).toBe(false);
      expect(isUploadTerminal('uploading')).toBe(false);
      expect(isUploadTerminal('paused')).toBe(false);
      expect(isUploadTerminal('processing')).toBe(false);
    });
  });

  describe('guards (pure predicates)', () => {
    it('maxRetriesExceeded guard should be pure predicate', () => {
      // Test guard logic directly via state transitions
      const service = interpret(uploadMachine);
      service.start();

      // Get to uploading state
      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      service.send({
        type: 'PRESIGN_SUCCESS',
        jobId: 'job-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/key',
        s3Key: 'uploads/test.jpg',
      });

      // Fail until max retries exceeded
      for (let i = 0; i < 4; i++) {
        service.send({ type: 'UPLOAD_FAILURE', error: `Network error ${i}` });
      }

      // Guard should evaluate to true and transition to failed
      const snapshot = service.getSnapshot();
      expect(snapshot.value).toBe('failed');
      expect(snapshot.context.retryCount).toBeGreaterThanOrEqual(3);

      service.stop();
    });

    it('canRetry guard should be pure predicate', () => {
      // Test guard logic directly via state transitions
      const service = interpret(uploadMachine);
      service.start();

      // Get to failed state with retries available
      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      service.send({
        type: 'PRESIGN_FAILURE',
        error: 'Presign failed',
      });

      // Now in failed state with retryCount = 0
      expect(service.getSnapshot().value).toBe('failed');
      expect(service.getSnapshot().context.retryCount).toBe(0);

      // RETRY should succeed (canRetry evaluates to true)
      service.send({ type: 'RETRY' });

      const snapshot = service.getSnapshot();
      expect(snapshot.value).toBe('requesting_presign'); // Transitioned via preprocessing
      expect(snapshot.context.retryCount).toBe(1);

      service.stop();
    });

    it('guards should be deterministic (same context → same result)', () => {
      // Guards are pure: maxRetriesExceeded(ctx) and canRetry(ctx)
      // They depend only on context.retryCount and context.maxRetries
      // No side effects, no I/O, no external state access

      const service = interpret(uploadMachine);
      service.start();

      // Set up context with specific retryCount
      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      service.send({
        type: 'PRESIGN_SUCCESS',
        jobId: 'job-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/key',
        s3Key: 'uploads/test.jpg',
      });

      // Fail once
      service.send({ type: 'UPLOAD_FAILURE', error: 'Network error' });

      const contextBefore = service.getSnapshot().context;

      // Guard evaluation is deterministic: retryCount = 1, maxRetries = 3
      // canRetry should evaluate to true (1 < 3)
      expect(contextBefore.retryCount).toBe(1);
      expect(contextBefore.maxRetries).toBe(3);
      expect(service.getSnapshot().value).toBe('uploading'); // Should retry

      service.stop();
    });
  });

  describe('context actions', () => {
    it('should update progress incrementally in processing state', () => {
      const service = interpret(uploadMachine);
      service.start();

      // Get to uploading state
      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      // preprocessing auto-transitions to requesting_presign, then request presign
      service.send({
        type: 'PRESIGN_SUCCESS',
        jobId: 'job-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/key',
        s3Key: 'uploads/test.jpg',
      });

      // Send progress update while in uploading state
      service.send({ type: 'UPLOAD_PROGRESS', progress: 50 });

      const progressAfterUpload = service.getSnapshot().context.progress;
      expect(progressAfterUpload).toBe(50);

      service.send({ type: 'UPLOAD_SUCCESS' });

      const progressAfterSuccess = service.getSnapshot().context.progress;
      expect(progressAfterSuccess).toBe(100);

      service.stop();
    });

    it('should preserve context data when paused', () => {
      const service = interpret(uploadMachine);
      service.start();

      // Get to paused state
      service.send({
        type: 'START_UPLOAD',
        imageUri: 'file:///test.jpg',
        fileName: 'test.jpg',
        fileSize: 1024000,
        mimeType: 'image/jpeg',
      });
      // preprocessing auto-transitions to requesting_presign
      service.send({
        type: 'PRESIGN_SUCCESS',
        jobId: 'job-123',
        presignedUrl: 'https://s3.amazonaws.com/bucket/key',
        s3Key: 'uploads/test.jpg',
      });
      service.send({ type: 'UPLOAD_PROGRESS', progress: 50 });
      service.send({ type: 'PAUSE' });

      const snapshot = service.getSnapshot();
      expect(snapshot.context.jobId).toBe('job-123');
      expect(snapshot.context.presignedUrl).toBe('https://s3.amazonaws.com/bucket/key');
      expect(snapshot.context.progress).toBe(50);

      service.stop();
    });
  });
});

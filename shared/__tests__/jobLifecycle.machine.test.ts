import {
  isValidTransition,
  getNextState,
  isTerminalState,
  isInProgressState,
  getAllowedEvents,
  JobEvent
} from '../statecharts/jobLifecycle.machine';
import { JobStatus, JobStatusType } from '../schemas/job.schema';

describe('Job Lifecycle State Machine', () => {
  describe('isValidTransition', () => {
    it('should allow QUEUED -> PROCESSING transition', () => {
      const event: JobEvent = { type: 'START_PROCESSING', tempS3Key: 's3://bucket/key' };
      expect(isValidTransition(JobStatus.QUEUED, event)).toBe(true);
    });

    it('should allow QUEUED -> FAILED transition', () => {
      const event: JobEvent = { type: 'FAIL', error: 'Upload failed' };
      expect(isValidTransition(JobStatus.QUEUED, event)).toBe(true);
    });

    it('should reject QUEUED -> EDITING transition', () => {
      const event: JobEvent = { type: 'START_EDITING' };
      expect(isValidTransition(JobStatus.QUEUED, event)).toBe(false);
    });

    it('should reject QUEUED -> COMPLETED transition', () => {
      const event: JobEvent = { type: 'COMPLETE', finalS3Key: 's3://bucket/final' };
      expect(isValidTransition(JobStatus.QUEUED, event)).toBe(false);
    });

    it('should allow PROCESSING -> EDITING transition', () => {
      const event: JobEvent = { type: 'START_EDITING' };
      expect(isValidTransition(JobStatus.PROCESSING, event)).toBe(true);
    });

    it('should allow PROCESSING -> FAILED transition', () => {
      const event: JobEvent = { type: 'FAIL', error: 'Analysis failed' };
      expect(isValidTransition(JobStatus.PROCESSING, event)).toBe(true);
    });

    it('should reject PROCESSING -> COMPLETED transition', () => {
      const event: JobEvent = { type: 'COMPLETE', finalS3Key: 's3://bucket/final' };
      expect(isValidTransition(JobStatus.PROCESSING, event)).toBe(false);
    });

    it('should allow EDITING -> COMPLETED transition', () => {
      const event: JobEvent = { type: 'COMPLETE', finalS3Key: 's3://bucket/final' };
      expect(isValidTransition(JobStatus.EDITING, event)).toBe(true);
    });

    it('should allow EDITING -> FAILED transition', () => {
      const event: JobEvent = { type: 'FAIL', error: 'Editing failed' };
      expect(isValidTransition(JobStatus.EDITING, event)).toBe(true);
    });

    it('should reject all transitions from COMPLETED', () => {
      const events: JobEvent[] = [
        { type: 'START_PROCESSING', tempS3Key: 's3://bucket/key' },
        { type: 'START_EDITING' },
        { type: 'COMPLETE', finalS3Key: 's3://bucket/final' },
        { type: 'FAIL', error: 'error' }
      ];

      events.forEach(event => {
        expect(isValidTransition(JobStatus.COMPLETED, event)).toBe(false);
      });
    });

    it('should reject all transitions from FAILED', () => {
      const events: JobEvent[] = [
        { type: 'START_PROCESSING', tempS3Key: 's3://bucket/key' },
        { type: 'START_EDITING' },
        { type: 'COMPLETE', finalS3Key: 's3://bucket/final' },
        { type: 'FAIL', error: 'error' }
      ];

      events.forEach(event => {
        expect(isValidTransition(JobStatus.FAILED, event)).toBe(false);
      });
    });
  });

  describe('getNextState', () => {
    it('should return PROCESSING for QUEUED + START_PROCESSING', () => {
      const event: JobEvent = { type: 'START_PROCESSING', tempS3Key: 's3://bucket/key' };
      expect(getNextState(JobStatus.QUEUED, event)).toBe(JobStatus.PROCESSING);
    });

    it('should return FAILED for QUEUED + FAIL', () => {
      const event: JobEvent = { type: 'FAIL', error: 'Upload failed' };
      expect(getNextState(JobStatus.QUEUED, event)).toBe(JobStatus.FAILED);
    });

    it('should return null for invalid transition', () => {
      const event: JobEvent = { type: 'START_EDITING' };
      expect(getNextState(JobStatus.QUEUED, event)).toBeNull();
    });

    it('should return EDITING for PROCESSING + START_EDITING', () => {
      const event: JobEvent = { type: 'START_EDITING' };
      expect(getNextState(JobStatus.PROCESSING, event)).toBe(JobStatus.EDITING);
    });

    it('should return COMPLETED for EDITING + COMPLETE', () => {
      const event: JobEvent = { type: 'COMPLETE', finalS3Key: 's3://bucket/final' };
      expect(getNextState(JobStatus.EDITING, event)).toBe(JobStatus.COMPLETED);
    });

    it('should return FAILED for any state + FAIL (except terminals)', () => {
      const event: JobEvent = { type: 'FAIL', error: 'error' };

      expect(getNextState(JobStatus.QUEUED, event)).toBe(JobStatus.FAILED);
      expect(getNextState(JobStatus.PROCESSING, event)).toBe(JobStatus.FAILED);
      expect(getNextState(JobStatus.EDITING, event)).toBe(JobStatus.FAILED);
    });
  });

  describe('isTerminalState', () => {
    it('should return true for COMPLETED', () => {
      expect(isTerminalState(JobStatus.COMPLETED)).toBe(true);
    });

    it('should return true for FAILED', () => {
      expect(isTerminalState(JobStatus.FAILED)).toBe(true);
    });

    it('should return false for non-terminal states', () => {
      expect(isTerminalState(JobStatus.QUEUED)).toBe(false);
      expect(isTerminalState(JobStatus.PROCESSING)).toBe(false);
      expect(isTerminalState(JobStatus.EDITING)).toBe(false);
    });
  });

  describe('isInProgressState', () => {
    it('should return true for in-progress states', () => {
      expect(isInProgressState(JobStatus.QUEUED)).toBe(true);
      expect(isInProgressState(JobStatus.PROCESSING)).toBe(true);
      expect(isInProgressState(JobStatus.EDITING)).toBe(true);
    });

    it('should return false for terminal states', () => {
      expect(isInProgressState(JobStatus.COMPLETED)).toBe(false);
      expect(isInProgressState(JobStatus.FAILED)).toBe(false);
    });
  });

  describe('getAllowedEvents', () => {
    it('should return correct allowed events for QUEUED', () => {
      const allowed = getAllowedEvents(JobStatus.QUEUED);
      expect(allowed).toContain('START_PROCESSING');
      expect(allowed).toContain('FAIL');
      expect(allowed).toHaveLength(2);
    });

    it('should return correct allowed events for PROCESSING', () => {
      const allowed = getAllowedEvents(JobStatus.PROCESSING);
      expect(allowed).toContain('START_EDITING');
      expect(allowed).toContain('FAIL');
      expect(allowed).toHaveLength(2);
    });

    it('should return correct allowed events for EDITING', () => {
      const allowed = getAllowedEvents(JobStatus.EDITING);
      expect(allowed).toContain('COMPLETE');
      expect(allowed).toContain('FAIL');
      expect(allowed).toHaveLength(2);
    });

    it('should return empty array for terminal states', () => {
      expect(getAllowedEvents(JobStatus.COMPLETED)).toEqual([]);
      expect(getAllowedEvents(JobStatus.FAILED)).toEqual([]);
    });
  });

  describe('Complete job lifecycle paths', () => {
    it('should allow complete success path: QUEUED -> PROCESSING -> EDITING -> COMPLETED', () => {
      let currentState: JobStatusType = JobStatus.QUEUED;

      // QUEUED -> PROCESSING
      const event1: JobEvent = { type: 'START_PROCESSING', tempS3Key: 's3://temp' };
      expect(isValidTransition(currentState, event1)).toBe(true);
      currentState = getNextState(currentState, event1)!;
      expect(currentState).toBe(JobStatus.PROCESSING);

      // PROCESSING -> EDITING
      const event2: JobEvent = { type: 'START_EDITING' };
      expect(isValidTransition(currentState, event2)).toBe(true);
      currentState = getNextState(currentState, event2)!;
      expect(currentState).toBe(JobStatus.EDITING);

      // EDITING -> COMPLETED
      const event3: JobEvent = { type: 'COMPLETE', finalS3Key: 's3://final' };
      expect(isValidTransition(currentState, event3)).toBe(true);
      currentState = getNextState(currentState, event3)!;
      expect(currentState).toBe(JobStatus.COMPLETED);
      expect(isTerminalState(currentState)).toBe(true);
    });

    it('should allow failure at any stage', () => {
      const failEvent: JobEvent = { type: 'FAIL', error: 'error' };

      expect(getNextState(JobStatus.QUEUED, failEvent)).toBe(JobStatus.FAILED);
      expect(getNextState(JobStatus.PROCESSING, failEvent)).toBe(JobStatus.FAILED);
      expect(getNextState(JobStatus.EDITING, failEvent)).toBe(JobStatus.FAILED);
    });
  });
});

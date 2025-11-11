/**
 * Frame Budget Monitor Tests
 *
 * Tests for frame processing time monitoring and violation detection.
 * Per standards/testing-standards.md: Pure functions tested without mocks.
 *
 * Coverage target: ≥70% lines, ≥60% branches per standards/testing-standards.md
 */


import {
  FRAME_BUDGET_MS,
  isFrameBudgetViolation,
  calculateBudgetExceeded,
  createFrameViolation,
  logFrameViolation,
  monitorFrameProcessing,
  calculateFrameStats,
  formatFrameStats,
  logFrameStats,
} from '../frameBudgetMonitor';

import type { FrameViolation, FrameProcessorType } from '../frameBudgetMonitor';

// Mock expo-device
jest.mock('expo-device', () => ({
  modelName: 'Pixel 5',
  osName: 'Android',
}));

// Mock console methods
const mockConsoleWarn = jest.spyOn(console, 'warn').mockImplementation();
const mockConsoleInfo = jest.spyOn(console, 'info').mockImplementation();

describe('frameBudgetMonitor', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('constants', () => {
    it('should define frame budget as 16ms', () => {
      expect(FRAME_BUDGET_MS).toBe(16);
    });
  });

  describe('isFrameBudgetViolation', () => {
    it('should return true for processing time > 16ms', () => {
      expect(isFrameBudgetViolation(17)).toBe(true);
      expect(isFrameBudgetViolation(20)).toBe(true);
      expect(isFrameBudgetViolation(100)).toBe(true);
    });

    it('should return false for processing time <= 16ms', () => {
      expect(isFrameBudgetViolation(16)).toBe(false);
      expect(isFrameBudgetViolation(15)).toBe(false);
      expect(isFrameBudgetViolation(10)).toBe(false);
      expect(isFrameBudgetViolation(0)).toBe(false);
    });

    it('should support custom budget threshold', () => {
      expect(isFrameBudgetViolation(20, 25)).toBe(false);
      expect(isFrameBudgetViolation(26, 25)).toBe(true);
    });
  });

  describe('calculateBudgetExceeded', () => {
    it('should calculate exceeded amount for violations', () => {
      expect(calculateBudgetExceeded(20)).toBe(4);
      expect(calculateBudgetExceeded(30)).toBe(14);
      expect(calculateBudgetExceeded(100)).toBe(84);
    });

    it('should return 0 for non-violations', () => {
      expect(calculateBudgetExceeded(16)).toBe(0);
      expect(calculateBudgetExceeded(15)).toBe(0);
      expect(calculateBudgetExceeded(10)).toBe(0);
      expect(calculateBudgetExceeded(0)).toBe(0);
    });

    it('should support custom budget threshold', () => {
      expect(calculateBudgetExceeded(20, 25)).toBe(0);
      expect(calculateBudgetExceeded(30, 25)).toBe(5);
    });
  });

  describe('createFrameViolation', () => {
    beforeEach(() => {
      jest.useFakeTimers();
      jest.setSystemTime(new Date('2025-11-11T12:00:00Z'));
    });

    afterEach(() => {
      jest.useRealTimers();
    });

    it('should create violation record with device info', () => {
      const violation = createFrameViolation(25, 'combined');

      expect(violation).toMatchObject({
        timestamp: Date.now(),
        processingTimeMs: 25,
        budgetExceededMs: 9,
        deviceModel: 'Pixel 5',
        devicePlatform: 'Android',
        frameProcessorType: 'combined',
      });
    });

    it('should create violation for each frame processor type', () => {
      const types: FrameProcessorType[] = ['boundingBoxes', 'liveFilters', 'aiOverlay', 'combined'];

      types.forEach((type) => {
        const violation = createFrameViolation(20, type);
        expect(violation.frameProcessorType).toBe(type);
      });
    });

    // NOTE: Testing null device model would require jest.isolateModules to reset
    // Device module state. The test for logFrameViolation below covers the null
    // device model handling.
  });

  describe('logFrameViolation', () => {
    it('should log violation with structured data', () => {
      const violation: FrameViolation = {
        timestamp: Date.now(),
        processingTimeMs: 25.5,
        budgetExceededMs: 9.5,
        deviceModel: 'Pixel 5',
        devicePlatform: 'Android',
        frameProcessorType: 'combined',
      };

      logFrameViolation(violation);

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[FrameBudgetMonitor] Frame budget violation',
        expect.objectContaining({
          processingTimeMs: '25.50',
          budgetExceededMs: '9.50',
          deviceModel: 'Pixel 5',
          devicePlatform: 'Android',
          frameProcessorType: 'combined',
          correlationId: expect.stringContaining('frame-'),
        })
      );
    });

    it('should handle null device model in log', () => {
      const violation: FrameViolation = {
        timestamp: Date.now(),
        processingTimeMs: 20,
        budgetExceededMs: 4,
        deviceModel: null,
        devicePlatform: 'Android',
        frameProcessorType: 'combined',
      };

      logFrameViolation(violation);

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[FrameBudgetMonitor] Frame budget violation',
        expect.objectContaining({
          deviceModel: 'unknown',
        })
      );
    });
  });

  describe('monitorFrameProcessing', () => {
    it('should log violation for slow frame processing', () => {
      monitorFrameProcessing(100, 125, 'combined');

      expect(mockConsoleWarn).toHaveBeenCalledWith(
        '[FrameBudgetMonitor] Frame budget violation',
        expect.objectContaining({
          processingTimeMs: '25.00',
          budgetExceededMs: '9.00',
        })
      );
    });

    it('should not log for fast frame processing', () => {
      monitorFrameProcessing(100, 110, 'combined');

      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });

    it('should not log for exactly 16ms processing', () => {
      monitorFrameProcessing(100, 116, 'combined');

      expect(mockConsoleWarn).not.toHaveBeenCalled();
    });
  });

  describe('calculateFrameStats', () => {
    it('should calculate stats for frame processing times', () => {
      const processingTimes = [10, 12, 15, 18, 20, 25];
      const stats = calculateFrameStats(processingTimes);

      expect(stats.totalFrames).toBe(6);
      expect(stats.violations).toBe(3); // 18, 20, 25 > 16
      expect(stats.averageProcessingTimeMs).toBeCloseTo(16.67, 2);
      expect(stats.maxProcessingTimeMs).toBe(25);
      expect(stats.violationRate).toBeCloseTo(0.5, 2);
    });

    it('should return zero stats for empty array', () => {
      const stats = calculateFrameStats([]);

      expect(stats.totalFrames).toBe(0);
      expect(stats.violations).toBe(0);
      expect(stats.averageProcessingTimeMs).toBe(0);
      expect(stats.maxProcessingTimeMs).toBe(0);
      expect(stats.violationRate).toBe(0);
    });

    it('should handle all frames within budget', () => {
      const processingTimes = [10, 12, 14, 15, 16];
      const stats = calculateFrameStats(processingTimes);

      expect(stats.violations).toBe(0);
      expect(stats.violationRate).toBe(0);
    });

    it('should handle all frames exceeding budget', () => {
      const processingTimes = [20, 25, 30, 35];
      const stats = calculateFrameStats(processingTimes);

      expect(stats.violations).toBe(4);
      expect(stats.violationRate).toBe(1);
    });

    it('should support custom budget threshold', () => {
      const processingTimes = [10, 15, 20, 25];
      const stats = calculateFrameStats(processingTimes, 18);

      expect(stats.violations).toBe(2); // 20, 25 > 18
    });
  });

  describe('formatFrameStats', () => {
    it('should format stats as readable string', () => {
      const stats = {
        totalFrames: 100,
        violations: 10,
        averageProcessingTimeMs: 14.5,
        maxProcessingTimeMs: 25.3,
        violationRate: 0.1,
      };

      const formatted = formatFrameStats(stats);

      expect(formatted).toContain('Total frames: 100');
      expect(formatted).toContain('Violations: 10 (10.0%)');
      expect(formatted).toContain('Average: 14.50ms');
      expect(formatted).toContain('Max: 25.30ms');
    });

    it('should format zero stats', () => {
      const stats = {
        totalFrames: 0,
        violations: 0,
        averageProcessingTimeMs: 0,
        maxProcessingTimeMs: 0,
        violationRate: 0,
      };

      const formatted = formatFrameStats(stats);

      expect(formatted).toContain('Total frames: 0');
      expect(formatted).toContain('Violations: 0 (0.0%)');
    });
  });

  describe('logFrameStats', () => {
    it('should log stats summary with device model', () => {
      const stats = {
        totalFrames: 100,
        violations: 10,
        averageProcessingTimeMs: 14.5,
        maxProcessingTimeMs: 25.3,
        violationRate: 0.1,
      };

      logFrameStats(stats, 'Pixel 5');

      expect(mockConsoleInfo).toHaveBeenCalledWith(
        '[FrameBudgetMonitor] Frame processing statistics',
        expect.objectContaining({
          totalFrames: 100,
          violations: 10,
          violationRate: '10.0%',
          averageMs: '14.50',
          maxMs: '25.30',
          deviceModel: 'Pixel 5',
          summary: expect.any(String),
        })
      );
    });

    it('should handle null device model', () => {
      const stats = {
        totalFrames: 50,
        violations: 5,
        averageProcessingTimeMs: 15,
        maxProcessingTimeMs: 20,
        violationRate: 0.1,
      };

      logFrameStats(stats, null);

      expect(mockConsoleInfo).toHaveBeenCalledWith(
        '[FrameBudgetMonitor] Frame processing statistics',
        expect.objectContaining({
          deviceModel: 'unknown',
        })
      );
    });
  });
});

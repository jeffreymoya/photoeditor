/**
 * Frame Budget Monitor
 *
 * Monitors frame processing times to detect violations of 16ms frame budget (60 FPS).
 * Logs violations with device model for telemetry and allowlist expansion decisions.
 *
 * Per ADR-0012 (Skia integration): Frame budget telemetry provides early signals for
 * performance issues during pilot phase.
 *
 * Standards alignment:
 * - standards/typescript.md#analyzability: Structured logging with correlation IDs
 * - standards/frontend-tier.md#state--logic-layer: Pure timing computation
 * - standards/testing-standards.md: Pure functions testable without mocks
 *
 * @module features/camera/frameBudgetMonitor
 */

import * as Device from 'expo-device';

/**
 * Frame budget threshold in milliseconds (60 FPS = 16.67ms per frame)
 */
export const FRAME_BUDGET_MS = 16;

/**
 * Frame processing violation record
 */
export type FrameViolation = {
  readonly timestamp: number;
  readonly processingTimeMs: number;
  readonly budgetExceededMs: number;
  readonly deviceModel: string | null;
  readonly devicePlatform: string;
  readonly frameProcessorType: FrameProcessorType;
};

/**
 * Frame processor types for telemetry categorization
 */
export type FrameProcessorType =
  | 'boundingBoxes'
  | 'liveFilters'
  | 'aiOverlay'
  | 'combined';

/**
 * Frame processing statistics
 */
export type FrameStats = {
  readonly totalFrames: number;
  readonly violations: number;
  readonly averageProcessingTimeMs: number;
  readonly maxProcessingTimeMs: number;
  readonly violationRate: number;
};

/**
 * Check if frame processing time violates budget.
 *
 * Pure function per standards/typescript.md#analyzability.
 *
 * @param processingTimeMs - Frame processing time in milliseconds
 * @param budgetMs - Frame budget threshold (default: 16ms)
 * @returns True if processing time exceeds budget
 */
export const isFrameBudgetViolation = (
  processingTimeMs: number,
  budgetMs: number = FRAME_BUDGET_MS
): boolean => {
  return processingTimeMs > budgetMs;
};

/**
 * Calculate budget exceeded amount.
 *
 * Pure function per standards/typescript.md#analyzability.
 *
 * @param processingTimeMs - Frame processing time in milliseconds
 * @param budgetMs - Frame budget threshold (default: 16ms)
 * @returns Milliseconds over budget (0 if within budget)
 */
export const calculateBudgetExceeded = (
  processingTimeMs: number,
  budgetMs: number = FRAME_BUDGET_MS
): number => {
  return Math.max(0, processingTimeMs - budgetMs);
};

/**
 * Create frame violation record.
 *
 * Impure function (reads device info, generates timestamp).
 *
 * @param processingTimeMs - Frame processing time in milliseconds
 * @param frameProcessorType - Type of frame processor that ran
 * @returns Frame violation record
 */
export const createFrameViolation = (
  processingTimeMs: number,
  frameProcessorType: FrameProcessorType
): FrameViolation => {
  const budgetExceeded = calculateBudgetExceeded(processingTimeMs);

  return {
    timestamp: Date.now(),
    processingTimeMs,
    budgetExceededMs: budgetExceeded,
    deviceModel: Device.modelName,
    devicePlatform: Device.osName ?? 'unknown',
    frameProcessorType,
  };
};

/**
 * Log frame budget violation.
 *
 * Structured logging per standards/typescript.md#analyzability.
 * Logs include device model for telemetry and allowlist expansion.
 *
 * @param violation - Frame violation record
 */
export const logFrameViolation = (violation: FrameViolation): void => {
  console.warn('[FrameBudgetMonitor] Frame budget violation', {
    timestamp: new Date(violation.timestamp).toISOString(),
    processingTimeMs: violation.processingTimeMs.toFixed(2),
    budgetExceededMs: violation.budgetExceededMs.toFixed(2),
    deviceModel: violation.deviceModel ?? 'unknown',
    devicePlatform: violation.devicePlatform,
    frameProcessorType: violation.frameProcessorType,
    correlationId: `frame-${violation.timestamp}`,
  });
};

/**
 * Monitor frame processing time and log violations.
 *
 * Usage:
 * ```typescript
 * const startTime = performance.now();
 * // ... frame processing ...
 * const endTime = performance.now();
 * monitorFrameProcessing(startTime, endTime, 'combined');
 * ```
 *
 * @param startTimeMs - Processing start time (performance.now())
 * @param endTimeMs - Processing end time (performance.now())
 * @param frameProcessorType - Type of frame processor
 */
export const monitorFrameProcessing = (
  startTimeMs: number,
  endTimeMs: number,
  frameProcessorType: FrameProcessorType
): void => {
  const processingTimeMs = endTimeMs - startTimeMs;

  if (isFrameBudgetViolation(processingTimeMs)) {
    const violation = createFrameViolation(processingTimeMs, frameProcessorType);
    logFrameViolation(violation);
  }
};

/**
 * Calculate frame processing statistics.
 *
 * Pure function per standards/typescript.md#analyzability.
 *
 * @param processingTimes - Array of frame processing times in milliseconds
 * @param budgetMs - Frame budget threshold (default: 16ms)
 * @returns Frame processing statistics
 */
export const calculateFrameStats = (
  processingTimes: readonly number[],
  budgetMs: number = FRAME_BUDGET_MS
): FrameStats => {
  if (processingTimes.length === 0) {
    return {
      totalFrames: 0,
      violations: 0,
      averageProcessingTimeMs: 0,
      maxProcessingTimeMs: 0,
      violationRate: 0,
    };
  }

  const violations = processingTimes.filter((time) => time > budgetMs).length;
  const totalProcessingTime = processingTimes.reduce((sum, time) => sum + time, 0);
  const averageProcessingTimeMs = totalProcessingTime / processingTimes.length;
  const maxProcessingTimeMs = Math.max(...processingTimes);
  const violationRate = violations / processingTimes.length;

  return {
    totalFrames: processingTimes.length,
    violations,
    averageProcessingTimeMs,
    maxProcessingTimeMs,
    violationRate,
  };
};

/**
 * Format frame stats for logging.
 *
 * Pure function per standards/typescript.md#analyzability.
 *
 * @param stats - Frame processing statistics
 * @returns Formatted stats string
 */
export const formatFrameStats = (stats: FrameStats): string => {
  return [
    `Total frames: ${stats.totalFrames}`,
    `Violations: ${stats.violations} (${(stats.violationRate * 100).toFixed(1)}%)`,
    `Average: ${stats.averageProcessingTimeMs.toFixed(2)}ms`,
    `Max: ${stats.maxProcessingTimeMs.toFixed(2)}ms`,
  ].join(', ');
};

/**
 * Log frame processing statistics summary.
 *
 * @param stats - Frame processing statistics
 * @param deviceModel - Device model for telemetry
 */
export const logFrameStats = (stats: FrameStats, deviceModel: string | null): void => {
  console.info('[FrameBudgetMonitor] Frame processing statistics', {
    totalFrames: stats.totalFrames,
    violations: stats.violations,
    violationRate: `${(stats.violationRate * 100).toFixed(1)}%`,
    averageMs: stats.averageProcessingTimeMs.toFixed(2),
    maxMs: stats.maxProcessingTimeMs.toFixed(2),
    deviceModel: deviceModel ?? 'unknown',
    summary: formatFrameStats(stats),
  });
};

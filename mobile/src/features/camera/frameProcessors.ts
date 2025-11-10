/**
 * Skia Frame Processors for VisionCamera
 *
 * GPU-accelerated camera overlays using VisionCamera + Skia + Reanimated worklets.
 * All frame processors run on the camera thread via Reanimated worklet syntax.
 *
 * @module features/camera/frameProcessors
 */

import { Skia } from '@shopify/react-native-skia';

import type { SkCanvas, SkRect, SkImage } from '@shopify/react-native-skia';
import type { Frame } from 'react-native-vision-camera';

/**
 * Bounding box coordinates for AI analysis preview overlays
 */
export type BoundingBox = {
  readonly x: number;
  readonly y: number;
  readonly width: number;
  readonly height: number;
  readonly label?: string;
  readonly confidence?: number;
};

/**
 * Live filter parameters for real-time image adjustments
 */
export type FilterParams = {
  readonly brightness?: number; // -1.0 to 1.0
  readonly contrast?: number; // 0.0 to 2.0
  readonly saturation?: number; // 0.0 to 2.0
};

/**
 * AI editing overlay configuration
 */
export type OverlayConfig = {
  readonly imageData?: SkImage;
  readonly opacity?: number; // 0.0 to 1.0
  readonly x?: number;
  readonly y?: number;
};

/**
 * Bounding Box Frame Processor
 *
 * Draws bounding boxes on camera feed for AI analysis preview.
 * Uses Skia Canvas API for GPU-accelerated rendering.
 *
 * Pure where possible: deterministic box rendering given coordinates.
 * Impure boundary: canvas drawing operations (isolated to Skia APIs).
 *
 * @param _frame - VisionCamera frame (unused in current implementation)
 * @param canvas - Skia canvas
 * @param boxes - Array of bounding box coordinates
 */
export function drawBoundingBoxes(
  _frame: Frame,
  canvas: SkCanvas,
  boxes: readonly BoundingBox[]
): void {
  'worklet';

  const paint = Skia.Paint();
  paint.setStrokeWidth(3);
  paint.setColor(Skia.Color('rgba(0, 255, 0, 0.8)'));
  paint.setAntiAlias(true);

  const labelPaint = Skia.Paint();
  labelPaint.setColor(Skia.Color('rgba(0, 255, 0, 1.0)'));
  labelPaint.setAntiAlias(true);

  for (const box of boxes) {
    const rect: SkRect = Skia.XYWHRect(box.x, box.y, box.width, box.height);
    canvas.drawRect(rect, paint);

    // Draw label if provided
    if (box.label) {
      const font = Skia.Font(undefined, 14);
      const labelText = box.confidence
        ? `${box.label} (${(box.confidence * 100).toFixed(0)}%)`
        : box.label;

      canvas.drawText(labelText, box.x, box.y - 5, labelPaint, font);
    }
  }
}

/**
 * Live Filter Frame Processor
 *
 * Applies real-time filters (brightness, contrast, saturation) to camera feed.
 * Uses Skia ColorMatrix for GPU-accelerated transformations.
 *
 * Pure computation: filter matrix calculation is deterministic.
 * Impure boundary: canvas filter application (isolated to Skia APIs).
 *
 * @param _frame - VisionCamera frame (unused in current implementation)
 * @param canvas - Skia canvas
 * @param params - Filter parameters
 */
export function applyLiveFilters(
  _frame: Frame,
  canvas: SkCanvas,
  params: FilterParams
): void {
  'worklet';

  const brightness = params.brightness ?? 0;
  const contrast = params.contrast ?? 1.0;
  const saturation = params.saturation ?? 1.0;

  // Build color matrix for combined filters
  // Pure computation: deterministic matrix calculation
  const matrix = buildColorMatrix(brightness, contrast, saturation);

  const paint = Skia.Paint();
  const colorFilter = Skia.ColorFilter.MakeMatrix(matrix);
  paint.setColorFilter(colorFilter);

  // Apply filter to entire canvas
  canvas.saveLayer(paint);
  canvas.restore();
}

/**
 * Build color matrix for filter transformations
 *
 * Pure function: deterministic matrix calculation from parameters.
 * Brightness: shifts RGB values by constant offset.
 * Contrast: scales RGB values around midpoint.
 * Saturation: interpolates between grayscale and full color.
 *
 * @param brightness - Brightness adjustment (-1.0 to 1.0)
 * @param contrast - Contrast multiplier (0.0 to 2.0)
 * @param saturation - Saturation multiplier (0.0 to 2.0)
 * @returns 5x4 color matrix for Skia ColorFilter
 */
function buildColorMatrix(
  brightness: number,
  contrast: number,
  saturation: number
): number[] {
  'worklet';

  // Saturation matrix (grayscale coefficients: R=0.3086, G=0.6094, B=0.0820)
  const sr = (1 - saturation) * 0.3086;
  const sg = (1 - saturation) * 0.6094;
  const sb = (1 - saturation) * 0.0820;

  // Contrast matrix (scale around 0.5)
  const contrastTranslate = (-(0.5 * contrast) + 0.5) * 255;

  // Brightness offset
  const brightnessOffset = brightness * 255;

  // Combined matrix (5x4 format for Skia)
  return [
    contrast * (sr + saturation), contrast * sr, contrast * sr, 0, brightnessOffset + contrastTranslate,
    contrast * sg, contrast * (sg + saturation), contrast * sg, 0, brightnessOffset + contrastTranslate,
    contrast * sb, contrast * sb, contrast * (sb + saturation), 0, brightnessOffset + contrastTranslate,
    0, 0, 0, 1, 0, // Alpha channel unchanged
  ];
}

/**
 * AI Editing Overlay Frame Processor
 *
 * Composites AI-generated overlay images onto camera feed.
 * Uses Skia Image/Canvas APIs for alpha blending.
 *
 * Pure where possible: overlay positioning is deterministic.
 * Impure boundary: image drawing (isolated to Skia APIs).
 *
 * @param _frame - VisionCamera frame (unused in current implementation)
 * @param canvas - Skia canvas
 * @param config - Overlay configuration
 */
export function drawAIOverlay(
  _frame: Frame,
  canvas: SkCanvas,
  config: OverlayConfig
): void {
  'worklet';

  const { imageData, opacity = 1.0, x = 0, y = 0 } = config;

  if (!imageData) {
    return; // No overlay to draw
  }

  const paint = Skia.Paint();
  paint.setAlphaf(opacity);
  paint.setAntiAlias(true);

  // Draw overlay image at specified position
  canvas.drawImage(imageData, x, y, paint);
}

/**
 * Combined Frame Processor
 *
 * Applies multiple overlays in sequence: filters → bounding boxes → AI overlay.
 * Order ensures proper compositing (base filters first, then overlays).
 *
 * @param frame - VisionCamera frame
 * @param canvas - Skia canvas
 * @param options - Combined overlay options
 */
export type CombinedOverlayOptions = {
  readonly filters?: FilterParams;
  readonly boxes?: readonly BoundingBox[];
  readonly overlay?: OverlayConfig;
};

export function applyCombinedOverlays(
  frame: Frame,
  canvas: SkCanvas,
  options: CombinedOverlayOptions
): void {
  'worklet';

  // Apply filters first (affects base image)
  if (options.filters) {
    applyLiveFilters(frame, canvas, options.filters);
  }

  // Draw bounding boxes (on top of filtered image)
  if (options.boxes && options.boxes.length > 0) {
    drawBoundingBoxes(frame, canvas, options.boxes);
  }

  // Draw AI overlay last (on top of everything)
  if (options.overlay) {
    drawAIOverlay(frame, canvas, options.overlay);
  }
}

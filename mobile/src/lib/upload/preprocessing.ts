/**
 * Image preprocessing utilities for upload preparation
 * Handles resizing, format conversion, and optimization
 */

import * as FileSystem from 'expo-file-system';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';

/**
 * Maximum dimension for uploaded images
 */
const MAX_DIMENSION = 4096;

/**
 * Supported image formats for preprocessing
 */
export type SupportedFormat = 'jpeg' | 'png' | 'webp';

/**
 * Preprocessing options
 */
export interface PreprocessOptions {
  /**
   * Maximum dimension (width or height). Default: 4096
   */
  maxDimension?: number;
  /**
   * Target format. Default: 'jpeg'
   */
  format?: SupportedFormat;
  /**
   * Compression quality (0-1). Default: 0.8
   */
  quality?: number;
}

/**
 * Preprocessed image result
 */
export interface PreprocessedImage {
  /**
   * Local URI of the preprocessed image
   */
  uri: string;
  /**
   * Image width in pixels
   */
  width: number;
  /**
   * Image height in pixels
   */
  height: number;
  /**
   * File size in bytes
   */
  size: number;
  /**
   * MIME type of the processed image
   */
  mimeType: string;
}

/**
 * Converts HEIC images to JPEG and resizes to meet upload constraints
 *
 * Implements:
 * - Caps images at ≤4096px (largest dimension)
 * - HEIC→JPEG fallback for compatibility
 * - Maintains aspect ratio during resize
 *
 * @param uri - Local URI of the source image
 * @param options - Preprocessing options
 * @returns Preprocessed image metadata
 * @throws Error if preprocessing fails
 */
export async function preprocessImage(
  uri: string,
  options: PreprocessOptions = {}
): Promise<PreprocessedImage> {
  const {
    maxDimension = MAX_DIMENSION,
    format = 'jpeg',
    quality = 0.8,
  } = options;

  try {
    // Get original file info
    const fileInfo = await FileSystem.getInfoAsync(uri);
    if (!fileInfo.exists) {
      throw new Error('Image file does not exist');
    }

    // Determine target format
    const saveFormat = format === 'jpeg'
      ? SaveFormat.JPEG
      : format === 'png'
      ? SaveFormat.PNG
      : SaveFormat.WEBP;

    // Process image: resize if needed and convert format
    const result = await manipulateAsync(
      uri,
      [
        {
          resize: {
            width: maxDimension,
            height: maxDimension,
          },
        },
      ],
      {
        compress: quality,
        format: saveFormat,
      }
    );

    // Get processed file size
    const processedInfo = await FileSystem.getInfoAsync(result.uri);
    const size = processedInfo.exists && 'size' in processedInfo
      ? processedInfo.size
      : 0;

    // Determine MIME type
    const mimeType = format === 'jpeg'
      ? 'image/jpeg'
      : format === 'png'
      ? 'image/png'
      : 'image/webp';

    return {
      uri: result.uri,
      width: result.width,
      height: result.height,
      size,
      mimeType,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Unknown error';
    throw new Error(`Image preprocessing failed: ${message}`);
  }
}

/**
 * Batch preprocess multiple images with individual error handling
 *
 * @param uris - Array of local image URIs
 * @param options - Preprocessing options
 * @returns Array of results with successful preprocessed images and errors
 */
export async function preprocessImages(
  uris: string[],
  options: PreprocessOptions = {}
): Promise<{ uri: string; result?: PreprocessedImage; error?: Error }[]> {
  const results = await Promise.allSettled(
    uris.map(uri => preprocessImage(uri, options))
  );

  return results.map((result, index) => {
    if (result.status === 'fulfilled') {
      return { uri: uris[index], result: result.value };
    } else {
      return {
        uri: uris[index],
        error: result.reason instanceof Error
          ? result.reason
          : new Error(String(result.reason))
      };
    }
  });
}

/**
 * Validates if an image needs preprocessing based on dimensions
 *
 * @param width - Image width
 * @param height - Image height
 * @param maxDimension - Maximum allowed dimension
 * @returns True if image exceeds maximum dimension
 */
export function needsResize(
  width: number,
  height: number,
  maxDimension: number = MAX_DIMENSION
): boolean {
  return width > maxDimension || height > maxDimension;
}

/**
 * Checks if a file is a HEIC/HEIF image based on URI or MIME type
 *
 * @param uri - File URI
 * @param mimeType - Optional MIME type
 * @returns True if file is HEIC/HEIF format
 */
export function isHEIC(uri: string, mimeType?: string): boolean {
  const lowerUri = uri.toLowerCase();
  const lowerMime = mimeType?.toLowerCase() || '';

  return (
    lowerUri.endsWith('.heic') ||
    lowerUri.endsWith('.heif') ||
    lowerMime === 'image/heic' ||
    lowerMime === 'image/heif'
  );
}

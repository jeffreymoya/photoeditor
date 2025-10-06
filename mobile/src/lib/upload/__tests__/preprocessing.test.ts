/**
 * Tests for image preprocessing utilities
 */

import { needsResize, isHEIC } from '../preprocessing';

describe('preprocessing utilities', () => {
  describe('needsResize', () => {
    it('returns false for images within max dimension', () => {
      expect(needsResize(1000, 1000, 4096)).toBe(false);
      expect(needsResize(4096, 2000, 4096)).toBe(false);
      expect(needsResize(2000, 4096, 4096)).toBe(false);
    });

    it('returns true for images exceeding max dimension', () => {
      expect(needsResize(5000, 3000, 4096)).toBe(true);
      expect(needsResize(3000, 5000, 4096)).toBe(true);
      expect(needsResize(4097, 4097, 4096)).toBe(true);
    });

    it('handles exact boundary case', () => {
      expect(needsResize(4096, 4096, 4096)).toBe(false);
      expect(needsResize(4097, 1000, 4096)).toBe(true);
    });

    it('uses default max dimension of 4096', () => {
      expect(needsResize(4096, 4096)).toBe(false);
      expect(needsResize(4097, 1000)).toBe(true);
    });
  });

  describe('isHEIC', () => {
    it('detects HEIC from file extension', () => {
      expect(isHEIC('photo.heic')).toBe(true);
      expect(isHEIC('photo.HEIC')).toBe(true);
      expect(isHEIC('/path/to/photo.heic')).toBe(true);
    });

    it('detects HEIF from file extension', () => {
      expect(isHEIC('photo.heif')).toBe(true);
      expect(isHEIC('photo.HEIF')).toBe(true);
    });

    it('detects HEIC from MIME type', () => {
      expect(isHEIC('photo.jpg', 'image/heic')).toBe(true);
      expect(isHEIC('photo.jpg', 'image/HEIC')).toBe(true);
      expect(isHEIC('photo.jpg', 'image/heif')).toBe(true);
      expect(isHEIC('photo.jpg', 'image/HEIF')).toBe(true);
    });

    it('returns false for non-HEIC images', () => {
      expect(isHEIC('photo.jpg')).toBe(false);
      expect(isHEIC('photo.png')).toBe(false);
      expect(isHEIC('photo.jpg', 'image/jpeg')).toBe(false);
      expect(isHEIC('photo.png', 'image/png')).toBe(false);
    });

    it('handles missing MIME type', () => {
      expect(isHEIC('photo.jpg')).toBe(false);
      expect(isHEIC('photo.heic')).toBe(true);
    });
  });
});

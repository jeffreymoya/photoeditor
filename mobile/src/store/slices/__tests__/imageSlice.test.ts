/**
 * imageSlice Reducer Tests
 *
 * Per the Testing Standards:
 * - Prefer pure unit tests with deterministic inputs/outputs
 * - Keep assertions focused on observable behaviour (inputs → outputs)
 *
 * Per the Frontend Tier standard:
 * - Redux Toolkit reducers: Write "mutating" syntax; immer makes it immutable
 * - Test reducers with: dispatch action → assert new state (no mocks)
 *
 * Coverage target: All reducer actions with edge cases
 */

import { ImagePickerAsset } from 'expo-image-picker';

import {
  imageSlice,
  setSelectedImages,
  addSelectedImage,
  removeSelectedImage,
  clearSelectedImages,
  addProcessedImage,
  removeProcessedImage,
  clearProcessedImages,
  setLoading,
  setError,
  clearError,
  type ImageState,
} from '../imageSlice';

describe('imageSlice reducer', () => {
  const initialState: ImageState = {
    selectedImages: [],
    processedImages: [],
    isLoading: false,
    error: null,
  };

  const mockImage: ImagePickerAsset = {
    uri: 'file:///path/to/image1.jpg',
    width: 1920,
    height: 1080,
    assetId: 'asset-1',
  };

  const mockImage2: ImagePickerAsset = {
    uri: 'file:///path/to/image2.jpg',
    width: 3840,
    height: 2160,
    assetId: 'asset-2',
  };

  describe('setSelectedImages', () => {
    it('sets selectedImages to provided array', () => {
      const state = imageSlice.reducer(
        initialState,
        setSelectedImages([mockImage, mockImage2])
      );

      expect(state.selectedImages).toHaveLength(2);
      expect(state.selectedImages[0]).toEqual(mockImage);
      expect(state.selectedImages[1]).toEqual(mockImage2);
    });

    it('replaces existing selectedImages', () => {
      const stateWithImages: ImageState = {
        ...initialState,
        selectedImages: [mockImage],
      };

      const state = imageSlice.reducer(
        stateWithImages,
        setSelectedImages([mockImage2])
      );

      expect(state.selectedImages).toHaveLength(1);
      expect(state.selectedImages[0]).toEqual(mockImage2);
    });

    it('clears error when setting images', () => {
      const stateWithError: ImageState = {
        ...initialState,
        error: 'Previous error',
      };

      const state = imageSlice.reducer(
        stateWithError,
        setSelectedImages([mockImage])
      );

      expect(state.error).toBeNull();
    });

    it('sets empty array when provided', () => {
      const stateWithImages: ImageState = {
        ...initialState,
        selectedImages: [mockImage],
      };

      const state = imageSlice.reducer(stateWithImages, setSelectedImages([]));

      expect(state.selectedImages).toHaveLength(0);
    });
  });

  describe('addSelectedImage', () => {
    it('adds image to selectedImages array', () => {
      const state = imageSlice.reducer(initialState, addSelectedImage(mockImage));

      expect(state.selectedImages).toHaveLength(1);
      expect(state.selectedImages[0]).toEqual(mockImage);
    });

    it('appends to existing selectedImages', () => {
      const stateWithImage: ImageState = {
        ...initialState,
        selectedImages: [mockImage],
      };

      const state = imageSlice.reducer(
        stateWithImage,
        addSelectedImage(mockImage2)
      );

      expect(state.selectedImages).toHaveLength(2);
      expect(state.selectedImages[0]).toEqual(mockImage);
      expect(state.selectedImages[1]).toEqual(mockImage2);
    });

    it('clears error when adding image', () => {
      const stateWithError: ImageState = {
        ...initialState,
        error: 'Previous error',
      };

      const state = imageSlice.reducer(
        stateWithError,
        addSelectedImage(mockImage)
      );

      expect(state.error).toBeNull();
    });
  });

  describe('removeSelectedImage', () => {
    it('removes image by uri from selectedImages', () => {
      const stateWithImages: ImageState = {
        ...initialState,
        selectedImages: [mockImage, mockImage2],
      };

      const state = imageSlice.reducer(
        stateWithImages,
        removeSelectedImage('file:///path/to/image1.jpg')
      );

      expect(state.selectedImages).toHaveLength(1);
      expect(state.selectedImages[0]).toEqual(mockImage2);
    });

    it('does nothing when uri not found', () => {
      const stateWithImages: ImageState = {
        ...initialState,
        selectedImages: [mockImage],
      };

      const state = imageSlice.reducer(
        stateWithImages,
        removeSelectedImage('file:///nonexistent.jpg')
      );

      expect(state.selectedImages).toEqual(stateWithImages.selectedImages);
    });

    it('handles removing from empty array', () => {
      const state = imageSlice.reducer(
        initialState,
        removeSelectedImage('file:///any.jpg')
      );

      expect(state.selectedImages).toHaveLength(0);
    });

    it('removes all matching images with same uri', () => {
      const stateWithDuplicates: ImageState = {
        ...initialState,
        selectedImages: [mockImage, mockImage, mockImage2],
      };

      const state = imageSlice.reducer(
        stateWithDuplicates,
        removeSelectedImage('file:///path/to/image1.jpg')
      );

      expect(state.selectedImages).toHaveLength(1);
      expect(state.selectedImages[0]).toEqual(mockImage2);
    });
  });

  describe('clearSelectedImages', () => {
    it('clears all selectedImages', () => {
      const stateWithImages: ImageState = {
        ...initialState,
        selectedImages: [mockImage, mockImage2],
      };

      const state = imageSlice.reducer(stateWithImages, clearSelectedImages());

      expect(state.selectedImages).toHaveLength(0);
    });

    it('clears error when clearing images', () => {
      const stateWithError: ImageState = {
        ...initialState,
        selectedImages: [mockImage],
        error: 'Previous error',
      };

      const state = imageSlice.reducer(stateWithError, clearSelectedImages());

      expect(state.error).toBeNull();
      expect(state.selectedImages).toHaveLength(0);
    });

    it('handles clearing already empty array', () => {
      const state = imageSlice.reducer(initialState, clearSelectedImages());

      expect(state.selectedImages).toHaveLength(0);
    });
  });

  describe('addProcessedImage', () => {
    it('adds image uri to processedImages array', () => {
      const state = imageSlice.reducer(
        initialState,
        addProcessedImage('s3://bucket/processed1.jpg')
      );

      expect(state.processedImages).toHaveLength(1);
      expect(state.processedImages[0]).toBe('s3://bucket/processed1.jpg');
    });

    it('appends to existing processedImages', () => {
      const stateWithProcessed: ImageState = {
        ...initialState,
        processedImages: ['s3://bucket/processed1.jpg'],
      };

      const state = imageSlice.reducer(
        stateWithProcessed,
        addProcessedImage('s3://bucket/processed2.jpg')
      );

      expect(state.processedImages).toHaveLength(2);
      expect(state.processedImages[1]).toBe('s3://bucket/processed2.jpg');
    });

    it('allows duplicate uris in processedImages', () => {
      const stateWithProcessed: ImageState = {
        ...initialState,
        processedImages: ['s3://bucket/processed1.jpg'],
      };

      const state = imageSlice.reducer(
        stateWithProcessed,
        addProcessedImage('s3://bucket/processed1.jpg')
      );

      expect(state.processedImages).toHaveLength(2);
      expect(state.processedImages[0]).toBe('s3://bucket/processed1.jpg');
      expect(state.processedImages[1]).toBe('s3://bucket/processed1.jpg');
    });
  });

  describe('removeProcessedImage', () => {
    it('removes image uri from processedImages', () => {
      const stateWithProcessed: ImageState = {
        ...initialState,
        processedImages: [
          's3://bucket/processed1.jpg',
          's3://bucket/processed2.jpg',
        ],
      };

      const state = imageSlice.reducer(
        stateWithProcessed,
        removeProcessedImage('s3://bucket/processed1.jpg')
      );

      expect(state.processedImages).toHaveLength(1);
      expect(state.processedImages[0]).toBe('s3://bucket/processed2.jpg');
    });

    it('does nothing when uri not found', () => {
      const stateWithProcessed: ImageState = {
        ...initialState,
        processedImages: ['s3://bucket/processed1.jpg'],
      };

      const state = imageSlice.reducer(
        stateWithProcessed,
        removeProcessedImage('s3://bucket/nonexistent.jpg')
      );

      expect(state.processedImages).toEqual(stateWithProcessed.processedImages);
    });

    it('handles removing from empty array', () => {
      const state = imageSlice.reducer(
        initialState,
        removeProcessedImage('s3://bucket/any.jpg')
      );

      expect(state.processedImages).toHaveLength(0);
    });

    it('removes all matching uris', () => {
      const stateWithDuplicates: ImageState = {
        ...initialState,
        processedImages: [
          's3://bucket/processed1.jpg',
          's3://bucket/processed1.jpg',
          's3://bucket/processed2.jpg',
        ],
      };

      const state = imageSlice.reducer(
        stateWithDuplicates,
        removeProcessedImage('s3://bucket/processed1.jpg')
      );

      expect(state.processedImages).toHaveLength(1);
      expect(state.processedImages[0]).toBe('s3://bucket/processed2.jpg');
    });
  });

  describe('clearProcessedImages', () => {
    it('clears all processedImages', () => {
      const stateWithProcessed: ImageState = {
        ...initialState,
        processedImages: [
          's3://bucket/processed1.jpg',
          's3://bucket/processed2.jpg',
        ],
      };

      const state = imageSlice.reducer(stateWithProcessed, clearProcessedImages());

      expect(state.processedImages).toHaveLength(0);
    });

    it('handles clearing already empty array', () => {
      const state = imageSlice.reducer(initialState, clearProcessedImages());

      expect(state.processedImages).toHaveLength(0);
    });

    it('does not affect selectedImages', () => {
      const stateWithBoth: ImageState = {
        ...initialState,
        selectedImages: [mockImage],
        processedImages: ['s3://bucket/processed1.jpg'],
      };

      const state = imageSlice.reducer(stateWithBoth, clearProcessedImages());

      expect(state.processedImages).toHaveLength(0);
      expect(state.selectedImages).toHaveLength(1);
    });
  });

  describe('setLoading', () => {
    it('sets isLoading to true', () => {
      const state = imageSlice.reducer(initialState, setLoading(true));

      expect(state.isLoading).toBe(true);
    });

    it('sets isLoading to false', () => {
      const stateLoading: ImageState = {
        ...initialState,
        isLoading: true,
      };

      const state = imageSlice.reducer(stateLoading, setLoading(false));

      expect(state.isLoading).toBe(false);
    });
  });

  describe('setError', () => {
    it('sets error message', () => {
      const state = imageSlice.reducer(
        initialState,
        setError('Failed to load image')
      );

      expect(state.error).toBe('Failed to load image');
    });

    it('sets isLoading to false when error is set', () => {
      const stateLoading: ImageState = {
        ...initialState,
        isLoading: true,
      };

      const state = imageSlice.reducer(
        stateLoading,
        setError('Failed to load image')
      );

      expect(state.isLoading).toBe(false);
      expect(state.error).toBe('Failed to load image');
    });

    it('allows setting error to null', () => {
      const stateWithError: ImageState = {
        ...initialState,
        error: 'Previous error',
      };

      const state = imageSlice.reducer(stateWithError, setError(null));

      expect(state.error).toBeNull();
    });

    it('replaces existing error', () => {
      const stateWithError: ImageState = {
        ...initialState,
        error: 'Previous error',
      };

      const state = imageSlice.reducer(
        stateWithError,
        setError('New error message')
      );

      expect(state.error).toBe('New error message');
    });
  });

  describe('clearError', () => {
    it('clears error', () => {
      const stateWithError: ImageState = {
        ...initialState,
        error: 'Some error',
      };

      const state = imageSlice.reducer(stateWithError, clearError());

      expect(state.error).toBeNull();
    });

    it('handles clearing when no error exists', () => {
      const state = imageSlice.reducer(initialState, clearError());

      expect(state.error).toBeNull();
    });

    it('does not affect other state properties', () => {
      const stateWithError: ImageState = {
        ...initialState,
        selectedImages: [mockImage],
        processedImages: ['s3://bucket/processed1.jpg'],
        isLoading: true,
        error: 'Some error',
      };

      const state = imageSlice.reducer(stateWithError, clearError());

      expect(state.error).toBeNull();
      expect(state.selectedImages).toHaveLength(1);
      expect(state.processedImages).toHaveLength(1);
      expect(state.isLoading).toBe(true);
    });
  });
});

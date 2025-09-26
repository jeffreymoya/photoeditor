import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import { ImagePickerAsset } from 'expo-image-picker';

export interface ImageState {
  selectedImages: ImagePickerAsset[];
  processedImages: string[];
  isLoading: boolean;
  error: string | null;
}

const initialState: ImageState = {
  selectedImages: [],
  processedImages: [],
  isLoading: false,
  error: null,
};

export const imageSlice = createSlice({
  name: 'image',
  initialState,
  reducers: {
    setSelectedImages: (state, action: PayloadAction<ImagePickerAsset[]>) => {
      state.selectedImages = action.payload;
      state.error = null;
    },
    addSelectedImage: (state, action: PayloadAction<ImagePickerAsset>) => {
      state.selectedImages.push(action.payload);
      state.error = null;
    },
    removeSelectedImage: (state, action: PayloadAction<string>) => {
      state.selectedImages = state.selectedImages.filter(
        (image) => image.uri !== action.payload
      );
    },
    clearSelectedImages: (state) => {
      state.selectedImages = [];
      state.error = null;
    },
    addProcessedImage: (state, action: PayloadAction<string>) => {
      state.processedImages.push(action.payload);
    },
    removeProcessedImage: (state, action: PayloadAction<string>) => {
      state.processedImages = state.processedImages.filter(
        (image) => image !== action.payload
      );
    },
    clearProcessedImages: (state) => {
      state.processedImages = [];
    },
    setLoading: (state, action: PayloadAction<boolean>) => {
      state.isLoading = action.payload;
    },
    setError: (state, action: PayloadAction<string | null>) => {
      state.error = action.payload;
      state.isLoading = false;
    },
    clearError: (state) => {
      state.error = null;
    },
  },
});

export const {
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
} = imageSlice.actions;
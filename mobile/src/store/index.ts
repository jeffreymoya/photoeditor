import { configureStore } from '@reduxjs/toolkit';
import { useDispatch, useSelector, TypedUseSelectorHook } from 'react-redux';

import { imageSlice } from './slices/imageSlice';
import { jobSlice } from './slices/jobSlice';
import { settingsSlice } from './slices/settingsSlice';
import { uploadApi } from './uploadApi';

export const store = configureStore({
  reducer: {
    image: imageSlice.reducer,
    job: jobSlice.reducer,
    settings: settingsSlice.reducer,
    // RTK Query API slice per standards/frontend-tier.md
    [uploadApi.reducerPath]: uploadApi.reducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['image/setSelectedImage'],
        ignoredPaths: ['image.selectedImage'],
      },
    })
      // Add RTK Query middleware for caching, invalidation, polling
      .concat(uploadApi.middleware),
  devTools: __DEV__,
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;

// Type-safe hooks
export const useAppDispatch = () => useDispatch<AppDispatch>();
export const useAppSelector: TypedUseSelectorHook<RootState> = useSelector;
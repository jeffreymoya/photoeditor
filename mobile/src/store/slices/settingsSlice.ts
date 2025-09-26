import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export interface SettingsState {
  theme: 'light' | 'dark' | 'auto';
  notifications: {
    enabled: boolean;
    jobCompletion: boolean;
    dailyTips: boolean;
  };
  image: {
    quality: 'low' | 'medium' | 'high';
    autoSave: boolean;
    watermark: boolean;
  };
  privacy: {
    analytics: boolean;
    crashReports: boolean;
  };
  apiEndpoint: string;
}

const initialState: SettingsState = {
  theme: 'auto',
  notifications: {
    enabled: true,
    jobCompletion: true,
    dailyTips: false,
  },
  image: {
    quality: 'high',
    autoSave: true,
    watermark: false,
  },
  privacy: {
    analytics: true,
    crashReports: true,
  },
  apiEndpoint: 'https://api.photoeditor.app',
};

export const settingsSlice = createSlice({
  name: 'settings',
  initialState,
  reducers: {
    setTheme: (state, action: PayloadAction<'light' | 'dark' | 'auto'>) => {
      state.theme = action.payload;
    },
    updateNotificationSettings: (
      state,
      action: PayloadAction<Partial<SettingsState['notifications']>>
    ) => {
      state.notifications = { ...state.notifications, ...action.payload };
    },
    updateImageSettings: (
      state,
      action: PayloadAction<Partial<SettingsState['image']>>
    ) => {
      state.image = { ...state.image, ...action.payload };
    },
    updatePrivacySettings: (
      state,
      action: PayloadAction<Partial<SettingsState['privacy']>>
    ) => {
      state.privacy = { ...state.privacy, ...action.payload };
    },
    setApiEndpoint: (state, action: PayloadAction<string>) => {
      state.apiEndpoint = action.payload;
    },
    resetSettings: () => initialState,
  },
});

export const {
  setTheme,
  updateNotificationSettings,
  updateImageSettings,
  updatePrivacySettings,
  setApiEndpoint,
  resetSettings,
} = settingsSlice.actions;
/**
 * settingsSlice Reducer Tests
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

import {
  settingsSlice,
  setTheme,
  updateNotificationSettings,
  updateImageSettings,
  updatePrivacySettings,
  setApiEndpoint,
  resetSettings,
  type SettingsState,
} from '../settingsSlice';

describe('settingsSlice reducer', () => {
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
    camera: {
      frameProcessorsEnabled: null,
    },
    apiEndpoint: 'https://api.photoeditor.app',
  };

  describe('setTheme', () => {
    it('sets theme to light', () => {
      const state = settingsSlice.reducer(initialState, setTheme('light'));

      expect(state.theme).toBe('light');
    });

    it('sets theme to dark', () => {
      const state = settingsSlice.reducer(initialState, setTheme('dark'));

      expect(state.theme).toBe('dark');
    });

    it('sets theme to auto', () => {
      const stateWithDark: SettingsState = {
        ...initialState,
        theme: 'dark',
      };

      const state = settingsSlice.reducer(stateWithDark, setTheme('auto'));

      expect(state.theme).toBe('auto');
    });

    it('does not affect other settings', () => {
      const state = settingsSlice.reducer(initialState, setTheme('light'));

      expect(state.notifications).toEqual(initialState.notifications);
      expect(state.image).toEqual(initialState.image);
      expect(state.privacy).toEqual(initialState.privacy);
      expect(state.apiEndpoint).toBe(initialState.apiEndpoint);
    });
  });

  describe('updateNotificationSettings', () => {
    it('updates enabled setting', () => {
      const state = settingsSlice.reducer(
        initialState,
        updateNotificationSettings({ enabled: false })
      );

      expect(state.notifications.enabled).toBe(false);
      expect(state.notifications.jobCompletion).toBe(true);
      expect(state.notifications.dailyTips).toBe(false);
    });

    it('updates jobCompletion setting', () => {
      const state = settingsSlice.reducer(
        initialState,
        updateNotificationSettings({ jobCompletion: false })
      );

      expect(state.notifications.jobCompletion).toBe(false);
      expect(state.notifications.enabled).toBe(true);
      expect(state.notifications.dailyTips).toBe(false);
    });

    it('updates dailyTips setting', () => {
      const state = settingsSlice.reducer(
        initialState,
        updateNotificationSettings({ dailyTips: true })
      );

      expect(state.notifications.dailyTips).toBe(true);
      expect(state.notifications.enabled).toBe(true);
      expect(state.notifications.jobCompletion).toBe(true);
    });

    it('updates multiple notification settings at once', () => {
      const state = settingsSlice.reducer(
        initialState,
        updateNotificationSettings({
          enabled: false,
          jobCompletion: false,
          dailyTips: true,
        })
      );

      expect(state.notifications.enabled).toBe(false);
      expect(state.notifications.jobCompletion).toBe(false);
      expect(state.notifications.dailyTips).toBe(true);
    });

    it('merges updates with existing notification settings', () => {
      const customState: SettingsState = {
        ...initialState,
        notifications: {
          enabled: false,
          jobCompletion: false,
          dailyTips: true,
        },
      };

      const state = settingsSlice.reducer(
        customState,
        updateNotificationSettings({ enabled: true })
      );

      expect(state.notifications.enabled).toBe(true);
      expect(state.notifications.jobCompletion).toBe(false);
      expect(state.notifications.dailyTips).toBe(true);
    });

    it('handles empty update object', () => {
      const state = settingsSlice.reducer(
        initialState,
        updateNotificationSettings({})
      );

      expect(state.notifications).toEqual(initialState.notifications);
    });

    it('does not affect other settings', () => {
      const state = settingsSlice.reducer(
        initialState,
        updateNotificationSettings({ enabled: false })
      );

      expect(state.theme).toBe(initialState.theme);
      expect(state.image).toEqual(initialState.image);
      expect(state.privacy).toEqual(initialState.privacy);
      expect(state.apiEndpoint).toBe(initialState.apiEndpoint);
    });
  });

  describe('updateImageSettings', () => {
    it('updates quality setting', () => {
      const state = settingsSlice.reducer(
        initialState,
        updateImageSettings({ quality: 'low' })
      );

      expect(state.image.quality).toBe('low');
      expect(state.image.autoSave).toBe(true);
      expect(state.image.watermark).toBe(false);
    });

    it('updates autoSave setting', () => {
      const state = settingsSlice.reducer(
        initialState,
        updateImageSettings({ autoSave: false })
      );

      expect(state.image.autoSave).toBe(false);
      expect(state.image.quality).toBe('high');
      expect(state.image.watermark).toBe(false);
    });

    it('updates watermark setting', () => {
      const state = settingsSlice.reducer(
        initialState,
        updateImageSettings({ watermark: true })
      );

      expect(state.image.watermark).toBe(true);
      expect(state.image.quality).toBe('high');
      expect(state.image.autoSave).toBe(true);
    });

    it('updates multiple image settings at once', () => {
      const state = settingsSlice.reducer(
        initialState,
        updateImageSettings({
          quality: 'medium',
          autoSave: false,
          watermark: true,
        })
      );

      expect(state.image.quality).toBe('medium');
      expect(state.image.autoSave).toBe(false);
      expect(state.image.watermark).toBe(true);
    });

    it('merges updates with existing image settings', () => {
      const customState: SettingsState = {
        ...initialState,
        image: {
          quality: 'low',
          autoSave: false,
          watermark: true,
        },
      };

      const state = settingsSlice.reducer(
        customState,
        updateImageSettings({ quality: 'high' })
      );

      expect(state.image.quality).toBe('high');
      expect(state.image.autoSave).toBe(false);
      expect(state.image.watermark).toBe(true);
    });

    it('handles empty update object', () => {
      const state = settingsSlice.reducer(initialState, updateImageSettings({}));

      expect(state.image).toEqual(initialState.image);
    });

    it('does not affect other settings', () => {
      const state = settingsSlice.reducer(
        initialState,
        updateImageSettings({ quality: 'low' })
      );

      expect(state.theme).toBe(initialState.theme);
      expect(state.notifications).toEqual(initialState.notifications);
      expect(state.privacy).toEqual(initialState.privacy);
      expect(state.apiEndpoint).toBe(initialState.apiEndpoint);
    });
  });

  describe('updatePrivacySettings', () => {
    it('updates analytics setting', () => {
      const state = settingsSlice.reducer(
        initialState,
        updatePrivacySettings({ analytics: false })
      );

      expect(state.privacy.analytics).toBe(false);
      expect(state.privacy.crashReports).toBe(true);
    });

    it('updates crashReports setting', () => {
      const state = settingsSlice.reducer(
        initialState,
        updatePrivacySettings({ crashReports: false })
      );

      expect(state.privacy.crashReports).toBe(false);
      expect(state.privacy.analytics).toBe(true);
    });

    it('updates both privacy settings at once', () => {
      const state = settingsSlice.reducer(
        initialState,
        updatePrivacySettings({
          analytics: false,
          crashReports: false,
        })
      );

      expect(state.privacy.analytics).toBe(false);
      expect(state.privacy.crashReports).toBe(false);
    });

    it('merges updates with existing privacy settings', () => {
      const customState: SettingsState = {
        ...initialState,
        privacy: {
          analytics: false,
          crashReports: false,
        },
      };

      const state = settingsSlice.reducer(
        customState,
        updatePrivacySettings({ analytics: true })
      );

      expect(state.privacy.analytics).toBe(true);
      expect(state.privacy.crashReports).toBe(false);
    });

    it('handles empty update object', () => {
      const state = settingsSlice.reducer(
        initialState,
        updatePrivacySettings({})
      );

      expect(state.privacy).toEqual(initialState.privacy);
    });

    it('does not affect other settings', () => {
      const state = settingsSlice.reducer(
        initialState,
        updatePrivacySettings({ analytics: false })
      );

      expect(state.theme).toBe(initialState.theme);
      expect(state.notifications).toEqual(initialState.notifications);
      expect(state.image).toEqual(initialState.image);
      expect(state.apiEndpoint).toBe(initialState.apiEndpoint);
    });
  });

  describe('setApiEndpoint', () => {
    it('sets apiEndpoint to provided value', () => {
      const state = settingsSlice.reducer(
        initialState,
        setApiEndpoint('https://staging.api.photoeditor.app')
      );

      expect(state.apiEndpoint).toBe('https://staging.api.photoeditor.app');
    });

    it('replaces existing apiEndpoint', () => {
      const customState: SettingsState = {
        ...initialState,
        apiEndpoint: 'https://dev.api.photoeditor.app',
      };

      const state = settingsSlice.reducer(
        customState,
        setApiEndpoint('https://prod.api.photoeditor.app')
      );

      expect(state.apiEndpoint).toBe('https://prod.api.photoeditor.app');
    });

    it('allows setting empty string', () => {
      const state = settingsSlice.reducer(initialState, setApiEndpoint(''));

      expect(state.apiEndpoint).toBe('');
    });

    it('allows localhost endpoints', () => {
      const state = settingsSlice.reducer(
        initialState,
        setApiEndpoint('http://localhost:3000')
      );

      expect(state.apiEndpoint).toBe('http://localhost:3000');
    });

    it('does not affect other settings', () => {
      const state = settingsSlice.reducer(
        initialState,
        setApiEndpoint('https://new.api.photoeditor.app')
      );

      expect(state.theme).toBe(initialState.theme);
      expect(state.notifications).toEqual(initialState.notifications);
      expect(state.image).toEqual(initialState.image);
      expect(state.privacy).toEqual(initialState.privacy);
    });
  });

  describe('resetSettings', () => {
    it('resets all settings to initial state', () => {
      const customState: SettingsState = {
        theme: 'dark',
        notifications: {
          enabled: false,
          jobCompletion: false,
          dailyTips: true,
        },
        image: {
          quality: 'low',
          autoSave: false,
          watermark: true,
        },
        privacy: {
          analytics: false,
          crashReports: false,
        },
        camera: {
          frameProcessorsEnabled: true,
        },
        apiEndpoint: 'https://custom.api.photoeditor.app',
      };

      const state = settingsSlice.reducer(customState, resetSettings());

      expect(state).toEqual(initialState);
    });

    it('resets theme to auto', () => {
      const customState: SettingsState = {
        ...initialState,
        theme: 'dark',
      };

      const state = settingsSlice.reducer(customState, resetSettings());

      expect(state.theme).toBe('auto');
    });

    it('resets notifications to default values', () => {
      const customState: SettingsState = {
        ...initialState,
        notifications: {
          enabled: false,
          jobCompletion: false,
          dailyTips: true,
        },
      };

      const state = settingsSlice.reducer(customState, resetSettings());

      expect(state.notifications).toEqual({
        enabled: true,
        jobCompletion: true,
        dailyTips: false,
      });
    });

    it('resets image settings to default values', () => {
      const customState: SettingsState = {
        ...initialState,
        image: {
          quality: 'low',
          autoSave: false,
          watermark: true,
        },
      };

      const state = settingsSlice.reducer(customState, resetSettings());

      expect(state.image).toEqual({
        quality: 'high',
        autoSave: true,
        watermark: false,
      });
    });

    it('resets privacy settings to default values', () => {
      const customState: SettingsState = {
        ...initialState,
        privacy: {
          analytics: false,
          crashReports: false,
        },
      };

      const state = settingsSlice.reducer(customState, resetSettings());

      expect(state.privacy).toEqual({
        analytics: true,
        crashReports: true,
      });
    });

    it('resets apiEndpoint to default value', () => {
      const customState: SettingsState = {
        ...initialState,
        apiEndpoint: 'https://custom.api.photoeditor.app',
      };

      const state = settingsSlice.reducer(customState, resetSettings());

      expect(state.apiEndpoint).toBe('https://api.photoeditor.app');
    });

    it('handles resetting already default state', () => {
      const state = settingsSlice.reducer(initialState, resetSettings());

      expect(state).toEqual(initialState);
    });
  });
});

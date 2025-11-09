import { createTamagui, createTokens } from '@tamagui/core';

/**
 * Tamagui configuration for PhotoEditor mobile app
 * Curated primitives subset: Stack, YStack, XStack, Text, Heading, Button, Pressable, Input, Form
 *
 * This configuration provides cross-platform component primitives with theme-aware styling
 * while avoiding full Tamagui adoption overhead per TASK-0909 clarifications.
 */

const tokens = createTokens({
  color: {
    // Primary colors
    primary50: '#f0f9ff',
    primary100: '#e0f2fe',
    primary200: '#bae6fd',
    primary300: '#7dd3fc',
    primary400: '#38bdf8',
    primary500: '#0ea5e9',
    primary600: '#0284c7',
    primary700: '#0369a1',
    primary800: '#075985',
    primary900: '#0c4a6e',
    primary950: '#082f49',

    // Secondary colors
    secondary50: '#faf5ff',
    secondary100: '#f3e8ff',
    secondary200: '#e9d5ff',
    secondary300: '#d8b4fe',
    secondary400: '#c084fc',
    secondary500: '#a855f7',
    secondary600: '#9333ea',
    secondary700: '#7e22ce',
    secondary800: '#6b21a8',
    secondary900: '#581c87',
    secondary950: '#3b0764',

    // Neutral colors
    neutral50: '#fafafa',
    neutral100: '#f5f5f5',
    neutral200: '#e5e5e5',
    neutral300: '#d4d4d4',
    neutral400: '#a3a3a3',
    neutral500: '#737373',
    neutral600: '#525252',
    neutral700: '#404040',
    neutral800: '#262626',
    neutral900: '#171717',
    neutral950: '#0a0a0a',

    // Success colors
    success50: '#f0fdf4',
    success100: '#dcfce7',
    success200: '#bbf7d0',
    success300: '#86efac',
    success400: '#4ade80',
    success500: '#22c55e',
    success600: '#16a34a',
    success700: '#15803d',
    success800: '#166534',
    success900: '#14532d',
    success950: '#052e16',

    // Warning colors
    warning50: '#fffbeb',
    warning100: '#fef3c7',
    warning200: '#fde68a',
    warning300: '#fcd34d',
    warning400: '#fbbf24',
    warning500: '#f59e0b',
    warning600: '#d97706',
    warning700: '#b45309',
    warning800: '#92400e',
    warning900: '#78350f',
    warning950: '#451a03',

    // Error colors
    error50: '#fef2f2',
    error100: '#fee2e2',
    error200: '#fecaca',
    error300: '#fca5a5',
    error400: '#f87171',
    error500: '#ef4444',
    error600: '#dc2626',
    error700: '#b91c1c',
    error800: '#991b1b',
    error900: '#7f1d1d',
    error950: '#450a0a',

    // Semantic colors
    white: '#ffffff',
    black: '#000000',
    transparent: 'transparent',
  },

  size: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 28,
    8: 32,
    9: 36,
    10: 40,
    12: 48,
    14: 56,
    16: 64,
    20: 80,
    true: 16, // default size
  },

  space: {
    0: 0,
    1: 4,
    2: 8,
    3: 12,
    4: 16,
    5: 20,
    6: 24,
    7: 28,
    8: 32,
    9: 36,
    10: 40,
    12: 48,
    14: 56,
    16: 64,
    20: 80,
    true: 16, // default space
  },

  radius: {
    0: 0,
    1: 2,
    2: 4,
    3: 6,
    4: 8,
    5: 10,
    6: 12,
    7: 14,
    8: 16,
    9: 18,
    10: 20,
    true: 8, // default radius
  },

  zIndex: {
    0: 0,
    1: 100,
    2: 200,
    3: 300,
    4: 400,
    5: 500,
  },
});

const config = createTamagui({
  tokens,
  themes: {
    light: {
      background: tokens.color.white,
      backgroundStrong: tokens.color.neutral100,
      backgroundHover: tokens.color.neutral50,
      backgroundPress: tokens.color.neutral200,
      backgroundFocus: tokens.color.neutral100,

      color: tokens.color.neutral900,
      colorHover: tokens.color.neutral950,
      colorPress: tokens.color.neutral800,
      colorFocus: tokens.color.neutral900,

      borderColor: tokens.color.neutral300,
      borderColorHover: tokens.color.neutral400,
      borderColorPress: tokens.color.neutral500,
      borderColorFocus: tokens.color.primary500,

      primary: tokens.color.primary600,
      primaryHover: tokens.color.primary700,
      primaryPress: tokens.color.primary800,
      primaryFocus: tokens.color.primary600,

      secondary: tokens.color.secondary600,
      secondaryHover: tokens.color.secondary700,
      secondaryPress: tokens.color.secondary800,
      secondaryFocus: tokens.color.secondary600,

      success: tokens.color.success600,
      warning: tokens.color.warning600,
      error: tokens.color.error600,
    },
    dark: {
      background: tokens.color.neutral950,
      backgroundStrong: tokens.color.neutral900,
      backgroundHover: tokens.color.neutral800,
      backgroundPress: tokens.color.neutral700,
      backgroundFocus: tokens.color.neutral800,

      color: tokens.color.neutral100,
      colorHover: tokens.color.neutral50,
      colorPress: tokens.color.neutral200,
      colorFocus: tokens.color.neutral100,

      borderColor: tokens.color.neutral700,
      borderColorHover: tokens.color.neutral600,
      borderColorPress: tokens.color.neutral500,
      borderColorFocus: tokens.color.primary400,

      primary: tokens.color.primary400,
      primaryHover: tokens.color.primary300,
      primaryPress: tokens.color.primary200,
      primaryFocus: tokens.color.primary400,

      secondary: tokens.color.secondary400,
      secondaryHover: tokens.color.secondary300,
      secondaryPress: tokens.color.secondary200,
      secondaryFocus: tokens.color.secondary400,

      success: tokens.color.success400,
      warning: tokens.color.warning400,
      error: tokens.color.error400,
    },
  },
  media: {
    xs: { maxWidth: 660 },
    sm: { maxWidth: 800 },
    md: { maxWidth: 1020 },
    lg: { maxWidth: 1280 },
    xl: { maxWidth: 1420 },
    xxl: { maxWidth: 1600 },
    gtXs: { minWidth: 660 + 1 },
    gtSm: { minWidth: 800 + 1 },
    gtMd: { minWidth: 1020 + 1 },
    gtLg: { minWidth: 1280 + 1 },
    short: { maxHeight: 820 },
    tall: { minHeight: 820 },
    hoverNone: { hover: 'none' },
    pointerCoarse: { pointer: 'coarse' },
  },
});

export type AppConfig = typeof config;

declare module '@tamagui/core' {
  interface TamaguiCustomConfig extends AppConfig {}
}

export default config;

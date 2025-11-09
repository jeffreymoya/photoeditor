# Design Token System

## Overview

PhotoEditor mobile app uses a dual design system combining NativeWind v5 (compile-time utility classes) and Tamagui (cross-platform component primitives) per TASK-0909. This document defines the design token system, usage patterns, and reusability strategy.

## Architecture

### NativeWind v5 + Tailwind v4

**Purpose**: Compile-time CSS-in-JS with zero runtime overhead

**Configuration**: `mobile/tailwind.config.js`

**Global styles**: `mobile/global.css` (processed by Metro via `mobile/metro.config.js`)

**Compiler integration**: Babel plugin (`nativewind/babel`) + Metro plugin (`withNativeWind`)

**Key features**:
- Zero runtime class parsing (all utilities compiled at build time)
- Full Tailwind v4 token system
- Concurrent rendering compatible (New Architecture requirement)
- Cross-platform consistency (identical on iOS and Android)

### Tamagui Curated Primitives

**Purpose**: Cross-platform component primitives with theme-aware styling

**Configuration**: `mobile/tamagui.config.ts`

**Curated subset**:
- **Layout**: Stack, YStack, XStack (flexbox-based layout primitives)
- **Typography**: Text, Heading (theme-aware text components)
- **Interaction**: Button, Pressable (press states and accessibility)
- **Forms**: Input (text inputs with theme support)

**Rationale for subset**: Full Tamagui adoption has steeper learning curve and documentation gaps (Thoughtworks Technology Radar "Assess"). Curated subset provides essential primitives while limiting complexity.

## Token Categories

### Color Tokens

Defined in both `tailwind.config.js` (NativeWind) and `tamagui.config.ts` (Tamagui) for consistency.

#### Primary Colors

```javascript
primary: {
  50: '#f0f9ff',  // Lightest
  100: '#e0f2fe',
  200: '#bae6fd',
  300: '#7dd3fc',
  400: '#38bdf8',
  500: '#0ea5e9', // Base
  600: '#0284c7', // Default (dark enough for WCAG AA)
  700: '#0369a1',
  800: '#075985',
  900: '#0c4a6e',
  950: '#082f49', // Darkest
}
```

**Usage**:
- Tamagui: `color="$primary600"`
- NativeWind: `className="text-primary-600"`

#### Semantic Colors

- **Success**: Green scale (50-950)
- **Warning**: Amber scale (50-950)
- **Error**: Red scale (50-950)
- **Neutral**: Gray scale (50-950)
- **Secondary**: Purple scale (50-950)

#### Theme Tokens

Tamagui provides semantic theme tokens that adapt to light/dark mode:

```javascript
// Light theme
background: '$white'
color: '$neutral900'
borderColor: '$neutral300'

// Dark theme (auto-switched)
background: '$neutral950'
color: '$neutral100'
borderColor: '$neutral700'
```

### Spacing Tokens

**Scale**: Based on 4px increments

```javascript
space: {
  0: 0,     // 0px
  1: 4,     // 4px
  2: 8,     // 8px
  3: 12,    // 12px
  4: 16,    // 16px
  5: 20,    // 20px
  6: 24,    // 24px
  ...
  20: 80,   // 80px
  true: 16, // Default
}
```

**Usage**:
- Tamagui: `padding="$4"` (16px)
- NativeWind: `className="p-4"` (16px via Tailwind)

### Typography Tokens

**Font sizes**:
```javascript
fontSize: {
  xxs: ['0.625rem', { lineHeight: '0.75rem' }],  // 10px
  xs: ['0.75rem', { lineHeight: '1rem' }],       // 12px
  sm: ['0.875rem', { lineHeight: '1.25rem' }],   // 14px
  base: ['1rem', { lineHeight: '1.5rem' }],      // 16px
  lg: ['1.125rem', { lineHeight: '1.75rem' }],   // 18px
  xl: ['1.25rem', { lineHeight: '1.75rem' }],    // 20px
  ...
  4xl: ['2.25rem', { lineHeight: '2.5rem' }],    // 36px
}
```

**Font weights**:
- 400: Regular
- 500: Medium
- 600: Semibold
- 700: Bold

**Usage**:
- Tamagui: `fontSize="$lg" fontWeight="600"`
- NativeWind: `className="text-lg font-semibold"`

### Border Radius Tokens

```javascript
radius: {
  0: 0,     // 0px (sharp corners)
  1: 2,     // 2px
  2: 4,     // 4px
  3: 6,     // 6px
  4: 8,     // 8px (default for cards)
  ...
  10: 20,   // 20px
  true: 8,  // Default
}
```

**Usage**:
- Tamagui: `borderRadius="$4"`
- NativeWind: `className="rounded-lg"`

## Usage Patterns

### When to Use NativeWind vs Tamagui

**Use NativeWind utilities when**:
- Styling native React Native components (View, Text, etc.)
- Need compile-time class processing
- Simple layout utilities (margin, padding, flexbox)

**Use Tamagui primitives when**:
- Building reusable component library
- Need built-in press states and interactions
- Want theme-aware semantic colors
- Cross-platform consistency is critical

### Component Example: JobCard

```tsx
import { YStack, Text } from '@tamagui/core';
import { Pressable } from 'react-native';

export const JobCard = ({ title, status }) => (
  <Pressable>
    <YStack
      backgroundColor="$backgroundStrong"  // Tamagui theme token
      borderRadius="$4"                     // Tamagui size token
      padding="$4"                          // Tamagui space token
      marginBottom="$3"                     // Tamagui space token
      borderWidth={1}
      borderColor="$borderColor"            // Tamagui theme token
      pressStyle={{
        backgroundColor: '$backgroundPress', // Automatic press state
      }}
    >
      <Text
        fontSize="$lg"                      // Tamagui font size
        fontWeight="600"                    // Numeric weight
        color="$color"                      // Tamagui theme token
      >
        {title}
      </Text>
    </YStack>
  </Pressable>
);
```

### Screen Example: JobsIndexScreen

```tsx
import { YStack } from '@tamagui/core';
import { ScrollView } from 'react-native';

export const JobsIndexScreen = () => (
  <ScrollView>
    <YStack padding="$4" backgroundColor="$background" flex={1}>
      <JobsHeader title="Jobs" subtitle="Track your jobs" />
      <YStack gap="$2">
        {jobs.map(job => <JobCard key={job.id} {...job} />)}
      </YStack>
    </YStack>
  </ScrollView>
);
```

## Theme System

### Light and Dark Modes

Tamagui automatically switches theme tokens based on system preference:

```javascript
// tamagui.config.ts
themes: {
  light: {
    background: '$white',
    color: '$neutral900',
    borderColor: '$neutral300',
    primary: '$primary600',
  },
  dark: {
    background: '$neutral950',
    color: '$neutral100',
    borderColor: '$neutral700',
    primary: '$primary400',
  },
}
```

**Provider setup** (`app/_layout.tsx`):
```tsx
<TamaguiProvider config={config} defaultTheme="light">
  {children}
</TamaguiProvider>
```

### Semantic Color Variants

Components accept semantic variants for automatic color mapping:

```tsx
<JobDetailCard
  label="Status"
  value="Completed"
  variant="success"  // Maps to $success600 in light, $success400 in dark
/>
```

Variant mapping:
- `default`: Uses theme `$color`
- `success`: Uses `$success600` (light) / `$success400` (dark)
- `warning`: Uses `$warning600` (light) / `$warning400` (dark)
- `error`: Uses `$error600` (light) / `$error400` (dark)

## Reusability Strategy

### For Expo Router Surfaces

Design tokens are validated for reuse across:

1. **Jobs surface** (implemented in TASK-0909)
   - JobCard, JobDetailCard, JobsHeader components
   - Demonstrates Tamagui primitives + NativeWind integration

2. **Settings surface** (future: TASK-0910)
   - Reuse Input, Button primitives
   - Form layout with YStack/XStack
   - Same color/spacing tokens

3. **Gallery surface** (future: TASK-0910)
   - Image card components using YStack
   - Grid layout with flex utilities
   - Same theme-aware styling

### For VisionCamera Overlays (TASK-0911)

NativeWind utilities can style overlay components:

```tsx
// Example: Camera overlay button
<Pressable className="absolute bottom-8 left-1/2 -translate-x-1/2">
  <View className="bg-primary-600 rounded-full p-4">
    <CaptureIcon className="text-white" />
  </View>
</Pressable>
```

Compiler processes utilities at build time, ensuring zero runtime overhead for camera performance.

### For List Virtualization (TASK-0910)

FlashList items can use Tamagui primitives:

```tsx
<FlashList
  data={jobs}
  renderItem={({ item }) => (
    <JobCard {...item} />  // Reuses themed component
  )}
  estimatedItemSize={100}
/>
```

Theme tokens ensure consistent styling across virtualized and non-virtualized lists.

## Performance Considerations

### NativeWind Compilation

- All utility classes compiled at build time
- Zero runtime cost for class parsing
- Output is native StyleSheet.create() calls
- No JavaScript execution for style resolution

### Tamagui Optimization

- Theme tokens resolve to static values at compile time where possible
- Press states use native Pressable performance
- No CSS-in-JS runtime required
- Automatic dead code elimination for unused theme values

## Migration Guide

### From Inline Styles

**Before** (inline StyleSheet):
```tsx
<View style={styles.container}>
  <Text style={styles.title}>{title}</Text>
</View>

const styles = StyleSheet.create({
  container: {
    backgroundColor: '#ffffff',
    padding: 16,
    borderRadius: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: '600',
  },
});
```

**After** (Tamagui):
```tsx
<YStack backgroundColor="$background" padding="$4" borderRadius="$4">
  <Text fontSize="$xl" fontWeight="600">{title}</Text>
</YStack>
```

### From UI Tokens Library

**Before** (`@/lib/ui-tokens`):
```tsx
import { colors, spacing, typography } from '@/lib/ui-tokens';

<View style={{ padding: spacing.md, backgroundColor: colors.background }}>
  <Text style={{ fontSize: typography.sizes.xl }}>{title}</Text>
</View>
```

**After** (Tamagui):
```tsx
<YStack padding="$4" backgroundColor="$background">
  <Text fontSize="$xl">{title}</Text>
</YStack>
```

## Testing

### Visual Consistency

Verify themed components render identically on iOS and Android:

1. Build app with NativeWind/Tamagui enabled
2. Run on iOS simulator and Android emulator
3. Compare screenshots of Jobs surface
4. Verify color values, spacing, and typography match

### Theme Switching

Test light/dark mode transitions:

1. Change system theme preference
2. Verify theme tokens update automatically
3. Check semantic colors adapt correctly
4. Ensure no flash of unstyled content

### Compiler Output

Verify NativeWind compiles utilities correctly:

```bash
# Build and inspect Metro bundle
pnpm run dev
# Check global.css is processed
# Verify no runtime class parsing in bundle
```

## Troubleshooting

### NativeWind classes not applying

**Issue**: Utility classes ignored at runtime

**Resolution**:
1. Ensure `global.css` imported in `app/_layout.tsx`
2. Verify `metro.config.js` has `withNativeWind` wrapper
3. Check `babel.config.js` includes `nativewind/babel` plugin
4. Restart Metro bundler: `pnpm run start --clear`

### Tamagui tokens undefined

**Issue**: Theme tokens resolve to `undefined`

**Resolution**:
1. Verify `TamaguiProvider` wraps app in `app/_layout.tsx`
2. Check `tamagui.config.ts` exports config correctly
3. Ensure token names use `$` prefix: `$primary600` not `primary600`
4. Restart Metro bundler

### Type errors on Tamagui components

**Issue**: TypeScript complains about prop types

**Resolution**:
1. Ensure `nativewind-env.d.ts` exists with `/// <reference types="nativewind/types" />`
2. Check `tamagui.config.ts` has module augmentation:
   ```ts
   declare module '@tamagui/core' {
     interface TamaguiCustomConfig extends AppConfig {}
   }
   ```
3. Restart TypeScript server in editor

## References

- TASK-0909: NativeWind v5 + Tamagui adoption
- mobile/tailwind.config.js: Tailwind v4 token definitions
- mobile/tamagui.config.ts: Tamagui theme configuration
- mobile/src/components/jobs/: Example themed components
- standards/frontend-tier.md#ui-components-layer: Component architecture
- [NativeWind v5 documentation](https://www.nativewind.dev/)
- [Tamagui documentation](https://tamagui.dev/)

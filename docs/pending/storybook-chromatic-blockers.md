# Storybook / Chromatic Build Status

**Status**: Blocked (needs follow-up)
**Created**: 2025-11-15
**Last Updated**: 2025-11-15
**Owner**: mobile platform (solo maintainer)
**Scope**: `mobile` package Storybook + Chromatic CI integration

---

## Executive Summary
- Storybook CLI now recognizes the project as React/webpack5 and resolves builder dependencies after adding the official framework package plus `babel-loader`.
- Build currently fails at the Babel transform stage with `Error: More than one plugin attempted to override parsing.` when processing files pulled in by `react-native-css` (transitively from NativeWind v5).
- Chromatic cannot proceed because it invokes `pnpm run build-storybook` internally and surfaces the same failure.

Until the parser conflict is fixed the Chromatic workflow is effectively blocked.

---

## Completed Work
1. **Config alignment**
   - `mobile/.storybook/main.js` now declares the webpack5 framework, adds the React Native Web addon, polyfills `console`, and aliases heavy native modules (`react-native-vision-camera`, `react-native-worklets-core`) to light Storybook stubs.
2. **Dependency updates**
   - Added `@storybook/react-webpack5`, `storybook`, `babel-loader`, `console-browserify`, and `cross-env` to `mobile/package.json` devDependencies. Reinstalled workspace deps via `pnpm install --filter photoeditor-mobile...`.
3. **Build command hardening**
   - `pnpm run build-storybook` now sets `STORYBOOK_BUILD=1` so `babel.config.js` can disable React Native Reanimated’s plugin during static builds.
4. **Babel adjustments**
   - Reworked `babel.config.js` to:
     - Toggle Reanimated preset via `reanimated: false` when `STORYBOOK_BUILD=1`.
     - Load the NativeWind preset via `react-native-css/babel` to control plugin injection.
     - Stub `react-native-worklets/plugin` and `react-native-reanimated/plugin` to no-op modules during Storybook builds to avoid missing native dependencies.

## Current Blocker Details
- **Error**: `Error: More than one plugin attempted to override parsing.` (Storybook build + Chromatic build logs).
- **Where**: Babel loader while transforming modules inside `react-native-css` (pulled by NativeWind 5.0.0-preview.2).
- **Likely cause**: Even after disabling Reanimated for Storybook, multiple presets still inject parser overrides (NativeWind’s underlying `react-native-css` plus `babel-plugin-react-compiler` or other Expo-managed plugins). Babel allows only a single `parserOverride`, so the second plugin crashes the compile.
- **Repro command**: `cd mobile && pnpm run build-storybook --output-dir=/tmp/storybook-test`.
- **Logs**: `mobile/build-storybook.log` (Chromatic) and `/tmp/storybook-build.out` (local runs) capture the stack trace.

## Next Steps / Recommendations
1. **Confirm parserOverride sources**
   - Run `BABEL_SHOW_CONFIG_FOR=src/features/camera/CameraWithOverlay.tsx pnpm react-native babel` (or similar) to inspect which plugins declare `parserOverride`.
2. **Strategic disablement**
   - Either:
     - Patch `nativewind` / `react-native-css` preset via Babel overrides to skip the problematic plugin in Storybook builds, **or**
     - Replace NativeWind’s Babel preset with the older v4 preset that does not depend on `react-native-css` until Expo/React Native catch up.
3. **Reanimated coordination**
   - Verify `babel-preset-expo` isn’t re-inserting Reanimated automatically despite `reanimated: false`. If it is, switch to explicit preset chain: `['babel-preset-expo', { web: { useTransformReactJSXExperimental: false }, reanimated: false }]` to ensure the option is honored.
4. **Temp workaround**
   - If Storybook only exercises plain RN components, consider mocking NativeWind entirely (alias to an identity shim) to bypass its Babel preset until a real fix lands.
5. **Re-run Chromatic**
   - After resolving the parser conflict, run `CHROMATIC_PROJECT_TOKEN=chpt_0b032dfd7b1e7f4 pnpm run chromatic` to verify the pipeline end-to-end.

## Outstanding Questions
- Do we strictly need NativeWind’s new CSS interop for the Storybook surface? If not, downgrading to the stable v4 release might unblock Chromatic quickly.
- Should we document an internal pattern for stubbing heavy native dependencies (VisionCamera, worklets) to avoid future Storybook regressions?

---

**Owner handoff**: Whoever picks this up should start by instrumenting Babel to print the full plugin list (`BABEL_ENV=story babel --show-config`). The main work item is ensuring only one plugin uses `parserOverride` during Storybook builds.

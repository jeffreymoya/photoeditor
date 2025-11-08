# Mobile Android Run Investigation — 2025-11-06

## Context
- Command: `make mobile-android`
- Environment: Ubuntu 22.04 host, Expo SDK 51, Android command line tools freshly installed under `/home/jeffreymoya/Android/Sdk`.
- Goal: Fast feedback loop for mobile feature work without depending on a physical device (reserved for UAT).

## Symptoms
1. **Initial failure:** `expo run:android` exited with `Failed to resolve the Android SDK path` and `spawn adb ENOENT`.
2. **Post-SDK install:** Build advanced then stalled with `CommandError: No Android connected device found`.
3. **Emulator launch:** Headless emulator attempt (`emulator -no-window ...`) hung ~23 minutes; `emulator.log` reported `x86_64 emulation currently requires hardware acceleration! /dev/kvm is not found`.

## Root Causes
1. **Missing Android toolchain pathing**  
   - No SDK installed at the default location and `ANDROID_HOME` was unset, so Expo could not find `adb`.
2. **No available Android runtime target**  
   - With SDK present, there still was no attached device nor booted emulator, so the native run failed before Gradle invocation.
3. **Hardware acceleration disabled**  
   - The created AVD could not start because `/dev/kvm` is absent (virtualization disabled or KVM modules missing). Emulator fell back to pure software virtualization, causing extreme slowdown and the observed hang.

## Actions Taken
- Installed Android command line tools, platform tools, build tools 34.0.0, and API 34 image.
- Added `sdkmanager` packages for the emulator and created `Pixel_API_34` AVD.
- Symlinked `/home/jeffreymoya/Android/sdk` to `/home/jeffreymoya/Android/Sdk` to satisfy Expo’s default lookup.
- Persisted Android SDK environment exports in `~/.bashrc`.
- Attempted to boot emulator headless; captured diagnostics from `Android/emulator.log`.
- Terminated lingering emulator/QEMU processes to restore a clean state.

## System Diagnostics — 2025-11-06
- Host OS: Pop!\_OS 22.04 LTS (`uname -r` → `6.16.3-76061603-generic`).
- CPU virtualization capability present: `egrep -c '(vmx|svm)' /proc/cpuinfo` → `12`; `lscpu` flags include `svm`.
- Virtualization now available to user space after enabling SVM in firmware: `/dev/kvm` exists (`crw-rw----+ 1 root kvm 10, 232` on 2025-11-06 10:39), and `lsmod | grep kvm` shows `kvm`, `kvm_amd`, `irqbypass`, `ccp` loaded.
- `/dev/kvm` now grants direct ACL access: `getfacl /dev/kvm` lists `user:jeffreymoya:rw-` even though `groups` still omits `kvm`.
- Android SDK directories verified: `/home/jeffreymoya/Android/Sdk` with symlink `/home/jeffreymoya/Android/sdk`; current shell shows `ANDROID_HOME` unset until re-sourcing `~/.bashrc`.
- Emulator inventory healthy: `/home/jeffreymoya/Android/Sdk/emulator/emulator -list-avds` → `Pixel_API_34`; `adb devices` presently lists no booted targets.
- Accelerated emulator probe (2025-11-06T10:47:25+08:00) via `timeout 30` booted `Pixel_API_34` to `Boot completed in 18316 ms`; raw log captured at `/tmp/emulator-kvm.log`.

## Verification Run — 2025-11-06 11:05 local
- Exported `ANDROID_HOME=/home/jeffreymoya/Android/Sdk`, `ANDROID_SDK_ROOT=/home/jeffreymoya/Android/Sdk`, and prepended `$ANDROID_HOME/platform-tools` + `$ANDROID_HOME/emulator` to `PATH` before invoking `make mobile-android`.
- `adb devices` acknowledged `emulator-5554`, but `timeout 5s adb shell getprop sys.boot_completed` never returned, and the emulator window showed a blank grey/black screen (see screenshot captured at 2025-11-06 11:03).
- `expo run:android` advanced through Gradle configuration yet failed while resolving `xml-apis:xml-apis:1.4.01` from Maven Central; Gradle 8.8 (running on Java 22) reported `Remote host terminated the handshake` after attempting TLSv1.2/TLSv1.3.
- Manual verification with `curl -I https://repo.maven.apache.org/maven2/xml-apis/xml-apis/1.4.01/xml-apis-1.4.01.jar` succeeded immediately, implying the TLS failure is specific to Gradle/Java negotiation or a transient CDN edge; no APK was produced, so Expo never launched the app inside the emulator.

## Recommendations
1. **Finalize hardware acceleration setup**  
   - With SVM enabled, `lsmod | grep kvm` already reports `kvm`/`kvm_amd`; verify `/dev/kvm` keeps an ACL for `jeffreymoya` after reboot, or add the account to `kvm` (`sudo usermod -a -G kvm jeffreymoya`) once credentials are available.  
   - Retest ``/home/jeffreymoya/Android/Sdk/emulator/emulator -avd Pixel_API_34 -no-window -gpu swiftshader_indirect`` (or `make mobile-android`) and capture logs to confirm the accelerated boot completes in under a minute.
2. **Persist Android env vars**  
   - Exports for `ANDROID_HOME=/home/jeffreymoya/Android/Sdk`, `ANDROID_SDK_ROOT=$ANDROID_HOME`, and `$ANDROID_HOME/platform-tools` were added to `~/.bashrc`; re-source the profile or start a new shell so `adb` resolves without manual exports.
3. **Snapshot an accelerated emulator**  
   - After the first successful boot with KVM (see `/tmp/emulator-kvm.log`), keep snapshotting enabled (`-no-snapshot-save` off). Subsequent runs should stay within tens of seconds, matching the requested rapid feedback loop.
4. **Fallback for regression verification**  
   - If KVM access regresses, fall back to Metro-only loops (`make mobile-start`) plus Storybook/web previews while triaging, then return to accelerated emulator runs before release validation.
5. **Optional: Expo Go bridge**  
   - Maintain Expo Go + tunnel workflow as an alternate path when remote hardware is more convenient, even though the local accelerated emulator should now cover day-to-day native checks.

## Follow-Up
- With SVM active, schedule a fresh `make mobile-android` run and archive the resulting emulator log alongside `/tmp/emulator-kvm.log` so the accelerated baseline is captured in repo docs.
- Persist the virtualization + Android tooling setup (BIOS notes, ACL or `kvm` group membership, env vars) in `docs/mobile/` for repeatability.
- Keep the nested-virtualization cloud VM fallback in mind if this workstation ever loses KVM access again.
- Debug the Gradle TLS failure by pinning protocols (`systemProp.https.protocols=TLSv1.2,TLSv1.3`), testing the build with a JDK 17 toolchain, or retrying after clearing `~/.gradle/caches` to determine whether the issue is Java handshake policy vs. transient CDN behavior. Re-run `make mobile-android` once dependency resolution succeeds and update this report with the resulting emulator state.
- Capture `adb logcat` and emulator `emulator.log` if the display remains blank after a successful build to confirm whether GPU configuration still needs adjustment (e.g., forcing `-gpu swiftshader_indirect` or toggling snapshots).

## Resolution — 2025-11-07

### Issues Successfully Resolved ✅

1. **Gradle TLS Handshake Failure**
   - **Fix Applied**: Added `systemProp.https.protocols=TLSv1.2,TLSv1.3` to `mobile/android/gradle.properties`
   - **Result**: Maven Central dependency downloads now succeed with Java 21
   - **Files Modified**: `mobile/android/gradle.properties`

2. **Missing expo-camera Dependency**
   - **Problem**: `Could not find com.google.android:cameraview:1.0.0` during dependency resolution
   - **Fix Applied**: Added expo-camera local maven repository to `mobile/android/build.gradle`:
     ```gradle
     maven {
         // Expo Camera local maven for cameraview:1.0.0
         url(new File(['node', '--print', "require.resolve('expo-camera/package.json')"].execute(null, rootDir).text.trim(), '../android/maven'))
     }
     ```
   - **Result**: Dependency resolution now includes expo-camera's bundled cameraview library
   - **Files Modified**: `mobile/android/build.gradle`

3. **Emulator Blank Screen Issue**
   - **Fix Applied**:
     - Wiped emulator data: `emulator -avd Pixel_API_34 -wipe-data`
     - Launched with GPU acceleration and KVM flags: `-gpu swiftshader_indirect -no-snapshot-load -qemu -enable-kvm`
   - **Result**: Emulator boots in ~18 seconds and displays Android launcher UI properly
   - **Verification**:
     ```bash
     $ adb devices
     emulator-5554	device

     $ adb shell getprop sys.boot_completed
     1

     $ adb shell dumpsys window | grep mCurrentFocus
     mCurrentFocus=Window{... com.google.android.apps.nexuslauncher/...NexusLauncherActivity}
     ```
   - **Files Modified**: `Makefile` (added `mobile-android-emulator` target with proper flags)

4. **Makefile Enhancement**
   - **Addition**: New `mobile-android-emulator` target that automatically starts emulator with optimal settings if not already running
   - **Implementation**:
     ```makefile
     mobile-android-emulator:
         @if ! adb devices | grep -q "emulator.*device"; then \
             echo "Starting Android emulator with KVM acceleration..."; \
             $(ANDROID_HOME)/emulator/emulator -avd Pixel_API_34 \
                 -gpu swiftshader_indirect \
                 -no-snapshot-load \
                 -qemu -enable-kvm \
                 > /tmp/emulator-android.log 2>&1 & \
             echo "Waiting for emulator to boot..."; \
             timeout 120s bash -c 'until [ "$$(adb shell getprop sys.boot_completed 2>/dev/null)" = "1" ]; do sleep 2; done' && \
             echo "Emulator ready!"; \
         else \
             echo "Emulator already running"; \
         fi

     mobile-android: mobile-android-emulator
         pnpm turbo run android --filter=photoeditor-mobile
     ```

### Remaining Issue ⚠️

**Kotlin Compilation Errors** - Documented in separate report: `docs/mobile/reports/2025-11-07-kotlin-compilation-errors.md`

- **Problem**: MainActivity.kt and MainApplication.kt have unresolved references to `R` and `BuildConfig` classes
- **Status**: BLOCKED - Build reaches `:app:compileDebugKotlin` task then fails
- **Build Progress**: 612 actionable tasks complete, 34 executed, 578 up-to-date before failure
- **Next Steps**: See dedicated compilation errors report for investigation plan

### Build Logs Captured

- TLS fix verification: `/tmp/gradle-build-test.log`
- Dependency resolution test: `/tmp/gradle-build-retry.log`
- Compilation attempt: `/tmp/gradle-build-third.log`
- Full build with install: `/tmp/gradle-build-full.log`
- Emulator KVM boot (successful): `/tmp/emulator-wiped.log`, `/tmp/emulator-kvm.log`

### System State — 2025-11-07 Post-Fix

- **Emulator**: ✅ Fully operational with KVM acceleration and GPU rendering
- **Gradle Dependencies**: ✅ All downloads succeed, TLS handshake stable
- **Build Pipeline**: ✅ Processes 578 tasks successfully
- **App Compilation**: ❌ Blocked on Kotlin compilation errors (separate investigation ongoing)

The core infrastructure issues (TLS, dependency resolution, emulator hardware acceleration, GPU rendering) are now resolved. The remaining compilation issue appears to be a code/configuration problem specific to the app module rather than an environmental or tooling issue.

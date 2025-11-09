# TASK-0911 Clarifications

## Outstanding Questions (Resolved)

This file serves as the evidence path for TASK-0911 clarifications.

## Resolution

### 1. VisionCamera Skia Frame Processor Use Cases
**Decisions** (comprehensive set selected):
- **Bounding boxes for AI analysis preview**: Draw bounding boxes on camera feed to preview detected objects/regions before capture. Visual feedback for AI editing workflow.
- **Live filters (brightness, contrast, saturation)**: Real-time GPU-accelerated filters rendered on camera feed. Preview editing adjustments before capture.
- **AI editing overlay previews**: Render AI-generated overlays (e.g., suggested edits, annotations) on camera feed. Interactive editing workflow.

Implementation scope: All three use cases pilot different Skia capabilities (shapes, filters, image overlays).

### 2. Memory Leak Profiling and Mitigation (Issue #3517)
**Approach** (comprehensive profiling selected):
- **Xcode Instruments / Android Profiler before/after**: Capture memory allocations during camera sessions. Establish baseline vs. Skia-enabled memory usage.
- **Frame processor cleanup hooks (useEffect unmount)**: Implement proper cleanup in frame processor worklets to release Skia resources on component unmount. Critical for preventing leaks.
- **Monitor long camera sessions (>5 min)**: Test extended camera usage to identify gradual memory growth patterns. Document leak rates.
- **Reference VisionCamera issue #3517 mitigations**: Apply upstream fixes or workarounds documented in GitHub issue #3517.

Profiling procedure:
1. Baseline: Profile current camera implementation without Skia
2. Implementation: Add Skia frame processors with cleanup hooks
3. Comparison: Profile memory usage during 5-10 minute camera sessions
4. Mitigation: Apply cleanup patterns and upstream fixes
5. Validation: Confirm no significant memory growth over extended sessions

### 3. expo-background-task Scheduling Strategy
**Decision**: Immediate dispatch with exponential backoff retry

Upload scheduling:
- Queue upload immediately after photo capture
- Retry on failure with exponential backoff (e.g., 1s, 2s, 4s, 8s, max 60s)
- Fast user feedback while handling transient network failures
- Use WorkManager (Android) and BGTaskScheduler (iOS) for reliable background execution

Rationale: Balances fast feedback with reliability. Users see upload progress immediately, retries handle network issues gracefully.

### 4. Feature Flag Strategy for Lower-End Devices
**Decisions** (dual strategy selected):
- **Device allowlist (only enable on known-good devices)**: Maintain list of devices with confirmed frame processor performance. Conservative rollout approach.
- **User toggle in Settings to enable/disable**: Allow users to opt-in/out of frame processors. Manual control for performance-sensitive users.

Implementation:
- Default: Frame processors disabled unless device on allowlist OR user manually enables
- Allowlist: Populate with devices tested to meet 16ms frame budget during frame processor operations
- Settings UI: Toggle to enable/disable frame processors with performance warning
- Telemetry: Log frame processing times to identify additional devices for allowlist

### 5. Upload Success Metrics
**Decision**: Baseline comparison with current upload system

Success metrics:
- **Upload success rate**: % of uploads that complete successfully without manual retry
  - Baseline: Measure current system success rate over 1-week period
  - Target: Match or exceed baseline (e.g., if baseline is 95%, target ≥95%)
- **End-to-end latency**: Time from capture to upload completion
  - Baseline: Measure current system p50/p95 latency
  - Target: p50 within 10% of baseline, p95 within 20% of baseline
- **Manual retry rate**: % of uploads requiring user intervention
  - Baseline: Current manual retry rate
  - Target: Reduce by ≥25% (exponential backoff should reduce manual retries)

Measurement approach:
1. Establish baseline metrics from current upload system (1-week sampling)
2. Implement expo-background-task with exponential backoff
3. Measure same metrics over 1-week period
4. Compare: success rate, latency percentiles, manual retry rate
5. Document improvements or regressions

## Notes

- This task pilots VisionCamera Skia frame processors and expo-background-task for uploads
- Blocked by TASK-0907 (requires Expo SDK 53 for expo-background-task)
- Addresses VisionCamera memory leak issue #3517 through comprehensive profiling and cleanup hooks
- Feature flags provide conservative rollout to prevent performance regressions on lower-end devices
- Upload success metrics baseline comparison ensures reliability improvement

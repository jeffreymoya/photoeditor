# ADR-0011: Android-First Pilot Rollout Strategy

**Status:** Accepted
**Date:** 2025-11-11
**Deciders:** Solo developer
**Related:** ADR-0009 (Mobile Stack Modernization), ADR-0012 (VisionCamera Skia Integration), TASK-0911

---

## Context

PhotoEditor's mobile app will introduce VisionCamera with Skia-powered camera overlays (bounding boxes, live filters, AI overlays) as part of the camera capture workflow. The pilot phase requires deciding whether to launch on both platforms simultaneously or adopt a staggered rollout strategy.

### Key Factors

1. **Resource Constraints**: Solo developer with limited capacity for parallel platform debugging
2. **Risk Management**: New camera functionality with GPU-accelerated frame processors introduces performance and stability unknowns
3. **Platform Differences**: iOS has a known memory leak issue (VisionCamera #3517) with `useSkiaFrameProcessor`, while Android status is unclear
4. **Market Context**: PhotoEditor targets global audience where Android dominates market share (>70% globally)
5. **Rollout Control**: Google Play supports instant staged rollout stops; iOS App Store rollout is all-or-nothing

### Industry Precedent

**Shopify Engineering** documented their React Native New Architecture migration strategy (2024):
- **Day 1**: Android 8%, iOS 0% (early stability signals)
- **Day 2**: Android 30%, iOS 1% (substantial Android data before iOS commitment)
- **Day 3**: Both 100% (after confirming no major issues)

**Rationale**: Android rollouts can be stopped instantly via Play Console, providing safety net before iOS commitment.

---

## Decision

**Adopt Android-first pilot strategy** for VisionCamera + Skia camera overlays feature.

### Rollout Phases

#### Phase 1: Android Pilot (Current Focus)
- **Scope**: Implement and validate VisionCamera + Skia overlays on Android only
- **Testing**: Android emulator + pilot tester devices (API 29+, 4GB+ RAM)
- **Duration**: 2-4 weeks from feature complete
- **Success Criteria**:
  - No critical crashes or memory issues
  - Frame processing consistently <16ms (60 FPS)
  - Positive pilot tester feedback
  - Feature flag toggle works as expected

#### Phase 2: iOS Evaluation (Post-Android Validation)
- **Trigger**: After Android pilot success + business viability confirmation
- **Approach**:
  1. Test current architecture on iOS simulator
  2. If VisionCamera issue #3517 reproduced → implement platform-specific workaround
  3. If no memory leak → ship with shared codebase
- **Timeline**: TBD based on Phase 1 outcomes

#### Phase 3: Dual-Platform Production (Future)
- **Scope**: Both platforms in production with feature flags
- **Monitoring**: Platform-specific telemetry and performance metrics
- **Gradual rollout**: Use platform-specific allowlists to control exposure

### Technical Implications

1. **Code Organization**:
   - **Maximize shared code** (frame processors, state management, UI components)
   - **Platform-specific files only when necessary** (e.g., `CameraWithOverlay.ios.tsx` if iOS workaround needed)
   - Follow React Native platform-specific code best practices

2. **Task Scoping**:
   - TASK-0911 series scoped to Android pilot only
   - iOS support tracked as separate future task series
   - Clear documentation of platform scope in all deliverables

3. **Documentation Requirements**:
   - All docs explicitly note "Android pilot" vs "iOS pending" status
   - Evidence bundles include Android validation only initially
   - Platform parity strategy documented for future iOS implementation

---

## Consequences

### Positive

1. **Risk Mitigation**: Android early signals before iOS commitment reduces blast radius
2. **Faster Iteration**: Single-platform focus enables faster debugging and validation
3. **Resource Efficiency**: Solo developer can focus deeply on one platform at a time
4. **Issue Isolation**: VisionCamera #3517 (iOS memory leak) deferred until iOS pilot phase
5. **Market Alignment**: Android-first aligns with global market share dominance
6. **Rollout Control**: Google Play staged rollout provides instant stop capability

### Negative

1. **iOS Delay**: iOS users won't access camera overlays feature until Phase 2
2. **Code Split Risk**: May require platform-specific components if iOS workaround needed (mitigated by React Native's platform-specific patterns)
3. **Dual Testing Cycles**: Eventually requires separate validation for both platforms (inevitable, just deferred)

### Neutral

1. **Platform Parity**: Not immediate, but achievable through documented strategy
2. **Technical Debt**: Minimal if shared code maximized; acceptable if split required for stability
3. **Market Coverage**: Android-first captures majority market share initially

---

## Alternatives Considered

### Alternative 1: Simultaneous Dual-Platform Launch
**Rejected because**:
- Doubles debugging surface area for solo developer
- iOS memory leak issue (#3517) could block entire launch
- No early signals before full commitment to both platforms
- Higher risk of cascading failures across platforms

### Alternative 2: iOS-First Pilot
**Rejected because**:
- iOS rollout is all-or-nothing (no staged rollout stop capability)
- Known memory leak issue (#3517) makes iOS higher risk
- Android market share dominance makes it more valuable initial target
- Premium iOS user base doesn't align with pilot risk tolerance

### Alternative 3: Web-Based Camera Alternative
**Rejected because**:
- Not relevant to platform rollout strategy decision
- Mobile-native camera features are core product differentiation
- WebRTC/MediaStream APIs don't match native camera capabilities

---

## Implementation Notes

### Dependencies
- **Blocked by**: None
- **Blocks**: TASK-0911 series (VisionCamera pilot tasks)
- **Related**: ADR-0012 (Skia integration architecture)

### Validation
- Python CLI task graph updated to reflect Android-only scope for Phase 1
- All TASK-0911 series tasks explicitly scoped to Android pilot
- Evidence files include platform scope documentation

### Future iOS Support Criteria
**Triggers for Phase 2 (iOS evaluation)**:
1. Android pilot completes successfully (no critical issues)
2. Business validation confirms market fit
3. User feedback from Android pilot is positive
4. Development capacity available for iOS work

**iOS Implementation Path**:
1. Test current architecture on iOS simulator
2. Reproduce/validate VisionCamera issue #3517 status
3. If leak exists: Implement separation architecture workaround (see ADR-0012)
4. If no leak: Ship with shared codebase
5. Create iOS-specific validation tasks (TASK-0911-iOS series)

---

## References

- [Shopify: Migrating to React Native's New Architecture](https://shopify.engineering/react-native-new-architecture) - Android-first rollout precedent
- [React Native: Platform-Specific Code](https://reactnative.dev/docs/platform-specific-code) - Official guidance for managing platform differences
- [VisionCamera Issue #3517](https://github.com/mrousavy/react-native-vision-camera/issues/3517) - iOS memory leak with useSkiaFrameProcessor
- ADR-0009: Mobile Stack Modernization
- ADR-0012: VisionCamera Skia Integration Architecture
- TASK-0911: VisionCamera + Background Task Pilot

/**
 * Camera Feature Public API
 *
 * Exported surface for camera overlays feature.
 * Follows standards/frontend-tier.md#coupling--cohesion-evidence:
 * - ≤5 exports per /public barrel
 * - Named exports only (no default exports)
 * - Single responsibility: camera overlay components and types
 *
 * @module features/camera/public
 */

// Component exports
export { CameraWithOverlay } from '../CameraWithOverlay';
export type {
  CameraWithOverlayProps,
  CameraPosition,
  OverlayType,
} from '../CameraWithOverlay';

// Frame processor types
export type {
  BoundingBox,
  FilterParams,
  OverlayConfig,
  CombinedOverlayOptions,
} from '../frameProcessors';

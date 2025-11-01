# Upload Feature

Resilient upload kit with retry, offline persistence, and network-aware pause/resume capabilities.

## Responsibility

Provides a complete upload workflow for mobile image uploads with the following capabilities:

- **Image preprocessing**: Resizes images to ≤4096px and converts HEIC to JPEG for compatibility
- **Presigned URL workflow**: Requests presigned URLs from backend and uploads directly to S3
- **Retry with exponential backoff**: Automatically retries failed requests with configurable backoff
- **Network-aware pause/resume**: Uses NetInfo to pause uploads on unsuitable networks and auto-resume when conditions improve
- **Progress tracking**: Provides real-time upload progress and status updates
- **Error handling**: Graceful error handling with retry predicates for transient failures

## Architecture

```
upload/
├── hooks/
│   └── useUpload.ts         # Main upload orchestration hook
├── components/
│   └── UploadButton.tsx     # Upload button with progress UI
├── public/
│   └── index.ts             # Public API exports
└── __tests__/               # Unit and component tests
```

Supporting utilities in `lib/upload/`:
- `preprocessing.ts` - Image preprocessing and format conversion
- `network.ts` - Network status monitoring and quality detection
- `retry.ts` - Retry logic with exponential backoff

## Public API

The feature exposes a controlled public API via `/public/index.ts`:

```typescript
import { useUpload, UploadStatus } from '@/features/upload/public';

const {
  progress,    // Current upload progress and status
  upload,      // Upload function
  pause,       // Manual pause
  resume,      // Manual resume
  reset,       // Reset state
  isPaused,    // Pause state
  networkStatus // Current network status
} = useUpload({
  allowMetered: false,  // Allow uploads on cellular
  maxRetries: 3,        // Max retry attempts
  onProgress: (p) => {},
  onSuccess: (jobId) => {},
  onError: (err) => {},
});
```

## Invariants

1. **Image preprocessing always runs before upload** - Ensures images meet size/format constraints
2. **Network suitability checked before upload** - Prevents uploads on unsuitable networks unless `allowMetered: true`
3. **Automatic pause on network degradation** - Upload pauses if network becomes unavailable during upload
4. **Retry only on transient failures** - Network errors and 5xx responses are retried; 4xx errors are not
5. **Maximum dimension enforcement** - All images resized to ≤4096px (largest dimension)
6. **HEIC automatic conversion** - HEIC/HEIF images always converted to JPEG for compatibility

## Edge Cases

### Network Changes During Upload

- **WiFi → Cellular**: If `allowMetered: false`, upload pauses automatically
- **Network lost**: Upload pauses with status `PAUSED`, auto-resumes when reconnected
- **Metered warning**: Can be configured to prevent uploads on cellular entirely

### Retry Scenarios

- **503 Service Unavailable**: Retried with exponential backoff up to `maxRetries`
- **Network timeout**: Retried with exponential backoff
- **429 Too Many Requests**: Retried with exponential backoff
- **400 Bad Request**: NOT retried (client error)
- **401 Unauthorized**: NOT retried (client error)

### Large Images

- Images >4096px are automatically downscaled while preserving aspect ratio
- HEIC images are converted to JPEG to ensure compatibility across platforms
- File size is checked after preprocessing to ensure upload constraints are met

### Concurrent Uploads

- Each `useUpload` hook instance manages a single upload
- For multiple uploads, create multiple hook instances or implement a queue

## Usage Example

```typescript
import React from 'react';
import { View, Alert } from 'react-native';
import { useUpload } from '@/features/upload/public';
import { UploadButton } from '@/features/upload/components/UploadButton';

export function MyScreen() {
  const { progress, upload } = useUpload({
    allowMetered: false,
    onSuccess: (jobId) => {
      Alert.alert('Success', `Upload complete: ${jobId}`);
    },
    onError: (error) => {
      Alert.alert('Error', error.message);
    },
  });

  const handleUpload = async (imageUri: string) => {
    try {
      const result = await upload(imageUri, 'https://api.example.com');
      console.log('Upload complete:', result);
    } catch (error) {
      console.error('Upload failed:', error);
    }
  };

  return (
    <View>
      <UploadButton
        status={progress.status}
        progress={progress.progress}
        onPress={() => handleUpload('file://path/to/image.jpg')}
      />
    </View>
  );
}
```

## Local Testing

### Unit Tests

```bash
npm test -- src/features/upload/__tests__
npm test -- src/lib/upload/__tests__
```

### Integration Tests with Network Mocking

```typescript
import { renderHook, act } from '@testing-library/react-hooks';
import NetInfo from '@react-native-community/netinfo';
import { useUpload, UploadStatus } from '@/features/upload/public';

// Mock NetInfo
jest.mock('@react-native-community/netinfo');

test('pauses upload when network lost', async () => {
  const { result } = renderHook(() => useUpload());

  // Simulate network loss
  act(() => {
    NetInfo.addEventListener.mock.calls[0][0]({
      isConnected: false,
      type: 'none',
    });
  });

  expect(result.current.progress.status).toBe(UploadStatus.PAUSED);
});
```

### Manual Testing

1. **Test retry logic**:
   - Disable network mid-upload
   - Verify automatic pause
   - Re-enable network
   - Verify automatic resume

2. **Test preprocessing**:
   - Upload image >4096px, verify downsizing
   - Upload HEIC image (iOS), verify JPEG conversion
   - Check file size of processed image

3. **Test metered network handling**:
   - Start upload on WiFi
   - Switch to cellular
   - Verify pause if `allowMetered: false`

## Testing Standards Compliance

Per the Testing Standards:

- **Lines coverage**: ≥70% for hooks and utilities
- **Branch coverage**: ≥60% for hooks and utilities
- **Mutation testing**: ≥50% for upload hooks
- **TSDoc coverage**: ≥70% for exported APIs

## Related ADRs

- ADR-0004: AWS Client Factory Pattern (if applicable to presigned URL generation)
- ADR-0003: Contract-First API (presigned URL request/response schemas)

## Dependencies

- `expo-file-system` - File operations
- `expo-image-manipulator` - Image preprocessing
- `@react-native-community/netinfo` - Network status monitoring
- `@/lib/upload/*` - Shared upload utilities

## Complexity Metrics

- Module complexity: Target ≤50 sum CC
- Component LOC: ≤200 per component
- Hook complexity: ≤15 CC

# Photo Editor Mobile App

React Native mobile application for AI-powered photo editing built with Expo.

## Features

- **Camera Integration**: Take photos directly within the app
- **Gallery Access**: Select images from device photo library
- **AI Photo Editing**: Send images to backend for AI-powered processing
- **Job Tracking**: Monitor processing status with real-time updates
- **Push Notifications**: Get notified when photo processing completes
- **Offline Support**: Queue jobs when offline, sync when connected
- **Redux State Management**: Centralized state with Redux Toolkit
- **Type Safety**: Full TypeScript implementation

## Tech Stack

- **Framework**: React Native with Expo (~50.0.0)
- **Navigation**: React Navigation v6
- **State Management**: Redux Toolkit with React Redux
- **Type System**: TypeScript
- **Camera**: Expo Camera
- **Notifications**: Expo Notifications
- **Storage**: AsyncStorage for local persistence
- **API Integration**: Custom service with zod validation
- **Testing**: Jest with React Native Testing Library

## Project Structure

```
src/
├── components/         # Reusable UI components
│   └── ErrorBoundary.tsx
├── screens/           # Screen components
│   ├── HomeScreen.tsx
│   ├── CameraScreen.tsx
│   ├── GalleryScreen.tsx
│   ├── JobsScreen.tsx
│   ├── SettingsScreen.tsx
│   ├── EditScreen.tsx
│   └── PreviewScreen.tsx
├── navigation/        # Navigation configuration
│   └── AppNavigator.tsx
├── services/          # API and external services
│   ├── ApiService.ts
│   └── NotificationService.ts
├── store/            # Redux store and slices
│   ├── index.ts
│   └── slices/
│       ├── imageSlice.ts
│       ├── jobSlice.ts
│       └── settingsSlice.ts
├── hooks/            # Custom React hooks
├── types/            # TypeScript type definitions
├── utils/            # Utility functions
└── constants/        # App constants
```

## Getting Started

### Prerequisites

- Node.js 18+
- npm or yarn
- Expo CLI (`npm install -g @expo/cli`)
- iOS Simulator (for iOS development)
- Android Studio (for Android development)

### Installation

1. **Install dependencies**:
   ```bash
   cd mobile
   npm install
   ```

2. **Start the development server**:
   ```bash
   npm start
   ```

3. **Run on device/simulator**:
   ```bash
   # iOS
   pnpm turbo run ios --filter=photoeditor-mobile

   # Android
   pnpm turbo run android --filter=photoeditor-mobile

   # Web (for testing)
   pnpm turbo run web --filter=photoeditor-mobile
   ```

## Available Scripts

- `pnpm turbo run start --filter=photoeditor-mobile` - Start Expo development server
- `pnpm turbo run ios --filter=photoeditor-mobile` - Run on iOS simulator
- `pnpm turbo run android --filter=photoeditor-mobile` - Run on Android emulator
- `pnpm turbo run web --filter=photoeditor-mobile` - Run in web browser
- `pnpm turbo run lint --filter=photoeditor-mobile` - Run ESLint
- `pnpm turbo run typecheck --filter=photoeditor-mobile` - Run TypeScript type checking
- `pnpm turbo run test --filter=photoeditor-mobile` - Run Jest tests
- `pnpm turbo run build:android --filter=photoeditor-mobile` - Build Android APK with EAS
- `pnpm turbo run build:ios --filter=photoeditor-mobile` - Build iOS app with EAS

## Configuration

### API Endpoint

The app connects to the photo editor backend API. Configure the endpoint in:

1. **Development**: Default endpoint in `ApiService.ts`
2. **Settings Screen**: Users can change endpoint in app
3. **Environment Variables**: Set via Expo configuration

### Notifications

Push notifications are configured for:

- Job completion alerts
- Processing status updates
- Error notifications

Configure notification settings in the Settings screen.

## Key Components

### ApiService

Handles all backend communication:

- Presigned URL requests
- Image uploads to S3
- Job status polling
- Error handling and retries

### Redux Store

Manages application state with three slices:

- **imageSlice**: Selected images and processing state
- **jobSlice**: Job tracking and status updates
- **settingsSlice**: User preferences and configuration

### NotificationService

Manages push notifications:

- Registration for push tokens
- Local and remote notification handling
- Job completion alerts

## Building for Production

### Android

1. **Configure signing**:
   ```bash
   eas credentials
   ```

2. **Build APK**:
   ```bash
   pnpm turbo run build:android --filter=photoeditor-mobile
   ```

### iOS

1. **Configure certificates**:
   ```bash
   eas credentials
   ```

2. **Build IPA**:
   ```bash
   pnpm turbo run build:ios --filter=photoeditor-mobile
   ```

## Testing

Run the test suite:

```bash
pnpm turbo run test --filter=photoeditor-mobile
```

Tests cover:
- Component rendering
- Redux state management
- API service methods
- Navigation flows
- Error handling

## Permissions

The app requires these permissions:

### iOS
- Camera usage (taking photos)
- Photo library access (selecting images)
- Photo library addition (saving edited photos)
- Push notifications

### Android
- Camera
- Read external storage
- Write external storage
- Internet access
- Network state

## Development Guidelines

### Code Style

- Use TypeScript for all new code
- Follow React hooks patterns
- Use Redux Toolkit for state management
- Implement proper error boundaries
- Add tests for critical functionality

### Performance

- Optimize images before upload
- Implement proper loading states
- Use React.memo for expensive components
- Minimize re-renders with proper dependencies

### Security

- Validate all API responses with zod
- Store sensitive data in secure storage
- Implement proper error handling
- Don't log sensitive information

## Troubleshooting

### Common Issues

1. **Metro bundler issues**: Clear cache with `npx expo start --clear`
2. **iOS build fails**: Check Xcode and iOS SDK versions
3. **Android build fails**: Verify Android SDK and Java versions
4. **API connection fails**: Check network connectivity and endpoint

### Debug Mode

Enable debug features:

```typescript
// In ApiService.ts
const DEBUG = __DEV__;
```

This enables:
- Detailed API logging
- Error stack traces
- Development endpoints

## Contributing

1. Create feature branch from `develop`
2. Implement changes with tests
3. Run linting and type checks
4. Submit pull request

## Deployment

The app deploys automatically via GitHub Actions:

- **Development builds**: Push to `develop` branch
- **Production builds**: Push to `main` branch
- **App stores**: Manual deployment after approval

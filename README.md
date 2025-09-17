# TransfaApp

A React Native application built with TypeScript.

## Prerequisites

- Node.js (>=18)
- React Native CLI
- Android Studio (for Android development)
- Xcode (for iOS development - macOS only)

## Installation

1. Install dependencies:

```bash
npm install
```

## Running the App

### Android

1. Make sure you have an Android emulator running or a device connected
2. Run the app:

```bash
npm run android
# or
npx react-native run-android
```

### iOS (macOS only)

1. Navigate to the iOS directory:

```bash
cd ios
```

2. Install CocoaPods dependencies:

```bash
pod install
```

3. Go back to the root directory:

```bash
cd ..
```

4. Run the app:

```bash
npm run ios
# or
npx react-native run-ios
```

## Project Structure

- `App.tsx` - Main application component
- `index.js` - Entry point for the app
- `android/` - Android-specific code and configuration
- `ios/` - iOS-specific code and configuration
- `package.json` - Dependencies and scripts

## Development

The app uses:

- React Native 0.74.1
- TypeScript
- React 19.1.1
- Clerk for authentication (@clerk/clerk-expo)
- React Navigation for navigation
- Various other React Native libraries

## Troubleshooting

### WSL2 Users

If you're developing on WSL2 (Windows Subsystem for Linux):

- Android development works fine
- iOS development requires macOS - you'll need to use a Mac or macOS VM for iOS development
- The project structure is ready for iOS development when you have access to macOS

### Common Issues

1. If you get Metro bundler issues, try:

```bash
npx react-native start --reset-cache
```

2. If Android build fails, make sure you have the correct Android SDK and build tools installed in Android Studio.

3. For iOS, make sure you have Xcode and CocoaPods installed on macOS.

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

## Environment Variables

Frontend runtime variables are loaded from `.env`. Key values:

- `EXPO_PUBLIC_API_GATEWAY_URL` - API gateway base URL.
- `EXPO_PUBLIC_PLATFORM_FEE_SERVICE_URL` - Platform fee service base URL.

## Backend Onboarding Notes

### Manual Tier2 Reconciliation (Anchor KYC Already Completed)

Anchor may occasionally complete Tier2 verification before our trigger runs, returning `412 Kyc already completed`. To align internal state:

1. Confirm the customer is approved inside the Anchor dashboard.
2. Record the Anchor Customer ID for that user.
3. Link it internally by running the admin recovery job in `customer-service` (or manually invoking `UpdateAnchorCustomerInfo`).
4. Update `onboarding_status` for `tier2` to `completed` via Supabase or the admin script.
5. If account provisioning hasn’t occurred, publish a `customer.verified` event so `account-service` creates the deposit account.

Documenting this runbook prevents retry storms and keeps the system consistent with Anchor.

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

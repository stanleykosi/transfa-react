/**
 * @description
 * Platform-specific Clerk provider that uses @clerk/clerk-react for web
 * and @clerk/clerk-expo for mobile platforms. This ensures proper
 * authentication functionality across all platforms.
 *
 * @dependencies
 * - @clerk/clerk-react: For web platform authentication
 * - @clerk/clerk-expo: For mobile platform authentication
 * - expo-secure-store: For secure token storage on mobile
 * - react-native: For Platform detection
 */

import React from 'react';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

// Platform-specific imports
import { ClerkProvider as ClerkExpoProvider } from '@clerk/clerk-expo';
import { ClerkProvider as ClerkReactProvider } from '@clerk/clerk-react';

// Appearance configuration
import { getClerkAppearance } from '@/config/clerkAppearance';

// Platform-specific token cache implementation for mobile
const tokenCache = {
  async getToken(key: string) {
    try {
      return SecureStore.getItemAsync(key);
    } catch (err) {
      console.error('Failed to get token from storage', err);
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      return SecureStore.setItemAsync(key, value);
    } catch (err) {
      console.error('Failed to save token to storage', err);
    }
  },
};

interface ClerkProviderProps {
  children: React.ReactNode;
  publishableKey: string;
}

const ClerkProvider: React.FC<ClerkProviderProps> = ({ children, publishableKey }) => {
  const appearance = getClerkAppearance();

  if (Platform.OS === 'web') {
    // Use @clerk/clerk-react for web platform with custom appearance
    return (
      <ClerkReactProvider publishableKey={publishableKey} appearance={appearance}>
        {children}
      </ClerkReactProvider>
    );
  }

  // Use @clerk/clerk-expo for mobile platforms with token cache and custom appearance
  return (
    <ClerkExpoProvider
      tokenCache={tokenCache}
      publishableKey={publishableKey}
      appearance={appearance}
    >
      {children}
    </ClerkExpoProvider>
  );
};

export default ClerkProvider;

/**
 * @description
 * This is the root component of the Transfa application. It sets up all the
 * essential providers that wrap the entire app.
 *
 * @dependencies
 * - react: Core React library.
 * - @clerk/clerk-expo: Provides the ClerkProvider for handling authentication state.
 * - @tanstack/react-query: Provides QueryClient and QueryClientProvider for server state management.
 * - @react-navigation/native: Provides the NavigationContainer to manage the app's navigation stack.
 * - expo-secure-store: Used by Clerk for secure token storage.
 * - RootNavigator: The main navigator component that decides which screen stack to show.
 *
 * @notes
 * - The `ClerkProvider` requires the `publishableKey` from your Clerk dashboard.
 * - The `tokenCache` is configured to use `expo-secure-store` for securely persisting
 *   authentication tokens on the device, as per security best practices.
 * - The `QueryClient` is instantiated here and passed to the `QueryClientProvider`,
 *   making server state management available throughout the component tree.
 */

import React from 'react';
import { ClerkProvider } from '@clerk/clerk-expo';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { NavigationContainer } from '@react-navigation/native';
import RootNavigator from '@/navigation/RootNavigator';
import { SafeAreaProvider } from 'react-native-safe-area-context';

// Initialize the QueryClient for TanStack Query
const queryClient = new QueryClient();

// Platform-specific token cache implementation for Clerk.
// Uses expo-secure-store for mobile platforms and localStorage for web.
const tokenCache = {
  async getToken(key: string) {
    try {
      if (Platform.OS === 'web') {
        // Use localStorage for web platform
        return localStorage.getItem(key);
      } else {
        // Use expo-secure-store for mobile platforms
        return SecureStore.getItemAsync(key);
      }
    } catch (err) {
      // Errors are logged but not thrown, allowing the app to proceed
      // in a degraded state if secure store is unavailable.
      console.error('Failed to get token from storage', err);
      return null;
    }
  },
  async saveToken(key: string, value: string) {
    try {
      if (Platform.OS === 'web') {
        // Use localStorage for web platform
        localStorage.setItem(key, value);
      } else {
        // Use expo-secure-store for mobile platforms
        return SecureStore.setItemAsync(key, value);
      }
    } catch (err) {
      // Log errors during token saving.
      console.error('Failed to save token to storage', err);
    }
  },
};

// Retrieve the Clerk Publishable Key from environment variables.
// It's crucial to have this in a .env file and not hardcoded.
const CLERK_PUBLISHABLE_KEY = process.env.EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY;

// For development purposes, we'll use a placeholder key if none is provided
// In production, this should always be set
const PUBLISHABLE_KEY = CLERK_PUBLISHABLE_KEY || 'pk_test_placeholder_key_for_development';

if (!CLERK_PUBLISHABLE_KEY) {
  console.warn(
    '⚠️  Missing Clerk Publishable Key. Please set EXPO_PUBLIC_CLERK_PUBLISHABLE_KEY in your .env file for full functionality.'
  );
}

function App(): React.JSX.Element {
  return (
    <ClerkProvider tokenCache={tokenCache} publishableKey={PUBLISHABLE_KEY}>
      <QueryClientProvider client={queryClient}>
        <SafeAreaProvider>
          <NavigationContainer>
            <RootNavigator />
          </NavigationContainer>
        </SafeAreaProvider>
      </QueryClientProvider>
    </ClerkProvider>
  );
}

export default App;

/**
 * @description
 * The RootNavigator is the primary navigation component that acts as a switch
 * between the authentication flow and the main application flow. It uses the
 * authentication state from Clerk to determine which navigator to display.
 *
 * @dependencies
 * - react: Core React library for component logic.
 * - react-native: For UI components like View, ActivityIndicator, StyleSheet.
 * - @clerk/clerk-expo: The `useAuth` hook provides user authentication state.
 * - AuthStack: The navigator for unauthenticated users (Sign In, Sign Up).
 * - AppStack: The main tab navigator for authenticated users.
 * - @/constants/theme: For styling the loading indicator container.
 *
 * @notes
 * - It handles the initial loading state (`isLoaded`) from Clerk to show a spinner
 *   while the authentication session is being verified.
 * - If the user is signed in (`isSignedIn`), it renders the `AppStack`.
 * - Otherwise, it renders the `AuthStack`.
 * - This component is essential for implementing protected routes.
 */

import React from 'react';
import { View, ActivityIndicator, StyleSheet } from 'react-native';
import { useAuth } from '@/hooks/useAuth';
import AuthStack from './AuthStack';
import AppStack from './AppStack';
import { theme } from '@/constants/theme';

const RootNavigator = () => {
  const { isLoaded, isSignedIn } = useAuth();

  // Show a loading indicator while Clerk is verifying the session.
  if (!isLoaded) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
      </View>
    );
  }

  // Conditionally render the correct navigator based on authentication state.
  return isSignedIn ? <AppStack /> : <AuthStack />;
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
});

export default RootNavigator;

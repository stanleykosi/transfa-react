/**
 * @description
 * Placeholder screen for the Home tab. This will be the main dashboard for the user,
 * displaying their wallet balance and primary actions like "Send/Move".
 *
 * @dependencies
 * - react-native: For Text component.
 * - @/components/ScreenWrapper: For consistent screen layout and safe area handling.
 */
import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import { theme } from '@/constants/theme';

const HomeScreen = () => {
  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Home Screen</Text>
        <Text style={styles.subtitle}>User dashboard and wallet balance will be here.</Text>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.s8,
  },
});

export default HomeScreen;

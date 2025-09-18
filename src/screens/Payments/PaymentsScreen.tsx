/**
 * @description
 * Placeholder screen for the Payments tab. This section will likely contain
 * transaction history, payment requests, and other payment-related features.
 *
 * @dependencies
 * - react-native: For Text component.
 * - @/components/ScreenWrapper: For consistent screen layout and safe area handling.
 */
import React from 'react';
import { Text, View, StyleSheet } from 'react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import { theme } from '@/constants/theme';

const PaymentsScreen = () => {
  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Payments Screen</Text>
        <Text style={styles.subtitle}>Transaction history will be displayed here.</Text>
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

export default PaymentsScreen;

/**
 * @description
 * Placeholder screen for the Transaction History tab within the Payments section.
 * This will eventually display a list of all the user's past transactions.
 *
 * @dependencies
 * - react, react-native: For UI components.
 * - @/constants/theme: For styling.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { theme } from '@/constants/theme';

const PaymentHistoryScreen = () => {
  return (
    <View style={styles.container}>
      <Text style={styles.placeholderText}>Transaction history will appear here.</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: theme.colors.background,
  },
  placeholderText: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
  },
});

export default PaymentHistoryScreen;

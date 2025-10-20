/**
 * @description
 * This screen acts as a container for a top tab navigator that separates
 * Transaction History and Payment Requests, fulfilling the "Persistent Payment
 * Requests Tab" requirement from the specification.
 *
 * @dependencies
 * - react-native: For core components.
 * - @/navigation/PaymentsTabNavigator: The actual tab navigator component.
 * - @/components/ScreenWrapper: To provide a consistent safe area and background.
 */
import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import PaymentsTabNavigator from '@/navigation/PaymentsTabNavigator';
import { theme } from '@/constants/theme';

const PaymentsScreen = () => {
  return (
    <ScreenWrapper style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Payments</Text>
      </View>
      <PaymentsTabNavigator />
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0, // Let the tab navigator handle its own padding
  },
  header: {
    paddingHorizontal: theme.spacing.s24,
    paddingBottom: theme.spacing.s16,
  },
  title: {
    fontSize: theme.fontSizes['3xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
  },
});

export default PaymentsScreen;

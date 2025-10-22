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
        <View style={styles.sectionLabels}>
          <Text style={styles.sectionLabel}>Transaction History</Text>
          <Text style={styles.sectionLabel}>Payment Requests</Text>
        </View>
      </View>
      <PaymentsTabNavigator />
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: 0,
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
  sectionLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: theme.spacing.s12,
  },
  sectionLabel: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeights.medium,
    textTransform: 'uppercase',
    letterSpacing: 0.5,
  },
});

export default PaymentsScreen;

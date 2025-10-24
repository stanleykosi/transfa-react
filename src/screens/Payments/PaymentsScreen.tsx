/**
 * @description
 * Simplified Payments screen that ONLY shows transaction history.
 * No tabs - just the transaction history list.
 *
 * @dependencies
 * - react-native: For core components
 * - @/screens/Payments/PaymentHistoryScreen: The transaction history component
 * - @/components/ScreenWrapper: To provide a consistent safe area and background
 */
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import PaymentHistoryScreen from '@/screens/Payments/PaymentHistoryScreen';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

const PaymentsScreen = () => {
  return (
    <ScreenWrapper style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.iconContainer}>
            <Ionicons name="receipt" size={28} color={theme.colors.primary} />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.title}>Transaction History</Text>
            <Text style={styles.subtitle}>View all your payment transactions</Text>
          </View>
        </View>
      </View>

      {/* Directly render transaction history */}
      <View style={styles.contentContainer}>
        <PaymentHistoryScreen />
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
    paddingVertical: 0,
    flex: 1,
  },
  header: {
    paddingHorizontal: theme.spacing.s20,
    paddingTop: theme.spacing.s16,
    paddingBottom: theme.spacing.s16,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 3,
      },
    }),
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.s12,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s2,
  },
  subtitle: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  contentContainer: {
    flex: 1,
  },
});

export default PaymentsScreen;

/**
 * @description
 * Enhanced Payments screen with modern fintech UI and improved tab styling.
 * Acts as a container for a top tab navigator that separates Transaction History
 * and Payment Requests with clear visual distinction and professional design.
 *
 * @dependencies
 * - react-native: For core components
 * - @/navigation/PaymentsTabNavigator: The actual tab navigator component
 * - @/components/ScreenWrapper: To provide a consistent safe area and background
 */
import React from 'react';
import { View, Text, StyleSheet, Platform } from 'react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import PaymentsTabNavigator from '@/navigation/PaymentsTabNavigator';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';

const PaymentsScreen = () => {
  return (
    <ScreenWrapper style={styles.container}>
      {/* Header with Icon */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.iconContainer}>
            <Ionicons name="wallet" size={28} color={theme.colors.primary} />
          </View>
          <View>
            <Text style={styles.title}>Payments</Text>
            <Text style={styles.subtitle}>View your activity</Text>
          </View>
        </View>
      </View>

      {/* Tab Navigator */}
      <View style={styles.tabContainer}>
        <PaymentsTabNavigator />
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
    paddingHorizontal: theme.spacing.s24,
    paddingTop: theme.spacing.s16,
    paddingBottom: theme.spacing.s20,
    backgroundColor: theme.colors.surface,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.05,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconContainer: {
    width: 56,
    height: 56,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.s16,
  },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s4,
  },
  subtitle: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeights.medium,
  },
  tabContainer: {
    flex: 1,
  },
});

export default PaymentsScreen;

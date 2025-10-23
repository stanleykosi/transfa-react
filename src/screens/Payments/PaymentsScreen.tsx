/**
 * @description
 * Redesigned Payments screen with CRYSTAL CLEAR tab distinction.
 * Features prominent header, descriptive subtitle, and highly visible tabs
 * that clearly separate Transaction History from Payment Requests.
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
      {/* Enhanced Header with Clear Description */}
      <View style={styles.header}>
        <View style={styles.headerContent}>
          <View style={styles.iconContainer}>
            <Ionicons name="wallet" size={32} color={theme.colors.primary} />
          </View>
          <View style={styles.headerTextContainer}>
            <Text style={styles.title}>Payments</Text>
            <Text style={styles.subtitle}>View your financial activity</Text>
          </View>
        </View>

        {/* Info Banner - Explains the two sections */}
        <View style={styles.infoBanner}>
          <Ionicons name="information-circle" size={18} color={theme.colors.info} />
          <Text style={styles.infoBannerText}>
            Swipe between tabs to view your transaction history or payment requests
          </Text>
        </View>
      </View>

      {/* Tab Navigator with Enhanced Visibility */}
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
    marginBottom: theme.spacing.s12,
  },
  iconContainer: {
    width: 60,
    height: 60,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.s16,
  },
  headerTextContainer: {
    flex: 1,
  },
  title: {
    fontSize: theme.fontSizes['3xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s4,
  },
  subtitle: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeights.medium,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#EFF6FF', // Blue 50
    paddingVertical: theme.spacing.s10,
    paddingHorizontal: theme.spacing.s12,
    borderRadius: theme.radii.md,
    gap: theme.spacing.s8,
  },
  infoBannerText: {
    flex: 1,
    fontSize: theme.fontSizes.xs,
    color: theme.colors.info,
    fontWeight: theme.fontWeights.medium,
    lineHeight: 16,
  },
  tabContainer: {
    flex: 1,
  },
});

export default PaymentsScreen;

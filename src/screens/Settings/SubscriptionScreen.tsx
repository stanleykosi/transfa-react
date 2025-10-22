/**
 * @description
 * This screen allows users to view and manage their Transfa subscription.
 * It displays their current plan (Free or Premium), their usage of monthly
 * free external transfers, and provides options to upgrade or manage auto-renewal.
 *
 * Key features:
 * - Fetches and displays the user's current subscription status.
 * - Shows a progress bar for free transfer usage.
 * - Allows users to upgrade to a premium plan.
 * - Allows subscribed users to toggle auto-renewal.
 *
 * @dependencies
 * - react, react-native: For UI components and state management.
 * - @react-navigation/native: For navigation actions.
 * - @/components/*: Reusable UI components.
 * - @/api/subscriptionApi: Hooks for managing subscription state.
 * - @expo/vector-icons: For UI icons.
 */
import React from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  ActivityIndicator,
  Alert,
  Switch,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ScreenWrapper from '@/components/ScreenWrapper';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import {
  useSubscriptionStatus,
  useUpgradeSubscription,
  useToggleAutoRenew,
} from '@/api/subscriptionApi';
import ActionButton from '@/components/ActionButton';
import EnhancedCard from '@/components/EnhancedCard';

const SubscriptionScreen = () => {
  const navigation = useNavigation();
  const { data: status, isLoading, isError, error } = useSubscriptionStatus();
  const { mutate: upgrade, isPending: isUpgrading } = useUpgradeSubscription({
    onSuccess: () => {
      Alert.alert('Success', 'You have been upgraded to the Premium plan!');
    },
    onError: (err) => {
      Alert.alert('Upgrade Failed', err.message || 'Could not process your upgrade.');
    },
  });
  const { mutate: toggleAutoRenew, isPending: isToggling } = useToggleAutoRenew({
    onSuccess: () => {
      Alert.alert('Success', 'Your auto-renewal setting has been updated.');
    },
    onError: (err) => {
      Alert.alert('Error', err.message || 'Could not update your auto-renewal setting.');
    },
  });

  const handleUpgrade = () => {
    Alert.alert(
      'Confirm Upgrade',
      'Are you sure you want to upgrade to the Premium plan? The subscription fee will be deducted from your wallet monthly.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Upgrade', onPress: () => upgrade() },
      ]
    );
  };

  const renderContent = () => {
    if (isLoading) {
      return (
        <View style={styles.centered}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading your subscription...</Text>
        </View>
      );
    }

    if (isError || !status) {
      return (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.colors.error} />
          <Text style={styles.errorText}>
            {error?.message || 'Could not load subscription details.'}
          </Text>
          <ActionButton
            title="Retry"
            icon="refresh"
            variant="primary"
            onPress={() => {
              // Force refetch the subscription status
              navigation.goBack();
              navigation.navigate('Subscription');
            }}
            style={{ marginTop: theme.spacing.s16 }}
          />
        </View>
      );
    }

    const { status: planStatus, auto_renew, is_active, transfers_remaining } = status;

    // Handle all possible subscription statuses
    const isPremium = is_active;
    const isLapsed = planStatus === 'lapsed';

    // Validate data integrity
    if (typeof transfers_remaining !== 'number') {
      console.error('Invalid transfers_remaining value:', transfers_remaining);
      return (
        <View style={styles.centered}>
          <Ionicons name="alert-circle-outline" size={48} color={theme.colors.error} />
          <Text style={styles.errorText}>Invalid subscription data received.</Text>
        </View>
      );
    }

    // Handle edge cases for usage calculation
    let usagePercentage = 0;
    let usedTransfers = 0;
    let maxTransfers = 5;

    if (transfers_remaining === -1) {
      // Premium user - unlimited transfers
      usagePercentage = 0;
      usedTransfers = 0;
      maxTransfers = 0; // Show as unlimited
    } else if (transfers_remaining < 0) {
      // Over-limit scenario - show 100% usage
      usagePercentage = 100;
      usedTransfers = 5;
    } else {
      // Normal free tier calculation
      usedTransfers = Math.max(0, 5 - transfers_remaining);
      usagePercentage = Math.min(100, (usedTransfers / 5) * 100);
    }

    return (
      <ScrollView showsVerticalScrollIndicator={false}>
        <EnhancedCard variant="gradient" style={styles.statusCard}>
          <Text style={styles.planLabel}>Current Plan</Text>
          <Text style={styles.planName}>
            {isPremium ? '⭐ Premium' : isLapsed ? '⚠️ Lapsed' : '🆓 Free Tier'}
          </Text>
          <Text style={styles.planDescription}>
            {isPremium
              ? 'Enjoy unlimited external transfers and multiple linked accounts.'
              : isLapsed
                ? 'Your subscription has lapsed. Upgrade to restore premium features.'
                : 'You get a limited number of free transfers each month.'}
          </Text>
          {isLapsed && (
            <View style={styles.lapsedWarning}>
              <Ionicons name="warning" size={16} color={theme.colors.textOnPrimary} />
              <Text style={styles.lapsedWarningText}>
                Your subscription expired. Some features may be limited.
              </Text>
            </View>
          )}
        </EnhancedCard>

        {!isPremium && (
          <EnhancedCard variant="elevated" style={styles.usageCard}>
            <View style={styles.usageHeader}>
              <View style={styles.usageIconContainer}>
                <Ionicons name="stats-chart" size={20} color={theme.colors.primary} />
              </View>
              <View style={styles.usageContent}>
                <Text style={styles.usageTitle}>Monthly External Transfers</Text>
                <Text style={styles.usageCount}>
                  {usedTransfers} / {maxTransfers} used
                </Text>
              </View>
            </View>
            <View style={styles.progressBarBackground}>
              <View style={[styles.progressBarFill, { width: `${usagePercentage}%` }]} />
            </View>
            {transfers_remaining < 0 && (
              <View style={styles.overLimitBanner}>
                <Ionicons name="alert-circle" size={16} color={theme.colors.error} />
                <Text style={styles.overLimitText}>
                  You've exceeded your monthly limit. Transfers will use your internal wallet until
                  next month or upgrade to Premium.
                </Text>
              </View>
            )}
          </EnhancedCard>
        )}

        {isPremium ? (
          <EnhancedCard variant="default" style={styles.manageCard}>
            <View style={styles.autoRenewRow}>
              <View style={styles.autoRenewIconContainer}>
                <Ionicons name="repeat" size={20} color={theme.colors.primary} />
              </View>
              <View style={styles.autoRenewContent}>
                <Text style={styles.autoRenewTitle}>Auto-Renew Subscription</Text>
                <Text style={styles.autoRenewDesc}>
                  {auto_renew
                    ? 'Your plan will automatically renew monthly.'
                    : 'Auto-renewal is disabled. Your subscription will not renew.'}
                </Text>
              </View>
              <Switch
                value={auto_renew}
                onValueChange={(value) => {
                  if (value) {
                    Alert.alert(
                      'Enable Auto-Renewal',
                      'Are you sure you want to enable auto-renewal? Your subscription will automatically renew monthly.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Enable', onPress: () => toggleAutoRenew(true) },
                      ]
                    );
                  } else {
                    Alert.alert(
                      'Disable Auto-Renewal',
                      'Are you sure you want to disable auto-renewal? Your subscription will not renew at the end of the current period.',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        { text: 'Disable', onPress: () => toggleAutoRenew(false) },
                      ]
                    );
                  }
                }}
                trackColor={{ false: theme.colors.border, true: theme.colors.primary }}
                thumbColor={theme.colors.surface}
                disabled={isToggling}
              />
            </View>
          </EnhancedCard>
        ) : (
          <ActionButton
            title="Upgrade to Premium"
            icon="rocket"
            variant="primary"
            size="large"
            onPress={handleUpgrade}
            loading={isUpgrading}
          />
        )}
      </ScrollView>
    );
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Subscription</Text>
        <View style={{ width: 24 }} />
      </View>
      {renderContent()}
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.s24,
  },
  backButton: {
    padding: theme.spacing.s4,
  },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: theme.spacing.s16,
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
  },
  errorText: {
    marginTop: theme.spacing.s16,
    fontSize: theme.fontSizes.base,
    color: theme.colors.error,
    textAlign: 'center',
  },
  statusCard: {
    marginBottom: theme.spacing.s24,
    alignItems: 'center',
  },
  planLabel: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textOnPrimary,
    opacity: 0.9,
    marginBottom: theme.spacing.s8,
  },
  planName: {
    fontSize: 32,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textOnPrimary,
    marginBottom: theme.spacing.s8,
  },
  planDescription: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textOnPrimary,
    opacity: 0.95,
    textAlign: 'center',
    lineHeight: 22,
  },
  lapsedWarning: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.s8,
    marginTop: theme.spacing.s16,
    padding: theme.spacing.s12,
    backgroundColor: 'rgba(255, 255, 255, 0.2)',
    borderRadius: theme.radii.md,
  },
  lapsedWarningText: {
    flex: 1,
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textOnPrimary,
    fontWeight: theme.fontWeights.semibold,
  },
  usageCard: {
    marginBottom: theme.spacing.s24,
  },
  usageHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.s16,
  },
  usageIconContainer: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.s12,
  },
  usageContent: {
    flex: 1,
  },
  usageTitle: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s4,
  },
  usageCount: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeights.medium,
  },
  progressBarBackground: {
    height: 12,
    backgroundColor: theme.colors.border,
    borderRadius: theme.radii.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.full,
  },
  overLimitBanner: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: theme.spacing.s8,
    marginTop: theme.spacing.s16,
    padding: theme.spacing.s12,
    backgroundColor: '#FEE2E2', // Red 100
    borderRadius: theme.radii.md,
  },
  overLimitText: {
    flex: 1,
    fontSize: theme.fontSizes.sm,
    color: theme.colors.error,
    lineHeight: 20,
    fontWeight: theme.fontWeights.medium,
  },
  manageCard: {
    marginBottom: theme.spacing.s16,
  },
  autoRenewRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  autoRenewIconContainer: {
    width: 40,
    height: 40,
    borderRadius: theme.radii.md,
    backgroundColor: theme.colors.primaryLight,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: theme.spacing.s12,
  },
  autoRenewContent: {
    flex: 1,
    marginRight: theme.spacing.s12,
  },
  autoRenewTitle: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s4,
  },
  autoRenewDesc: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    lineHeight: 18,
  },
});

export default SubscriptionScreen;

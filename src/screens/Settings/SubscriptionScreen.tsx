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
import PrimaryButton from '@/components/PrimaryButton';
import Card from '@/components/Card';

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
          <PrimaryButton
            title="Retry"
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
        <Card style={styles.statusCard}>
          <Text style={styles.planLabel}>Current Plan</Text>
          <Text style={styles.planName}>
            {isPremium ? 'Premium' : isLapsed ? 'Lapsed' : 'Free Tier'}
          </Text>
          <Text style={styles.planDescription}>
            {isPremium
              ? 'Enjoy unlimited external transfers and multiple linked accounts.'
              : isLapsed
                ? 'Your subscription has lapsed. Upgrade to restore premium features.'
                : 'You get a limited number of free transfers each month.'}
          </Text>
          {isLapsed && (
            <Text style={styles.lapsedWarning}>
              ⚠️ Your subscription expired. Some features may be limited.
            </Text>
          )}
        </Card>

        {!isPremium && (
          <Card style={styles.usageCard}>
            <View style={styles.usageHeader}>
              <Text style={styles.usageTitle}>Monthly External Transfers</Text>
              <Text style={styles.usageCount}>
                {usedTransfers} / {maxTransfers} used
              </Text>
            </View>
            <View style={styles.progressBarBackground}>
              <View style={[styles.progressBarFill, { width: `${usagePercentage}%` }]} />
            </View>
            {transfers_remaining < 0 && (
              <Text style={styles.overLimitText}>
                ⚠️ You've exceeded your monthly limit. Transfers will automatically use your
                internal wallet until next month or upgrade to Premium.
              </Text>
            )}
          </Card>
        )}

        {isPremium ? (
          <Card style={styles.manageCard}>
            <View style={styles.autoRenewRow}>
              <View>
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
          </Card>
        ) : (
          <PrimaryButton
            title="Upgrade to Premium"
            onPress={handleUpgrade}
            isLoading={isUpgrading}
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
    backgroundColor: theme.colors.primary,
  },
  planLabel: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textOnPrimary,
    opacity: 0.8,
  },
  planName: {
    fontSize: 28,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textOnPrimary,
    marginVertical: theme.spacing.s8,
  },
  planDescription: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textOnPrimary,
    opacity: 0.9,
    textAlign: 'center',
  },
  usageCard: {
    marginBottom: theme.spacing.s24,
  },
  usageHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.s12,
  },
  usageTitle: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
  },
  usageCount: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  progressBarBackground: {
    height: 10,
    backgroundColor: theme.colors.border,
    borderRadius: theme.radii.full,
    overflow: 'hidden',
  },
  progressBarFill: {
    height: '100%',
    backgroundColor: theme.colors.primary,
    borderRadius: theme.radii.full,
  },
  manageCard: {
    paddingVertical: theme.spacing.s8,
  },
  autoRenewRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  autoRenewTitle: {
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
  },
  autoRenewDesc: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.s4,
  },
  overLimitText: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.error,
    marginTop: theme.spacing.s8,
    textAlign: 'center',
    fontWeight: theme.fontWeights.semibold,
  },
  lapsedWarning: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.error,
    marginTop: theme.spacing.s8,
    textAlign: 'center',
    fontWeight: theme.fontWeights.semibold,
  },
});

export default SubscriptionScreen;

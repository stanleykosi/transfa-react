/**
 * @description
 * Redesigned Home screen with modern fintech UI featuring card-based layout,
 * icon buttons, and professional styling. Main dashboard displaying wallet balance
 * and primary actions like "Pay Someone", "Self Transfer", and "Create Payment Request".
 *
 * @dependencies
 * - react-native: For core components
 * - @/components/ScreenWrapper: For consistent screen layout and safe area handling
 * - @/components/EnhancedCard: For modern card components
 * - @/components/ActionButton: For icon-based action buttons
 */
import React, { useEffect, useState, useCallback } from 'react';
import {
  Text,
  View,
  StyleSheet,
  ActivityIndicator,
  ScrollView,
  RefreshControl,
  Platform,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ScreenWrapper from '@/components/ScreenWrapper';
import ActionButton from '@/components/ActionButton';
import { theme } from '@/constants/theme';
import apiClient from '@/api/apiClient';
import { useAuth } from '@clerk/clerk-expo';
import { useAccountBalance, useUserProfile } from '@/api/transactionApi';
import { formatCurrency } from '@/utils/formatCurrency';
import { LinearGradient } from 'expo-linear-gradient';

const HomeScreen = () => {
  const navigation = useNavigation();
  const { getToken } = useAuth();
  const [loading, setLoading] = useState(true);
  const [nuban, setNuban] = useState<string | null>(null);
  const [bankName, setBankName] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch user profile from database (includes username, UUID)
  const { data: userProfile, isLoading: isLoadingProfile } = useUserProfile();

  // Fetch account balance with caching
  const {
    data: accountBalance,
    isLoading: isLoadingBalance,
    error: balanceError,
    refetch: refetchBalance,
  } = useAccountBalance();

  const fetchAccountData = useCallback(async () => {
    try {
      const token = await getToken().catch(() => undefined);
      console.log('Fetching account data with token:', token ? 'present' : 'missing');

      const { data } = await apiClient.get<{ accountNumber?: string; bankName?: string }>(
        '/me/primary-account'
      );

      console.log('API response:', data);
      return data;
    } catch (e) {
      console.error('Error fetching account data:', e);
      return null;
    }
  }, [getToken]);

  useEffect(() => {
    let mounted = true;
    let pollInterval: NodeJS.Timeout | null = null;

    const loadAccountData = async () => {
      const data = await fetchAccountData();
      if (!mounted) {
        return;
      }

      if (data?.accountNumber) {
        // Account data found, stop polling
        setNuban(data.accountNumber);
        setBankName(data.bankName || null);
        setPolling(false);
        setLoading(false);
      } else {
        // No account data yet, start polling if not already polling
        setNuban(null);
        setBankName(null);
        setLoading(false);

        // Start polling for account data
        setPolling(true);
        // Poll every 3 seconds for up to 5 minutes (100 polls)
        let pollCount = 0;
        const maxPolls = 100; // 100 * 3s = 5 minutes

        pollInterval = setInterval(async () => {
          if (!mounted || pollCount >= maxPolls) {
            if (pollInterval) {
              clearInterval(pollInterval);
            }
            setPolling(false);
            return;
          }

          pollCount++;
          console.log(`Polling attempt ${pollCount}/${maxPolls} for account data...`);
          const pollData = await fetchAccountData();
          if (!mounted) {
            return;
          }

          if (pollData?.accountNumber) {
            // Account data found, stop polling
            console.log(
              `Account found! NUBAN: ${pollData.accountNumber}, Bank: ${pollData.bankName}`
            );
            setNuban(pollData.accountNumber);
            setBankName(pollData.bankName || null);
            setPolling(false);
            if (pollInterval) {
              clearInterval(pollInterval);
            }
          } else {
            console.log(`No account data yet (attempt ${pollCount}/${maxPolls})`);
          }
        }, 3000);
      }
    };

    loadAccountData();

    return () => {
      mounted = false;
      if (pollInterval) {
        clearInterval(pollInterval);
      }
    };
  }, [fetchAccountData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    // Refresh both account data and balance
    const data = await fetchAccountData();
    await refetchBalance(); // Force refresh the cached balance
    if (data?.accountNumber) {
      setNuban(data.accountNumber);
      setBankName(data.bankName || null);
      setPolling(false);
    }
    setRefreshing(false);
  };

  // Loading state
  if (loading || isLoadingProfile) {
    return (
      <ScreenWrapper>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Loading your account...</Text>
        </View>
      </ScreenWrapper>
    );
  }

  // Polling state
  if (polling) {
    return (
      <ScreenWrapper>
        <View style={styles.centerContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.title}>Setting up your account...</Text>
          <Text style={styles.subtitle}>This may take a few minutes</Text>
          <Text style={styles.pollingText}>Please wait while we create your virtual account</Text>
        </View>
      </ScreenWrapper>
    );
  }

  // No account state
  if (!nuban) {
    return (
      <ScreenWrapper>
        <View style={styles.centerContainer}>
          <Ionicons name="wallet-outline" size={64} color={theme.colors.textSecondary} />
          <Text style={styles.title}>No Account Found</Text>
          <Text style={styles.subtitle}>We couldn't find your account details.</Text>
          <ActionButton
            title={refreshing ? 'Checking...' : 'Refresh Account Data'}
            icon="refresh"
            onPress={handleRefresh}
            loading={refreshing}
            style={styles.refreshButton}
          />
        </View>
      </ScreenWrapper>
    );
  }

  // Main content - Account loaded successfully
  return (
    <ScreenWrapper style={styles.container}>
      <ScrollView
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Header */}
        <View style={styles.header}>
          <View>
            <Text style={styles.greeting}>Welcome Back</Text>
            <Text style={styles.userName}>{userProfile?.username || 'User'}</Text>
          </View>
        </View>

        {/* Balance Card with Gradient */}
        <LinearGradient
          colors={[theme.colors.gradientStart, theme.colors.gradientEnd]}
          start={{ x: 0, y: 0 }}
          end={{ x: 1, y: 1 }}
          style={styles.balanceCard}
        >
          <View style={styles.balanceCardContent}>
            <Text style={styles.balanceLabel}>Available Balance</Text>
            {isLoadingBalance ? (
              <ActivityIndicator size="small" color={theme.colors.textOnPrimary} />
            ) : balanceError ? (
              <Text style={styles.balanceError}>Unable to load balance</Text>
            ) : (
              <Text style={styles.balanceAmount}>
                {accountBalance ? formatCurrency(accountBalance.available_balance) : '₦0.00'}
              </Text>
            )}

            {/* Account Info */}
            <View style={styles.accountInfo}>
              <View style={styles.accountInfoItem}>
                <Ionicons name="card-outline" size={16} color={theme.colors.textOnPrimary} />
                <Text style={styles.accountInfoText}>{nuban}</Text>
              </View>
              {bankName && (
                <View style={styles.accountInfoItem}>
                  <Ionicons name="business-outline" size={16} color={theme.colors.textOnPrimary} />
                  <Text style={styles.accountInfoText}>{bankName}</Text>
                </View>
              )}
            </View>
          </View>
        </LinearGradient>

        {/* Quick Actions Section */}
        <View style={styles.quickActionsSection}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          {/* Primary Actions */}
          <View style={styles.actionGrid}>
            <ActionButton
              title="Pay Someone"
              icon="send"
              onPress={() => navigation.navigate('PayUser' as never)}
              variant="primary"
              size="large"
              style={styles.actionButton}
            />

            <ActionButton
              title="Self Transfer"
              icon="swap-horizontal"
              onPress={() => navigation.navigate('SelfTransfer' as never)}
              variant="secondary"
              size="large"
              style={styles.actionButton}
            />

            <ActionButton
              title="Payment Request"
              icon="document-text"
              onPress={() => navigation.navigate('PaymentRequestsList' as never)}
              variant="outline"
              size="large"
              style={styles.actionButton}
            />
          </View>
        </View>

        <View style={styles.bottomSpacer} />
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingHorizontal: 0,
  },
  centerContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.s24,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.s24,
    marginBottom: theme.spacing.s24,
    marginTop: theme.spacing.s16,
  },
  greeting: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeights.medium,
  },
  userName: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.s4,
  },
  // Balance Card Styles
  balanceCard: {
    marginHorizontal: theme.spacing.s24,
    marginBottom: theme.spacing.s24,
    borderRadius: theme.radii.xl,
    ...Platform.select({
      ios: {
        shadowColor: '#5B48E8',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.3,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  balanceCardContent: {
    padding: theme.spacing.s24,
  },
  balanceLabel: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textOnPrimary,
    opacity: 0.9,
    fontWeight: theme.fontWeights.medium,
    marginBottom: theme.spacing.s8,
  },
  balanceAmount: {
    fontSize: theme.fontSizes['4xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textOnPrimary,
    marginBottom: theme.spacing.s16,
  },
  balanceError: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textOnPrimary,
    opacity: 0.8,
  },
  accountInfo: {
    marginTop: theme.spacing.s12,
    gap: theme.spacing.s8,
  },
  accountInfoItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.s8,
  },
  accountInfoText: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textOnPrimary,
    opacity: 0.9,
    fontWeight: theme.fontWeights.medium,
  },
  // Quick Actions Section
  quickActionsSection: {
    paddingHorizontal: theme.spacing.s24,
    marginBottom: theme.spacing.s24,
  },
  sectionTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s16,
  },
  actionGrid: {
    gap: theme.spacing.s12,
  },
  actionButton: {
    width: '100%',
  },
  // Misc
  loadingText: {
    marginTop: theme.spacing.s16,
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
  },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginTop: theme.spacing.s16,
  },
  subtitle: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.s8,
    textAlign: 'center',
  },
  pollingText: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.s8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  refreshButton: {
    marginTop: theme.spacing.s24,
    minWidth: 200,
  },
  bottomSpacer: {
    height: theme.spacing.s32,
  },
});

export default HomeScreen;

/**
 * @description
 * Redesigned Home screen with modern fintech UI featuring card-based layout,
 * circular icon buttons, and professional styling. Main dashboard displaying wallet balance
 * with expandable account details and primary actions with smooth animations.
 *
 * @dependencies
 * - react-native: For core components
 * - react-native-reanimated: For smooth animations
 * - @/components/ScreenWrapper: For consistent screen layout and safe area handling
 * - @/components/CircularIconButton: For icon-based action grid
 * - @/components/ExpandableAccountDetails: For Add Money toggle
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
import Animated from 'react-native-reanimated';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import ScreenWrapper from '@/components/ScreenWrapper';
import ActionButton from '@/components/ActionButton';
import CircularIconButton from '@/components/CircularIconButton';
import ExpandableAccountDetails from '@/components/ExpandableAccountDetails';
import { theme } from '@/constants/theme';
import apiClient from '@/api/apiClient';
import { useAuth } from '@clerk/clerk-expo';
import { useAccountBalance, useUserProfile } from '@/api/transactionApi';
import { usePlatformFeeStatus } from '@/api/platformFeeApi';
import { formatCurrency } from '@/utils/formatCurrency';
import { LinearGradient } from 'expo-linear-gradient';
import { useEntranceAnimation } from '@/hooks/useEntranceAnimation';

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
  const { data: platformFeeStatus } = usePlatformFeeStatus();

  // Fetch account balance with caching
  const {
    data: accountBalance,
    isLoading: isLoadingBalance,
    error: balanceError,
    refetch: refetchBalance,
  } = useAccountBalance();

  // Animation hooks for entrance effects - must be at top level
  const headerAnimation = useEntranceAnimation({ delay: 0, duration: 500 });
  const balanceCardAnimation = useEntranceAnimation({ delay: 100, duration: 500 });
  const actionsAnimation = useEntranceAnimation({ delay: 200, duration: 500 });

  const platformFeeBanner = (() => {
    if (
      !platformFeeStatus ||
      platformFeeStatus.status === 'paid' ||
      platformFeeStatus.status === 'waived' ||
      platformFeeStatus.status === 'none'
    ) {
      return null;
    }

    const dueDate = platformFeeStatus.due_at
      ? new Date(platformFeeStatus.due_at).toLocaleDateString('en-US', {
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        })
      : 'soon';

    if (platformFeeStatus.is_delinquent) {
      return {
        tone: 'error',
        title: 'Platform Fee Overdue',
        message:
          'External transfers are disabled. Add funds to your wallet to settle the fee.',
      };
    }

    return {
      tone: 'warning',
      title: 'Platform Fee Due',
      message: `Your monthly platform fee is due on ${dueDate}. Keep funds in your wallet for auto-debit.`,
    };
  })();

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
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={handleRefresh}
            colors={[theme.colors.primary]}
            tintColor={theme.colors.primary}
          />
        }
      >
        {/* Header with entrance animation */}
        <Animated.View style={[styles.header, headerAnimation.animatedStyle]}>
          <View>
            <Text style={styles.greeting}>Welcome Back</Text>
            <Text style={styles.userName}>{userProfile?.username || 'User'}</Text>
          </View>
        </Animated.View>

        {platformFeeBanner && (
          <View
            style={[
              styles.feeBanner,
              platformFeeBanner.tone === 'error' ? styles.feeBannerError : styles.feeBannerWarning,
            ]}
          >
            <Ionicons
              name={platformFeeBanner.tone === 'error' ? 'alert-circle' : 'time-outline'}
              size={18}
              color={platformFeeBanner.tone === 'error' ? theme.colors.error : theme.colors.warning}
            />
            <View style={styles.feeBannerContent}>
              <Text style={styles.feeBannerTitle}>{platformFeeBanner.title}</Text>
              <Text style={styles.feeBannerText}>{platformFeeBanner.message}</Text>
            </View>
          </View>
        )}

        {/* Enhanced Balance Card with Gradient and Entrance Animation */}
        <Animated.View style={balanceCardAnimation.animatedStyle}>
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

              {/* Expandable Account Details with Add Money Toggle */}
              {nuban && (
                <ExpandableAccountDetails accountNumber={nuban} bankName={bankName || ''} />
              )}
            </View>
          </LinearGradient>
        </Animated.View>

        {/* Quick Actions Section with Circular Icon Grid */}
        <Animated.View style={[styles.quickActionsSection, actionsAnimation.animatedStyle]}>
          <Text style={styles.sectionTitle}>Quick Actions</Text>

          {/* Circular Icon Grid */}
          <View style={styles.iconGrid}>
            <CircularIconButton
              title="Send"
              icon="send"
              onPress={() => navigation.navigate('PayUser' as never)}
              variant="gradient"
              gradientColors={[theme.colors.gradientStart, theme.colors.gradientEnd]}
            />

            <CircularIconButton
              title="Self Transfer"
              icon="swap-horizontal"
              onPress={() => navigation.navigate('SelfTransfer' as never)}
              variant="solid"
              color={theme.colors.secondary}
            />

            <CircularIconButton
              title="Request"
              icon="document-text"
              onPress={() => navigation.navigate('PaymentRequestsList' as never)}
              variant="outline"
              color={theme.colors.primary}
            />

            <CircularIconButton
              title="Money Drop"
              icon="gift"
              onPress={() => navigation.navigate('CreateDropWizard' as never)}
              variant="outline"
              color={theme.colors.accent}
            />
          </View>
        </Animated.View>
      </ScrollView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  scrollContent: {
    paddingBottom: 0,
  },
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
  feeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: theme.spacing.s12,
    padding: theme.spacing.s12,
    borderRadius: theme.radii.md,
    marginHorizontal: theme.spacing.s20,
    marginBottom: theme.spacing.s16,
  },
  feeBannerWarning: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
  },
  feeBannerError: {
    backgroundColor: '#FEE2E2',
    borderWidth: 1,
    borderColor: '#FECACA',
  },
  feeBannerContent: {
    flex: 1,
  },
  feeBannerTitle: {
    fontSize: theme.fontSizes.sm,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s2,
  },
  feeBannerText: {
    fontSize: theme.fontSizes.xs,
    color: theme.colors.textSecondary,
    lineHeight: 16,
  },
  greeting: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeights.medium,
    opacity: 0.7,
  },
  userName: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.s4,
    letterSpacing: -0.5,
  },
  // Enhanced Balance Card Styles
  balanceCard: {
    marginHorizontal: theme.spacing.s20,
    marginBottom: theme.spacing.s32,
    borderRadius: theme.radii.xl,
    overflow: 'visible', // Ensure expandable content is not clipped
    ...Platform.select({
      ios: {
        shadowColor: '#5B48E8',
        shadowOffset: { width: 0, height: 12 },
        shadowOpacity: 0.4,
        shadowRadius: 24,
      },
      android: {
        elevation: 12,
      },
    }),
  },
  balanceCardContent: {
    padding: theme.spacing.s24,
  },
  balanceLabel: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textOnPrimary,
    opacity: 0.85,
    fontWeight: theme.fontWeights.medium,
    marginBottom: theme.spacing.s8,
  },
  balanceAmount: {
    fontSize: theme.fontSizes['4xl'],
    fontWeight: '800' as any,
    color: theme.colors.textOnPrimary,
    marginBottom: theme.spacing.s8,
    letterSpacing: -1,
    ...Platform.select({
      ios: {
        textShadowColor: 'rgba(0, 0, 0, 0.1)',
        textShadowOffset: { width: 0, height: 2 },
        textShadowRadius: 4,
      },
    }),
  },
  balanceError: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textOnPrimary,
    opacity: 0.8,
  },
  // Quick Actions Section with Circular Icons
  quickActionsSection: {
    paddingHorizontal: theme.spacing.s24,
    marginBottom: 0,
    paddingBottom: theme.spacing.s24,
  },
  sectionTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s20,
    letterSpacing: -0.3,
  },
  iconGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.s8,
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
});

export default HomeScreen;

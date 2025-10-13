/**
 * @description
 * Placeholder screen for the Home tab. This will be the main dashboard for the user,
 * displaying their wallet balance and primary actions like "Send/Move".
 *
 * @dependencies
 * - react-native: For Text component.
 * - @/components/ScreenWrapper: For consistent screen layout and safe area handling.
 */
import React, { useEffect, useState, useCallback } from 'react';
import { Text, View, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ScreenWrapper from '@/components/ScreenWrapper';
import PrimaryButton from '@/components/PrimaryButton';
import { theme } from '@/constants/theme';
import apiClient from '@/api/apiClient';
import { useAuth, useUser } from '@clerk/clerk-expo';
import { useAccountBalance } from '@/api/transactionApi';
import { formatCurrency } from '@/utils/formatCurrency';

const HomeScreen = () => {
  const navigation = useNavigation();
  const { getToken, signOut } = useAuth();
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [nuban, setNuban] = useState<string | null>(null);
  const [bankName, setBankName] = useState<string | null>(null);
  const [polling, setPolling] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Fetch account balance
  const { data: accountBalance, isLoading: isLoadingBalance, error: balanceError } = useAccountBalance();

  const fetchAccountData = useCallback(async () => {
    try {
      const token = await getToken().catch(() => undefined);
      console.log('Fetching account data with token:', token ? 'present' : 'missing');
      console.log('User ID:', user?.id);

      const { data } = await apiClient.get<{ accountNumber?: string; bankName?: string }>(
        '/me/primary-account',
        {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'X-Clerk-User-Id': user?.id || '',
          },
        }
      );

      console.log('API response:', data);
      return data;
    } catch (e) {
      console.error('Error fetching account data:', e);
      return null;
    }
  }, [getToken, user?.id]);

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
  }, [getToken, user?.id, fetchAccountData]);

  const handleRefresh = async () => {
    setRefreshing(true);
    const data = await fetchAccountData();
    if (data?.accountNumber) {
      setNuban(data.accountNumber);
      setBankName(data.bankName || null);
      setPolling(false);
    }
    setRefreshing(false);
  };

  const handleSignOut = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: () => signOut(),
      },
    ]);
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {loading ? (
          <>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.subtitle}>Loading your account...</Text>
          </>
        ) : nuban ? (
          <>
            <Text style={styles.title}>Your Account</Text>
            <Text style={styles.subtitle}>Virtual NUBAN: {nuban}</Text>
            {bankName && <Text style={styles.bankName}>Bank: {bankName}</Text>}

            {/* Account Balance */}
            <View style={styles.balanceCard}>
              <Text style={styles.balanceLabel}>Available Balance</Text>
              {isLoadingBalance ? (
                <ActivityIndicator size="small" color={theme.colors.primary} />
              ) : balanceError ? (
                <Text style={styles.balanceError}>Unable to load balance</Text>
              ) : (
                <Text style={styles.balanceAmount}>
                  {accountBalance ? formatCurrency(accountBalance.available_balance) : '₦0.00'}
                </Text>
              )}
            </View>

            {/* Temporary navigation buttons for testing payment flows */}
            <View style={styles.paymentButtons}>
              <PrimaryButton
                title="Pay Someone"
                onPress={() => navigation.navigate('PayUser' as never)}
                style={styles.paymentButton}
              />
              <PrimaryButton
                title="Self Transfer"
                onPress={() => navigation.navigate('SelfTransfer' as never)}
                style={styles.paymentButton}
              />
            </View>
          </>
        ) : polling ? (
          <>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.title}>Setting up your account...</Text>
            <Text style={styles.subtitle}>This may take a few minutes</Text>
            <Text style={styles.debugText}>Please wait while we create your virtual account</Text>
          </>
        ) : (
          <>
            <Text style={styles.title}>Home</Text>
            <Text style={styles.subtitle}>No account found yet.</Text>
            <PrimaryButton
              title={refreshing ? 'Checking...' : 'Refresh'}
              onPress={handleRefresh}
              isLoading={refreshing}
              style={styles.refreshButton}
            />
          </>
        )}

        <View style={styles.signOutContainer}>
          <PrimaryButton
            title="Sign Out"
            onPress={handleSignOut}
            style={styles.signOutButton}
            textStyle={styles.signOutButtonText}
          />
        </View>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.s16,
  },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
  },
  subtitle: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.s8,
  },
  bankName: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.s4,
    fontStyle: 'italic',
  },
  signOutContainer: {
    position: 'absolute',
    bottom: theme.spacing.s24,
    left: theme.spacing.s16,
    right: theme.spacing.s16,
  },
  signOutButton: {
    backgroundColor: theme.colors.error,
    paddingVertical: theme.spacing.s12,
    paddingHorizontal: theme.spacing.s24,
    borderRadius: theme.radii.md,
  },
  signOutButtonText: {
    color: theme.colors.textOnPrimary,
    fontSize: theme.fontSizes.base,
    fontWeight: theme.fontWeights.semibold,
  },
  refreshButton: {
    marginTop: theme.spacing.s16,
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.s12,
    paddingHorizontal: theme.spacing.s24,
    borderRadius: theme.radii.md,
  },
  debugText: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.s8,
    textAlign: 'center',
    fontStyle: 'italic',
  },
  paymentButtons: {
    marginTop: theme.spacing.s24,
    width: '100%',
    gap: theme.spacing.s12,
  },
  paymentButton: {
    backgroundColor: theme.colors.primary,
    paddingVertical: theme.spacing.s12,
    paddingHorizontal: theme.spacing.s24,
    borderRadius: theme.radii.md,
  },
  balanceCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.s20,
    marginVertical: theme.spacing.s16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  balanceLabel: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.s8,
  },
  balanceAmount: {
    fontSize: theme.fontSizes['3xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.primary,
  },
  balanceError: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.error,
  },
});

export default HomeScreen;

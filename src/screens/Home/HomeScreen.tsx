/**
 * @description
 * Placeholder screen for the Home tab. This will be the main dashboard for the user,
 * displaying their wallet balance and primary actions like "Send/Move".
 *
 * @dependencies
 * - react-native: For Text component.
 * - @/components/ScreenWrapper: For consistent screen layout and safe area handling.
 */
import React, { useEffect, useState } from 'react';
import { Text, View, StyleSheet, ActivityIndicator } from 'react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import { theme } from '@/constants/theme';
import apiClient from '@/api/apiClient';
import { useAuth, useUser } from '@clerk/clerk-expo';

const HomeScreen = () => {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [loading, setLoading] = useState(true);
  const [nuban, setNuban] = useState<string | null>(null);
  const [bankName, setBankName] = useState<string | null>(null);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const token = await getToken().catch(() => undefined);
        const { data } = await apiClient.get<{ accountNumber?: string; bankName?: string }>('/me/primary-account', {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            'X-Clerk-User-Id': user?.id || '',
          },
        });
        if (!mounted) {
          return;
        }
        setNuban(data?.accountNumber || null);
        setBankName(data?.bankName || null);
      } catch (e) {
        if (!mounted) {
          return;
        }
        setNuban(null);
        setBankName(null);
      } finally {
        if (mounted) {
          setLoading(false);
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getToken, user?.id]);

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        {loading ? (
          <ActivityIndicator size="large" color={theme.colors.primary} />
        ) : nuban ? (
          <>
            <Text style={styles.title}>Your Account</Text>
            <Text style={styles.subtitle}>Virtual NUBAN: {nuban}</Text>
            {bankName && (
              <Text style={styles.bankName}>Bank: {bankName}</Text>
            )}
          </>
        ) : (
          <>
            <Text style={styles.title}>Home</Text>
            <Text style={styles.subtitle}>No account found yet.</Text>
          </>
        )}
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
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
});

export default HomeScreen;

/**
 * @description
 * This screen allows a user to claim a Money Drop. It is typically accessed via a
 * deep link or QR code scan. It fetches details about the drop and provides a button
 * for the user to claim their portion.
 *
 * @dependencies
 * - react, react-native: For UI and state management.
 * - @react-navigation/native: For route parameters and navigation.
 * - @/components/*: Reusable UI components.
 * - @/api/transactionApi: For fetching drop details and claiming the drop.
 * - @/utils/formatCurrency: For displaying currency values.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, Alert } from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import ScreenWrapper from '@/components/ScreenWrapper';
import PrimaryButton from '@/components/PrimaryButton';
import Card from '@/components/Card';
import { theme } from '@/constants/theme';
import { AppStackParamList } from '@/navigation/AppStack';
import { useClaimMoneyDrop, useMoneyDropDetails } from '@/api/transactionApi';
import { formatCurrency } from '@/utils/formatCurrency';
import { AppNavigationProp } from '@/types/navigation';
import { Ionicons } from '@expo/vector-icons';

type ClaimDropScreenRouteProp = RouteProp<AppStackParamList, 'ClaimDrop'>;

const ClaimDropScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const route = useRoute<ClaimDropScreenRouteProp>();
  const { dropId } = route.params;

  const [claimResult, setClaimResult] = useState<{ success: boolean; message: string } | null>(
    null
  );

  const {
    data: dropDetails,
    isLoading: isLoadingDetails,
    error: detailsError,
  } = useMoneyDropDetails(dropId);

  const { mutate: claimDrop, isPending: isClaiming } = useClaimMoneyDrop({
    onSuccess: (data) => {
      setClaimResult({ success: true, message: data.message });
      Alert.alert(
        'Success!',
        `You've successfully claimed ${formatCurrency(data.amount_claimed)} from ${
          data.creator_username
        }.`
      );
    },
    onError: (error) => {
      setClaimResult({ success: false, message: error.message });
      Alert.alert('Claim Failed', error.message || 'An unexpected error occurred.');
    },
  });

  const handleClaim = () => {
    claimDrop({ dropId });
  };

  const renderContent = () => {
    if (isLoadingDetails) {
      return <ActivityIndicator size="large" color={theme.colors.primary} />;
    }

    if (detailsError) {
      return <Text style={styles.errorText}>Error loading drop: {detailsError.message}</Text>;
    }

    if (!dropDetails) {
      return <Text style={styles.errorText}>Could not find money drop details.</Text>;
    }

    if (claimResult) {
      return (
        <View style={styles.resultContainer}>
          <Ionicons
            name={claimResult.success ? 'checkmark-circle' : 'close-circle'}
            size={60}
            color={claimResult.success ? theme.colors.success : theme.colors.error}
          />
          <Text style={styles.resultTitle}>
            {claimResult.success ? 'Claim Successful!' : 'Claim Failed'}
          </Text>
          <Text style={styles.resultMessage}>{claimResult.message}</Text>
          <PrimaryButton title="Go to Home" onPress={() => navigation.navigate('Home' as never)} />
        </View>
      );
    }

    if (!dropDetails.is_claimable) {
      return (
        <View style={styles.resultContainer}>
          <Ionicons name="information-circle" size={60} color={theme.colors.warning} />
          <Text style={styles.resultTitle}>Cannot Claim</Text>
          <Text style={styles.resultMessage}>{dropDetails.message}</Text>
          <PrimaryButton title="Go to Home" onPress={() => navigation.navigate('Home' as never)} />
        </View>
      );
    }

    return (
      <>
        <Text style={styles.title}>You're Invited!</Text>
        <Text style={styles.subtitle}>
          <Text style={styles.creatorName}>{dropDetails.creator_username}</Text> has sent you a
          money drop.
        </Text>
        <Card style={styles.claimCard}>
          <Text style={styles.amountLabel}>You will receive</Text>
          <Text style={styles.amountValue}>{formatCurrency(dropDetails.amount_per_claim)}</Text>
        </Card>
        <PrimaryButton
          title="Claim Now"
          onPress={handleClaim}
          isLoading={isClaiming}
          disabled={isClaiming}
        />
      </>
    );
  };

  return (
    <ScreenWrapper>
      <View style={styles.container}>{renderContent()}</View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: theme.spacing.s24,
  },
  title: {
    fontSize: theme.fontSizes['3xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  subtitle: {
    fontSize: theme.fontSizes.lg,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginTop: theme.spacing.s8,
    marginBottom: theme.spacing.s32,
  },
  creatorName: {
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.primary,
  },
  claimCard: {
    width: '100%',
    padding: theme.spacing.s24,
    alignItems: 'center',
    marginBottom: theme.spacing.s32,
  },
  amountLabel: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
  },
  amountValue: {
    fontSize: 48,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.primary,
    marginVertical: theme.spacing.s8,
  },
  errorText: {
    color: theme.colors.error,
    fontSize: theme.fontSizes.base,
    textAlign: 'center',
  },
  resultContainer: {
    alignItems: 'center',
    padding: theme.spacing.s24,
  },
  resultTitle: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginTop: theme.spacing.s16,
  },
  resultMessage: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginVertical: theme.spacing.s16,
    lineHeight: 24,
  },
});

export default ClaimDropScreen;

import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, ActivityIndicator, TouchableOpacity } from 'react-native';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import ScreenWrapper from '@/components/ScreenWrapper';
import PrimaryButton from '@/components/PrimaryButton';
import { theme } from '@/constants/theme';
import { formatCurrency } from '@/utils/formatCurrency';
import {
  useTransactionStatus,
  useTransactionStatusSubscription,
} from '@/api/transactionStatusHooks';
import { AppStackParamList } from '@/navigation/AppStack';
import { AppNavigationProp } from '@/types/navigation';
import { Ionicons } from '@expo/vector-icons';

interface RouteParams {
  transactionId: string;
  amount: number;
  fee: number;
  description?: string;
  recipientUsername?: string;
  transferType?: string;
  initialStatus?: 'pending' | 'failed';
  failureReason?: string;
}

type TransferStatusRoute = RouteProp<AppStackParamList, 'TransferStatus'>;

const TransferStatusScreen = () => {
  const route = useRoute<TransferStatusRoute>();
  const navigation = useNavigation<AppNavigationProp>();

  const {
    transactionId,
    amount,
    fee,
    description,
    recipientUsername,
    transferType,
    initialStatus = 'pending',
    failureReason,
  } = route.params as RouteParams;

  const [fallback, setFallback] = useState({ status: initialStatus, failureReason });

  const {
    data: statusData,
    isLoading,
    isFetching,
    refetch,
  } = useTransactionStatus(transactionId, initialStatus === 'pending');

  useEffect(() => {
    if (!transactionId && initialStatus === 'failed' && failureReason) {
      setFallback({ status: 'failed', failureReason });
    }
  }, [transactionId, initialStatus, failureReason]);

  const status = statusData?.status || fallback.status;
  const finalFailureReason = statusData?.failure_reason || fallback.failureReason;

  const isCompleted = status === 'completed';
  const isFailed = status === 'failed';

  const totalAmount = useMemo(() => amount + fee, [amount, fee]);

  useTransactionStatusSubscription(transactionId);

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>

        <View style={styles.content}>
          {isLoading ? (
            <View style={styles.stateContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.stateTitle}>Checking status…</Text>
              <Text style={styles.stateSubtitle}>Please wait while we confirm your transfer.</Text>
            </View>
          ) : isFailed ? (
            <View style={styles.stateContainer}>
              <Ionicons name="close-circle" size={72} color={theme.colors.error} />
              <Text style={styles.stateTitle}>Transfer Failed</Text>
              <Text style={styles.failureReason}>
                {finalFailureReason || 'The transfer could not be completed.'}
              </Text>
            </View>
          ) : isCompleted ? (
            <View style={styles.stateContainer}>
              <Ionicons name="checkmark-circle" size={72} color={theme.colors.success} />
              <Text style={styles.stateTitle}>Transfer Successful</Text>
              <Text style={styles.stateSubtitle}>Funds have been delivered successfully.</Text>
            </View>
          ) : (
            <View style={styles.stateContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.stateTitle}>Processing…</Text>
              <Text style={styles.stateSubtitle}>We are waiting for confirmation from Anchor.</Text>
            </View>
          )}

          <View style={styles.summaryCard}>
            <SummaryRow label="Amount" value={formatCurrency(amount)} />
            <SummaryRow label="Fee" value={formatCurrency(fee)} />
            <SummaryRow label="Total Debited" value={formatCurrency(totalAmount)} isTotal />
            {recipientUsername ? (
              <SummaryRow label="Recipient" value={`@${recipientUsername}`} />
            ) : null}
            {description ? <SummaryRow label="Description" value={description} /> : null}
            {transferType ? <SummaryRow label="Transfer Type" value={transferType} /> : null}
          </View>
        </View>

        <View style={styles.actions}>
          {!isCompleted && !isFailed ? (
            <PrimaryButton
              title={isFetching ? 'Checking…' : 'Refresh Status'}
              onPress={() => refetch()}
              isLoading={isFetching}
            />
          ) : (
            <PrimaryButton
              title="Done"
              onPress={() => navigation.navigate('AppTabs', { screen: 'Payments' })}
            />
          )}
        </View>
      </View>
    </ScreenWrapper>
  );
};

const SummaryRow = ({
  label,
  value,
  isTotal,
}: {
  label: string;
  value: string;
  isTotal?: boolean;
}) => (
  <View style={[styles.summaryRow, isTotal && styles.summaryRowTotal]}>
    <Text style={[styles.summaryLabel, isTotal && styles.summaryLabelTotal]}>{label}</Text>
    <Text style={[styles.summaryValue, isTotal && styles.summaryValueTotal]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  container: {
    flex: 1,
    paddingHorizontal: theme.spacing.s20,
    paddingTop: theme.spacing.s16,
  },
  backButton: {
    alignSelf: 'flex-start',
    padding: theme.spacing.s4,
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.s24,
  },
  stateTitle: {
    marginTop: theme.spacing.s16,
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
  },
  stateSubtitle: {
    marginTop: theme.spacing.s8,
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
  },
  failureReason: {
    marginTop: theme.spacing.s8,
    fontSize: theme.fontSizes.base,
    color: theme.colors.error,
    textAlign: 'center',
  },
  summaryCard: {
    width: '100%',
    marginTop: theme.spacing.s24,
    padding: theme.spacing.s16,
    borderRadius: theme.radii.lg,
    backgroundColor: theme.colors.surface,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.s12,
  },
  summaryRowTotal: {
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingTop: theme.spacing.s12,
  },
  summaryLabel: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
  },
  summaryLabelTotal: {
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
  },
  summaryValue: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeights.medium,
  },
  summaryValueTotal: {
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.primary,
  },
  actions: {
    paddingVertical: theme.spacing.s24,
  },
});

export default TransferStatusScreen;

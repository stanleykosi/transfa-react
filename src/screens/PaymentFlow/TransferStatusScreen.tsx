import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ActivityIndicator,
  TouchableOpacity,
  Platform,
} from 'react-native';
import Animated from 'react-native-reanimated';
import { RouteProp, useRoute, useNavigation } from '@react-navigation/native';
import * as Haptics from 'expo-haptics';
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
import { useEntranceAnimation } from '@/hooks/useEntranceAnimation';

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

  // Entrance animations for polish
  const headerAnimation = useEntranceAnimation({ delay: 0, duration: 400 });
  const contentAnimation = useEntranceAnimation({ delay: 100, duration: 500 });
  const cardAnimation = useEntranceAnimation({ delay: 200, duration: 500 });

  // Haptic feedback on status changes
  useEffect(() => {
    if (isCompleted) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (isFailed) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }
  }, [isCompleted, isFailed]);

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Animated.View style={headerAnimation.animatedStyle}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              navigation.goBack();
            }}
          >
            <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
          </TouchableOpacity>
        </Animated.View>

        <View style={styles.content}>
          <Animated.View style={contentAnimation.animatedStyle}>
            {isLoading ? (
              <View style={styles.stateContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.stateTitle}>Checking status…</Text>
                <Text style={styles.stateSubtitle}>
                  Please wait while we confirm your transfer.
                </Text>
              </View>
            ) : isFailed ? (
              <View style={styles.stateContainer}>
                <View style={styles.iconContainer}>
                  <Ionicons name="close-circle" size={80} color={theme.colors.error} />
                </View>
                <Text style={styles.stateTitle}>Transfer Failed</Text>
                <Text style={styles.failureReason}>
                  {finalFailureReason || 'The transfer could not be completed.'}
                </Text>
              </View>
            ) : isCompleted ? (
              <View style={styles.stateContainer}>
                <View style={styles.iconContainer}>
                  <Ionicons name="checkmark-circle" size={80} color={theme.colors.success} />
                </View>
                <Text style={styles.stateTitle}>Transfer Successful</Text>
                <Text style={styles.stateSubtitle}>Funds have been delivered successfully.</Text>
              </View>
            ) : (
              <View style={styles.stateContainer}>
                <ActivityIndicator size="large" color={theme.colors.primary} />
                <Text style={styles.stateTitle}>Processing…</Text>
                <Text style={styles.stateSubtitle}>
                  Real-time updates enabled. No refresh needed.
                </Text>
              </View>
            )}
          </Animated.View>

          <Animated.View style={cardAnimation.animatedStyle}>
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
          </Animated.View>
        </View>

        <View style={styles.actions}>
          {(isCompleted || isFailed) && (
            <PrimaryButton
              title="Done"
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                navigation.navigate('AppTabs', { screen: 'Payments' });
              }}
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
    padding: theme.spacing.s8,
    borderRadius: theme.radii.full,
    backgroundColor: theme.colors.surface,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 2 },
        shadowOpacity: 0.08,
        shadowRadius: 4,
      },
      android: {
        elevation: 2,
      },
    }),
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stateContainer: {
    alignItems: 'center',
    marginBottom: theme.spacing.s32,
  },
  iconContainer: {
    marginBottom: theme.spacing.s16,
  },
  stateTitle: {
    marginTop: theme.spacing.s16,
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    letterSpacing: -0.5,
  },
  stateSubtitle: {
    marginTop: theme.spacing.s12,
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.s24,
    lineHeight: 22,
  },
  failureReason: {
    marginTop: theme.spacing.s12,
    fontSize: theme.fontSizes.base,
    color: theme.colors.error,
    textAlign: 'center',
    paddingHorizontal: theme.spacing.s24,
    lineHeight: 22,
  },
  summaryCard: {
    width: '100%',
    marginTop: theme.spacing.s32,
    padding: theme.spacing.s20,
    borderRadius: theme.radii.xl,
    backgroundColor: theme.colors.surface,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: theme.spacing.s16,
  },
  summaryRowTotal: {
    borderTopWidth: 2,
    borderColor: theme.colors.border,
    paddingTop: theme.spacing.s16,
    marginTop: theme.spacing.s4,
  },
  summaryLabel: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeights.medium,
  },
  summaryLabelTotal: {
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    fontSize: theme.fontSizes.lg,
  },
  summaryValue: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeights.semibold,
    letterSpacing: -0.3,
  },
  summaryValueTotal: {
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.primary,
    fontSize: theme.fontSizes.lg,
    letterSpacing: -0.5,
  },
  actions: {
    paddingVertical: theme.spacing.s24,
  },
});

export default TransferStatusScreen;

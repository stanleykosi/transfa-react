import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import * as Haptics from 'expo-haptics';
import { Ionicons } from '@expo/vector-icons';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';

import { useTransactionStatus } from '@/api/transactionStatusHooks';
import { AppStackParamList } from '@/navigation/AppStack';
import { AppNavigationProp } from '@/types/navigation';
import { formatCurrency } from '@/utils/formatCurrency';
import { normalizeUsername } from '@/utils/username';

type TransferStatusRoute = RouteProp<AppStackParamList, 'TransferStatus'>;
type ReceiptStatus = 'pending' | 'processing' | 'completed' | 'failed';

type RouteParams = {
  transactionId: string;
  amount: number;
  fee: number;
  description?: string;
  recipientUsername?: string;
  transferType?: string;
  initialStatus?: ReceiptStatus;
  failureReason?: string;
};

const BRAND_YELLOW = '#FFD300';
const BG_BOTTOM = '#050607';
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BORDER = 'rgba(255,255,255,0.06)';

const normalizeStatus = (value?: string | null): ReceiptStatus => {
  const normalized = (value ?? '').toLowerCase();
  if (normalized === 'completed' || normalized === 'success' || normalized === 'successful') {
    return 'completed';
  }
  if (normalized === 'failed' || normalized === 'failure' || normalized === 'cancelled') {
    return 'failed';
  }
  if (normalized === 'processing' || normalized === 'initiated') {
    return 'processing';
  }
  return 'pending';
};

const isTerminal = (status: ReceiptStatus) => status === 'completed' || status === 'failed';

const formatTransferType = (value?: string) => {
  if (!value) {
    return 'P2P transfer';
  }
  const normalized = value.replace(/_/g, ' ').trim().toLowerCase();
  if (!normalized) {
    return 'P2P transfer';
  }
  return normalized.charAt(0).toUpperCase() + normalized.slice(1);
};

const statusMeta = (status: ReceiptStatus, failureReason?: string) => {
  if (status === 'completed') {
    return {
      label: 'Successful',
      title: 'Transfer Confirmed',
      description: 'Server confirmation received. This transfer has been completed.',
      color: '#00C267',
      badgeBg: 'rgba(0,194,103,0.15)',
      iconName: 'checkmark-circle' as const,
    };
  }

  if (status === 'failed') {
    return {
      label: 'Failed',
      title: 'Transfer Failed',
      description: failureReason || 'This transfer could not be completed by the server.',
      color: '#E85B5B',
      badgeBg: 'rgba(232,91,91,0.15)',
      iconName: 'close-circle' as const,
    };
  }

  return {
    label: 'Processing',
    title: 'Transfer Processing',
    description: 'Server confirmation is still pending for this transfer.',
    color: BRAND_YELLOW,
    badgeBg: 'rgba(255,211,0,0.16)',
    iconName: 'time' as const,
  };
};

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

  const [fallback, setFallback] = useState({
    status: normalizeStatus(initialStatus),
    failureReason,
  });

  const { data: statusData, isLoading } = useTransactionStatus(transactionId, false);

  useEffect(() => {
    if (!transactionId && normalizeStatus(initialStatus) === 'failed' && failureReason) {
      setFallback({ status: 'failed', failureReason });
    }
  }, [transactionId, initialStatus, failureReason]);

  const fallbackStatus = normalizeStatus(fallback.status);
  const fetchedStatus = statusData ? normalizeStatus(statusData.status) : undefined;
  const serverStatus =
    fetchedStatus && !(isTerminal(fallbackStatus) && !isTerminal(fetchedStatus))
      ? fetchedStatus
      : fallbackStatus;

  const finalFailureReason =
    serverStatus === 'failed'
      ? statusData?.failure_reason || fallback.failureReason
      : fallback.failureReason;
  const meta = statusMeta(serverStatus, finalFailureReason);
  const totalAmount = useMemo(() => amount + fee, [amount, fee]);

  const lastStatusRef = useRef<ReceiptStatus | null>(null);
  useEffect(() => {
    if (lastStatusRef.current === serverStatus) {
      return;
    }

    if (serverStatus === 'completed') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } else if (serverStatus === 'failed') {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
    }

    lastStatusRef.current = serverStatus;
  }, [serverStatus]);

  const summaryRows = useMemo(
    () => [
      { label: 'Amount', value: formatCurrency(amount) },
      { label: 'Fee', value: formatCurrency(fee) },
      {
        label: 'Recipient',
        value: recipientUsername ? `@${normalizeUsername(recipientUsername)}` : 'N/A',
      },
      { label: 'Type', value: formatTransferType(transferType) },
      { label: 'Description', value: description?.trim() || 'No narration provided' },
      { label: 'Transaction ID', value: transactionId },
    ],
    [amount, fee, recipientUsername, transferType, description, transactionId]
  );

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A1B1E', '#0E0F12', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.backgroundGradient}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.headerRow}>
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.85}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={20} color="#F3F3F3" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transfer Receipt</Text>
          <View style={styles.headerSpacer} />
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.statusCard}>
            <View style={[styles.statusBadge, { backgroundColor: meta.badgeBg }]}>
              <Text style={[styles.statusBadgeText, { color: meta.color }]}>{meta.label}</Text>
            </View>

            <View style={[styles.iconWrap, { borderColor: `${meta.color}66` }]}>
              {serverStatus === 'processing' ||
              serverStatus === 'pending' ||
              (isLoading && !statusData) ? (
                <ActivityIndicator size="large" color={BRAND_YELLOW} />
              ) : (
                <Ionicons name={meta.iconName} size={62} color={meta.color} />
              )}
            </View>

            <Text style={styles.statusTitle}>{meta.title}</Text>
            <Text style={[styles.statusDescription, serverStatus === 'failed' && styles.errorText]}>
              {meta.description}
            </Text>
          </View>

          <View style={styles.amountCard}>
            <Text style={styles.amountLabel}>Total Debited</Text>
            <Text style={styles.amountValue}>{formatCurrency(totalAmount)}</Text>
            <Text style={styles.amountSubtext}>Amount + fee charged for this transfer</Text>
          </View>

          <View style={styles.detailsCard}>
            <Text style={styles.cardTitle}>Receipt Details</Text>
            {summaryRows.map((row) => (
              <View key={row.label} style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>{row.label}</Text>
                <Text
                  style={[
                    styles.summaryValue,
                    row.label === 'Description' && styles.descriptionValue,
                  ]}
                  numberOfLines={row.label === 'Description' ? 3 : 1}
                >
                  {row.value}
                </Text>
              </View>
            ))}
          </View>

          <View style={styles.progressCard}>
            <Text style={styles.cardTitle}>Transfer Lifecycle</Text>
            <LifecycleRow label="Submitted" tone="done" />
            <LifecycleRow label="Processing" tone={isTerminal(serverStatus) ? 'done' : 'active'} />
            <LifecycleRow
              label={serverStatus === 'failed' ? 'Failed' : 'Completed'}
              tone={
                serverStatus === 'failed'
                  ? 'failed'
                  : serverStatus === 'completed'
                    ? 'done'
                    : 'idle'
              }
            />
          </View>
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.primaryButton}
            activeOpacity={0.9}
            onPress={() => navigation.navigate('AppTabs', { screen: 'Home' })}
          >
            <Text style={styles.primaryButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

const LifecycleRow = ({
  label,
  tone,
}: {
  label: string;
  tone: 'active' | 'done' | 'failed' | 'idle';
}) => {
  const color =
    tone === 'done'
      ? '#00C267'
      : tone === 'failed'
        ? '#E85B5B'
        : tone === 'active'
          ? BRAND_YELLOW
          : '#8F929A';

  const iconName =
    tone === 'done'
      ? 'checkmark-circle'
      : tone === 'failed'
        ? 'close-circle'
        : tone === 'active'
          ? 'time'
          : 'ellipse-outline';

  return (
    <View style={styles.lifecycleRow}>
      <Ionicons name={iconName} size={17} color={color} />
      <Text style={[styles.lifecycleText, { color }]}>{label}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_BOTTOM,
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 20,
  },
  headerRow: {
    marginTop: 8,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 34,
    height: 34,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerTitle: {
    color: '#F2F2F2',
    fontSize: 20,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  headerSpacer: {
    width: 34,
  },
  content: {
    paddingBottom: 16,
  },
  statusCard: {
    borderRadius: 24,
    paddingHorizontal: 18,
    paddingVertical: 20,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOpacity: 0.16,
        shadowRadius: 14,
        shadowOffset: { width: 0, height: 10 },
      },
      android: {
        elevation: 8,
      },
    }),
  },
  statusBadge: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginBottom: 14,
  },
  statusBadgeText: {
    fontSize: 13,
    fontWeight: '700',
    letterSpacing: 0.2,
  },
  iconWrap: {
    width: 104,
    height: 104,
    borderRadius: 52,
    borderWidth: 1.4,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    backgroundColor: 'rgba(0,0,0,0.12)',
  },
  statusTitle: {
    color: '#F8F8F8',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.6,
    textAlign: 'center',
  },
  statusDescription: {
    marginTop: 8,
    color: '#C0C4CC',
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    paddingHorizontal: 4,
  },
  errorText: {
    color: '#F18A8A',
  },
  amountCard: {
    borderRadius: 18,
    paddingHorizontal: 18,
    paddingVertical: 18,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: 'rgba(255,211,0,0.09)',
  },
  amountLabel: {
    color: '#B4B7BE',
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
  },
  amountValue: {
    color: '#FFEA81',
    fontSize: 31,
    fontWeight: '800',
    letterSpacing: -0.8,
  },
  amountSubtext: {
    marginTop: 4,
    color: '#B4B7BE',
    fontSize: 13,
    fontWeight: '500',
  },
  detailsCard: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 16,
    marginBottom: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
  },
  cardTitle: {
    color: '#F0F0F0',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 8,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingVertical: 9,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
    gap: 12,
  },
  summaryLabel: {
    color: '#9EA0A6',
    fontSize: 14,
    fontWeight: '500',
    flexShrink: 0,
  },
  summaryValue: {
    color: '#F2F2F2',
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
    textAlign: 'right',
  },
  descriptionValue: {
    color: '#D9DBDF',
  },
  progressCard: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
  },
  lifecycleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    paddingVertical: 6,
  },
  lifecycleText: {
    fontSize: 14,
    fontWeight: '600',
  },
  footer: {
    paddingTop: 10,
    paddingBottom: 6,
  },
  primaryButton: {
    borderRadius: 999,
    minHeight: 48,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  primaryButtonText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default TransferStatusScreen;

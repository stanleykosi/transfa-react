import React, { useMemo } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';

import { useTransactionStatus } from '@/api/transactionStatusHooks';
import type { AppNavigationProp } from '@/types/navigation';
import type { AppStackParamList } from '@/navigation/AppStack';
import { formatCurrency } from '@/utils/formatCurrency';

type MultiReceiptRoute = RouteProp<AppStackParamList, 'MultiTransferReceipts'>;

type Receipt = AppStackParamList['MultiTransferReceipts']['receipts'][number];

const BG_BOTTOM = '#050607';
const BRAND_YELLOW = '#FFD300';

const normalizeStatusLabel = (status?: string) => {
  const normalized = (status ?? 'pending').toLowerCase();
  if (normalized === 'completed') {
    return { label: 'Completed', color: '#0F8F40' };
  }
  if (normalized === 'failed') {
    return { label: 'Failed', color: '#D24646' };
  }
  return { label: 'Processing', color: '#9EA0A6' };
};

const stripUsernamePrefix = (username: string) => username.replace(/^_+/, '');

const ReceiptStatusCard = ({ receipt }: { receipt: Receipt }) => {
  const navigation = useNavigation<AppNavigationProp>();
  const { data, isLoading } = useTransactionStatus(receipt.transactionId, true);

  const statusMeta = normalizeStatusLabel(data?.status);

  return (
    <TouchableOpacity
      style={styles.receiptCard}
      activeOpacity={0.85}
      onPress={() =>
        navigation.navigate('TransferStatus', {
          transactionId: receipt.transactionId,
          amount: receipt.amount,
          fee: receipt.fee,
          description: receipt.description,
          recipientUsername: stripUsernamePrefix(receipt.recipientUsername),
          transferType: 'p2p',
        })
      }
    >
      <View style={styles.receiptHeader}>
        <Text style={styles.receiptRecipient}>
          {stripUsernamePrefix(receipt.recipientUsername)}
        </Text>
        <View style={styles.statusBadge}>
          {isLoading ? (
            <ActivityIndicator size="small" color={statusMeta.color} />
          ) : (
            <Text style={[styles.statusText, { color: statusMeta.color }]}>{statusMeta.label}</Text>
          )}
        </View>
      </View>

      <View style={styles.receiptRow}>
        <Text style={styles.receiptLabel}>Amount</Text>
        <Text style={styles.receiptValue}>{formatCurrency(receipt.amount)}</Text>
      </View>
      <View style={styles.receiptRow}>
        <Text style={styles.receiptLabel}>Fee</Text>
        <Text style={styles.receiptValue}>{formatCurrency(receipt.fee)}</Text>
      </View>
      <View style={styles.receiptDivider} />
      <View style={styles.receiptRow}>
        <Text style={styles.receiptTotalLabel}>Total</Text>
        <Text style={styles.receiptTotalValue}>{formatCurrency(receipt.amount + receipt.fee)}</Text>
      </View>

      {receipt.description ? (
        <Text style={styles.receiptDescription} numberOfLines={2}>
          {receipt.description}
        </Text>
      ) : null}
    </TouchableOpacity>
  );
};

const MultiReceiptScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const route = useRoute<MultiReceiptRoute>();

  const receipts = useMemo(() => route.params?.receipts ?? [], [route.params?.receipts]);
  const failures = useMemo(() => route.params?.failures ?? [], [route.params?.failures]);

  const totals = useMemo(() => {
    const amount = receipts.reduce((sum, item) => sum + item.amount, 0);
    const fee = receipts.reduce((sum, item) => sum + item.fee, 0);
    return {
      amount,
      fee,
      total: amount + fee,
    };
  }, [receipts]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A1B1E', '#0C0D0F', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.backgroundGradient}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={22} color="#ECECEC" />
          </TouchableOpacity>
          <Text style={styles.title}>Transfer Receipts</Text>
          <View style={styles.spacer} />
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Batch Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Successful transfers</Text>
            <Text style={styles.summaryValue}>{receipts.length}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Failed transfers</Text>
            <Text style={styles.summaryValue}>{failures.length}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Amount</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totals.amount)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Fee</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totals.fee)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryTotalLabel}>Total</Text>
            <Text style={styles.summaryTotalValue}>{formatCurrency(totals.total)}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.listContent} showsVerticalScrollIndicator={false}>
          {receipts.map((receipt) => (
            <ReceiptStatusCard key={receipt.transactionId} receipt={receipt} />
          ))}

          {failures.length > 0 ? (
            <View style={styles.failureSection}>
              <Text style={styles.failureTitle}>Failed Transfers</Text>
              {failures.map((failure, index) => (
                <View key={`${failure.recipient_username}-${index}`} style={styles.failureCard}>
                  <Text style={styles.failureRecipient}>
                    {stripUsernamePrefix(failure.recipient_username)} -{' '}
                    {formatCurrency(failure.amount)}
                  </Text>
                  <Text style={styles.failureReason}>{failure.error}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.doneButton}
            onPress={() => navigation.navigate('AppTabs', { screen: 'Home' })}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
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
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 28,
    paddingVertical: 4,
  },
  title: {
    color: '#F2F2F2',
    fontSize: 20,
    fontWeight: '700',
  },
  spacer: {
    width: 28,
  },
  summaryCard: {
    marginTop: 14,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  summaryTitle: {
    color: '#D8B926',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 6,
  },
  summaryRow: {
    minHeight: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryLabel: {
    color: '#AEB0B5',
    fontSize: 13,
  },
  summaryValue: {
    color: '#ECEDEF',
    fontSize: 13,
    fontWeight: '600',
  },
  summaryDivider: {
    marginVertical: 4,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  summaryTotalLabel: {
    color: '#F5F5F6',
    fontSize: 16,
    fontWeight: '700',
  },
  summaryTotalValue: {
    color: '#F5F5F6',
    fontSize: 16,
    fontWeight: '700',
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 120,
    gap: 10,
  },
  receiptCard: {
    borderRadius: 10,
    backgroundColor: '#F6F6F7',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  receiptHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  receiptRecipient: {
    color: '#18191B',
    fontSize: 15,
    fontWeight: '700',
  },
  statusBadge: {
    minWidth: 84,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#ECECEF',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '700',
  },
  receiptRow: {
    minHeight: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  receiptLabel: {
    color: '#5A5C60',
    fontSize: 13,
  },
  receiptValue: {
    color: '#1A1B1E',
    fontSize: 13,
    fontWeight: '600',
  },
  receiptDivider: {
    marginVertical: 4,
    height: 1,
    backgroundColor: '#DADBDD',
  },
  receiptTotalLabel: {
    color: '#1A1B1D',
    fontSize: 14,
    fontWeight: '700',
  },
  receiptTotalValue: {
    color: '#1A1B1D',
    fontSize: 14,
    fontWeight: '700',
  },
  receiptDescription: {
    marginTop: 6,
    color: '#4F5054',
    fontSize: 12,
  },
  failureSection: {
    marginTop: 4,
    gap: 6,
  },
  failureTitle: {
    color: '#F4B6B6',
    fontSize: 14,
    fontWeight: '700',
  },
  failureCard: {
    borderRadius: 8,
    backgroundColor: 'rgba(251,104,104,0.16)',
    borderWidth: 1,
    borderColor: 'rgba(251,104,104,0.4)',
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  failureRecipient: {
    color: '#FFD3D3',
    fontSize: 13,
    fontWeight: '600',
  },
  failureReason: {
    marginTop: 2,
    color: '#FFB3B3',
    fontSize: 12,
  },
  footer: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
  },
  doneButton: {
    height: 46,
    borderRadius: 8,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: '#111214',
    fontSize: 17,
    fontWeight: '700',
  },
});

export default MultiReceiptScreen;

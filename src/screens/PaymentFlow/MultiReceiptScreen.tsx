import React, { useMemo } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';

import type { AppNavigationProp } from '@/types/navigation';
import type { AppStackParamList } from '@/navigation/AppStack';
import { formatCurrency } from '@/utils/formatCurrency';
import { normalizeUsername } from '@/utils/username';

type MultiReceiptRoute = RouteProp<AppStackParamList, 'MultiTransferReceipts'>;
type Receipt = AppStackParamList['MultiTransferReceipts']['receipts'][number];

const BRAND_YELLOW = '#FFD300';
const BG_BOTTOM = '#050607';
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BORDER = 'rgba(255,255,255,0.06)';

const ReceiptCard = ({ receipt }: { receipt: Receipt }) => {
  const navigation = useNavigation<AppNavigationProp>();

  return (
    <TouchableOpacity
      activeOpacity={0.9}
      style={styles.receiptCard}
      onPress={() =>
        navigation.navigate('TransferStatus', {
          transactionId: receipt.transactionId,
          amount: receipt.amount,
          fee: receipt.fee,
          description: receipt.description,
          recipientUsername: normalizeUsername(receipt.recipientUsername),
          transferType: 'p2p',
          initialStatus: receipt.initialStatus ?? 'completed',
        })
      }
    >
      <View style={styles.receiptTopRow}>
        <View>
          <Text style={styles.receiptRecipient}>
            @{normalizeUsername(receipt.recipientUsername)}
          </Text>
          <Text style={styles.receiptTxId} numberOfLines={1}>
            {receipt.transactionId}
          </Text>
        </View>
        <View style={styles.completedBadge}>
          <Ionicons name="checkmark-circle" size={14} color="#00C267" />
          <Text style={styles.completedBadgeText}>Completed</Text>
        </View>
      </View>

      <View style={styles.receiptAmountWrap}>
        <Text style={styles.receiptAmountLabel}>Total Debited</Text>
        <Text style={styles.receiptAmountValue}>
          {formatCurrency(receipt.amount + receipt.fee)}
        </Text>
      </View>

      <View style={styles.receiptRow}>
        <Text style={styles.receiptLabel}>Amount</Text>
        <Text style={styles.receiptValue}>{formatCurrency(receipt.amount)}</Text>
      </View>
      <View style={styles.receiptRow}>
        <Text style={styles.receiptLabel}>Fee</Text>
        <Text style={styles.receiptValue}>{formatCurrency(receipt.fee)}</Text>
      </View>
      {receipt.description ? (
        <View style={styles.receiptRow}>
          <Text style={styles.receiptLabel}>Description</Text>
          <Text style={[styles.receiptValue, styles.receiptDescription]} numberOfLines={2}>
            {receipt.description}
          </Text>
        </View>
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
        colors={['#1A1B1E', '#0E0F12', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.backgroundGradient}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
        <View style={styles.headerRow}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={20} color="#F3F3F3" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Transfer Receipts</Text>
          <View style={styles.headerSpacer} />
        </View>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Batch Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Completed receipts</Text>
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
            <Text style={styles.summaryTotalLabel}>Total Debited</Text>
            <Text style={styles.summaryTotalValue}>{formatCurrency(totals.total)}</Text>
          </View>
        </View>

        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          {receipts.length === 0 ? (
            <View style={styles.emptyState}>
              <Ionicons name="receipt-outline" size={30} color="#A9ACB3" />
              <Text style={styles.emptyTitle}>No Completed Receipts Yet</Text>
              <Text style={styles.emptyText}>
                Receipts appear here only after server confirmation.
              </Text>
            </View>
          ) : (
            receipts.map((receipt) => <ReceiptCard key={receipt.transactionId} receipt={receipt} />)
          )}

          {failures.length > 0 ? (
            <View style={styles.failureSection}>
              <Text style={styles.failureTitle}>Failed Transfers</Text>
              {failures.map((failure, index) => (
                <View key={`${failure.recipient_username}-${index}`} style={styles.failureCard}>
                  <Text style={styles.failureRecipient}>
                    @{normalizeUsername(failure.recipient_username)}
                  </Text>
                  <Text style={styles.failureAmount}>{formatCurrency(failure.amount)}</Text>
                  <Text style={styles.failureReason}>{failure.error}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </ScrollView>

        <View style={styles.footer}>
          <TouchableOpacity
            style={styles.doneButton}
            activeOpacity={0.9}
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
  summaryCard: {
    borderRadius: 18,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
  },
  summaryTitle: {
    color: '#FFF3AD',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  summaryRow: {
    minHeight: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 6,
  },
  summaryLabel: {
    color: '#A9ACB3',
    fontSize: 14,
    fontWeight: '500',
  },
  summaryValue: {
    color: '#EDEEF0',
    fontSize: 14,
    fontWeight: '600',
  },
  summaryDivider: {
    height: 1,
    marginVertical: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
  },
  summaryTotalLabel: {
    color: '#FFF0AA',
    fontSize: 15,
    fontWeight: '700',
  },
  summaryTotalValue: {
    color: '#FFEA81',
    fontSize: 16,
    fontWeight: '800',
  },
  content: {
    paddingTop: 14,
    paddingBottom: 16,
    gap: 12,
  },
  emptyState: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    paddingVertical: 20,
    paddingHorizontal: 16,
  },
  emptyTitle: {
    marginTop: 8,
    color: '#EEF0F3',
    fontSize: 16,
    fontWeight: '700',
  },
  emptyText: {
    marginTop: 6,
    color: '#A9ACB3',
    fontSize: 14,
    textAlign: 'center',
    lineHeight: 20,
  },
  receiptCard: {
    borderRadius: 18,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  receiptTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 8,
  },
  receiptRecipient: {
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '700',
  },
  receiptTxId: {
    marginTop: 3,
    color: '#9EA0A6',
    fontSize: 12,
    maxWidth: 210,
  },
  completedBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 5,
    backgroundColor: 'rgba(0,194,103,0.12)',
  },
  completedBadgeText: {
    color: '#00C267',
    fontSize: 12,
    fontWeight: '700',
  },
  receiptAmountWrap: {
    marginTop: 12,
    marginBottom: 10,
    borderRadius: 14,
    backgroundColor: 'rgba(255,211,0,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,211,0,0.17)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  receiptAmountLabel: {
    color: '#B4B7BE',
    fontSize: 12,
    fontWeight: '600',
  },
  receiptAmountValue: {
    marginTop: 2,
    color: '#FFEA81',
    fontSize: 24,
    fontWeight: '800',
    letterSpacing: -0.5,
  },
  receiptRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginTop: 8,
    gap: 12,
  },
  receiptLabel: {
    color: '#A9ACB3',
    fontSize: 14,
    fontWeight: '500',
  },
  receiptValue: {
    color: '#EDEEF0',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'right',
    flex: 1,
  },
  receiptDescription: {
    color: '#D5D8DD',
  },
  failureSection: {
    marginTop: 6,
  },
  failureTitle: {
    color: '#F78D8D',
    fontSize: 15,
    fontWeight: '700',
    marginBottom: 8,
  },
  failureCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(232,91,91,0.3)',
    backgroundColor: 'rgba(232,91,91,0.1)',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
  },
  failureRecipient: {
    color: '#F4B2B2',
    fontSize: 14,
    fontWeight: '700',
  },
  failureAmount: {
    marginTop: 2,
    color: '#F6C2C2',
    fontSize: 13,
    fontWeight: '600',
  },
  failureReason: {
    marginTop: 4,
    color: '#FAD7D7',
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    paddingTop: 10,
    paddingBottom: 6,
  },
  doneButton: {
    borderRadius: 999,
    minHeight: 48,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  doneButtonText: {
    color: '#111111',
    fontSize: 15,
    fontWeight: '700',
  },
});

export default MultiReceiptScreen;

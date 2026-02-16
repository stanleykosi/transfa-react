import React from 'react';
import { ActivityIndicator, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  useGetIncomingPaymentRequest,
  useTransactionFees,
  useUserProfile,
} from '@/api/transactionApi';
import type { AppNavigationProp } from '@/types/navigation';
import type { AppStackParamList } from '@/navigation/AppStack';
import { formatCurrency } from '@/utils/formatCurrency';
import { BRAND_YELLOW, stripUsernamePrefix } from './helpers';

type SummaryRoute = RouteProp<AppStackParamList, 'RequestPaymentSummary'>;

const BG_BOTTOM = '#050607';

const RequestPaymentSummaryScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const route = useRoute<SummaryRoute>();
  const { requestId } = route.params;

  const { data: request, isLoading: isLoadingRequest } = useGetIncomingPaymentRequest(requestId);
  const { data: fees, isLoading: isLoadingFees } = useTransactionFees();
  const { data: me } = useUserProfile();

  if (isLoadingRequest || isLoadingFees || !request) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="small" color={BRAND_YELLOW} />
        <Text style={styles.loadingText}>Preparing payment summary...</Text>
      </View>
    );
  }

  const senderUsername = stripUsernamePrefix(me?.username || 'you');
  const receiverUsername = stripUsernamePrefix(request.creator_username || 'recipient');

  const fee = fees?.p2p_fee_kobo ?? 0;
  const total = request.amount + fee;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A1B1E', '#0C0D0F', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#ECECEC" />
        </TouchableOpacity>

        <Text style={styles.title}>Summary</Text>

        <View style={styles.userFlowRow}>
          <View style={styles.userNode}>
            <View style={styles.userAvatar}>
              <Text style={styles.userInitial}>{senderUsername.slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text style={styles.userLabel} numberOfLines={1}>
              {senderUsername}
            </Text>
          </View>

          <Ionicons name="arrow-forward" size={18} color="#B8B8BA" style={styles.arrow} />

          <View style={styles.userNode}>
            <View style={[styles.userAvatar, { backgroundColor: '#F3ABA7' }]}>
              <Text style={styles.userInitial}>{receiverUsername.slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text style={styles.userLabel} numberOfLines={1}>
              {receiverUsername}
            </Text>
          </View>
        </View>

        <View style={styles.summaryCard}>
          <SummaryRow label="Receiver" value={receiverUsername} />
          <SummaryRow label="Transaction type" value="Request" />
          <SummaryRow label="Amount" value={formatCurrency(request.amount)} />
          <SummaryRow label="Transaction fee" value={formatCurrency(fee)} />
          <View style={styles.summaryDivider} />
          <SummaryRow label="Total" value={formatCurrency(total)} isTotal />
        </View>

        <TouchableOpacity
          style={styles.confirmButton}
          onPress={() => navigation.navigate('RequestPaymentAuth', { requestId: request.id })}
        >
          <Text style={styles.confirmButtonText}>Confirm</Text>
        </TouchableOpacity>
      </SafeAreaView>
    </View>
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
  <View style={styles.row}>
    <Text style={[styles.rowLabel, isTotal && styles.rowLabelTotal]}>{label}</Text>
    <Text style={[styles.rowValue, isTotal && styles.rowValueTotal]}>{value}</Text>
  </View>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_BOTTOM,
  },
  safeArea: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: BG_BOTTOM,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#F2F2F2',
    fontSize: 14,
  },
  backButton: {
    width: 28,
    paddingVertical: 4,
  },
  title: {
    marginTop: 14,
    color: BRAND_YELLOW,
    fontSize: 18,
    fontWeight: '700',
    textAlign: 'center',
  },
  userFlowRow: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  userNode: {
    alignItems: 'center',
    maxWidth: 120,
  },
  userAvatar: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: '#F4DDB5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInitial: {
    color: '#151618',
    fontSize: 22,
    fontWeight: '700',
  },
  userLabel: {
    marginTop: 6,
    color: '#D8D9DC',
    fontSize: 15,
    fontWeight: '500',
  },
  arrow: {
    marginHorizontal: 24,
  },
  summaryCard: {
    marginTop: 18,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  row: {
    minHeight: 27,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  rowLabel: {
    color: '#A5A8AF',
    fontSize: 14,
  },
  rowLabelTotal: {
    color: '#F5F5F6',
    fontWeight: '700',
    fontSize: 18,
  },
  rowValue: {
    color: '#ECEDEF',
    fontSize: 15,
    fontWeight: '600',
  },
  rowValueTotal: {
    color: '#F5F5F6',
    fontWeight: '800',
    fontSize: 18,
  },
  summaryDivider: {
    marginVertical: 4,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  confirmButton: {
    marginTop: 14,
    height: 52,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: '#121316',
    fontSize: 22 / 2,
    fontWeight: '700',
  },
});

export default RequestPaymentSummaryScreen;

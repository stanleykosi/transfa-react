import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';

import {
  useDeclineIncomingPaymentRequest,
  useGetIncomingPaymentRequest,
  useMarkNotificationRead,
} from '@/api/transactionApi';
import type { AppNavigationProp } from '@/types/navigation';
import type { AppStackParamList } from '@/navigation/AppStack';
import { formatCurrency } from '@/utils/formatCurrency';
import { BRAND_YELLOW, formatShortDate, stripUsernamePrefix } from './helpers';

type DetailRoute = RouteProp<AppStackParamList, 'IncomingRequestDetail'>;

const mapStatus = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === 'fulfilled' || normalized === 'paid') {
    return { label: 'Paid', text: '#25A641', bg: '#BFF2B6', icon: 'checkmark-circle' as const };
  }
  if (normalized === 'declined') {
    return { label: 'Declined', text: '#F14D4D', bg: '#FFCACA', icon: 'close-circle' as const };
  }
  return { label: 'Pending', text: '#D7A800', bg: 'rgba(255,211,0,0.25)', icon: 'time' as const };
};

const IncomingRequestDetailScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const route = useRoute<DetailRoute>();
  const { requestId, notificationId } = route.params;

  const {
    data: request,
    isLoading,
    isError,
    error,
    refetch,
  } = useGetIncomingPaymentRequest(requestId);

  const { mutate: markRead } = useMarkNotificationRead();
  const { mutate: declineRequest, isPending: isDeclining } = useDeclineIncomingPaymentRequest({
    onSuccess: () => {
      Alert.alert('Declined', 'Payment request declined successfully.');
      refetch();
    },
    onError: (mutationError) => {
      Alert.alert('Decline failed', mutationError.message || 'Could not decline request.');
    },
  });

  useEffect(() => {
    if (notificationId) {
      markRead({ notificationId });
    }
  }, [markRead, notificationId]);

  if (isLoading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="small" color={BRAND_YELLOW} />
        <Text style={styles.loadingText}>Loading request...</Text>
      </View>
    );
  }

  if (isError || !request) {
    return (
      <View style={styles.loadingRoot}>
        <Text style={styles.loadingText}>{error?.message || 'Unable to load request.'}</Text>
        <TouchableOpacity style={styles.retryButton} onPress={() => refetch()}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const status = mapStatus(request.display_status || request.status);
  const creatorUsername = stripUsernamePrefix(request.creator_username || 'Transfa User');
  const creatorName = request.creator_full_name?.trim() || 'Transfa User';
  const canAct = request.display_status === 'pending';

  return (
    <View style={styles.root}>
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.mediaArea}>
          {request.image_url ? (
            <Image
              source={{ uri: request.image_url }}
              style={styles.mediaImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.mediaPlaceholder}>
              <Ionicons name="image-outline" size={54} color="#BBBBBD" />
            </View>
          )}

          <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={18} color="#0F1013" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.sheetScroll}
          contentContainerStyle={styles.sheetScrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sheetCard}>
            <View style={styles.headerRow}>
              <View style={styles.avatarWrap}>
                <Text style={styles.avatarInitial}>
                  {creatorUsername.slice(0, 1).toUpperCase()}
                </Text>
                <View style={styles.lockBadge}>
                  <Ionicons name="lock-closed" size={9} color="#080808" />
                </View>
              </View>

              <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                <Ionicons name={status.icon} size={10} color={status.text} />
                <Text style={[styles.statusText, { color: status.text }]}>{status.label}</Text>
              </View>
            </View>

            <Text style={styles.username}>{creatorUsername}</Text>
            <Text style={styles.fullName}>{creatorName}</Text>

            <View style={styles.dateRow}>
              <Ionicons name="calendar-outline" size={12} color="#74777D" />
              <Text style={styles.dateText}>{formatShortDate(request.created_at)}</Text>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Title</Text>
              <Text style={styles.fieldValue} numberOfLines={2}>
                "{request.title}"
              </Text>
            </View>

            <View style={styles.fieldRow}>
              <Text style={styles.fieldLabel}>Amount</Text>
              <Text style={styles.amountValue}>{formatCurrency(request.amount)}</Text>
            </View>

            <View style={styles.descriptionWrap}>
              <Text style={styles.fieldLabel}>Description</Text>
              <Text style={styles.descriptionText}>
                {request.description || 'No description provided.'}
              </Text>
            </View>

            {canAct ? (
              <View style={styles.actionRow}>
                <TouchableOpacity
                  style={styles.payButton}
                  onPress={() =>
                    navigation.navigate('RequestPaymentSummary', { requestId: request.id })
                  }
                  activeOpacity={0.88}
                >
                  <Text style={styles.payButtonText}>Pay</Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={[styles.declineButton, isDeclining && styles.buttonDisabled]}
                  onPress={() =>
                    Alert.alert(
                      'Decline Request',
                      'Are you sure you want to decline this request?',
                      [
                        { text: 'Cancel', style: 'cancel' },
                        {
                          text: 'Decline',
                          style: 'destructive',
                          onPress: () => declineRequest({ requestId: request.id }),
                        },
                      ]
                    )
                  }
                  disabled={isDeclining}
                  activeOpacity={0.88}
                >
                  <Text style={styles.declineButtonText}>
                    {isDeclining ? 'Declining...' : 'Decline'}
                  </Text>
                </TouchableOpacity>
              </View>
            ) : (
              <TouchableOpacity style={styles.doneButton} onPress={() => navigation.goBack()}>
                <Text style={styles.doneButtonText}>Done</Text>
              </TouchableOpacity>
            )}
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#DEDEDF',
  },
  safeArea: {
    flex: 1,
  },
  loadingRoot: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#0A0B0E',
    gap: 10,
  },
  loadingText: {
    color: '#F2F2F2',
    fontSize: 14,
  },
  retryButton: {
    marginTop: 8,
    height: 36,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#111317',
    fontSize: 13,
    fontWeight: '700',
  },
  mediaArea: {
    height: 280,
    backgroundColor: '#CFCFD1',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  mediaPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#D6D6D8',
  },
  closeButton: {
    position: 'absolute',
    top: 14,
    left: 16,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#F0F0F1',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetScroll: {
    flex: 1,
  },
  sheetScrollContent: {
    paddingBottom: 24,
  },
  sheetCard: {
    marginTop: -20,
    minHeight: 480,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    backgroundColor: '#F6F6F7',
    paddingHorizontal: 20,
    paddingTop: 18,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  avatarWrap: {
    width: 90,
    height: 90,
    borderRadius: 20,
    backgroundColor: '#AFAFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#18191C',
    fontSize: 28,
    fontWeight: '700',
  },
  lockBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPill: {
    height: 24,
    borderRadius: 12,
    paddingHorizontal: 9,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
  username: {
    marginTop: 12,
    color: '#0E0F12',
    fontSize: 42 / 2,
    fontWeight: '800',
  },
  fullName: {
    marginTop: 2,
    color: '#5A5D64',
    fontSize: 14,
  },
  dateRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
  },
  dateText: {
    color: '#74777D',
    fontSize: 13,
  },
  fieldRow: {
    marginTop: 18,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 12,
  },
  fieldLabel: {
    color: '#2B2E33',
    fontSize: 28 / 2,
    fontWeight: '600',
  },
  fieldValue: {
    flex: 1,
    color: '#181A1F',
    fontSize: 17,
    fontWeight: '700',
    textAlign: 'right',
  },
  amountValue: {
    color: '#15171B',
    fontSize: 46 / 2,
    fontWeight: '800',
  },
  descriptionWrap: {
    marginTop: 18,
    gap: 6,
  },
  descriptionText: {
    color: '#74777D',
    fontSize: 14,
    lineHeight: 20,
  },
  actionRow: {
    marginTop: 22,
    flexDirection: 'row',
    gap: 10,
  },
  payButton: {
    flex: 1,
    height: 46,
    borderRadius: 9,
    backgroundColor: '#06080B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  payButtonText: {
    color: '#F3F4F6',
    fontSize: 17,
    fontWeight: '700',
  },
  declineButton: {
    flex: 1,
    height: 46,
    borderRadius: 9,
    backgroundColor: '#06080B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  declineButtonText: {
    color: '#F3F4F6',
    fontSize: 17,
    fontWeight: '700',
  },
  doneButton: {
    marginTop: 22,
    height: 46,
    borderRadius: 9,
    backgroundColor: '#06080B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: '#F3F4F6',
    fontSize: 17,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.7,
  },
});

export default IncomingRequestDetailScreen;

import React from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { LinearGradient } from 'expo-linear-gradient';

import {
  useListInAppNotifications,
  useMarkNotificationRead,
  useNotificationUnreadCounts,
} from '@/api/transactionApi';
import type { InAppNotification } from '@/types/api';
import type { AppNavigationProp } from '@/types/navigation';
import {
  BRAND_YELLOW,
  formatShortDate,
  resolveRequestNotificationMeta,
  stripUsernamePrefix,
} from './helpers';

const BG_BOTTOM = '#050607';

const RequestStatusPill = ({ status }: { status: 'pending' | 'paid' | 'declined' }) => {
  const colors =
    status === 'paid'
      ? { bg: '#BFF2B6', text: '#25A641', icon: 'checkmark-circle' as const }
      : status === 'declined'
        ? { bg: '#FFCACA', text: '#F14D4D', icon: 'close-circle' as const }
        : { bg: 'rgba(255,211,0,0.25)', text: '#D7A800', icon: 'time' as const };

  return (
    <View style={[styles.statusPill, { backgroundColor: colors.bg }]}>
      <Ionicons name={colors.icon} size={10} color={colors.text} />
      <Text style={[styles.statusPillText, { color: colors.text }]}>
        {status === 'paid' ? 'Paid' : status === 'declined' ? 'Declined' : 'Pending'}
      </Text>
    </View>
  );
};

const NotificationCenterScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const readString = (value: unknown): string | undefined =>
    typeof value === 'string' && value.trim().length > 0 ? value : undefined;
  const readNumber = (value: unknown): number | undefined =>
    typeof value === 'number' && Number.isFinite(value) ? value : undefined;

  const { data: counts } = useNotificationUnreadCounts();
  const {
    data: notifications,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useListInAppNotifications({
    limit: 40,
    offset: 0,
  });

  const { mutate: markRead } = useMarkNotificationRead();

  const items = notifications ?? [];
  const isInitialLoading = isLoading && items.length === 0;

  const openNotification = (item: InAppNotification) => {
    if (item.status === 'unread') {
      markRead({ notificationId: item.id });
    }

    if (item.type.startsWith('request.')) {
      const meta = resolveRequestNotificationMeta(item);
      if (!meta.requestId) {
        return;
      }

      if (item.type === 'request.incoming') {
        navigation.navigate('IncomingRequestDetail', {
          requestId: meta.requestId,
          notificationId: item.id,
        });
        return;
      }

      navigation.navigate('PaymentRequestSuccess', { requestId: meta.requestId });
      return;
    }

    if (item.type.startsWith('transfer.')) {
      const data = item.data || {};
      const transactionId = readString(data.transaction_id);
      if (!transactionId) {
        return;
      }

      const amount = readNumber(data.amount) ?? 0;
      const fee = readNumber(data.fee) ?? 0;
      const description = readString(data.description);
      const senderUsername = stripUsernamePrefix(readString(data.sender_username) || '');
      const transferType = readString(data.transfer_type) || 'p2p';
      const reason = readString(data.reason);

      navigation.navigate('TransferStatus', {
        transactionId,
        amount,
        fee,
        description,
        recipientUsername: senderUsername || undefined,
        transferType,
        initialStatus: item.type === 'transfer.failed' ? 'failed' : undefined,
        failureReason: item.type === 'transfer.failed' ? reason : undefined,
      });
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A1B1E', '#0C0D0F', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.content}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={BRAND_YELLOW}
            />
          }
        >
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
              <Ionicons name="arrow-back" size={20} color="#ECECEC" />
            </TouchableOpacity>

            <View style={styles.headerSpacer} />

            <TouchableOpacity style={styles.headerButton} activeOpacity={0.9}>
              <Ionicons name="settings-outline" size={18} color="#ECECEC" />
            </TouchableOpacity>
          </View>

          <View style={styles.categoryList}>
            <TouchableOpacity
              style={styles.categoryCard}
              activeOpacity={0.86}
              onPress={() => navigation.navigate('IncomingRequests')}
            >
              <View style={styles.categoryLeft}>
                <View style={styles.categoryIconWrap}>
                  <Ionicons name="receipt-outline" size={17} color="#D6D7D9" />
                </View>
                <View>
                  <Text style={styles.categoryTitle}>Request</Text>
                  <Text style={styles.categorySubtitle}>Incoming request</Text>
                </View>
              </View>
              <View style={styles.categoryRight}>
                {(counts?.request ?? 0) > 0 ? (
                  <View style={styles.unreadBadge}>
                    <Text style={styles.unreadBadgeText}>{counts?.request}</Text>
                  </View>
                ) : null}
                <Ionicons name="chevron-forward" size={18} color="#CDD0D5" />
              </View>
            </TouchableOpacity>

            <View style={styles.categoryCard}>
              <View style={styles.categoryLeft}>
                <View style={styles.categoryIconWrap}>
                  <Ionicons name="newspaper-outline" size={17} color="#D6D7D9" />
                </View>
                <View>
                  <Text style={styles.categoryTitle}>Newsletter</Text>
                  <Text style={styles.categorySubtitle}>Newsletter announcement</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CDD0D5" />
            </View>

            <View style={styles.categoryCard}>
              <View style={styles.categoryLeft}>
                <View style={styles.categoryIconWrap}>
                  <Ionicons name="phone-portrait-outline" size={17} color="#D6D7D9" />
                </View>
                <View>
                  <Text style={styles.categoryTitle}>System</Text>
                  <Text style={styles.categorySubtitle}>System notification</Text>
                </View>
              </View>
              <Ionicons name="chevron-forward" size={18} color="#CDD0D5" />
            </View>
          </View>

          <Text style={styles.sectionTitle}>General</Text>

          {isInitialLoading ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator size="small" color={BRAND_YELLOW} />
            </View>
          ) : isError && items.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {error?.message || 'Unable to load notifications.'}
              </Text>
              <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : items.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No notifications yet.</Text>
            </View>
          ) : (
            <View style={styles.notificationList}>
              {items.map((item) => {
                const meta = resolveRequestNotificationMeta(item);
                const username = stripUsernamePrefix(meta.actorUsername || 'Transfa User');
                const isRequestLike = item.type.startsWith('request.');

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.card}
                    activeOpacity={0.88}
                    onPress={() => openNotification(item)}
                  >
                    <View style={styles.cardAvatar}>
                      <Text style={styles.cardAvatarInitial}>
                        {username.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.cardTextWrap}>
                      <View style={styles.titleRow}>
                        <Text style={styles.cardTitle} numberOfLines={1}>
                          {isRequestLike ? username : item.title}
                        </Text>
                        {isRequestLike ? (
                          <View style={styles.lockBadge}>
                            <Ionicons name="lock-closed" size={8} color="#080808" />
                          </View>
                        ) : null}
                      </View>

                      {meta.amount ? (
                        <Text style={styles.cardAmount}>
                          ₦{(meta.amount / 100).toLocaleString()}
                        </Text>
                      ) : null}

                      <View style={styles.dateRow}>
                        <Ionicons name="calendar-outline" size={11} color="#757981" />
                        <Text style={styles.cardDate}>{formatShortDate(item.created_at)}</Text>
                      </View>

                      {meta.actorFullName ? (
                        <Text style={styles.cardSubText} numberOfLines={1}>
                          {meta.actorFullName}
                        </Text>
                      ) : item.body ? (
                        <Text style={styles.cardSubText} numberOfLines={1}>
                          {item.body}
                        </Text>
                      ) : null}
                    </View>

                    {isRequestLike && meta.status === 'pending' && meta.amount ? (
                      <View style={styles.requestedWrap}>
                        <Text style={styles.requestedLabel}>Requested{`\n`}Amount:</Text>
                        <Text style={styles.requestedAmount}>
                          ₦{(meta.amount / 100).toLocaleString()}
                        </Text>
                      </View>
                    ) : isRequestLike ? (
                      <RequestStatusPill status={meta.status} />
                    ) : item.status === 'unread' ? (
                      <View style={styles.unreadDot} />
                    ) : null}
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_BOTTOM,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 28,
    paddingVertical: 4,
    alignItems: 'center',
  },
  headerSpacer: {
    flex: 1,
  },
  categoryList: {
    marginTop: 14,
    gap: 10,
  },
  categoryCard: {
    minHeight: 64,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  categoryLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  categoryIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  categoryTitle: {
    color: '#EFEFF0',
    fontSize: 28 / 2,
    fontWeight: '700',
  },
  categorySubtitle: {
    color: '#8F9197',
    fontSize: 11,
    marginTop: 2,
  },
  categoryRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 6,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    color: '#131416',
    fontSize: 11,
    fontWeight: '700',
  },
  sectionTitle: {
    marginTop: 16,
    color: '#DFE0E4',
    fontSize: 26 / 2,
    fontWeight: '600',
  },
  stateWrap: {
    marginTop: 24,
    alignItems: 'center',
  },
  emptyCard: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    color: '#9FA1A7',
    fontSize: 13,
    textAlign: 'center',
  },
  retryButton: {
    borderRadius: 8,
    backgroundColor: BRAND_YELLOW,
    paddingHorizontal: 14,
    height: 30,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#111317',
    fontSize: 12,
    fontWeight: '700',
  },
  notificationList: {
    marginTop: 10,
    gap: 10,
  },
  card: {
    minHeight: 86,
    borderRadius: 8,
    backgroundColor: '#F4F4F5',
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardAvatar: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#F3ABA7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAvatarInitial: {
    color: '#17181A',
    fontSize: 14,
    fontWeight: '700',
  },
  cardTextWrap: {
    marginLeft: 10,
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardTitle: {
    color: '#1B1C1F',
    fontSize: 24 / 2,
    fontWeight: '700',
    maxWidth: '88%',
  },
  lockBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAmount: {
    marginTop: 1,
    color: '#131416',
    fontSize: 22 / 2,
    fontWeight: '700',
  },
  dateRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardDate: {
    color: '#6F7279',
    fontSize: 11,
  },
  cardSubText: {
    marginTop: 2,
    color: '#686B72',
    fontSize: 12,
  },
  statusPill: {
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusPillText: {
    fontSize: 11,
    fontWeight: '700',
  },
  requestedWrap: {
    alignItems: 'flex-end',
  },
  requestedLabel: {
    color: '#686B72',
    fontSize: 11,
    textAlign: 'right',
    lineHeight: 13,
  },
  requestedAmount: {
    marginTop: 2,
    color: '#111216',
    fontSize: 12,
    fontWeight: '700',
  },
  unreadDot: {
    width: 9,
    height: 9,
    borderRadius: 4.5,
    backgroundColor: BRAND_YELLOW,
  },
});

export default NotificationCenterScreen;

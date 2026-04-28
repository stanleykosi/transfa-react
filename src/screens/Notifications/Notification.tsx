import ArrowRightIcon from '@/assets/icons/arrow-right1.svg';
import BackIcon from '@/assets/icons/back.svg';
import CalendarIcon from '@/assets/icons/calendar1.svg';
import CancelIcon from '@/assets/icons/cancel.svg';
import NewsletterIcon from '@/assets/icons/newsletter.svg';
import RequestIcon from '@/assets/icons/request.svg';
import SettingsIcon from '@/assets/icons/settings.svg';
import SystemIcon from '@/assets/icons/system.svg';
import VerifiedBadge from '@/assets/icons/verified.svg';
import Avatar1 from '@/assets/images/avatar1.svg';
import Avatar2 from '@/assets/images/avatar2.svg';
import Avatar3 from '@/assets/images/avatar3.svg';
import { useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

import {
  useListInAppNotifications,
  useMarkNotificationRead,
  useNotificationUnreadCounts,
} from '@/api/transactionApi';
import type { InAppNotification } from '@/types/api';
import type { AppNavigationProp } from '@/types/navigation';
import { formatCurrency } from '@/utils/formatCurrency';
import { formatShortDate, formatUsername, resolveRequestNotificationMeta } from './helpers';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const backgroundSvg = `<svg width="375" height="812" viewBox="0 0 375 812" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="375" height="812" fill="url(#paint0_linear_708_2445)"/>
<defs>
<linearGradient id="paint0_linear_708_2445" x1="187.5" y1="0" x2="187.5" y2="812" gradientUnits="userSpaceOnUse">
<stop stop-color="#2B2B2B"/>
<stop offset="0.778846" stop-color="#0F0F0F"/>
</linearGradient>
</defs>
</svg>`;

type AvatarComponent = React.ComponentType<{ width?: number; height?: number }>;

const avatarPool: AvatarComponent[] = [Avatar1, Avatar2, Avatar3];

const pickAvatarComponent = (seed: string): AvatarComponent => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000000007;
  }

  return avatarPool[Math.abs(hash) % avatarPool.length] || Avatar1;
};

const formatAmountFromKobo = (amountKobo?: number) => {
  if (typeof amountKobo !== 'number' || !Number.isFinite(amountKobo)) {
    return undefined;
  }

  return formatCurrency(amountKobo);
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
      const senderUsername = formatUsername(readString(data.sender_username) || '');
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

  const categories = [
    {
      id: 'request',
      title: 'Request',
      subtitle: 'Incoming request',
      icon: RequestIcon,
      onPress: () => navigation.navigate('IncomingRequests'),
    },
    {
      id: 'newsletter',
      title: 'Newsletter',
      subtitle: 'Newsletter announcement',
      icon: NewsletterIcon,
      onPress: undefined,
    },
    {
      id: 'system',
      title: 'System',
      subtitle: 'System notification',
      icon: SystemIcon,
      onPress: undefined,
    },
  ] as const;

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <View style={styles.backgroundContainer}>
        <SvgXml xml={backgroundSvg} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} />
      </View>

      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <BackIcon width={24} height={24} />
          </TouchableOpacity>
        </View>
        <View style={styles.topBarRight}>
          <TouchableOpacity style={styles.settingsButton} activeOpacity={0.7}>
            <SettingsIcon width={24} height={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#FFFFFF"
            colors={['#FFFFFF']}
          />
        }
      >
        <View style={styles.categoriesSection}>
          {categories.map((category) => {
            const IconComponent = category.icon;
            const isRequest = category.id === 'request';

            return (
              <TouchableOpacity
                key={category.id}
                style={styles.categoryCard}
                activeOpacity={0.7}
                onPress={category.onPress}
                disabled={!category.onPress}
              >
                <View style={styles.categoryIconContainer}>
                  {isRequest ? (
                    <RequestIcon width={20} height={20} color="#FFFFFF" />
                  ) : (
                    <IconComponent width={20} height={20} fill="#FFFFFF" />
                  )}
                </View>
                <View style={styles.categoryTextContainer}>
                  <Text style={styles.categoryTitle}>{category.title}</Text>
                  <Text style={styles.categorySubtitle}>{category.subtitle}</Text>
                </View>

                <View style={styles.categoryRightWrap}>
                  {isRequest && (counts?.request ?? 0) > 0 ? (
                    <View style={styles.unreadBadge}>
                      <Text style={styles.unreadBadgeText}>{counts?.request}</Text>
                    </View>
                  ) : null}
                  <ArrowRightIcon width={20} height={20} />
                </View>
              </TouchableOpacity>
            );
          })}
        </View>

        <View style={styles.generalSection}>
          <Text style={styles.sectionTitle}>General</Text>

          {isInitialLoading ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator size="small" color="#FFFFFF" />
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
            <View style={styles.notificationsList}>
              {items.map((item) => {
                const meta = resolveRequestNotificationMeta(item);
                const data = item.data || {};
                const isRequestLike = item.type.startsWith('request.');
                const status = meta.status;
                const isDeclined = status === 'declined';
                const username = formatUsername(
                  meta.actorUsername ||
                    readString(data.sender_username) ||
                    item.title ||
                    'Transfa User'
                );
                const amountKobo = meta.amount ?? readNumber(data.amount);
                const formattedAmount = formatAmountFromKobo(amountKobo);
                const secondaryText = meta.actorFullName || item.body || '';
                const AvatarComponent = pickAvatarComponent(username || item.id);

                return (
                  <TouchableOpacity
                    key={item.id}
                    style={styles.notificationCard}
                    onPress={() => openNotification(item)}
                    activeOpacity={0.7}
                  >
                    <View style={styles.notificationLeft}>
                      <AvatarComponent width={48} height={48} />

                      <View style={styles.notificationInfo}>
                        <View style={styles.usernameRow}>
                          <Text style={styles.username} numberOfLines={1}>
                            {username || 'Transfa User'}
                          </Text>
                          {isRequestLike ? <VerifiedBadge width={16} height={16} /> : null}
                        </View>

                        {formattedAmount && isDeclined ? (
                          <Text style={styles.amountText}>{formattedAmount}</Text>
                        ) : null}

                        <View style={styles.dateRow}>
                          <CalendarIcon width={14} height={14} />
                          <Text style={styles.dateText}>{formatShortDate(item.created_at)}</Text>
                        </View>

                        {!isRequestLike && secondaryText ? (
                          <Text style={styles.secondaryText} numberOfLines={1}>
                            {secondaryText}
                          </Text>
                        ) : null}
                      </View>
                    </View>

                    <View style={styles.notificationRight}>
                      {formattedAmount && isRequestLike && !isDeclined ? (
                        <View style={styles.amountContainer}>
                          <Text style={styles.requestedAmountLabel}>Requested Amount:</Text>
                          <Text style={styles.requestedAmountValue}>{formattedAmount}</Text>
                        </View>
                      ) : null}

                      {isDeclined ? (
                        <View style={styles.declinedBadge}>
                          <CancelIcon width={10} height={10} />
                          <Text style={styles.declinedText}>Declined</Text>
                        </View>
                      ) : null}

                      {!isRequestLike && item.status === 'unread' ? (
                        <View style={styles.unreadDot} />
                      ) : null}
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    zIndex: 0,
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    zIndex: 1,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    padding: 4,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  settingsButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  categoriesSection: {
    gap: 24,
    marginBottom: 32,
  },
  categoryCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333333',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  categoryIconContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#6C6C6C',
    borderRadius: 7,
  },
  categoryTextContainer: {
    flex: 1,
  },
  categoryTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 4,
  },
  categorySubtitle: {
    fontSize: 14,
    color: '#6C6B6B',
    fontFamily: 'Montserrat_400Regular',
  },
  categoryRightWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  unreadBadge: {
    minWidth: 20,
    height: 20,
    borderRadius: 10,
    paddingHorizontal: 5,
    backgroundColor: '#FFD300',
    alignItems: 'center',
    justifyContent: 'center',
  },
  unreadBadgeText: {
    fontSize: 11,
    color: '#0F0F0F',
    fontFamily: 'Montserrat_700Bold',
  },
  generalSection: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 16,
  },
  stateWrap: {
    marginTop: 20,
    alignItems: 'center',
  },
  emptyCard: {
    marginTop: 8,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 10,
  },
  emptyText: {
    fontSize: 13,
    color: '#D9D9D9',
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
  },
  retryButton: {
    height: 34,
    borderRadius: 8,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    fontSize: 13,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
  notificationsList: {
    gap: 12,
  },
  notificationCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  notificationLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
  },
  notificationInfo: {
    flex: 1,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginTop: 4,
  },
  username: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
    maxWidth: 140,
  },
  amountText: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 6,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 12,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
  },
  secondaryText: {
    fontSize: 12,
    color: '#4F4F4F',
    fontFamily: 'Montserrat_400Regular',
    marginTop: 6,
  },
  notificationRight: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  amountContainer: {
    alignItems: 'flex-end',
    maxWidth: 120,
  },
  requestedAmountLabel: {
    fontSize: 12,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 4,
    textAlign: 'right',
  },
  requestedAmountValue: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
    textAlign: 'right',
  },
  declinedBadge: {
    backgroundColor: '#FFCDCD',
    borderRadius: 21,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  declinedText: {
    fontSize: 12,
    color: '#FF3737',
    fontFamily: 'Montserrat_600SemiBold',
  },
  unreadDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFD300',
  },
});

export default NotificationCenterScreen;

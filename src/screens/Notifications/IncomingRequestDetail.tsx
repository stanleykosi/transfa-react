import CalendarIcon from '@/assets/icons/calendar1.svg';
import VerifiedBadge from '@/assets/icons/verified.svg';
import Avatar1 from '@/assets/images/avatar1.svg';
import Avatar2 from '@/assets/images/avatar2.svg';
import Avatar3 from '@/assets/images/avatar3.svg';
import MemeImage from '@/assets/images/meme.svg';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  SafeAreaView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';

import {
  useDeclineIncomingPaymentRequest,
  useGetIncomingPaymentRequest,
  useMarkNotificationRead,
} from '@/api/transactionApi';
import type { AppStackParamList } from '@/navigation/AppStack';
import type { AppNavigationProp } from '@/types/navigation';
import { formatCurrency } from '@/utils/formatCurrency';
import { BRAND_YELLOW, formatShortDate, stripUsernamePrefix } from './helpers';

type DetailRoute = RouteProp<AppStackParamList, 'IncomingRequestDetail'>;

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

type AvatarComponent = React.ComponentType<{ width?: number; height?: number }>;

const avatarPool: AvatarComponent[] = [Avatar1, Avatar2, Avatar3];

const pickAvatarComponent = (seed: string): AvatarComponent => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000000007;
  }

  return avatarPool[Math.abs(hash) % avatarPool.length] || Avatar1;
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

  const username = stripUsernamePrefix(request.creator_username || 'Transfa User');
  const fullName = request.creator_full_name?.trim() || 'Transfa User';
  const date = formatShortDate(request.created_at);
  const title = request.title || 'Payment Request';
  const description = request.description || 'No description provided.';
  const amount = formatCurrency(request.amount);
  const canAct = request.display_status === 'pending';
  const AvatarComponent = pickAvatarComponent(username || request.id);

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />

      <View style={styles.backgroundContainer}>
        {request.image_url ? (
          <Image
            source={{ uri: request.image_url }}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.imageWrapper}>
            <MemeImage width={SCREEN_WIDTH} height={SCREEN_HEIGHT * 0.5} />
          </View>
        )}
      </View>

      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
            <View style={styles.closeButtonInner}>
              <Text style={styles.closeButtonText}>✕</Text>
            </View>
          </TouchableOpacity>
        </View>
      </View>

      <View style={styles.whiteCard}>
        <View style={styles.avatarContainer}>
          <AvatarComponent width={100} height={100} />
          <View style={styles.verifiedBadgeContainer}>
            <VerifiedBadge width={20} height={20} />
          </View>
        </View>

        <View style={styles.userInfoSection}>
          <Text style={styles.username}>{username}</Text>
          <Text style={styles.name}>{fullName}</Text>
          <View style={styles.dateRow}>
            <CalendarIcon width={14} height={14} />
            <Text style={styles.dateText}>{date}</Text>
          </View>
        </View>

        <View style={styles.requestDetails}>
          <Text style={styles.detailLabel}>Title</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailTitle} numberOfLines={2}>
              {title}
            </Text>
            <Text style={styles.amount}>{amount}</Text>
          </View>

          <View style={styles.descriptionSection}>
            <Text style={styles.detailLabel}>Description</Text>
            <Text style={styles.description}>{description}</Text>
          </View>
        </View>

        {canAct ? (
          <View style={styles.actionButtons}>
            <TouchableOpacity
              style={styles.payButton}
              onPress={() =>
                navigation.navigate('RequestPaymentSummary', { requestId: request.id })
              }
              activeOpacity={0.7}
            >
              <Text style={styles.payButtonText}>Pay</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.declineButton}
              onPress={() =>
                Alert.alert('Decline Request', 'Are you sure you want to decline this request?', [
                  { text: 'Cancel', style: 'cancel' },
                  {
                    text: 'Decline',
                    style: 'destructive',
                    onPress: () => declineRequest({ requestId: request.id }),
                  },
                ])
              }
              disabled={isDeclining}
              activeOpacity={0.7}
            >
              <Text style={styles.declineButtonText}>
                {isDeclining ? 'Declining...' : 'Decline'}
              </Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.singleActionWrap}>
            <TouchableOpacity
              style={styles.payButton}
              onPress={() => navigation.goBack()}
              activeOpacity={0.7}
            >
              <Text style={styles.payButtonText}>Done</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
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
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
  },
  retryButton: {
    marginTop: 8,
    height: 36,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryButtonText: {
    color: '#111317',
    fontSize: 13,
    fontFamily: 'Montserrat_600SemiBold',
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.4,
    overflow: 'hidden',
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
  },
  imageWrapper: {
    width: SCREEN_WIDTH,
    height: '100%',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 10,
    zIndex: 10,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
  whiteCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 32,
    paddingHorizontal: 20,
    paddingBottom: 40,
    minHeight: SCREEN_HEIGHT * 0.7,
  },
  avatarContainer: {
    position: 'absolute',
    top: -20,
    left: 20,
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: 'visible',
    zIndex: 20,
  },
  verifiedBadgeContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  userInfoSection: {
    marginTop: 64,
    marginBottom: 24,
  },
  username: {
    fontSize: 30,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
  },
  requestDetails: {
    marginBottom: 32,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 24,
    gap: 12,
  },
  detailLabel: {
    fontSize: 16,
    color: '#FFD300',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  detailTitle: {
    fontSize: 18,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
    flex: 1,
    marginRight: 16,
  },
  amount: {
    fontSize: 24,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
  descriptionSection: {
    marginTop: 24,
  },
  description: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
    opacity: 0.7,
    lineHeight: 24,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 24,
    maxWidth: '90%',
    alignSelf: 'center',
  },
  singleActionWrap: {
    marginTop: 24,
    maxWidth: '90%',
    alignSelf: 'center',
    width: '100%',
  },
  payButton: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payButtonText: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
  declineButton: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    opacity: 1,
  },
  declineButtonText: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
});

export default IncomingRequestDetailScreen;

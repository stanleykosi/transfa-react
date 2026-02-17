import React from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import { BlurView } from 'expo-blur';

import { useTransactionHistoryWithUser, useUserProfile } from '@/api/transactionApi';
import type { TransactionHistoryItem, UserDiscoveryResult } from '@/types/api';
import type { AppNavigationProp } from '@/types/navigation';
import type { AppStackParamList } from '@/navigation/AppStack';
import { formatCurrency } from '@/utils/formatCurrency';

type UserProfileViewRoute = RouteProp<AppStackParamList, 'UserProfileView'>;

const BRAND_YELLOW = '#FFD300';

const stripUsernamePrefix = (value?: string | null) => (value || '').replace(/^_+/, '');

const UserProfileViewScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const route = useRoute<UserProfileViewRoute>();
  const initialUser = route.params.user;

  const { data: me } = useUserProfile();
  const {
    data: bilateral,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useTransactionHistoryWithUser(initialUser.username, 50, 0);

  const profileUser = bilateral?.user || initialUser;
  const displayUsername = stripUsernamePrefix(profileUser.username) || 'user';
  const displayFullName = profileUser.full_name?.trim() || 'Transfa User';
  const profileLink =
    bilateral?.shareable_link || `https://trytransfa.com/${displayUsername.toLowerCase()}`;

  const history = bilateral?.transactions ?? [];

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(profileLink);
    Alert.alert('Copied', 'Profile link copied to clipboard.');
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Connect with ${displayUsername} on Transfa: ${profileLink}`,
        url: profileLink,
      });
    } catch {
      Alert.alert('Share failed', 'Unable to share profile right now.');
    }
  };

  const openShareOptions = () => {
    Alert.alert('Share Profile', 'Choose an option', [
      { text: 'Copy Link', onPress: handleCopyLink },
      { text: 'Share', onPress: handleShare },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const recipientForActions: UserDiscoveryResult = {
    id: profileUser.id,
    username: profileUser.username,
    full_name: profileUser.full_name,
  };

  return (
    <View style={styles.root}>
      <BlurView intensity={34} tint="dark" style={StyleSheet.absoluteFillObject} />
      <View style={styles.backdropTint} />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.topActionsRow}>
          <TouchableOpacity
            onPress={() => navigation.goBack()}
            style={styles.topIconButton}
            activeOpacity={0.88}
          >
            <Ionicons name="close" size={22} color="#131417" />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={openShareOptions}
            style={styles.topIconButton}
            activeOpacity={0.88}
          >
            <Ionicons name="share-social-outline" size={18} color="#131417" />
          </TouchableOpacity>
        </View>

        <View style={styles.sheet}>
          <View style={styles.sheetHandle} />

          <View style={styles.avatarWrap}>
            <Text style={styles.avatarInitial}>{displayUsername.slice(0, 1).toUpperCase()}</Text>
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={10} color="#0B0C0F" />
            </View>
          </View>

          <Text style={styles.username}>{displayUsername}</Text>
          <Text style={styles.fullName}>{displayFullName}</Text>

          <View style={styles.actionRow}>
            <TouchableOpacity
              style={styles.actionButton}
              activeOpacity={0.9}
              onPress={() =>
                navigation.navigate('PayUser', { initialRecipient: recipientForActions })
              }
            >
              <Ionicons name="arrow-up-outline" size={17} color="#F2F2F3" />
              <Text style={styles.actionText}>Send</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.actionButton}
              activeOpacity={0.9}
              onPress={() =>
                navigation.navigate('CreatePaymentRequest', {
                  initialRecipient: recipientForActions,
                  forceMode: 'individual',
                })
              }
            >
              <Ionicons name="arrow-down-outline" size={17} color="#F2F2F3" />
              <Text style={styles.actionText}>Request</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.historyHeaderRow}>
            <Text style={styles.historyTitle}>Transaction History</Text>
            {(isRefetching || isLoading) && <ActivityIndicator size="small" color={BRAND_YELLOW} />}
          </View>

          {isError ? (
            <View style={styles.stateWrap}>
              <Text style={styles.stateText}>
                {error?.message || 'Unable to load transactions.'}
              </Text>
              <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
                <Text style={styles.retryButtonText}>Retry</Text>
              </TouchableOpacity>
            </View>
          ) : history.length === 0 && !isLoading ? (
            <View style={styles.stateWrap}>
              <Text style={styles.stateText}>No transactions with this user yet.</Text>
            </View>
          ) : (
            <ScrollView
              style={styles.historyList}
              contentContainerStyle={styles.historyListContent}
              showsVerticalScrollIndicator={false}
            >
              {history.map((item) => (
                <BilateralHistoryCard
                  key={item.id}
                  item={item}
                  currentUserID={me?.id}
                  counterpartyUserID={profileUser.id}
                  currentUsername={stripUsernamePrefix(me?.username) || 'You'}
                  counterpartyUsername={displayUsername}
                />
              ))}
            </ScrollView>
          )}
        </View>
      </SafeAreaView>
    </View>
  );
};

const BilateralHistoryCard = ({
  item,
  currentUserID,
  counterpartyUserID,
  currentUsername,
  counterpartyUsername,
}: {
  item: TransactionHistoryItem;
  currentUserID?: string;
  counterpartyUserID: string;
  currentUsername: string;
  counterpartyUsername: string;
}) => {
  const outgoing = currentUserID
    ? item.sender_id === currentUserID
    : item.sender_id !== counterpartyUserID;
  const sender = outgoing ? currentUsername : counterpartyUsername;
  const recipient = outgoing ? counterpartyUsername : currentUsername;

  return (
    <View style={styles.txCard}>
      <View style={styles.txLeft}>
        <View style={styles.txAvatarStack}>
          <View style={[styles.txAvatar, styles.txAvatarBack]}>
            <Text style={styles.txAvatarInitial}>{sender.slice(0, 1).toUpperCase()}</Text>
          </View>
          <View style={[styles.txAvatar, styles.txAvatarFront]}>
            <Text style={styles.txAvatarInitial}>{recipient.slice(0, 1).toUpperCase()}</Text>
          </View>
        </View>

        <View style={styles.txTextWrap}>
          <Text style={styles.txTitle} numberOfLines={1}>
            {`TRF FRM ${sender.toUpperCase()} TO ${recipient} - B69`}
          </Text>
          <Text style={styles.txSubText} numberOfLines={1}>
            {new Date(item.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </View>
      </View>

      <Text style={styles.txAmount}>{`${outgoing ? '-' : '+'}${formatCurrency(item.amount)}`}</Text>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: 'rgba(5, 6, 8, 0.32)',
  },
  backdropTint: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(4, 5, 7, 0.46)',
  },
  safeArea: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  topActionsRow: {
    marginTop: 6,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  topIconButton: {
    width: 41,
    height: 41,
    borderRadius: 20.5,
    backgroundColor: '#F5F5F6',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheet: {
    marginTop: 48,
    flex: 1,
    backgroundColor: '#F3F3F5',
    borderTopLeftRadius: 30,
    borderTopRightRadius: 30,
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 18,
  },
  sheetHandle: {
    alignSelf: 'center',
    width: 66,
    height: 4,
    borderRadius: 2,
    backgroundColor: '#CECED1',
  },
  avatarWrap: {
    marginTop: 24,
    alignSelf: 'center',
    width: 110,
    height: 110,
    borderRadius: 30,
    backgroundColor: '#ABABFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#16171A',
    fontSize: 40,
    fontWeight: '700',
  },
  lockBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 30,
    height: 30,
    borderRadius: 15,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    marginTop: 16,
    color: '#15161A',
    fontSize: 26,
    fontWeight: '800',
    textAlign: 'center',
  },
  fullName: {
    marginTop: 4,
    color: '#5A5D63',
    fontSize: 16,
    textAlign: 'center',
  },
  actionRow: {
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },
  actionButton: {
    width: 140,
    height: 86,
    borderRadius: 16,
    backgroundColor: '#0B0C10',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
  },
  actionText: {
    color: '#F1F1F2',
    fontSize: 15,
    fontWeight: '500',
  },
  historyHeaderRow: {
    marginTop: 24,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyTitle: {
    color: '#53565E',
    fontSize: 16,
    fontWeight: '500',
  },
  stateWrap: {
    marginTop: 18,
    borderRadius: 10,
    backgroundColor: '#E7E7E9',
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
    gap: 10,
  },
  stateText: {
    color: '#54575F',
    fontSize: 13,
    textAlign: 'center',
  },
  retryButton: {
    minWidth: 90,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#0C0D10',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  retryButtonText: {
    color: '#F3F3F4',
    fontSize: 13,
    fontWeight: '700',
  },
  historyList: {
    marginTop: 12,
    flex: 1,
  },
  historyListContent: {
    gap: 10,
    paddingBottom: 8,
  },
  txCard: {
    minHeight: 70,
    borderRadius: 11,
    backgroundColor: '#DEDFE2',
    paddingHorizontal: 11,
    paddingVertical: 11,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  txLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  txAvatarStack: {
    width: 36,
    height: 30,
    position: 'relative',
  },
  txAvatar: {
    width: 22,
    height: 22,
    borderRadius: 6,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'absolute',
  },
  txAvatarBack: {
    backgroundColor: '#F4DDB5',
    left: 0,
    top: 0,
    zIndex: 1,
  },
  txAvatarFront: {
    backgroundColor: '#ABABFD',
    right: 0,
    bottom: 0,
    zIndex: 2,
  },
  txAvatarInitial: {
    color: '#141518',
    fontSize: 10,
    fontWeight: '700',
  },
  txTextWrap: {
    marginLeft: 8,
    flex: 1,
  },
  txTitle: {
    color: '#383A40',
    fontSize: 13,
    fontWeight: '600',
  },
  txSubText: {
    marginTop: 1,
    color: '#6D7077',
    fontSize: 12,
  },
  txAmount: {
    marginLeft: 10,
    color: '#2D2F35',
    fontSize: 16,
    fontWeight: '700',
  },
});

export default UserProfileViewScreen;

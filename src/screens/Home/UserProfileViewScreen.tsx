import React, { useMemo } from 'react';
import { Alert, Share } from 'react-native';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';

import { useTransactionHistoryWithUser, useUserProfile } from '@/api/transactionApi';
import UserProfileModal, { type UserProfileModalTransaction } from '@/components/UserProfileModal';
import type { AppStackParamList } from '@/navigation/AppStack';
import type { UserDiscoveryResult } from '@/types/api';
import type { AppNavigationProp } from '@/types/navigation';
import { normalizeUsername } from '@/utils/username';

type UserProfileViewRoute = RouteProp<AppStackParamList, 'UserProfileView'>;

type AvatarKey = 'avatar1' | 'avatar2' | 'avatar3';

const stripUsernamePrefix = (value?: string | null) => normalizeUsername(value || '');

const pickAvatarKey = (seed: string): AvatarKey => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000000007;
  }

  const keys: AvatarKey[] = ['avatar1', 'avatar2', 'avatar3'];
  return keys[Math.abs(hash) % keys.length];
};

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

  const recipientForActions: UserDiscoveryResult = {
    id: profileUser.id,
    username: profileUser.username,
    full_name: profileUser.full_name,
  };

  const transactions = useMemo<UserProfileModalTransaction[]>(() => {
    const history = bilateral?.transactions ?? [];
    const currentUsername = stripUsernamePrefix(me?.username) || 'You';

    return history.map((item) => {
      const outgoing = me?.id ? item.sender_id === me.id : item.sender_id !== profileUser.id;
      const sender = outgoing ? currentUsername : displayUsername;
      const recipient = outgoing ? displayUsername : currentUsername;
      const fallbackTitle = outgoing ? `Transfer to ${recipient}` : `Transfer from ${sender}`;

      return {
        id: item.id,
        type: outgoing ? 'sent' : 'received',
        description: item.description?.trim() || fallbackTitle,
        amount: item.amount,
      };
    });
  }, [bilateral?.transactions, me?.id, me?.username, profileUser.id, displayUsername]);

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

  return (
    <UserProfileModal
      visible
      onClose={() => navigation.goBack()}
      username={displayUsername}
      fullName={displayFullName}
      avatar={pickAvatarKey(profileUser.username || displayUsername)}
      verified
      transactions={transactions}
      isLoading={isLoading}
      isRefetching={isRefetching}
      isError={isError}
      errorMessage={error?.message}
      onRetry={() => refetch()}
      onShare={handleShare}
      onSend={() => navigation.replace('PayUser', { initialRecipient: recipientForActions })}
      onRequest={() =>
        navigation.replace('CreatePaymentRequest', {
          initialRecipient: recipientForActions,
          forceMode: 'individual',
        })
      }
    />
  );
};

export default UserProfileViewScreen;

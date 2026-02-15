import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  PanResponder,
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

import { useAccountBalance, useTransactionHistory, useUserProfile } from '@/api/transactionApi';
import { useFrequentUsers } from '@/api/userDiscoveryApi';
import { formatCurrency } from '@/utils/formatCurrency';
import type { TransactionHistoryItem, UserDiscoveryResult } from '@/types/api';
import type { AppNavigationProp } from '@/types/navigation';

const BRAND_YELLOW = '#FFD300';
const BG_BOTTOM = '#050607';
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BORDER = 'rgba(255,255,255,0.06)';

const avatarPalette = ['#ABABFD', '#A8E6B5', '#F4CE9B', '#F3ABA7', '#BDE3FF', '#FFDCC0'];

const stripUsernamePrefix = (username?: string | null): string =>
  (username ?? 'new_user').replace(/^_+/, '');

const HomeScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();

  const [refreshing, setRefreshing] = useState(false);
  const [isBalanceHidden, setIsBalanceHidden] = useState(false);
  const [isExpandedHistory, setIsExpandedHistory] = useState(false);

  const historySheetPanResponder = useMemo(
    () =>
      PanResponder.create({
        onMoveShouldSetPanResponder: (_, gestureState) => Math.abs(gestureState.dy) > 8,
        onPanResponderRelease: (_, gestureState) => {
          if (gestureState.dy < -24) {
            setIsExpandedHistory(true);
            return;
          }
          if (gestureState.dy > 24) {
            setIsExpandedHistory(false);
          }
        },
      }),
    []
  );

  const {
    data: userProfile,
    isLoading: isLoadingProfile,
    refetch: refetchProfile,
  } = useUserProfile();
  const {
    data: balanceData,
    isLoading: isLoadingBalance,
    refetch: refetchBalance,
  } = useAccountBalance();
  const {
    data: transactionHistory,
    isLoading: isLoadingTransactions,
    refetch: refetchTransactions,
  } = useTransactionHistory();
  const { data: frequentUsersData, isLoading: isLoadingFrequent } = useFrequentUsers(8);

  const balanceValue = useMemo(() => {
    if (isBalanceHidden) {
      return '******';
    }
    return formatCurrency(balanceData?.available_balance ?? 0);
  }, [balanceData?.available_balance, isBalanceHidden]);

  const frequentUsers = frequentUsersData?.users ?? [];
  const transactions = transactionHistory ?? [];
  const visibleTransactions = isExpandedHistory ? transactions : transactions.slice(0, 3);

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await Promise.all([refetchBalance(), refetchTransactions(), refetchProfile()]);
    } finally {
      setRefreshing(false);
    }
  };

  if (isLoadingProfile) {
    return (
      <SafeAreaView style={styles.loadingSafeArea} edges={['top', 'left', 'right']}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={BRAND_YELLOW} />
          <Text style={styles.loadingText}>Loading your dashboard...</Text>
        </View>
      </SafeAreaView>
    );
  }

  const username = stripUsernamePrefix(userProfile?.username);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A1B1E', '#0C0D0F', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.backgroundGradient}
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              tintColor={BRAND_YELLOW}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.headerRow}>
            <View style={styles.userIdentityRow}>
              <View style={styles.avatarSquare}>
                <Ionicons name="person" size={16} color="#0D0E10" />
              </View>

              <View>
                <Text style={styles.welcomeText}>Welcome back</Text>
                <Text style={styles.usernameText}>{username}</Text>
              </View>
            </View>

            <View style={styles.headerActions}>
              <TouchableOpacity style={styles.headerIconButton} activeOpacity={0.8}>
                <Ionicons name="wallet-outline" size={18} color="#F2F2F2" />
              </TouchableOpacity>
              <TouchableOpacity style={styles.headerIconButton} activeOpacity={0.8}>
                <Ionicons name="notifications-outline" size={18} color="#F2F2F2" />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.balanceWrap}>
            <Text style={styles.balanceLabel}>AVAILABLE BALANCE</Text>
            <View style={styles.balanceRow}>
              {isLoadingBalance ? (
                <ActivityIndicator size="small" color={BRAND_YELLOW} />
              ) : (
                <Text style={styles.balanceAmount}>{balanceValue}</Text>
              )}

              <TouchableOpacity
                activeOpacity={0.8}
                onPress={() => setIsBalanceHidden((prev) => !prev)}
                style={styles.eyeButton}
              >
                <Ionicons
                  name={isBalanceHidden ? 'eye-outline' : 'eye-off-outline'}
                  size={18}
                  color="#CECECE"
                />
              </TouchableOpacity>
            </View>
          </View>

          <View style={styles.primaryActionRow}>
            <ActionCard
              icon="arrow-up-outline"
              title="Send"
              onPress={() => navigation.navigate('PayUser')}
            />
            <ActionCard icon="scan-outline" title="Scan" onPress={() => {}} />
            <ActionCard
              icon="arrow-down-outline"
              title="Receive"
              onPress={() => navigation.navigate('CreatePaymentRequest')}
            />
          </View>

          <View style={styles.findUsersHeader}>
            <Text style={styles.findUsersTitle}>Find Users</Text>

            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.searchPill}
              onPress={() => navigation.navigate('UserSearch')}
            >
              <Ionicons name="search" size={15} color="#D7D7D7" />
              <Text style={styles.searchPillText}>Search</Text>
            </TouchableOpacity>
          </View>

          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            contentContainerStyle={styles.userChipsRow}
          >
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.listChip}
              onPress={() => navigation.navigate('UserSearch')}
            >
              <View style={styles.listChipIconWrap}>
                <Ionicons name="list-outline" size={16} color="#F4F4F4" />
              </View>
              <Text style={styles.listChipLabel}>List</Text>
            </TouchableOpacity>

            {isLoadingFrequent
              ? [0, 1, 2].map((index) => (
                  <View key={index} style={styles.loadingUserChip}>
                    <View style={styles.loadingAvatar} />
                    <View style={styles.loadingTextBar} />
                  </View>
                ))
              : frequentUsers.map((user, index) => (
                  <FrequentUserChip
                    key={user.id}
                    user={user}
                    color={avatarPalette[index % avatarPalette.length]}
                    onPress={() => navigation.navigate('PayUser', { initialRecipient: user })}
                  />
                ))}
          </ScrollView>
        </ScrollView>
      </SafeAreaView>

      {isExpandedHistory && (
        <Pressable style={styles.overlayDimmer} onPress={() => setIsExpandedHistory(false)} />
      )}

      <View style={[styles.historySheet, isExpandedHistory && styles.historySheetExpanded]}>
        <View style={styles.sheetHandleTouchArea} {...historySheetPanResponder.panHandlers}>
          <View style={styles.sheetHandle} />
        </View>

        <View style={styles.historyHeaderRow}>
          <Text style={styles.historyTitle}>Transaction History</Text>
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.showAllButton}
            onPress={() => setIsExpandedHistory((prev) => !prev)}
          >
            <Text style={styles.showAllButtonText}>
              {isExpandedHistory ? 'Show less' : 'Show all'}
            </Text>
          </TouchableOpacity>
        </View>

        {isLoadingTransactions ? (
          <View style={styles.historyLoadingWrap}>
            <ActivityIndicator size="small" color="#101214" />
          </View>
        ) : visibleTransactions.length === 0 ? (
          <View style={styles.emptyHistoryWrap}>
            <Text style={styles.emptyHistoryText}>No transactions yet.</Text>
          </View>
        ) : (
          <ScrollView
            contentContainerStyle={styles.historyList}
            showsVerticalScrollIndicator={false}
            scrollEnabled={isExpandedHistory}
          >
            {visibleTransactions.map((txn) => (
              <TransactionHistoryCard
                key={txn.id}
                transaction={txn}
                currentUserId={userProfile?.id ?? ''}
              />
            ))}
          </ScrollView>
        )}
      </View>
    </View>
  );
};

const ActionCard = ({
  icon,
  title,
  onPress,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  title: string;
  onPress: () => void;
}) => (
  <TouchableOpacity activeOpacity={0.85} style={styles.actionCard} onPress={onPress}>
    <Ionicons name={icon} size={18} color="#F4F4F4" />
    <Text style={styles.actionCardText}>{title}</Text>
  </TouchableOpacity>
);

const FrequentUserChip = ({
  user,
  color,
  onPress,
}: {
  user: UserDiscoveryResult;
  color: string;
  onPress: () => void;
}) => {
  const label = stripUsernamePrefix(user.username);

  return (
    <TouchableOpacity style={styles.userChip} activeOpacity={0.8} onPress={onPress}>
      <View style={[styles.userAvatar, { backgroundColor: color }]}>
        <Text style={styles.userAvatarInitial}>
          {user.full_name?.slice(0, 1)?.toUpperCase() || user.username.slice(0, 1).toUpperCase()}
        </Text>
      </View>
      <Text style={styles.userChipLabel} numberOfLines={1}>
        {label}
      </Text>
    </TouchableOpacity>
  );
};

const TransactionHistoryCard = ({
  transaction,
  currentUserId,
}: {
  transaction: TransactionHistoryItem;
  currentUserId: string;
}) => {
  const isIncoming =
    transaction.recipient_id === currentUserId && transaction.sender_id !== currentUserId;
  const amountPrefix = isIncoming ? '+' : '-';
  const iconName: React.ComponentProps<typeof Ionicons>['name'] = isIncoming
    ? 'arrow-down-outline'
    : 'arrow-up-outline';

  const counterpart =
    transaction.description?.trim().length > 0
      ? transaction.description
      : isIncoming
        ? 'Incoming transfer'
        : 'Transfer';

  return (
    <View style={styles.historyItemCard}>
      <View style={styles.historyItemLeft}>
        <View style={styles.historyIconWrap}>
          <Ionicons name={iconName} size={14} color={BRAND_YELLOW} />
        </View>
        <View style={styles.historyItemTextWrap}>
          <Text style={styles.historyItemTitle} numberOfLines={1}>
            {counterpart}
          </Text>
          <Text style={styles.historyItemSubText} numberOfLines={1}>
            {new Date(transaction.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
            })}
          </Text>
        </View>
      </View>
      <Text style={styles.historyAmountText}>
        {amountPrefix}
        {formatCurrency(transaction.amount)}
      </Text>
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
    backgroundColor: BG_BOTTOM,
  },
  loadingSafeArea: {
    flex: 1,
    backgroundColor: BG_BOTTOM,
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    marginTop: 10,
    color: '#F1F1F1',
    fontSize: 13,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 280,
    backgroundColor: BG_BOTTOM,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  avatarSquare: {
    width: 38,
    height: 38,
    borderRadius: 10,
    backgroundColor: '#F4DDB5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  welcomeText: {
    color: '#8A8B8D',
    fontSize: 13,
  },
  usernameText: {
    marginTop: 1,
    color: '#F4F4F4',
    fontSize: 17,
    fontWeight: '700',
  },
  headerActions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  headerIconButton: {
    padding: 6,
  },
  balanceWrap: {
    alignItems: 'center',
    marginTop: 20,
  },
  balanceLabel: {
    color: '#B2B2B3',
    fontSize: 13,
    letterSpacing: 0.6,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 5,
  },
  balanceAmount: {
    color: '#F8F8F8',
    fontSize: 40,
    fontWeight: '700',
  },
  eyeButton: {
    marginLeft: 8,
    marginTop: 3,
    padding: 6,
  },
  primaryActionRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 24,
  },
  actionCard: {
    width: '31.5%',
    borderRadius: 16,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: 'center',
    paddingVertical: 14,
    gap: 7,
  },
  actionCardText: {
    color: '#EDEDED',
    fontSize: 15,
    fontWeight: '500',
  },
  findUsersHeader: {
    marginTop: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  findUsersTitle: {
    color: '#EDEDED',
    fontSize: 20,
    fontWeight: '500',
  },
  searchPill: {
    height: 36,
    borderRadius: 12,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  searchPillText: {
    color: '#D5D5D6',
    fontSize: 16,
  },
  userChipsRow: {
    marginTop: 14,
    gap: 12,
    paddingRight: 18,
  },
  listChip: {
    width: 62,
    alignItems: 'center',
  },
  listChipIconWrap: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listChipLabel: {
    marginTop: 7,
    color: '#EDEDED',
    fontSize: 12,
    fontWeight: '700',
  },
  loadingUserChip: {
    width: 62,
    alignItems: 'center',
  },
  loadingAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  loadingTextBar: {
    width: 44,
    height: 8,
    borderRadius: 4,
    marginTop: 8,
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  userChip: {
    width: 62,
    alignItems: 'center',
  },
  userAvatar: {
    width: 52,
    height: 52,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarInitial: {
    fontSize: 18,
    fontWeight: '700',
    color: '#121212',
  },
  userChipLabel: {
    marginTop: 7,
    color: '#EDEDED',
    fontSize: 12,
    maxWidth: 62,
  },
  overlayDimmer: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  historySheet: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 258,
    maxHeight: 340,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#F8F8F8',
    paddingHorizontal: 18,
    paddingTop: 10,
    paddingBottom: 96,
  },
  historySheetExpanded: {
    maxHeight: 710,
  },
  sheetHandle: {
    width: 50,
    height: 4,
    borderRadius: 999,
    backgroundColor: '#D4D4D5',
  },
  sheetHandleTouchArea: {
    alignSelf: 'center',
    paddingHorizontal: 16,
    paddingVertical: 10,
    marginBottom: 4,
  },
  historyHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 14,
  },
  historyTitle: {
    color: '#424347',
    fontSize: 21,
    fontWeight: '500',
  },
  showAllButton: {
    backgroundColor: '#E6E6E6',
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 6,
  },
  showAllButtonText: {
    color: '#424347',
    fontSize: 16,
    fontWeight: '500',
  },
  historyLoadingWrap: {
    paddingVertical: 22,
    alignItems: 'center',
  },
  emptyHistoryWrap: {
    paddingVertical: 14,
  },
  emptyHistoryText: {
    fontSize: 14,
    color: '#777',
  },
  historyList: {
    gap: 10,
    paddingBottom: 18,
  },
  historyItemCard: {
    backgroundColor: '#E8E8E9',
    borderRadius: 12,
    padding: 11,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  historyItemLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    flex: 1,
    marginRight: 8,
  },
  historyIconWrap: {
    width: 28,
    height: 28,
    borderRadius: 8,
    backgroundColor: '#101214',
    justifyContent: 'center',
    alignItems: 'center',
  },
  historyItemTextWrap: {
    flex: 1,
  },
  historyItemTitle: {
    fontSize: 13,
    color: '#36373B',
    fontWeight: '600',
  },
  historyItemSubText: {
    marginTop: 1,
    fontSize: 11,
    color: '#5D5E61',
  },
  historyAmountText: {
    color: '#36373B',
    fontSize: 14,
    fontWeight: '500',
  },
});

export default HomeScreen;

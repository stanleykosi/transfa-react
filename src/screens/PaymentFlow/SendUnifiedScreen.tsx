import AddIcon from '@/assets/icons/add.svg';
import ArrowRightIcon from '@/assets/icons/arrow-right1.svg';
import BackIcon from '@/assets/icons/back.svg';
import CloseIcon from '@/assets/icons/cancel.svg';
import Eyeslash from '@/assets/icons/eyeSlash.svg';
import NairaIcon from '@/assets/icons/naira.svg';
import NotificationIcon from '@/assets/icons/notification.svg';
import SearchIcon from '@/assets/icons/search-normal.svg';
import TransferIcon from '@/assets/icons/transfer.svg';
import TrashIcon from '@/assets/icons/trash.svg';
import VerifiedBadge from '@/assets/icons/verified.svg';
import WalletPlusIcon from '@/assets/icons/wallet.svg';
import WithdrawIcon from '@/assets/icons/withdraw.svg';
import Avatar from '@/assets/images/avatar.svg';
import AvatarAlt1 from '@/assets/images/avatar1.svg';
import AvatarAlt2 from '@/assets/images/avatar2.svg';
import AvatarAlt3 from '@/assets/images/avatar3.svg';
import PartialGradientBorder from '@/components/PartialGradientBorder';
import WalletModal from '@/components/WalletModal';
import { useNavigation } from '@react-navigation/native';
import { BlurView } from 'expo-blur';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SvgXml } from 'react-native-svg';

import { useListBeneficiaries } from '@/api/accountApi';
import { useUserSearch } from '@/api/userDiscoveryApi';
import {
  useAccountBalance,
  useGetTransferList,
  useTransactionFees,
  useUserProfile,
} from '@/api/transactionApi';
import type { AppNavigationProp } from '@/types/navigation';
import type { UserDiscoveryResult } from '@/types/api';
import { formatCurrency, nairaToKobo } from '@/utils/formatCurrency';
import { normalizeUsername, usernameKey } from '@/utils/username';

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

const avatarComponents = [Avatar, AvatarAlt1, AvatarAlt2, AvatarAlt3];
const MAX_RECIPIENTS = 10;

interface TransferUser {
  id: string;
  userId?: string;
  username: string;
  fullName?: string | null;
  amount: number; // Kobo
  narration: string;
  avatarIndex: number;
  verified: boolean;
}

interface LinkedAccount {
  id: string;
  accountName: string;
  accountNumber: string;
  bankName: string;
  currency: string;
}

interface ListMember {
  id: string;
  username: string;
  fullName: string;
  avatarIndex: number;
  verified: boolean;
}

interface SearchUser {
  id: string;
  username: string;
  fullName: string;
  avatarIndex: number;
  verified: boolean;
}

interface SendUnifiedScreenProps {
  initialMode?: 'transfer' | 'withdraw';
  listId?: string;
  initialRecipient?: UserDiscoveryResult | null;
}

const NARRATION_CHIPS = ['Gift', 'Payment', 'Refund', 'Rent', 'School Fees', 'Food'];

const avatarIndexFromSeed = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000000007;
  }
  return Math.abs(hash) % avatarComponents.length;
};

const parseAmountInputToKobo = (value: string) => {
  const normalized = value.replace(/,/g, '').trim();
  if (!normalized) {
    return 0;
  }
  const parsed = Number(normalized);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return nairaToKobo(parsed);
};

const nairaInputFromKobo = (value: number) => {
  if (!value || value <= 0) {
    return '';
  }
  return (value / 100).toFixed(2);
};

const SendUnifiedScreen = ({
  initialMode = 'transfer',
  listId,
  initialRecipient,
}: SendUnifiedScreenProps) => {
  const navigation = useNavigation<AppNavigationProp>();
  const isFromList = !!listId;
  const listEmoji = '📋';

  const [balanceVisible, setBalanceVisible] = useState(true);
  const [activeMode, setActiveMode] = useState<'transfer' | 'withdraw'>(initialMode);
  const [formAmount, setFormAmount] = useState('');
  const [formNarration, setFormNarration] = useState('');
  const [selectedChip, setSelectedChip] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUserForTransfer, setSelectedUserForTransfer] = useState<SearchUser | null>(null);

  const [focusedField, setFocusedField] = useState<string | null>(null);
  const [transferUsers, setTransferUsers] = useState<TransferUser[]>([]);
  const [formError, setFormError] = useState<string | null>(null);

  const [expandedUserId, setExpandedUserId] = useState<string | null>(null);
  const [editingAmount, setEditingAmount] = useState<string>('');
  const [editingNarration, setEditingNarration] = useState<string>('');
  const [userPendingDeletion, setUserPendingDeletion] = useState<TransferUser | null>(null);

  const [transferButtonDimensions, setTransferButtonDimensions] = useState({
    width: 0,
    height: 0,
  });
  const [withdrawButtonDimensions, setWithdrawButtonDimensions] = useState({
    width: 0,
    height: 0,
  });

  const [walletModalVisible, setWalletModalVisible] = useState(false);
  const [selectedAccountId, setSelectedAccountId] = useState<string | null>(null);
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [accountCardDimensions, setAccountCardDimensions] = useState<
    Record<string, { width: number; height: number }>
  >({});
  const { data: profile } = useUserProfile();
  const {
    data: balanceData,
    isLoading: isLoadingBalance,
    refetch: refetchBalance,
  } = useAccountBalance();
  const { data: fees } = useTransactionFees();
  const { data: searchData, isLoading: isSearching } = useUserSearch(searchQuery.trim(), 12);
  const {
    data: beneficiariesData,
    isLoading: isLoadingBeneficiaries,
    refetch: refetchBeneficiaries,
  } = useListBeneficiaries();
  const { data: listData, isLoading: isLoadingList } = useGetTransferList(listId);

  const username = normalizeUsername(profile?.username || 'you');
  const balance = balanceData?.available_balance ?? 0;
  const p2pFeeKobo = fees?.p2p_fee_kobo ?? 0;
  const selfFeeKobo = fees?.self_fee_kobo ?? 0;
  const profileRecipientUser = useMemo<SearchUser | null>(() => {
    if (!initialRecipient || isFromList) {
      return null;
    }
    return {
      id: initialRecipient.id,
      username: normalizeUsername(initialRecipient.username),
      fullName: initialRecipient.full_name || 'Transfa User',
      avatarIndex: avatarIndexFromSeed(initialRecipient.username),
      verified: true,
    };
  }, [initialRecipient, isFromList]);
  const isProfileRecipientFlow = !!profileRecipientUser;

  const listMembers = useMemo<ListMember[]>(
    () =>
      (listData?.members ?? []).map((member) => ({
        id: member.user_id,
        username: normalizeUsername(member.username),
        fullName: member.full_name || '',
        avatarIndex: avatarIndexFromSeed(member.username),
        verified: true,
      })),
    [listData?.members]
  );

  const listTitle = listData?.name || 'List';

  const linkedAccounts = useMemo<LinkedAccount[]>(
    () =>
      (beneficiariesData ?? []).map((account) => ({
        id: account.id,
        accountName: account.account_name,
        accountNumber: account.account_number_masked,
        bankName: account.bank_name,
        currency: 'NGN',
      })),
    [beneficiariesData]
  );

  const searchResults = useMemo<SearchUser[]>(() => {
    const query = searchQuery.trim();
    if (!query) {
      return [];
    }

    return (searchData?.users ?? [])
      .filter((user) => usernameKey(user.username) !== usernameKey(username))
      .map((user) => ({
        id: user.id,
        username: normalizeUsername(user.username),
        fullName: user.full_name || 'Transfa User',
        avatarIndex: avatarIndexFromSeed(user.username),
        verified: true,
      }))
      .slice(0, 3);
  }, [searchData?.users, searchQuery, username]);

  useEffect(() => {
    if (!isFromList || listMembers.length === 0) {
      return;
    }

    setTransferUsers((prev) => {
      if (prev.length === 0) {
        return listMembers.map((member) => ({
          id: member.id,
          userId: member.id,
          username: member.username,
          fullName: member.fullName,
          amount: 0,
          narration: '',
          avatarIndex: member.avatarIndex,
          verified: member.verified,
        }));
      }

      const prevById = new Map(prev.map((item) => [item.id, item]));
      return listMembers.map((member) => {
        const existing = prevById.get(member.id);
        if (existing) {
          return {
            ...existing,
            username: member.username,
            fullName: member.fullName,
            avatarIndex: member.avatarIndex,
            verified: member.verified,
          };
        }
        return {
          id: member.id,
          userId: member.id,
          username: member.username,
          fullName: member.fullName,
          amount: 0,
          narration: '',
          avatarIndex: member.avatarIndex,
          verified: member.verified,
        };
      });
    });
  }, [isFromList, listMembers]);

  useEffect(() => {
    if (!profileRecipientUser) {
      return;
    }
    setSelectedUserForTransfer(profileRecipientUser);
    setSearchQuery('');
  }, [profileRecipientUser]);

  useEffect(() => {
    if (isFromList && transferUsers.length > 0) {
      const amount = parseAmountInputToKobo(formAmount);
      setTransferUsers((prev) => prev.map((user) => ({ ...user, amount })));
    }
  }, [formAmount, isFromList, transferUsers.length]);

  useEffect(() => {
    if (isFromList && transferUsers.length > 0) {
      setTransferUsers((prev) =>
        prev.map((user) => ({
          ...user,
          narration: formNarration.trim(),
        }))
      );
    }
  }, [formNarration, isFromList, transferUsers.length]);

  useEffect(() => {
    if (activeMode === 'withdraw') {
      refetchBeneficiaries();
      refetchBalance();
    }
  }, [activeMode, refetchBalance, refetchBeneficiaries]);

  useEffect(() => {
    if (activeMode === 'withdraw' && !selectedAccountId && linkedAccounts.length > 0) {
      setSelectedAccountId(linkedAccounts[0].id);
    }
  }, [activeMode, linkedAccounts, selectedAccountId]);

  useEffect(() => {
    if (isProfileRecipientFlow && activeMode !== 'transfer') {
      setActiveMode('transfer');
    }
  }, [activeMode, isProfileRecipientFlow]);

  const formatBalance = (amount: number) => formatCurrency(amount);
  const formatAmount = (amount: number) => formatCurrency(amount);

  const handleSearch = (text: string) => {
    setSearchQuery(text);
    setFormError(null);
  };

  const handleSelectUser = (user: SearchUser) => {
    const existingTransfer = transferUsers.find(
      (entry) => usernameKey(entry.username) === usernameKey(user.username)
    );

    setSelectedUserForTransfer(user);
    setSearchQuery('');

    if (existingTransfer) {
      const existingNarration = existingTransfer.narration.trim();
      const matchedChip =
        NARRATION_CHIPS.find(
          (chip) => chip.trim().toLowerCase() === existingNarration.toLowerCase()
        ) ?? null;

      setFormAmount(nairaInputFromKobo(existingTransfer.amount));
      setFormNarration(existingTransfer.narration);
      setSelectedChip(matchedChip);
    } else {
      setFormAmount('');
      setFormNarration('');
      setSelectedChip(null);
    }

    setFormError(null);
  };

  const handleCloseUserForm = () => {
    if (isProfileRecipientFlow) {
      return;
    }
    setSelectedUserForTransfer(null);
  };

  const handleChipSelect = (chip: string) => {
    setSelectedChip(chip);
    setFormNarration(chip);
  };

  const handleNarrationChange = (value: string) => {
    setFormNarration(value);
    const matchedChip =
      NARRATION_CHIPS.find((chip) => chip.trim().toLowerCase() === value.trim().toLowerCase()) ??
      null;
    setSelectedChip(matchedChip);
  };

  const handleSaveTransfer = () => {
    if (!selectedUserForTransfer) {
      return;
    }
    const amount = parseAmountInputToKobo(formAmount);
    if (amount <= 0) {
      setFormError('Enter a valid amount.');
      return;
    }

    const narration = formNarration.trim();
    if (narration.length < 3 || narration.length > 100) {
      setFormError('Narration must be between 3 and 100 characters.');
      return;
    }

    const existingIndex = transferUsers.findIndex(
      (entry) => usernameKey(entry.username) === usernameKey(selectedUserForTransfer.username)
    );

    if (existingIndex === -1 && transferUsers.length >= MAX_RECIPIENTS) {
      setFormError('You can add up to 10 recipients in one transfer.');
      return;
    }

    const draft: TransferUser = {
      id: existingIndex >= 0 ? transferUsers[existingIndex].id : Date.now().toString(),
      userId: selectedUserForTransfer.id,
      username: selectedUserForTransfer.username,
      fullName: selectedUserForTransfer.fullName,
      amount,
      narration,
      avatarIndex: selectedUserForTransfer.avatarIndex,
      verified: selectedUserForTransfer.verified,
    };

    if (existingIndex >= 0) {
      setTransferUsers((prev) =>
        prev.map((user, index) => (index === existingIndex ? draft : user))
      );
    } else {
      setTransferUsers((prev) => [...prev, draft]);
    }

    setSelectedUserForTransfer(null);
    setFormAmount('');
    setFormNarration('');
    setSelectedChip(null);
    setFormError(null);
  };

  const handleRemoveUser = (id: string) => {
    setTransferUsers((prev) => prev.filter((user) => user.id !== id));
    if (expandedUserId === id) {
      setExpandedUserId(null);
    }
  };

  const handleUserClick = (user: TransferUser) => {
    if (expandedUserId === user.id) {
      setExpandedUserId(null);
      setEditingAmount('');
      setEditingNarration('');
      return;
    }
    setExpandedUserId(user.id);
    setEditingAmount(nairaInputFromKobo(user.amount));
    setEditingNarration(user.narration);
  };

  const handleUpdateUser = (id: string) => {
    const amount = parseAmountInputToKobo(editingAmount);
    if (amount <= 0) {
      setFormError('Enter a valid amount.');
      return;
    }

    const narration = editingNarration.trim();
    if (narration.length < 3 || narration.length > 100) {
      setFormError('Narration must be between 3 and 100 characters.');
      return;
    }

    setTransferUsers((prev) =>
      prev.map((user) =>
        user.id === id
          ? {
              ...user,
              amount,
              narration,
            }
          : user
      )
    );
    setExpandedUserId(null);
    setEditingAmount('');
    setEditingNarration('');
    setFormError(null);
  };

  const handleConfirmDelete = () => {
    if (userPendingDeletion) {
      handleRemoveUser(userPendingDeletion.id);
      setUserPendingDeletion(null);
    }
  };

  const handleCancelDelete = () => {
    setUserPendingDeletion(null);
  };

  const transferUsersWithAmount = transferUsers.filter((user) => user.amount > 0);
  const hasSavedProfileRecipientTransfer =
    isProfileRecipientFlow &&
    !!profileRecipientUser &&
    transferUsersWithAmount.some(
      (user) => usernameKey(user.username) === usernameKey(profileRecipientUser.username)
    );

  useEffect(() => {
    if (!isProfileRecipientFlow || !profileRecipientUser || hasSavedProfileRecipientTransfer) {
      return;
    }

    if (
      !selectedUserForTransfer ||
      usernameKey(selectedUserForTransfer.username) !== usernameKey(profileRecipientUser.username)
    ) {
      setSelectedUserForTransfer(profileRecipientUser);
    }

    if (searchQuery) {
      setSearchQuery('');
    }
  }, [
    hasSavedProfileRecipientTransfer,
    isProfileRecipientFlow,
    profileRecipientUser,
    searchQuery,
    selectedUserForTransfer,
  ]);

  const calculateTotal = () => {
    if (activeMode === 'withdraw') {
      const amount = parseAmountInputToKobo(withdrawAmount);
      const fee = amount > 0 ? selfFeeKobo : 0;
      return {
        amount,
        fee,
        total: amount + fee,
      };
    }

    const amount = transferUsersWithAmount.reduce((sum, user) => sum + user.amount, 0);
    const fee = transferUsersWithAmount.length * p2pFeeKobo;
    return {
      amount,
      fee,
      total: amount + fee,
    };
  };

  const maskAccountNumber = (accountNumber: string) => {
    if (accountNumber.includes('*')) {
      return accountNumber;
    }
    if (accountNumber.length <= 3) {
      return accountNumber;
    }
    const firstThree = accountNumber.slice(0, 3);
    const lastTwo = accountNumber.slice(-2);
    const masked = '*'.repeat(accountNumber.length - 5);
    return `${firstThree}${masked}${lastTwo}`;
  };

  const handleLinkNewAccount = () => {
    navigation.navigate('AppTabs', {
      screen: 'Settings',
      params: { screen: 'LinkAccountPin' },
    });
  };

  const isWithdrawFormValid = () =>
    parseAmountInputToKobo(withdrawAmount) > 0 && selectedAccountId !== null;

  const handleModeChange = (mode: 'transfer' | 'withdraw') => {
    setActiveMode(mode);
    setFocusedField(null);
    setFormError(null);
  };

  const validateBeforeConfirm = (): string | null => {
    if (activeMode === 'withdraw') {
      const amount = parseAmountInputToKobo(withdrawAmount);
      if (!selectedAccountId) {
        return 'Select a destination account.';
      }
      if (amount <= 0) {
        return 'Enter a valid amount.';
      }
      if (amount + selfFeeKobo > balance) {
        return 'Amount plus fee exceeds your available balance.';
      }
      return null;
    }

    if (transferUsersWithAmount.length === 0) {
      return 'Add at least one valid transfer before confirming.';
    }

    if (transferUsersWithAmount.length > MAX_RECIPIENTS) {
      return 'You can add up to 10 recipients in one transfer.';
    }

    const currentUsername = usernameKey(profile?.username || '');
    const containsSelf = transferUsersWithAmount.some(
      (entry) => usernameKey(entry.username) === currentUsername
    );
    if (containsSelf) {
      return 'You cannot transfer to your own username from this flow.';
    }

    if (transferUsersWithAmount.some((entry) => entry.narration.trim().length < 3)) {
      return 'Narration must be at least 3 characters for each transfer.';
    }

    const total = transferUsersWithAmount.reduce((sum, item) => sum + item.amount, 0);
    const fee = transferUsersWithAmount.length * p2pFeeKobo;
    if (total + fee > balance) {
      return 'Insufficient balance for this transfer.';
    }
    return null;
  };

  const handleConfirm = () => {
    const validationError = validateBeforeConfirm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);

    if (activeMode === 'withdraw') {
      const selectedAccount = linkedAccounts.find((account) => account.id === selectedAccountId);
      const amount = parseAmountInputToKobo(withdrawAmount);
      if (!selectedAccount || amount <= 0) {
        setFormError('Complete withdrawal details before continuing.');
        return;
      }

      navigation.navigate('PaymentVerification', {
        intent: 'withdraw',
        beneficiaryId: selectedAccount.id,
        accountName: selectedAccount.accountName,
        accountNumberMasked: selectedAccount.accountNumber,
        bankName: selectedAccount.bankName,
        amount,
      });
      return;
    }

    const transfers = transferUsersWithAmount.map((user) => ({
      recipientUserId: user.userId,
      recipientUsername: normalizeUsername(user.username),
      recipientFullName: user.fullName,
      amount: user.amount,
      narration: user.narration,
      avatarIndex: user.avatarIndex,
      verified: user.verified,
    }));

    navigation.navigate('PaymentVerification', {
      intent: 'transfer',
      transfers,
      fromList: isFromList,
      listName: isFromList ? listTitle : undefined,
      listEmoji: isFromList ? listEmoji : undefined,
    });
  };

  const summary = calculateTotal();
  const hasTransactions =
    activeMode === 'transfer' ? transferUsersWithAmount.length > 0 : isWithdrawFormValid();

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.backgroundContainer}>
        <SvgXml xml={backgroundSvg} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Header */}
          <View style={styles.headerContainer}>
            {/* First line: Back button */}
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
              <BackIcon width={24} height={24} />
            </TouchableOpacity>

            {/* Second line: Avatar, username, verified badge on left; wallet/notification on right */}
            <View style={styles.header}>
              <View style={styles.headerLeft}>
                <View>
                  <Avatar width={44} height={44} />
                </View>
                <View style={styles.usernameWrapper}>
                  <View style={styles.usernameRow}>
                    <Text style={styles.username}>{username}</Text>
                    <VerifiedBadge width={14} height={14} />
                  </View>
                </View>
              </View>
              <View style={styles.headerRight}>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => setWalletModalVisible(true)}
                >
                  <WalletPlusIcon width={20} height={20} />
                </TouchableOpacity>
                <TouchableOpacity
                  style={styles.iconButton}
                  onPress={() => navigation.navigate('NotificationCenter')}
                >
                  <NotificationIcon width={20} height={20} />
                </TouchableOpacity>
              </View>
            </View>
          </View>

          {/* Available Balance Section */}
          <View style={styles.balanceSection}>
            <Text style={styles.balanceLabel}>AVAILABLE BALANCE</Text>
            <View style={styles.balanceRow}>
              {isLoadingBalance ? (
                <ActivityIndicator size="small" color="#FFD300" />
              ) : (
                <Text style={styles.balanceAmount}>
                  {balanceVisible ? formatBalance(balance) : '••••••••'}
                </Text>
              )}
              <TouchableOpacity
                onPress={() => setBalanceVisible(!balanceVisible)}
                style={styles.eyeButton}
              >
                <Eyeslash width={20} height={20} />
              </TouchableOpacity>
            </View>
          </View>

          {/* Transfer/Withdraw Actions - hide in profile-recipient send flow */}
          {!isFromList && !isProfileRecipientFlow && (
            <View style={styles.transferActions}>
              <View
                style={styles.transferActionButtonWrapper}
                onLayout={(event) => {
                  const { width, height } = event.nativeEvent.layout;
                  setTransferButtonDimensions({ width, height });
                }}
              >
                <TouchableOpacity
                  style={[
                    styles.transferActionButton,
                    activeMode === 'transfer' && styles.transferActionButtonActive,
                  ]}
                  onPress={() => handleModeChange('transfer')}
                >
                  <View>
                    <TransferIcon width={24} height={24} color={'#FFFFFF'} />
                  </View>
                  <Text
                    style={[
                      styles.transferActionText,
                      activeMode === 'transfer' && styles.transferActionTextActive,
                    ]}
                  >
                    Transfer
                  </Text>
                </TouchableOpacity>
                <PartialGradientBorder
                  width={transferButtonDimensions.width}
                  height={transferButtonDimensions.height}
                  borderRadius={10}
                  visible={activeMode === 'transfer'}
                />
              </View>
              <View
                style={styles.transferActionButtonWrapper}
                onLayout={(event) => {
                  const { width, height } = event.nativeEvent.layout;
                  setWithdrawButtonDimensions({ width, height });
                }}
              >
                <TouchableOpacity
                  style={[
                    styles.transferActionButton,
                    activeMode === 'withdraw' && styles.transferActionButtonActive,
                  ]}
                  onPress={() => handleModeChange('withdraw')}
                >
                  <View>
                    <WithdrawIcon width={24} height={24} color={'#FFFFFF'} />
                  </View>
                  <Text
                    style={[
                      styles.transferActionText,
                      activeMode === 'withdraw' && styles.transferActionTextActive,
                    ]}
                  >
                    Withdraw
                  </Text>
                </TouchableOpacity>
                <PartialGradientBorder
                  width={withdrawButtonDimensions.width}
                  height={withdrawButtonDimensions.height}
                  borderRadius={10}
                  visible={activeMode === 'withdraw'}
                />
              </View>
            </View>
          )}

          {isFromList && (
            <View style={styles.listSelectionSection}>
              <Text style={styles.inputLabel}>List</Text>
              <TouchableOpacity
                style={styles.listCard}
                onPress={() => navigation.navigate('TransferLists')}
                activeOpacity={0.7}
              >
                <View style={styles.listIconContainer}>
                  <Text style={styles.emojiText}>{listEmoji}</Text>
                </View>
                <View style={styles.listTextContainer}>
                  <Text style={styles.listTitle}>{isLoadingList ? 'Loading...' : listTitle}</Text>
                  <Text style={styles.listSubtitle}>
                    {listMembers.length} member
                    {listMembers.length !== 1 ? 's' : ''}
                  </Text>
                </View>
                <ArrowRightIcon width={20} height={20} />
              </TouchableOpacity>
            </View>
          )}

          <View style={styles.sectionDivider} />

          {/* Form Section */}
          {activeMode === 'transfer' ? (
            !(!isFromList && isProfileRecipientFlow && hasSavedProfileRecipientTransfer) ? (
              <View style={styles.formSection}>
                {!isFromList && (
                  <>
                    {!selectedUserForTransfer && !isProfileRecipientFlow ? (
                      <View style={styles.searchSection}>
                        <View style={styles.inputGroup}>
                          <View
                            style={[
                              styles.inputWrapper,
                              focusedField === 'search' && styles.inputWrapperFocused,
                            ]}
                          >
                            <View style={styles.inputIcon}>
                              <SearchIcon width={20} height={20} color="rgba(255, 255, 255, 0.5)" />
                            </View>
                            <TextInput
                              style={styles.input}
                              placeholder={searchQuery ? '' : 'Search Username'}
                              placeholderTextColor="rgba(255, 255, 255, 0.32)"
                              value={searchQuery}
                              onChangeText={handleSearch}
                              autoCapitalize="none"
                              onFocus={() => setFocusedField('search')}
                              onBlur={() => setFocusedField(null)}
                            />
                          </View>
                        </View>

                        {isSearching ? (
                          <View style={styles.searchResultsContainer}>
                            <ActivityIndicator size="small" color="#FFD300" />
                          </View>
                        ) : searchResults.length > 0 ? (
                          <View style={styles.searchResultsContainer}>
                            {searchResults.map((user) => {
                              const AvatarComponent = avatarComponents[user.avatarIndex];
                              return (
                                <Pressable
                                  key={user.id}
                                  style={({ pressed }) => [
                                    styles.searchResultCard,
                                    pressed && styles.searchResultCardPressed,
                                  ]}
                                  onPress={() => handleSelectUser(user)}
                                >
                                  <AvatarComponent width={50} height={50} />
                                  <View style={styles.searchResultInfo}>
                                    <View style={styles.searchResultUsernameRow}>
                                      <Text style={styles.searchResultUsername}>
                                        {user.username}
                                      </Text>
                                      {user.verified && <VerifiedBadge width={16} height={16} />}
                                    </View>
                                    <Text style={styles.searchResultFullname} numberOfLines={1}>
                                      {user.fullName || 'Transfa User'}
                                    </Text>
                                  </View>
                                </Pressable>
                              );
                            })}
                          </View>
                        ) : null}

                        {!searchQuery && transferUsers.length === 0 && (
                          <View style={styles.noUserSelectedContainer}>
                            <Text style={styles.noUserSelectedText}>No User Selected</Text>
                          </View>
                        )}
                      </View>
                    ) : selectedUserForTransfer ? (
                      <View style={styles.newTransferCard}>
                        <View style={styles.newTransferHeader}>
                          <View style={styles.newTransferUserRow}>
                            <View style={styles.newTransferAvatar}>
                              {(() => {
                                const AvatarComp =
                                  avatarComponents[selectedUserForTransfer.avatarIndex];
                                return <AvatarComp width={50} height={50} />;
                              })()}
                            </View>
                            <View>
                              <View style={styles.usernameRow}>
                                <Text style={styles.newTransferUsername}>
                                  {selectedUserForTransfer.username}
                                </Text>
                                {selectedUserForTransfer.verified && (
                                  <VerifiedBadge width={16} height={16} />
                                )}
                              </View>
                              <Text style={styles.newTransferFullname}>
                                {selectedUserForTransfer.fullName}
                              </Text>
                            </View>
                          </View>
                          {!isProfileRecipientFlow ? (
                            <TouchableOpacity
                              onPress={handleCloseUserForm}
                              style={styles.closeButton}
                            >
                              <CloseIcon width={14} height={14} color="#000000" />
                            </TouchableOpacity>
                          ) : null}
                        </View>

                        <Text style={styles.cardLabel}>Amount</Text>
                        <View style={styles.cardInputWrapper}>
                          <NairaIcon width={16} height={16} color="#0F0F0F" />
                          <TextInput
                            style={styles.cardInput}
                            placeholder="Enter Amount"
                            placeholderTextColor="#6C6B6B"
                            keyboardType="numeric"
                            value={formAmount}
                            onChangeText={setFormAmount}
                          />
                        </View>

                        <Text style={styles.cardLabel}>Narration</Text>
                        <TextInput
                          style={styles.cardNarrationInput}
                          placeholder="Enter Narration"
                          placeholderTextColor="#6C6B6B"
                          value={formNarration}
                          onChangeText={handleNarrationChange}
                        />

                        <View style={styles.chipsContainer}>
                          {NARRATION_CHIPS.map((chip) => (
                            <TouchableOpacity
                              key={chip}
                              style={[styles.chip, selectedChip === chip && styles.chipSelected]}
                              onPress={() => handleChipSelect(chip)}
                            >
                              <Text
                                style={[
                                  styles.chipText,
                                  selectedChip === chip && styles.chipTextSelected,
                                ]}
                              >
                                {chip}
                              </Text>
                            </TouchableOpacity>
                          ))}
                        </View>

                        <TouchableOpacity style={styles.saveNewButton} onPress={handleSaveTransfer}>
                          <Text style={styles.saveNewButtonText}>Save</Text>
                        </TouchableOpacity>
                      </View>
                    ) : null}
                  </>
                )}

                {isFromList ? (
                  <>
                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Amount</Text>
                      <View
                        style={[
                          styles.inputWrapper,
                          focusedField === 'listAmount' && styles.inputWrapperFocused,
                        ]}
                      >
                        <View style={styles.inputIcon}>
                          <NairaIcon width={17} height={15} color="#FFFFFF" />
                        </View>
                        <TextInput
                          style={styles.input}
                          placeholder="Amount"
                          placeholderTextColor="rgba(255, 255, 255, 0.32)"
                          value={formAmount}
                          onChangeText={setFormAmount}
                          keyboardType="numeric"
                          onFocus={() => setFocusedField('listAmount')}
                          onBlur={() => setFocusedField(null)}
                        />
                      </View>
                    </View>

                    <View style={styles.inputGroup}>
                      <Text style={styles.inputLabel}>Narration</Text>
                      <View
                        style={[
                          styles.inputWrapper,
                          focusedField === 'listNarration' && styles.inputWrapperFocused,
                        ]}
                      >
                        <TextInput
                          style={styles.input}
                          placeholder="Enter Narration"
                          placeholderTextColor="rgba(255, 255, 255, 0.32)"
                          value={formNarration}
                          onChangeText={handleNarrationChange}
                          onFocus={() => setFocusedField('listNarration')}
                          onBlur={() => setFocusedField(null)}
                        />
                      </View>
                    </View>
                  </>
                ) : null}

                {/* Divider after Amount/Narration when from list */}
                {isFromList && <View style={styles.sectionDivider} />}
              </View>
            ) : null
          ) : (
            <View style={styles.formSection}>
              {/* Withdraw Amount Input */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Amount</Text>
                <View
                  style={[
                    styles.inputWrapper,
                    focusedField === 'withdrawAmount' && styles.inputWrapperFocused,
                  ]}
                >
                  <View style={styles.inputIcon}>
                    <NairaIcon width={17} height={15} color="#FFFFFF" />
                  </View>
                  <TextInput
                    style={styles.input}
                    placeholder="Amount"
                    placeholderTextColor="rgba(255, 255, 255, 0.32)"
                    value={withdrawAmount}
                    onChangeText={setWithdrawAmount}
                    keyboardType="numeric"
                    onFocus={() => setFocusedField('withdrawAmount')}
                    onBlur={() => setFocusedField(null)}
                  />
                </View>
              </View>

              {/* Account Destination Section */}
              <View style={styles.inputGroup}>
                <Text style={styles.inputLabel}>Account destination</Text>
                {isLoadingBeneficiaries ? (
                  <View style={styles.accountCard}>
                    <ActivityIndicator size="small" color="#FFD300" />
                  </View>
                ) : linkedAccounts.length === 0 ? (
                  <View style={styles.accountCard}>
                    <Text style={styles.accountDetails}>No linked account yet.</Text>
                  </View>
                ) : (
                  linkedAccounts.map((account) => {
                    const isSelected = selectedAccountId === account.id;
                    return (
                      <View
                        key={account.id}
                        style={styles.accountCardWrapper}
                        onLayout={(event) => {
                          const { width, height } = event.nativeEvent.layout;
                          setAccountCardDimensions((prev) => ({
                            ...prev,
                            [account.id]: { width, height },
                          }));
                        }}
                      >
                        <TouchableOpacity
                          style={styles.accountCard}
                          onPress={() => setSelectedAccountId(account.id)}
                          activeOpacity={0.85}
                        >
                          <View style={styles.accountCardContent}>
                            <View style={styles.accountCardLeft}>
                              <View style={styles.accountInfo}>
                                <Text style={styles.accountName}>{account.accountName}</Text>
                                <Text style={styles.accountDetails}>
                                  {maskAccountNumber(account.accountNumber)}({account.currency})
                                </Text>
                                <Text style={styles.accountBank}>{account.bankName}</Text>
                              </View>
                            </View>
                          </View>
                        </TouchableOpacity>
                        <PartialGradientBorder
                          width={accountCardDimensions[account.id]?.width || 0}
                          height={accountCardDimensions[account.id]?.height || 0}
                          borderRadius={12}
                          visible={isSelected}
                        />
                      </View>
                    );
                  })
                )}

                <TouchableOpacity style={styles.linkAccountButton} onPress={handleLinkNewAccount}>
                  <AddIcon width={20} height={20} />
                  <Text style={styles.linkAccountButtonText}>Link New Account</Text>
                </TouchableOpacity>
              </View>

              <View style={styles.sectionDivider} />
            </View>
          )}

          {/* Divider after Transfer Form */}
          {activeMode === 'transfer' && !isFromList && !hasSavedProfileRecipientTransfer && (
            <View style={styles.sectionDivider} />
          )}

          {/* Outgoing Transfers List (if any) - Only show in transfer mode and not from list */}
          {activeMode === 'transfer' && transferUsersWithAmount.length > 0 && !isFromList && (
            <>
              <View style={styles.outgoingSection}>
                {/* <View style={styles.outgoingDivider} /> */}
                <Text style={styles.outgoingTitle}>Outgoing transfers</Text>
                {transferUsersWithAmount.map((user) => {
                  const isExpanded = expandedUserId === user.id;
                  const AvatarComponent = avatarComponents[user.avatarIndex] || Avatar;

                  return (
                    <View key={user.id} style={styles.outgoingItem}>
                      <TouchableOpacity
                        onPress={() => handleUserClick(user)}
                        style={styles.outgoingItemContent}
                        activeOpacity={0.85}
                      >
                        <View style={styles.outgoingAvatar}>
                          <AvatarComponent width={48} height={48} />
                        </View>
                        <View style={styles.outgoingInfo}>
                          <View style={styles.outgoingUsernameRow}>
                            <Text style={styles.outgoingUsername}>{user.username}</Text>
                            <VerifiedBadge width={16} height={16} />
                          </View>
                          <Text style={styles.outgoingName}>{user.fullName || 'Transfer'}</Text>
                        </View>
                        {!isExpanded ? (
                          <View style={styles.outgoingAmountContainer}>
                            <Text style={styles.outgoingAmount}>{formatAmount(user.amount)}</Text>
                          </View>
                        ) : (
                          <TouchableOpacity
                            onPress={(e) => {
                              e.stopPropagation();
                              setUserPendingDeletion(user);
                            }}
                            style={styles.deleteButton}
                            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          >
                            <TrashIcon width={20} height={20} />
                          </TouchableOpacity>
                        )}
                      </TouchableOpacity>

                      {isExpanded && (
                        <View style={styles.expandedEditView}>
                          <View style={styles.editField}>
                            <Text style={styles.editFieldLabel}>Amount</Text>
                            <View style={styles.editInputContainer}>
                              <View style={styles.editInputIcon}>
                                <NairaIcon width={16} height={16} color="#0F0F0F" />
                              </View>
                              <TextInput
                                style={styles.editInput}
                                value={editingAmount}
                                onChangeText={setEditingAmount}
                                keyboardType="numeric"
                                placeholder="Amount"
                                placeholderTextColor="#6C6B6B"
                              />
                            </View>
                          </View>

                          <View style={styles.editField}>
                            <Text style={styles.editFieldLabel}>Narration</Text>
                            <TextInput
                              style={styles.editNarrationInput}
                              value={editingNarration}
                              onChangeText={setEditingNarration}
                              placeholder="Add narration"
                              placeholderTextColor="#6C6B6B"
                              multiline
                            />
                          </View>

                          <TouchableOpacity
                            style={styles.saveButton}
                            onPress={() => handleUpdateUser(user.id)}
                          >
                            <Text style={styles.saveButtonText}>Save</Text>
                          </TouchableOpacity>
                        </View>
                      )}

                      {userPendingDeletion?.id === user.id && (
                        <BlurView intensity={10} tint="dark" style={styles.inlineModalOverlay}>
                          <View style={styles.inlineModalCard}>
                            <Text style={styles.inlineModalTitle}>
                              Are you sure you want to delete transaction?
                            </Text>
                            <View style={styles.inlineModalButtonsRow}>
                              <TouchableOpacity
                                style={[styles.inlineModalButton, styles.inlineModalPrimary]}
                                onPress={handleConfirmDelete}
                              >
                                <Text style={styles.inlineModalPrimaryText}>Yes</Text>
                              </TouchableOpacity>
                              <TouchableOpacity
                                style={[styles.inlineModalButton, styles.inlineModalSecondary]}
                                onPress={handleCancelDelete}
                              >
                                <Text style={styles.inlineModalSecondaryText}>No</Text>
                              </TouchableOpacity>
                            </View>
                          </View>
                        </BlurView>
                      )}
                    </View>
                  );
                })}
              </View>
              <View style={styles.sectionDivider} />
            </>
          )}

          {/* List Users Display - Only show when from list */}
          {isFromList && transferUsers.length > 0 && (
            <View style={styles.listUsersSection}>
              {transferUsers.map((user) => {
                const member = listMembers.find((m) => m.id === user.id);
                const AvatarComponent =
                  typeof member?.avatarIndex === 'number'
                    ? avatarComponents[member.avatarIndex] || Avatar
                    : avatarComponents[user.avatarIndex] || Avatar;

                return (
                  <View key={user.id} style={styles.listUserCard}>
                    <View style={styles.listUserAvatar}>
                      <AvatarComponent width={48} height={48} />
                      {member?.verified && (
                        <View style={styles.listUserVerifiedBadge}>
                          <VerifiedBadge width={15} height={15} />
                        </View>
                      )}
                    </View>
                    <View style={styles.listUserInfo}>
                      <View style={styles.listUserUsernameRow}>
                        <Text style={styles.listUserUsername}>{user.username}</Text>
                        {member?.verified && <VerifiedBadge width={15} height={15} />}
                      </View>
                      <Text style={styles.listUserFullName}>{member?.fullName || ''}</Text>
                    </View>
                    <View style={styles.listUserAmountContainer}>
                      <Text style={styles.listUserAmount}>{formatAmount(user.amount)}</Text>
                    </View>
                  </View>
                );
              })}
              <View style={styles.sectionDivider} />
            </View>
          )}

          {/* Summary Section */}
          <View style={[styles.summarySection, { opacity: hasTransactions ? 1 : 0.4 }]}>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Amount</Text>
              <Text style={styles.summaryValue}>{formatAmount(summary.amount)}</Text>
            </View>
            <View style={styles.summaryItem}>
              <Text style={styles.summaryLabel}>Transaction fee</Text>
              <Text style={styles.summaryValue}>{formatAmount(summary.fee)}</Text>
            </View>
            <View style={styles.summaryDivider} />
            <View style={styles.summaryItem}>
              <Text style={styles.summaryTotalLabel}>Total</Text>
              <Text style={styles.summaryTotalValue}>{formatAmount(summary.total)}</Text>
            </View>
          </View>

          {formError ? <Text style={styles.formErrorText}>{formError}</Text> : null}

          {/* Confirm Button */}
          <TouchableOpacity
            style={[styles.confirmButton, !hasTransactions && styles.confirmButtonDisabled]}
            onPress={handleConfirm}
            disabled={!hasTransactions}
          >
            <Text style={styles.confirmButtonText}>Confirm</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Wallet Modal */}
      <WalletModal visible={walletModalVisible} onClose={() => setWalletModalVisible(false)} />
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
  scrollView: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },
  headerContainer: {
    marginBottom: 24,
  },
  backButton: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 16,
  },
  iconButton: {
    padding: 4,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  usernameWrapper: {
    flexShrink: 1,
  },
  username: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
  },
  balanceSection: {
    alignItems: 'flex-start',
    marginBottom: 32,
  },
  balanceLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    marginBottom: 8,
    fontFamily: 'Montserrat_400Regular',
    letterSpacing: 1.2,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'ArtificTrial-Semibold',
  },
  eyeButton: {
    padding: 4,
  },
  transferActions: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 24,
  },
  transferActionButtonWrapper: {
    flex: 1,
    position: 'relative',
  },
  transferActionButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#333333',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 8,
  },
  transferActionButtonActive: {
    // Border is handled by gradient overlay
  },
  transferActionText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
  },
  transferActionTextActive: {
    color: '#FFFFFF',
  },
  outgoingSection: {
    marginBottom: 32,
  },
  outgoingTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 16,
  },
  outgoingDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.12)',
    marginBottom: 12,
  },
  outgoingDividerFooter: {
    marginTop: 12,
  },
  outgoingItem: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    marginBottom: 16,
    borderCurve: 'continuous',
  },
  outgoingItemContent: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  outgoingAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    alignItems: 'center',
    justifyContent: 'center',
  },
  outgoingInfo: {
    flex: 1,
    gap: 3,
  },
  outgoingUsernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  outgoingUsername: {
    fontSize: 18,
    color: '#000000',
    fontFamily: 'Montserrat_700Bold',
  },
  outgoingName: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
  },
  outgoingAmountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    justifyContent: 'flex-end',
  },
  outgoingAmount: {
    fontSize: 16,
    color: '#0F0F0F',
    fontFamily: 'Montserrat_600SemiBold',
  },
  removeButton: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeButtonText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Montserrat_600SemiBold',
  },
  deleteButton: {
    padding: 4,
    marginLeft: 12,
  },
  expandedEditView: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
  },
  editField: {
    marginBottom: 16,
  },
  editFieldLabel: {
    fontSize: 16,
    color: '#0F0F0F',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 8,
  },
  editInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
  },
  editInputIcon: {
    marginRight: 8,
  },
  editInput: {
    flex: 1,
    fontSize: 16,
    color: '#0F0F0F',
    fontFamily: 'Montserrat_400Regular',
  },
  editNarrationInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 16,
    color: '#0F0F0F',
    fontFamily: 'Montserrat_400Regular',
    minHeight: 50,
  },
  saveButton: {
    backgroundColor: '#FFD300',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  saveButtonText: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
  formSection: {
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 8,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 40,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  inputWrapperFocused: {
    borderColor: 'rgba(255, 211, 0, 0.5)',
  },
  inputIcon: {
    marginRight: 12,
  },
  input: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  textAreaWrapper: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    minHeight: 56,
  },
  textAreaInput: {
    textAlignVertical: 'top',
  },
  addUserButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#6C6B6B',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 8,
  },
  addUserButtonDisabled: {
    opacity: 0.5,
  },
  addUserButtonText: {
    fontSize: 18,
    color: '#6C6B6B',
    fontFamily: 'Montserrat_600SemiBold',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#6C6B6B',
    marginTop: 20,
    marginBottom: 20,
  },
  summaryContainer: {
    marginBottom: 24,
  },
  summarySection: {
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 20,
  },
  summaryTitle: {
    fontSize: 18,
    color: '#FFD300',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 12,
  },
  summaryItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.32)',
    fontFamily: 'Montserrat_400Regular',
  },
  summaryValue: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#6C6B6B',
    marginBottom: 12,
  },
  summaryTotalLabel: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.32)',
    fontFamily: 'Montserrat_600SemiBold',
  },
  summaryTotalValue: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
  },
  confirmButton: {
    backgroundColor: '#FFD300',
    borderRadius: 12,
    paddingVertical: 18,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
  },
  confirmButtonDisabled: {
    backgroundColor: '#333333',
    opacity: 0.5,
  },
  confirmButtonText: {
    fontSize: 18,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
  listSelectionSection: {
    marginBottom: 24,
  },
  listCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333333',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    marginTop: 8,
  },
  listIconContainer: {
    width: 32,
    height: 32,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 7,
  },
  emojiText: {
    fontSize: 20,
  },
  listTextContainer: {
    flex: 1,
  },
  listTitle: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 4,
  },
  listSubtitle: {
    fontSize: 14,
    color: '#6C6B6B',
    fontFamily: 'Montserrat_400Regular',
  },
  listUsersSection: {
    marginTop: 20,
  },
  listUserCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    marginBottom: 12,
  },
  listUserAvatar: {
    marginRight: 12,
    position: 'relative',
    width: 48,
    height: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listUserVerifiedBadge: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 15,
    height: 15,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listUserInfo: {
    flex: 1,
  },
  listUserUsernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 4,
  },
  listUserUsername: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
  listUserFullName: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
  },
  listUserAmountContainer: {
    marginLeft: 12,
  },
  listUserAmount: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
  inlineModalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  inlineModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    width: '80%',
    alignItems: 'center',
  },
  inlineModalTitle: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
    marginBottom: 16,
  },
  inlineModalButtonsRow: {
    flexDirection: 'row',
    width: '70%',
    gap: 12,
  },
  inlineModalButton: {
    flex: 1,
    borderRadius: 12,
    paddingVertical: 10,
    alignItems: 'center',
    justifyContent: 'center',
  },
  inlineModalPrimary: {
    backgroundColor: '#FFD300',
  },
  inlineModalPrimaryText: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
  inlineModalSecondary: {
    backgroundColor: '#F2F2F2',
  },
  inlineModalSecondaryText: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
  accountCardWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  accountCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  accountCardContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  accountCardLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  accountInfo: {
    flex: 1,
    gap: 4,
  },
  accountName: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
  },
  accountDetails: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'Montserrat_400Regular',
  },
  accountBank: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.6)',
    fontFamily: 'Montserrat_400Regular',
  },
  linkAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#6C6B6B',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 8,
  },
  linkAccountButtonText: {
    fontSize: 16,
    color: '#6C6B6B',
    fontFamily: 'Montserrat_600SemiBold',
  },
  searchSection: {
    marginBottom: 20,
    zIndex: 10,
  },
  searchResultsContainer: {
    marginTop: 8,
    gap: 16,
  },
  searchResultCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    borderCurve: 'continuous',
  },
  searchResultCardPressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
  searchResultInfo: {
    flex: 1,
    justifyContent: 'center',
    gap: 3,
  },
  searchResultUsernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 2,
  },
  searchResultUsername: {
    fontSize: 18,
    color: '#000000',
    fontFamily: 'Montserrat_700Bold',
  },
  searchResultFullname: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
  },
  noUserSelectedContainer: {
    marginTop: 8,
    height: 50,
    borderWidth: 1,
    borderColor: 'rgba(225, 225, 225, 0.2)',
    borderStyle: 'dashed',
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noUserSelectedText: {
    color: 'rgba(255, 255, 255, 0.32)',
    fontFamily: 'Montserrat_400Regular',
    fontSize: 16,
  },
  newTransferCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    marginBottom: 24,
  },
  newTransferHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 16,
  },
  newTransferUserRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  newTransferAvatar: {
    width: 50,
    height: 50,
    borderRadius: 25,
    justifyContent: 'center',
    alignItems: 'center',
  },
  newTransferUsername: {
    fontSize: 18,
    color: '#000000',
    fontFamily: 'Montserrat_700Bold',
  },
  newTransferFullname: {
    fontSize: 16,
    color: '#6C6B6B',
    fontFamily: 'Montserrat_400Regular',
  },
  closeButton: {
    padding: 4,
  },
  cardLabel: {
    fontSize: 14,
    color: '#0F0F0F',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 8,
  },
  cardInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    height: 48,
    marginBottom: 16,
    gap: 10,
  },
  cardInput: {
    flex: 1,
    fontSize: 16,
    color: '#0F0F0F',
    fontFamily: 'Montserrat_400Regular',
  },
  cardNarrationInput: {
    backgroundColor: '#F5F5F5',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 12,
    fontSize: 16,
    color: '#0F0F0F',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 16,
  },
  chipsContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginBottom: 20,
  },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#E0E0E0',
    borderStyle: 'dashed',
  },
  chipSelected: {
    borderColor: '#FFD300',
    backgroundColor: 'rgba(255, 211, 0, 0.1)',
  },
  chipText: {
    fontSize: 12,
    color: '#6C6B6B',
    fontFamily: 'Montserrat_500Medium',
  },
  chipTextSelected: {
    color: '#000000',
  },
  saveNewButton: {
    backgroundColor: '#FFD300',
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveNewButtonText: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
  formErrorText: {
    marginTop: 14,
    marginBottom: 12,
    color: '#FF9D9D',
    fontSize: 13,
    fontFamily: 'Montserrat_500Medium',
  },
});

export default SendUnifiedScreen;

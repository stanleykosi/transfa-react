import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ReactNativeBiometrics from 'react-native-biometrics';
import { useNavigation, useRoute } from '@react-navigation/native';

import { useUserSearch } from '@/api/userDiscoveryApi';
import {
  useAccountBalance,
  useBulkP2PTransfer,
  useP2PTransfer,
  useTransactionFees,
  useUserProfile,
} from '@/api/transactionApi';
import { useSecurityStore } from '@/store/useSecurityStore';
import { formatCurrency, nairaToKobo } from '@/utils/formatCurrency';
import type {
  BulkP2PTransferFailure,
  BulkP2PTransferResponse,
  UserDiscoveryResult,
} from '@/types/api';
import type { AppNavigationProp } from '@/types/navigation';
import type { AppStackParamList } from '@/navigation/AppStack';
import type { RouteProp } from '@react-navigation/native';

type PayUserRoute = RouteProp<AppStackParamList, 'PayUser'>;

type TransferDraft = {
  recipient: UserDiscoveryResult;
  amountKobo: number;
  narration: string;
};

type ResultState = {
  type: 'success' | 'partial' | 'failure';
  title: string;
  message: string;
  receipts: Array<{
    transactionId: string;
    amount: number;
    fee: number;
    description: string;
    recipientUsername: string;
  }>;
  failures: BulkP2PTransferFailure[];
};

const BRAND_YELLOW = '#FFD300';
const BG_BOTTOM = '#050607';
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BORDER = 'rgba(255,255,255,0.06)';
const MAX_RECIPIENTS = 10;
const NARRATION_SUGGESTIONS = ['Gift', 'Payment', 'Refund', 'Rent', 'School Fees'];

const rnBiometrics = new ReactNativeBiometrics();

const stripUsernamePrefix = (username?: string | null): string =>
  (username ?? '').replace(/^_+/, '');

const parseAmountInputToKobo = (value: string): number => {
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

const amountInputFromKobo = (amountKobo: number): string => {
  if (!amountKobo || amountKobo <= 0) {
    return '';
  }
  return (amountKobo / 100).toFixed(2);
};

const isValidNarration = (value: string) => {
  const length = value.trim().length;
  return length >= 3 && length <= 100;
};

const usernamesMatch = (a: string, b: string) =>
  stripUsernamePrefix(a).toLowerCase() === stripUsernamePrefix(b).toLowerCase();

const PayUserScreen = () => {
  const route = useRoute<PayUserRoute>();
  const navigation = useNavigation<AppNavigationProp>();

  const [searchQuery, setSearchQuery] = useState('');
  const [selectedUser, setSelectedUser] = useState<UserDiscoveryResult | null>(
    route.params?.initialRecipient ?? null
  );
  const [amountInput, setAmountInput] = useState('');
  const [narrationInput, setNarrationInput] = useState('');
  const [isNarrationFocused, setIsNarrationFocused] = useState(false);
  const [savedTransfers, setSavedTransfers] = useState<TransferDraft[]>([]);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [isDeleteConfirmVisible, setDeleteConfirmVisible] = useState(false);

  const [isAuthVisible, setAuthVisible] = useState(false);
  const [authMode, setAuthMode] = useState<'pin' | 'biometric'>('pin');
  const [pinValue, setPinValue] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [pendingTransfers, setPendingTransfers] = useState<TransferDraft[]>([]);

  const [isProcessingVisible, setProcessingVisible] = useState(false);
  const [resultState, setResultState] = useState<ResultState | null>(null);

  const pinInputRef = useRef<TextInput | null>(null);

  const { getPin, biometricsEnabled } = useSecurityStore();

  const { data: userProfile } = useUserProfile();
  const { data: balanceData, isLoading: isLoadingBalance } = useAccountBalance();
  const { data: feeData } = useTransactionFees();

  const normalizedQuery = useMemo(() => searchQuery.trim(), [searchQuery]);
  const { data: searchData, isLoading: isSearching } = useUserSearch(normalizedQuery, 12);

  const p2pTransfer = useP2PTransfer();
  const bulkP2PTransfer = useBulkP2PTransfer();

  const transferFeeKobo = feeData?.p2p_fee_kobo ?? 0;

  useEffect(() => {
    if (route.params?.initialRecipient) {
      const initial = route.params.initialRecipient;
      setSelectedUser(initial);
      setSearchQuery(stripUsernamePrefix(initial.username));
    }
  }, [route.params?.initialRecipient]);

  useEffect(() => {
    if (isAuthVisible && authMode === 'pin') {
      const timer = setTimeout(() => {
        pinInputRef.current?.focus();
      }, 100);

      return () => clearTimeout(timer);
    }

    return undefined;
  }, [isAuthVisible, authMode]);

  const amountKobo = useMemo(() => parseAmountInputToKobo(amountInput), [amountInput]);
  const narration = useMemo(() => narrationInput.trim(), [narrationInput]);

  const activeDraft = useMemo<TransferDraft | null>(() => {
    if (!selectedUser || amountKobo <= 0 || !isValidNarration(narration)) {
      return null;
    }

    return {
      recipient: selectedUser,
      amountKobo,
      narration,
    };
  }, [amountKobo, narration, selectedUser]);

  const effectiveTransfers = useMemo(() => {
    if (editingIndex !== null) {
      if (!activeDraft) {
        return savedTransfers;
      }

      return savedTransfers.map((item, index) => (index === editingIndex ? activeDraft : item));
    }

    if (!activeDraft) {
      return savedTransfers;
    }

    const alreadySaved = savedTransfers.some((item) =>
      usernamesMatch(item.recipient.username, activeDraft.recipient.username)
    );

    if (alreadySaved) {
      return savedTransfers;
    }

    return [...savedTransfers, activeDraft];
  }, [activeDraft, editingIndex, savedTransfers]);

  const summary = useMemo(() => {
    const amount = effectiveTransfers.reduce((sum, item) => sum + item.amountKobo, 0);
    const fee = effectiveTransfers.length * transferFeeKobo;

    return {
      amount,
      fee,
      total: amount + fee,
    };
  }, [effectiveTransfers, transferFeeKobo]);

  const isSubmitting = p2pTransfer.isPending || bulkP2PTransfer.isPending;

  const clearComposer = () => {
    setSelectedUser(null);
    setSearchQuery('');
    setAmountInput('');
    setNarrationInput('');
    setEditingIndex(null);
    setIsNarrationFocused(false);
  };

  const setComposerForRecipient = (recipient: UserDiscoveryResult) => {
    const existingIndex = savedTransfers.findIndex((entry) =>
      usernamesMatch(entry.recipient.username, recipient.username)
    );

    if (existingIndex >= 0) {
      const existing = savedTransfers[existingIndex];
      setSelectedUser(existing.recipient);
      setSearchQuery(stripUsernamePrefix(existing.recipient.username));
      setAmountInput(amountInputFromKobo(existing.amountKobo));
      setNarrationInput(existing.narration);
      setEditingIndex(existingIndex);
      setFormError(null);
      return;
    }

    setSelectedUser(recipient);
    setSearchQuery(stripUsernamePrefix(recipient.username));
    setAmountInput('');
    setNarrationInput('');
    setEditingIndex(null);
    setFormError(null);
  };

  const handleSaveTransfer = () => {
    if (!selectedUser) {
      setFormError('Select a recipient first.');
      return;
    }
    if (amountKobo <= 0) {
      setFormError('Enter a valid amount.');
      return;
    }
    if (!isValidNarration(narration)) {
      setFormError('Narration must be between 3 and 100 characters.');
      return;
    }

    const draft: TransferDraft = {
      recipient: selectedUser,
      amountKobo,
      narration,
    };

    if (editingIndex !== null) {
      setSavedTransfers((prev) =>
        prev.map((item, index) => (index === editingIndex ? draft : item))
      );
      clearComposer();
      setFormError(null);
      return;
    }

    const duplicate = savedTransfers.some((item) =>
      usernamesMatch(item.recipient.username, selectedUser.username)
    );
    if (duplicate) {
      setFormError('This recipient is already added. Tap the card below to edit instead.');
      return;
    }

    if (savedTransfers.length >= MAX_RECIPIENTS) {
      setFormError('You can add up to 10 recipients in one transfer.');
      return;
    }

    setSavedTransfers((prev) => [...prev, draft]);
    clearComposer();
    setFormError(null);
  };

  const handleSelectSearchUser = (user: UserDiscoveryResult) => {
    setComposerForRecipient(user);
  };

  const handleEditSavedTransfer = (index: number) => {
    const item = savedTransfers[index];
    if (!item) {
      return;
    }

    setSelectedUser(item.recipient);
    setSearchQuery(stripUsernamePrefix(item.recipient.username));
    setAmountInput(amountInputFromKobo(item.amountKobo));
    setNarrationInput(item.narration);
    setEditingIndex(index);
    setFormError(null);
  };

  const closeAuthModal = () => {
    if (isSubmitting) {
      return;
    }

    setAuthVisible(false);
    setAuthMode('pin');
    setPinValue('');
    setAuthError(null);
  };

  const buildBulkReceipts = (
    pending: TransferDraft[],
    response: BulkP2PTransferResponse
  ): ResultState['receipts'] => {
    const failedUsernames = new Set(
      response.failed_transfers.map((entry) =>
        stripUsernamePrefix(entry.recipient_username).toLowerCase()
      )
    );

    const successfulDrafts = pending.filter(
      (entry) => !failedUsernames.has(stripUsernamePrefix(entry.recipient.username).toLowerCase())
    );

    return response.successful_transfers.map((transfer, index) => {
      const draft = successfulDrafts[index];

      return {
        transactionId: transfer.transaction_id,
        amount: transfer.amount ?? draft?.amountKobo ?? 0,
        fee: transfer.fee ?? transferFeeKobo,
        description: draft?.narration ?? '',
        recipientUsername: stripUsernamePrefix(draft?.recipient.username ?? ''),
      };
    });
  };

  const openResultModal = (result: ResultState) => {
    setResultState(result);
  };

  const runTransferSubmission = async (
    transactionPin: string,
    transfersOverride?: TransferDraft[]
  ) => {
    const transfers = transfersOverride ?? pendingTransfers;

    if (transfers.length === 0) {
      setAuthError('No transfers to submit.');
      return;
    }

    setAuthError(null);
    setProcessingVisible(true);

    try {
      if (transfers.length === 1) {
        const entry = transfers[0];
        const response = await p2pTransfer.mutateAsync({
          recipient_username: stripUsernamePrefix(entry.recipient.username),
          amount: entry.amountKobo,
          description: entry.narration,
          transaction_pin: transactionPin,
        });

        setAuthVisible(false);
        setSavedTransfers([]);
        clearComposer();

        openResultModal({
          type: 'success',
          title: 'Success!',
          message: 'Your transaction was successful.',
          failures: [],
          receipts: [
            {
              transactionId: response.transaction_id,
              amount: response.amount ?? entry.amountKobo,
              fee: response.fee ?? transferFeeKobo,
              description: entry.narration,
              recipientUsername: stripUsernamePrefix(entry.recipient.username),
            },
          ],
        });

        return;
      }

      const bulkResponse = await bulkP2PTransfer.mutateAsync({
        transfers: transfers.map((entry) => ({
          recipient_username: stripUsernamePrefix(entry.recipient.username),
          amount: entry.amountKobo,
          description: entry.narration,
        })),
        transaction_pin: transactionPin,
      });

      const receipts = buildBulkReceipts(transfers, bulkResponse);
      const failures = bulkResponse.failed_transfers;

      setAuthVisible(false);

      if (bulkResponse.status === 'completed') {
        setSavedTransfers([]);
        clearComposer();
        openResultModal({
          type: 'success',
          title: 'Success!',
          message: 'Your transaction was successful.',
          receipts,
          failures,
        });
        return;
      }

      if (bulkResponse.status === 'partial_failed') {
        // Keep failed recipients in composer for quick retry.
        const failedSet = new Set(
          failures.map((failure) => stripUsernamePrefix(failure.recipient_username).toLowerCase())
        );
        const failedDrafts = transfers.filter((entry) =>
          failedSet.has(stripUsernamePrefix(entry.recipient.username).toLowerCase())
        );
        setSavedTransfers(failedDrafts);
        clearComposer();

        openResultModal({
          type: 'partial',
          title: 'Partially Completed',
          message: 'Some transfers were processed. Review failed recipients and retry.',
          receipts,
          failures,
        });
        return;
      }

      openResultModal({
        type: 'failure',
        title: 'Transfer Failed',
        message: failures[0]?.error || bulkResponse.message || 'No transfers were processed.',
        receipts,
        failures,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Transfer failed. Please try again.';
      const normalized = message.toLowerCase();
      const shouldShowInlineError = !isAuthVisible;

      if (normalized.includes('invalid transaction pin') || normalized.includes('unauthorized')) {
        if (shouldShowInlineError) {
          setFormError('Wrong PIN. Please try again.');
        } else {
          setAuthError('Wrong PIN. Please try again.');
        }
      } else if (normalized.includes('pin is not set')) {
        setAuthVisible(false);
        navigation.navigate('CreatePin');
      } else {
        if (shouldShowInlineError) {
          setFormError(message);
        } else {
          setAuthError(message);
        }
      }
    } finally {
      setProcessingVisible(false);
      setPinValue('');
    }
  };

  const resolveDevelopmentPin = async () => {
    const stored = await getPin();
    if (stored && stored.length === 4) {
      return stored;
    }
    return process.env.EXPO_PUBLIC_DEV_TRANSACTION_PIN || '0000';
  };

  const handleConfirm = async () => {
    if (effectiveTransfers.length === 0) {
      setFormError('Add at least one valid transfer before confirming.');
      return;
    }

    if (effectiveTransfers.length > MAX_RECIPIENTS) {
      setFormError('You can add up to 10 recipients in one transfer.');
      return;
    }

    const currentUsername = stripUsernamePrefix(userProfile?.username).toLowerCase();
    const containsSelf = effectiveTransfers.some(
      (entry) => stripUsernamePrefix(entry.recipient.username).toLowerCase() === currentUsername
    );
    if (containsSelf) {
      setFormError('You cannot transfer to your own username from this flow.');
      return;
    }

    setFormError(null);
    setPendingTransfers(effectiveTransfers);

    const shouldSkipPrompt = process.env.EXPO_PUBLIC_SKIP_PIN_CHECK === 'true';
    if (shouldSkipPrompt) {
      const devPin = await resolveDevelopmentPin();
      await runTransferSubmission(devPin, effectiveTransfers);
      return;
    }

    setPinValue('');
    setAuthError(null);
    setAuthMode('pin');
    setAuthVisible(true);
  };

  const handlePinValueChange = async (value: string) => {
    const normalized = value.replace(/[^0-9]/g, '').slice(0, 4);
    setPinValue(normalized);
    setAuthError(null);

    if (normalized.length === 4 && !isSubmitting) {
      await runTransferSubmission(normalized);
    }
  };

  const handleBiometricVerify = async () => {
    setAuthError(null);

    if (!biometricsEnabled) {
      setAuthError('Biometrics is disabled. Enable it in Settings.');
      return;
    }

    try {
      const { available, biometryType } = await rnBiometrics.isSensorAvailable();
      if (!available || !biometryType) {
        setAuthError('Biometric authentication is not available on this device.');
        return;
      }

      const { success } = await rnBiometrics.simplePrompt({
        promptMessage: 'Verify to continue transfer',
        cancelButtonText: 'Cancel',
      });

      if (!success) {
        setAuthError('Biometric verification was cancelled.');
        return;
      }

      const pin = await getPin();
      if (!pin) {
        setAuthError('PIN is required for biometric payment. Please pay with PIN.');
        return;
      }

      await runTransferSubmission(pin);
    } catch {
      setAuthError('Biometric verification failed. Use PIN instead.');
    }
  };

  const activeSearchResults = searchData?.users ?? [];

  const currentUserDisplay = stripUsernamePrefix(userProfile?.username) || 'you';
  const recipientDisplay =
    pendingTransfers.length === 1
      ? stripUsernamePrefix(pendingTransfers[0].recipient.username)
      : pendingTransfers.length > 1
        ? `${stripUsernamePrefix(pendingTransfers[0].recipient.username)}+${pendingTransfers.length - 1} users`
        : selectedUser
          ? stripUsernamePrefix(selectedUser.username)
          : 'Recipient';

  const hasAtLeastOneTransfer = effectiveTransfers.length > 0;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A1B1E', '#0C0D0F', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.backgroundGradient}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.flexOne}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.headerRow}>
              <TouchableOpacity
                onPress={() => navigation.goBack()}
                style={styles.backButton}
                accessibilityRole="button"
                accessibilityLabel="Go back"
              >
                <Ionicons name="arrow-back" size={22} color="#ECECEC" />
              </TouchableOpacity>

              <View style={styles.headerIdentityRow}>
                <View style={styles.headerAvatar}>
                  <Text style={styles.headerAvatarInitial}>
                    {currentUserDisplay.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.headerUsername} numberOfLines={1}>
                  {currentUserDisplay}
                </Text>
              </View>

              <View style={styles.headerIconsRow}>
                <Ionicons name="wallet-outline" size={18} color="#EFEFEF" />
                <Ionicons name="notifications-outline" size={17} color="#EFEFEF" />
              </View>
            </View>

            <View style={styles.balanceSection}>
              <Text style={styles.balanceLabel}>AVAILABLE BALANCE</Text>
              <View style={styles.balanceRow}>
                {isLoadingBalance ? (
                  <ActivityIndicator size="small" color={BRAND_YELLOW} />
                ) : (
                  <Text style={styles.balanceValue}>
                    {formatCurrency(balanceData?.available_balance ?? 0)}
                  </Text>
                )}
                <Ionicons
                  name="eye-off-outline"
                  size={18}
                  color="#C6C6C7"
                  style={styles.balanceEyeIcon}
                />
              </View>
            </View>

            <View style={styles.segmentedWrap}>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.segmentButton, styles.segmentButtonActive]}
              >
                <Ionicons name="swap-horizontal-outline" size={15} color="#DADADA" />
                <Text style={styles.segmentText}>Transfer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                style={styles.segmentButton}
                onPress={() => navigation.navigate('SelfTransfer')}
              >
                <Ionicons name="wallet-outline" size={15} color="#DADADA" />
                <Text style={styles.segmentText}>Withdraw</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <View style={styles.searchWrap}>
              <Ionicons name="search" size={17} color="#D2D2D2" />
              <TextInput
                style={styles.searchInput}
                value={searchQuery}
                onChangeText={(value) => {
                  setSearchQuery(value);
                  if (selectedUser) {
                    setSelectedUser(null);
                    setEditingIndex(null);
                    setAmountInput('');
                    setNarrationInput('');
                  }
                }}
                placeholder="Search Username"
                placeholderTextColor="#8D8D90"
                autoCapitalize="none"
                autoCorrect={false}
              />
            </View>

            {!selectedUser && normalizedQuery.length === 0 ? (
              <View style={styles.noSelectionCard}>
                <Text style={styles.noSelectionText}>No User Selected</Text>
              </View>
            ) : null}

            {!selectedUser && normalizedQuery.length > 0 ? (
              isSearching ? (
                <View style={styles.searchLoadingWrap}>
                  <ActivityIndicator size="small" color={BRAND_YELLOW} />
                </View>
              ) : activeSearchResults.length === 0 ? (
                <Text style={styles.emptySearchText}>No users found.</Text>
              ) : (
                <View style={styles.searchResultList}>
                  {activeSearchResults.map((user) => (
                    <TouchableOpacity
                      key={user.id}
                      style={styles.searchResultCard}
                      activeOpacity={0.85}
                      onPress={() => handleSelectSearchUser(user)}
                    >
                      <View style={styles.searchResultAvatar}>
                        <Text style={styles.searchResultAvatarInitial}>
                          {(
                            user.full_name?.slice(0, 1) ||
                            stripUsernamePrefix(user.username).slice(0, 1)
                          ).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.searchResultTextWrap}>
                        <Text style={styles.searchResultUsername}>
                          {stripUsernamePrefix(user.username)}
                        </Text>
                        <Text style={styles.searchResultFullName} numberOfLines={1}>
                          {user.full_name || 'Transfa User'}
                        </Text>
                      </View>
                    </TouchableOpacity>
                  ))}
                </View>
              )
            ) : null}

            {selectedUser ? (
              <View style={styles.selectedCard}>
                <View style={styles.selectedHeaderRow}>
                  <View style={styles.selectedIdentityRow}>
                    <View style={styles.selectedAvatar}>
                      <Text style={styles.selectedAvatarInitial}>
                        {(
                          selectedUser.full_name?.slice(0, 1) ||
                          stripUsernamePrefix(selectedUser.username).slice(0, 1)
                        ).toUpperCase()}
                      </Text>
                    </View>
                    <View>
                      <Text style={styles.selectedUsername}>
                        {stripUsernamePrefix(selectedUser.username)}
                      </Text>
                      <Text style={styles.selectedFullName} numberOfLines={1}>
                        {selectedUser.full_name || 'Transfa User'}
                      </Text>
                    </View>
                  </View>

                  <View style={styles.selectedActionsRow}>
                    {editingIndex !== null ? (
                      <TouchableOpacity
                        onPress={() => setDeleteConfirmVisible(true)}
                        hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                      >
                        <Ionicons name="trash-outline" size={16} color="#F14C4C" />
                      </TouchableOpacity>
                    ) : null}

                    <TouchableOpacity
                      onPress={() => {
                        clearComposer();
                        setFormError(null);
                      }}
                      hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    >
                      <Ionicons name="close" size={18} color="#111" />
                    </TouchableOpacity>
                  </View>
                </View>

                <Text style={styles.fieldLabel}>Amount</Text>
                <View style={styles.fieldWrap}>
                  <Ionicons name="cash-outline" size={15} color="#3A3A3A" />
                  <TextInput
                    style={styles.fieldInput}
                    value={amountInput}
                    onChangeText={(value) => {
                      setAmountInput(value.replace(/[^0-9.]/g, ''));
                      setFormError(null);
                    }}
                    placeholder="Enter Amount"
                    placeholderTextColor="#8D8D90"
                    keyboardType="decimal-pad"
                  />
                </View>

                <Text style={styles.fieldLabel}>Narration</Text>
                <TextInput
                  style={styles.textareaInput}
                  value={narrationInput}
                  onChangeText={(value) => {
                    setNarrationInput(value);
                    setFormError(null);
                  }}
                  onFocus={() => setIsNarrationFocused(true)}
                  onBlur={() => setIsNarrationFocused(false)}
                  placeholder="Enter Narration"
                  placeholderTextColor="#8D8D90"
                />

                {isNarrationFocused ? (
                  <ScrollView
                    horizontal
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.suggestionsRow}
                  >
                    {NARRATION_SUGGESTIONS.map((suggestion) => (
                      <TouchableOpacity
                        key={suggestion}
                        style={styles.suggestionChip}
                        onPress={() => {
                          setNarrationInput(suggestion);
                          setFormError(null);
                        }}
                      >
                        <Text style={styles.suggestionChipText}>{suggestion}</Text>
                      </TouchableOpacity>
                    ))}
                  </ScrollView>
                ) : null}

                <TouchableOpacity
                  style={[
                    styles.saveButton,
                    (!activeDraft || isSubmitting) && styles.saveButtonDisabled,
                  ]}
                  onPress={handleSaveTransfer}
                  activeOpacity={0.85}
                  disabled={!activeDraft || isSubmitting}
                >
                  <Text style={styles.saveButtonText}>Save</Text>
                </TouchableOpacity>
              </View>
            ) : null}

            {savedTransfers.length > 0 ? (
              <View style={styles.outgoingSection}>
                <Text style={styles.outgoingTitle}>Outgoing transfers</Text>
                <ScrollView
                  style={[
                    styles.outgoingListWrap,
                    savedTransfers.length > 2 && styles.outgoingListWrapFixedHeight,
                  ]}
                  contentContainerStyle={styles.outgoingListContent}
                  nestedScrollEnabled
                  showsVerticalScrollIndicator={false}
                >
                  {savedTransfers.map((item, index) => (
                    <TouchableOpacity
                      key={`${item.recipient.id}-${index}`}
                      style={styles.outgoingCard}
                      activeOpacity={0.85}
                      onPress={() => handleEditSavedTransfer(index)}
                    >
                      <View style={styles.outgoingIdentityRow}>
                        <View style={styles.outgoingAvatar}>
                          <Text style={styles.outgoingAvatarInitial}>
                            {(
                              item.recipient.full_name?.slice(0, 1) ||
                              stripUsernamePrefix(item.recipient.username).slice(0, 1)
                            ).toUpperCase()}
                          </Text>
                        </View>
                        <View style={styles.outgoingTextWrap}>
                          <Text style={styles.outgoingUsername}>
                            {stripUsernamePrefix(item.recipient.username)}
                          </Text>
                          <Text style={styles.outgoingFullName} numberOfLines={1}>
                            {item.recipient.full_name || 'Transfa User'}
                          </Text>
                        </View>
                      </View>
                      <Text style={styles.outgoingAmount}>
                        {formatCurrency(item.amountKobo + transferFeeKobo)}
                      </Text>
                    </TouchableOpacity>
                  ))}
                </ScrollView>
              </View>
            ) : null}

            {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

            <View style={styles.summarySection}>
              <Text style={styles.summaryTitle}>Summary</Text>
              <View style={[styles.summaryCard, !hasAtLeastOneTransfer && styles.summaryCardMuted]}>
                <SummaryRow label="Amount" value={formatCurrency(summary.amount)} />
                <SummaryRow label="Transaction fee" value={formatCurrency(summary.fee)} />
                <View style={styles.summaryDivider} />
                <SummaryRow label="Total" value={formatCurrency(summary.total)} isTotal />
              </View>
            </View>
          </ScrollView>

          <View style={styles.bottomActions}>
            <TouchableOpacity
              style={[
                styles.confirmButton,
                (!hasAtLeastOneTransfer || isSubmitting) && styles.confirmButtonDisabled,
              ]}
              onPress={handleConfirm}
              disabled={!hasAtLeastOneTransfer || isSubmitting}
              activeOpacity={0.85}
            >
              {isSubmitting ? (
                <ActivityIndicator size="small" color="#111" />
              ) : (
                <Text style={styles.confirmButtonText}>Confirm</Text>
              )}
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        transparent
        animationType="fade"
        visible={isDeleteConfirmVisible}
        onRequestClose={() => setDeleteConfirmVisible(false)}
      >
        <View style={styles.centerModalOverlay}>
          <View style={styles.deleteModalCard}>
            <Text style={styles.deleteModalText}>Are you sure you want to delete transaction?</Text>
            <View style={styles.deleteModalActions}>
              <TouchableOpacity
                style={styles.deleteModalActionButton}
                onPress={() => {
                  if (editingIndex !== null) {
                    setSavedTransfers((prev) => prev.filter((_, index) => index !== editingIndex));
                  }
                  clearComposer();
                  setDeleteConfirmVisible(false);
                }}
              >
                <Text style={styles.deleteModalActionText}>Yes</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.deleteModalActionButton}
                onPress={() => setDeleteConfirmVisible(false)}
              >
                <Text style={styles.deleteModalActionText}>No</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={isAuthVisible}
        onRequestClose={closeAuthModal}
      >
        <View style={styles.authOverlay}>
          <LinearGradient
            colors={['#1A1B1E', '#0C0D0F', BG_BOTTOM]}
            start={{ x: 0, y: 0 }}
            end={{ x: 0, y: 1 }}
            style={styles.authBackground}
          />

          <SafeAreaView style={styles.authSafeArea} edges={['top', 'left', 'right']}>
            <TouchableOpacity
              style={styles.authBackButton}
              onPress={closeAuthModal}
              disabled={isSubmitting}
            >
              <Ionicons name="arrow-back" size={22} color="#ECECEC" />
            </TouchableOpacity>

            <View style={styles.authIdentityWrap}>
              <View style={styles.authSenderWrap}>
                <View style={styles.authAvatarPrimary}>
                  <Text style={styles.authAvatarPrimaryText}>
                    {currentUserDisplay.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.authIdentityLabel} numberOfLines={1}>
                  {currentUserDisplay}
                </Text>
              </View>

              <Ionicons name="arrow-forward" size={18} color="#B8B8BA" />

              <View style={styles.authRecipientWrap}>
                <View style={styles.authRecipientCluster}>
                  <View style={[styles.clusterAvatar, { backgroundColor: '#F3ABA7' }]}>
                    <Text style={styles.clusterAvatarText}>
                      {recipientDisplay.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>
                  {pendingTransfers.length > 1 ? (
                    <View style={[styles.clusterAvatarOverlay, { backgroundColor: '#A8E6B5' }]}>
                      <Text
                        style={styles.clusterAvatarTextSmall}
                      >{`+${pendingTransfers.length - 1}`}</Text>
                    </View>
                  ) : null}
                </View>
                <Text style={styles.authIdentityLabel} numberOfLines={1}>
                  {recipientDisplay}
                </Text>
              </View>
            </View>

            <Text style={styles.authAmount}>{formatCurrency(summary.total)}</Text>

            {authMode === 'pin' ? (
              <>
                <Text style={styles.authSubtitle}>Enter PIN to Pay</Text>

                <Pressable style={styles.pinBoxesRow} onPress={() => pinInputRef.current?.focus()}>
                  {[0, 1, 2, 3].map((index) => (
                    <View key={index} style={styles.pinBox}>
                      <Text style={styles.pinBoxText}>
                        {pinValue[index] ? pinValue[index] : '-'}
                      </Text>
                    </View>
                  ))}
                </Pressable>

                <TextInput
                  ref={pinInputRef}
                  value={pinValue}
                  onChangeText={handlePinValueChange}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                  style={styles.hiddenPinInput}
                />

                <TouchableOpacity
                  style={styles.authLinkButton}
                  onPress={() => setAuthMode('biometric')}
                  disabled={isSubmitting}
                >
                  <Text style={styles.authLinkText}>Pay with Biometrics</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.authSubtitle}>Verify your identity to continue</Text>
                <Ionicons
                  name="scan-circle-outline"
                  size={38}
                  color="#DFDFDF"
                  style={styles.biometricIcon}
                />
                <TouchableOpacity
                  style={[
                    styles.biometricVerifyButton,
                    isSubmitting && styles.confirmButtonDisabled,
                  ]}
                  onPress={handleBiometricVerify}
                  disabled={isSubmitting}
                >
                  {isSubmitting ? (
                    <ActivityIndicator size="small" color="#111" />
                  ) : (
                    <Text style={styles.biometricVerifyButtonText}>Verify Biometrics</Text>
                  )}
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setAuthMode('pin')}>
                  <Text style={styles.authLinkText}>Pay with PIN</Text>
                </TouchableOpacity>
              </>
            )}

            {authError ? <Text style={styles.authErrorText}>{authError}</Text> : null}
          </SafeAreaView>
        </View>
      </Modal>

      <Modal transparent animationType="fade" visible={isProcessingVisible}>
        <View style={styles.processingOverlay}>
          <View style={styles.processingCard}>
            <Ionicons
              name="paper-plane"
              size={56}
              color={BRAND_YELLOW}
              style={styles.processingIcon}
            />
            <Text style={styles.processingTitle}>Processing</Text>
            <Text style={styles.processingText}>Your transfer is processing</Text>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={!!resultState}
        onRequestClose={() => setResultState(null)}
      >
        <View style={styles.resultOverlay}>
          <View style={styles.resultCard}>
            <View style={styles.resultHeaderGraphic}>
              <LinearGradient
                colors={['#0E1D3A', '#1F4D7A']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={styles.resultGraphicFill}
              >
                <Ionicons
                  name={resultState?.type === 'failure' ? 'close-circle' : 'rocket'}
                  size={48}
                  color={BRAND_YELLOW}
                />
              </LinearGradient>
            </View>

            <Text style={styles.resultTitle}>{resultState?.title ?? 'Success!'}</Text>
            <Text style={styles.resultText}>
              {resultState?.message ?? 'Your transaction was successful.'}
            </Text>

            {resultState?.type !== 'success' && (resultState?.failures?.length ?? 0) > 0 ? (
              <View style={styles.failureListWrap}>
                {resultState?.failures.slice(0, 2).map((failure, index) => (
                  <Text
                    key={`${failure.recipient_username}-${index}`}
                    style={styles.failureListText}
                    numberOfLines={2}
                  >
                    • {stripUsernamePrefix(failure.recipient_username)}: {failure.error}
                  </Text>
                ))}
              </View>
            ) : null}

            <TouchableOpacity
              style={styles.resultDoneButton}
              onPress={() => {
                setResultState(null);
                navigation.navigate('AppTabs', { screen: 'Home' });
              }}
            >
              <Text style={styles.resultDoneButtonText}>Done</Text>
            </TouchableOpacity>

            {(resultState?.receipts.length ?? 0) > 0 ? (
              <TouchableOpacity
                onPress={() => {
                  if (!resultState?.receipts || resultState.receipts.length === 0) {
                    return;
                  }

                  setResultState(null);

                  if (resultState.receipts.length > 1) {
                    navigation.navigate('MultiTransferReceipts', {
                      receipts: resultState.receipts,
                      failures: resultState.failures,
                    });
                    return;
                  }

                  const first = resultState.receipts[0];
                  navigation.navigate('TransferStatus', {
                    transactionId: first.transactionId,
                    amount: first.amount,
                    fee: first.fee,
                    description: first.description,
                    recipientUsername: first.recipientUsername,
                    transferType: 'p2p',
                  });
                }}
              >
                <Text style={styles.resultReceiptText}>
                  {resultState && resultState.receipts.length > 1
                    ? 'View Receipts'
                    : 'View Receipt'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>
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
  <View style={styles.summaryRow}>
    <Text style={[styles.summaryLabel, isTotal && styles.summaryLabelTotal]}>{label}</Text>
    <Text style={[styles.summaryValue, isTotal && styles.summaryValueTotal]}>{value}</Text>
  </View>
);

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
  flexOne: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 140,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  backButton: {
    width: 28,
    paddingVertical: 4,
  },
  headerIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginLeft: 4,
    marginRight: 10,
  },
  headerAvatar: {
    width: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#F4DDB5',
  },
  headerAvatarInitial: {
    color: '#111',
    fontSize: 13,
    fontWeight: '700',
  },
  headerUsername: {
    color: '#F4F4F4',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
    maxWidth: 168,
  },
  headerIconsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  balanceSection: {
    marginTop: 16,
  },
  balanceLabel: {
    color: '#B3B3B4',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  balanceRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceValue: {
    color: '#F3F3F4',
    fontSize: 40,
    fontWeight: '700',
  },
  balanceEyeIcon: {
    marginLeft: 8,
    marginTop: 3,
  },
  segmentedWrap: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },
  segmentButton: {
    flex: 1,
    height: 40,
    borderRadius: 10,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 7,
  },
  segmentButtonActive: {
    borderColor: BRAND_YELLOW,
  },
  segmentText: {
    color: '#DDDDDE',
    fontSize: 16,
    fontWeight: '500',
  },
  divider: {
    marginTop: 18,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  searchWrap: {
    marginTop: 14,
    height: 36,
    borderRadius: 10,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  searchInput: {
    flex: 1,
    color: '#ECECEC',
    fontSize: 15,
    paddingVertical: 0,
  },
  noSelectionCard: {
    marginTop: 12,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#2F3135',
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  noSelectionText: {
    color: '#787A7F',
    fontSize: 14,
    fontWeight: '500',
  },
  searchLoadingWrap: {
    marginTop: 14,
    alignItems: 'center',
  },
  emptySearchText: {
    marginTop: 14,
    color: '#9B9C9F',
    fontSize: 13,
  },
  searchResultList: {
    marginTop: 10,
    gap: 10,
  },
  searchResultCard: {
    minHeight: 66,
    borderRadius: 8,
    backgroundColor: '#F6F6F7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  searchResultAvatar: {
    width: 40,
    height: 40,
    borderRadius: 8,
    backgroundColor: '#F3ABA7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  searchResultAvatarInitial: {
    color: '#111',
    fontSize: 14,
    fontWeight: '700',
  },
  searchResultTextWrap: {
    marginLeft: 12,
    flex: 1,
  },
  searchResultUsername: {
    color: '#1A1B1E',
    fontSize: 20,
    fontWeight: '700',
  },
  searchResultFullName: {
    marginTop: 2,
    color: '#5E5F63',
    fontSize: 13,
  },
  selectedCard: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: '#F6F6F7',
    padding: 12,
  },
  selectedHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectedIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  selectedAvatar: {
    width: 38,
    height: 38,
    borderRadius: 8,
    backgroundColor: '#F3ABA7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  selectedAvatarInitial: {
    color: '#111',
    fontSize: 14,
    fontWeight: '700',
  },
  selectedUsername: {
    marginLeft: 10,
    color: '#151618',
    fontSize: 20,
    fontWeight: '700',
  },
  selectedFullName: {
    marginLeft: 10,
    color: '#5C5E61',
    fontSize: 12,
    marginTop: 1,
    maxWidth: 160,
  },
  selectedActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  fieldLabel: {
    marginTop: 10,
    marginBottom: 6,
    color: '#242528',
    fontSize: 14,
    fontWeight: '500',
  },
  fieldWrap: {
    height: 42,
    borderRadius: 6,
    backgroundColor: '#E8E8EA',
    borderWidth: 1,
    borderColor: '#DFDFE1',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldInput: {
    flex: 1,
    color: '#1B1C1F',
    fontSize: 14,
    paddingVertical: 0,
  },
  textareaInput: {
    minHeight: 42,
    borderRadius: 6,
    backgroundColor: '#E8E8EA',
    borderWidth: 1,
    borderColor: '#DFDFE1',
    color: '#1B1C1F',
    fontSize: 14,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  suggestionsRow: {
    marginTop: 8,
    gap: 8,
    paddingBottom: 2,
  },
  suggestionChip: {
    paddingHorizontal: 12,
    height: 28,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: '#E2C646',
    alignItems: 'center',
    justifyContent: 'center',
  },
  suggestionChipText: {
    color: '#4B4C4F',
    fontSize: 12,
    fontWeight: '500',
  },
  saveButton: {
    marginTop: 10,
    height: 40,
    borderRadius: 8,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveButtonDisabled: {
    opacity: 0.45,
  },
  saveButtonText: {
    color: '#0F0F10',
    fontSize: 17,
    fontWeight: '700',
  },
  outgoingSection: {
    marginTop: 14,
  },
  outgoingTitle: {
    color: '#DCDCDD',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  outgoingListWrap: {
    maxHeight: 144,
  },
  outgoingListWrapFixedHeight: {
    height: 128,
  },
  outgoingListContent: {
    gap: 8,
    paddingBottom: 4,
  },
  outgoingCard: {
    minHeight: 60,
    borderRadius: 8,
    backgroundColor: '#F6F6F7',
    paddingHorizontal: 10,
    paddingVertical: 9,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  outgoingIdentityRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 8,
  },
  outgoingAvatar: {
    width: 34,
    height: 34,
    borderRadius: 8,
    backgroundColor: '#F3ABA7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outgoingAvatarInitial: {
    color: '#151618',
    fontWeight: '700',
    fontSize: 13,
  },
  outgoingTextWrap: {
    flex: 1,
    marginLeft: 10,
  },
  outgoingUsername: {
    color: '#1A1B1E',
    fontSize: 16,
    fontWeight: '700',
  },
  outgoingFullName: {
    marginTop: 1,
    color: '#5D5E61',
    fontSize: 12,
  },
  outgoingAmount: {
    color: '#151618',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    marginTop: 10,
    color: '#F26464',
    fontSize: 13,
    fontWeight: '500',
  },
  summarySection: {
    marginTop: 14,
  },
  summaryTitle: {
    color: '#9E8B1B',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  summaryCard: {
    borderRadius: 8,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingVertical: 10,
    paddingHorizontal: 12,
  },
  summaryCardMuted: {
    opacity: 0.5,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    minHeight: 24,
  },
  summaryLabel: {
    color: '#A7A7A8',
    fontSize: 14,
  },
  summaryLabelTotal: {
    color: '#F0F0F0',
    fontWeight: '700',
  },
  summaryValue: {
    color: '#D0D0D1',
    fontSize: 14,
    fontWeight: '500',
  },
  summaryValueTotal: {
    color: '#F6F6F6',
    fontSize: 18,
    fontWeight: '700',
  },
  summaryDivider: {
    marginVertical: 4,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  bottomActions: {
    position: 'absolute',
    left: 20,
    right: 20,
    bottom: 24,
  },
  confirmButton: {
    height: 46,
    borderRadius: 8,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.45,
  },
  confirmButtonText: {
    color: '#111213',
    fontSize: 18,
    fontWeight: '700',
  },
  centerModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
  },
  deleteModalCard: {
    width: '100%',
    maxWidth: 300,
    borderRadius: 8,
    backgroundColor: '#F4F4F4',
    paddingHorizontal: 14,
    paddingVertical: 14,
  },
  deleteModalText: {
    color: '#1A1B1D',
    fontSize: 15,
    fontWeight: '500',
    textAlign: 'center',
  },
  deleteModalActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 8,
  },
  deleteModalActionButton: {
    flex: 1,
    height: 32,
    borderRadius: 6,
    backgroundColor: '#070809',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteModalActionText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
  },
  authOverlay: {
    flex: 1,
    backgroundColor: BG_BOTTOM,
  },
  authBackground: {
    ...StyleSheet.absoluteFillObject,
  },
  authSafeArea: {
    flex: 1,
    paddingHorizontal: 20,
  },
  authBackButton: {
    marginTop: 4,
    width: 28,
    paddingVertical: 4,
  },
  authIdentityWrap: {
    marginTop: 44,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 14,
  },
  authSenderWrap: {
    alignItems: 'center',
    width: 110,
  },
  authAvatarPrimary: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F4DDB5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authAvatarPrimaryText: {
    color: '#111',
    fontSize: 17,
    fontWeight: '700',
  },
  authRecipientWrap: {
    alignItems: 'center',
    width: 110,
  },
  authRecipientCluster: {
    width: 52,
    height: 52,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterAvatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  clusterAvatarOverlay: {
    position: 'absolute',
    right: -4,
    bottom: -2,
    minWidth: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  clusterAvatarText: {
    color: '#111',
    fontWeight: '700',
    fontSize: 16,
  },
  clusterAvatarTextSmall: {
    color: '#111',
    fontWeight: '700',
    fontSize: 10,
  },
  authIdentityLabel: {
    color: '#CFCFD1',
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
    maxWidth: 110,
  },
  authAmount: {
    marginTop: 28,
    textAlign: 'center',
    color: '#F2F2F3',
    fontSize: 48,
    fontWeight: '700',
  },
  authSubtitle: {
    marginTop: 6,
    textAlign: 'center',
    color: '#777A80',
    fontSize: 16,
  },
  pinBoxesRow: {
    marginTop: 30,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 14,
  },
  pinBox: {
    width: 54,
    height: 54,
    borderRadius: 8,
    backgroundColor: '#2A2B2F',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBoxText: {
    color: '#DBDCDF',
    fontSize: 24,
    fontWeight: '500',
  },
  hiddenPinInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  authLinkButton: {
    marginTop: 28,
    alignItems: 'center',
  },
  authLinkText: {
    color: BRAND_YELLOW,
    fontSize: 24,
    fontWeight: '500',
  },
  biometricIcon: {
    marginTop: 24,
    alignSelf: 'center',
  },
  biometricVerifyButton: {
    marginTop: 22,
    alignSelf: 'center',
    width: 280,
    height: 56,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  biometricVerifyButtonText: {
    color: '#111',
    fontSize: 27,
    fontWeight: '700',
  },
  authErrorText: {
    marginTop: 16,
    textAlign: 'center',
    color: '#F26464',
    fontSize: 14,
    fontWeight: '500',
    paddingHorizontal: 16,
  },
  processingOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.5)',
    justifyContent: 'flex-end',
  },
  processingCard: {
    minHeight: 300,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: '#F4F4F4',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 24,
    paddingBottom: 30,
  },
  processingIcon: {
    transform: [{ rotate: '-20deg' }],
  },
  processingTitle: {
    marginTop: 14,
    color: '#131416',
    fontSize: 46,
    fontWeight: '700',
  },
  processingText: {
    marginTop: 8,
    color: '#76777B',
    fontSize: 30,
  },
  resultOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 22,
  },
  resultCard: {
    width: '100%',
    maxWidth: 370,
    borderRadius: 10,
    overflow: 'hidden',
    backgroundColor: '#F4F4F4',
    paddingBottom: 18,
    alignItems: 'center',
  },
  resultHeaderGraphic: {
    width: '100%',
    height: 146,
    backgroundColor: '#18345B',
  },
  resultGraphicFill: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultTitle: {
    marginTop: 16,
    color: '#111214',
    fontSize: 44,
    fontWeight: '700',
    textAlign: 'center',
  },
  resultText: {
    marginTop: 8,
    color: '#535457',
    fontSize: 24,
    textAlign: 'center',
    paddingHorizontal: 18,
  },
  failureListWrap: {
    marginTop: 10,
    width: '88%',
    borderRadius: 8,
    backgroundColor: '#ECECEE',
    paddingVertical: 8,
    paddingHorizontal: 10,
    gap: 4,
  },
  failureListText: {
    color: '#2A2B2E',
    fontSize: 12,
  },
  resultDoneButton: {
    marginTop: 16,
    width: 140,
    height: 44,
    borderRadius: 8,
    backgroundColor: '#040506',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultDoneButtonText: {
    color: '#FFFFFF',
    fontSize: 24,
    fontWeight: '700',
  },
  resultReceiptText: {
    marginTop: 10,
    color: '#111214',
    fontSize: 22,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

export default PayUserScreen;

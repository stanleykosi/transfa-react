import BackIcon from '@/assets/icons/back.svg';
import BankIcon from '@/assets/icons/bank.svg';
import BetweenIcon from '@/assets/icons/between.svg';
import VerifiedBadge from '@/assets/icons/verified.svg';
import Avatar from '@/assets/images/avatar.svg';
import AvatarAlt1 from '@/assets/images/avatar1.svg';
import AvatarAlt2 from '@/assets/images/avatar2.svg';
import AvatarAlt3 from '@/assets/images/avatar3.svg';
import ProcessIllustration from '@/assets/images/processing.png';
import {
  fetchTransactionStatus,
  useBulkP2PTransfer,
  useGetIncomingPaymentRequest,
  useP2PTransfer,
  usePayIncomingPaymentRequest,
  useSelfTransfer,
  useTransactionFees,
  useUserProfile,
} from '@/api/transactionApi';
import type { AppStackParamList } from '@/types/navigation';
import { useSecurityStore } from '@/store/useSecurityStore';
import type { AppNavigationProp } from '@/types/navigation';
import type { BulkP2PTransferFailure, BulkP2PTransferResponse } from '@/types/api';
import { formatCurrency } from '@/utils/formatCurrency';
import {
  ensureMinimumProcessingDisplay,
  toTransferSettlementStatus,
  waitForMs,
} from '@/utils/transferFlow';
import { normalizeUsername, usernameKey } from '@/utils/username';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  Image,
  Modal,
  SafeAreaView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import ReactNativeBiometrics from 'react-native-biometrics';
import Animated, { useAnimatedStyle, useSharedValue, withTiming } from 'react-native-reanimated';
import { SvgXml } from 'react-native-svg';

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
const rnBiometrics = new ReactNativeBiometrics();
type VerificationRoute =
  | RouteProp<AppStackParamList, 'PaymentVerification'>
  | RouteProp<AppStackParamList, 'RequestPaymentAuth'>;

type TransferPayloadItem = {
  recipientUserId?: string;
  recipientUsername: string;
  recipientFullName?: string | null;
  amount: number;
  narration: string;
  avatarIndex?: number;
  verified?: boolean;
};

interface VerificationReceipt {
  transactionId: string;
  amount: number;
  fee: number;
  description: string;
  recipientUsername: string;
  transferType: string;
  initialStatus?: 'completed' | 'failed';
}

interface VerificationResult {
  submitMode: 'transfer' | 'withdraw' | 'list' | 'request_payment';
  type: 'success' | 'partial';
  title: string;
  message: string;
  receipts: VerificationReceipt[];
  failures: BulkP2PTransferFailure[];
}

const getAvatarComponent = (index?: number) => avatarComponents[index ?? 0] || Avatar;

const avatarIndexFromSeed = (seed: string) => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000000007;
  }
  return Math.abs(hash) % avatarComponents.length;
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

const buildWithdrawalDescription = (bankName: string) => {
  if (!bankName) {
    return 'Wallet withdrawal';
  }
  const value = `Wallet withdrawal to ${bankName}`;
  return value.slice(0, 100);
};

const toDisplayStatus = (status?: string): 'completed' | 'failed' | 'processing' | 'pending' => {
  return toTransferSettlementStatus(status) ?? 'pending';
};

const waitForSingleTransferSettlement = async (
  transactionId: string,
  initialStatus?: string
): Promise<{ status: 'completed' | 'failed'; failureReason?: string }> => {
  const status = toDisplayStatus(initialStatus);
  if (status === 'completed') {
    return { status: 'completed' };
  }
  if (status === 'failed') {
    return { status: 'failed' };
  }

  const timeoutAt = Date.now() + 60000;
  while (Date.now() < timeoutAt) {
    await waitForMs(1500);
    try {
      const { data } = await fetchTransactionStatus(transactionId);
      const current = toDisplayStatus(data?.status);
      if (current === 'completed') {
        return { status: 'completed' };
      }
      if (current === 'failed') {
        return {
          status: 'failed',
          failureReason: data?.failure_reason || data?.anchor_reason || data?.status,
        };
      }
    } catch {
      // Continue polling to tolerate transient failures.
    }
  }

  throw new Error(
    'Transfer is still processing on the server. Please wait a moment and check History.'
  );
};

const waitForBulkTransferSettlement = async (
  response: BulkP2PTransferResponse,
  payload: TransferPayloadItem[],
  feePerTransfer: number
): Promise<{ receipts: VerificationReceipt[]; failures: BulkP2PTransferFailure[] }> => {
  const receipts: VerificationReceipt[] = [];
  const failures: BulkP2PTransferFailure[] = [...response.failed_transfers];
  const failedSet = new Set(
    response.failed_transfers.map((failure) => usernameKey(failure.recipient_username))
  );

  const successfulPayloadItems = payload.filter(
    (item) => !failedSet.has(usernameKey(item.recipientUsername))
  );

  const pendingChecks = new Map<
    string,
    {
      transactionId: string;
      amount: number;
      fee: number;
      description: string;
      recipientUsername: string;
      fallbackFailureReason: string;
    }
  >();

  response.successful_transfers.forEach((transaction, index) => {
    const item = successfulPayloadItems[index];
    const transactionId = transaction.transaction_id;
    const amount = transaction.amount ?? item?.amount ?? 0;
    const fee = transaction.fee ?? feePerTransfer;
    const description = item?.narration ?? '';
    const recipientUsername = normalizeUsername(item?.recipientUsername || '');
    const fallbackFailureReason = transaction.message || transaction.status || 'Transfer failed.';
    const initialStatus = toDisplayStatus(transaction.status);

    if (initialStatus === 'completed') {
      receipts.push({
        transactionId,
        amount,
        fee,
        description,
        recipientUsername,
        transferType: 'p2p',
        initialStatus: 'completed',
      });
      return;
    }

    if (initialStatus === 'failed') {
      failures.push({
        recipient_username: recipientUsername || 'unknown',
        amount,
        description,
        error: fallbackFailureReason,
      });
      return;
    }

    pendingChecks.set(transactionId, {
      transactionId,
      amount,
      fee,
      description,
      recipientUsername,
      fallbackFailureReason,
    });
  });

  const timeoutAt = Date.now() + 60000;
  while (pendingChecks.size > 0 && Date.now() < timeoutAt) {
    await waitForMs(1500);
    const ids = Array.from(pendingChecks.keys());
    const updates = await Promise.all(
      ids.map(async (transactionId) => {
        try {
          const { data } = await fetchTransactionStatus(transactionId);
          return { transactionId, data };
        } catch {
          return null;
        }
      })
    );

    updates.forEach((update) => {
      if (!update) {
        return;
      }

      const candidate = pendingChecks.get(update.transactionId);
      if (!candidate) {
        return;
      }

      const status = toDisplayStatus(update.data?.status);
      if (status === 'completed') {
        receipts.push({
          transactionId: candidate.transactionId,
          amount: candidate.amount,
          fee: candidate.fee,
          description: candidate.description,
          recipientUsername: candidate.recipientUsername,
          transferType: 'p2p',
          initialStatus: 'completed',
        });
        pendingChecks.delete(candidate.transactionId);
        return;
      }

      if (status === 'failed') {
        failures.push({
          recipient_username: candidate.recipientUsername || 'unknown',
          amount: candidate.amount,
          description: candidate.description,
          error:
            update.data?.failure_reason ||
            update.data?.anchor_reason ||
            update.data?.status ||
            candidate.fallbackFailureReason,
        });
        pendingChecks.delete(candidate.transactionId);
      }
    });
  }

  if (pendingChecks.size > 0) {
    throw new Error(
      'Some transfers are still processing on the server. Please wait a moment and check History.'
    );
  }

  return { receipts, failures };
};

const toFriendlyError = (rawMessage: string) => {
  const normalized = rawMessage.toLowerCase();
  if (normalized.includes('invalid transaction pin') || normalized.includes('unauthorized')) {
    return 'Wrong PIN. Please try again.';
  }
  if (normalized.includes('temporarily locked') || normalized.includes('too many')) {
    return 'PIN is temporarily locked. Please wait and try again.';
  }
  if (normalized.includes('pin is not set')) {
    return 'PIN is not set. Create a transaction PIN in Settings.';
  }
  if (normalized.includes('insufficient')) {
    return 'Insufficient balance for this payment.';
  }
  return rawMessage;
};

const resolveDevelopmentPin = async (getPin: () => Promise<string | null>) => {
  const stored = await getPin();
  if (stored && stored.length === 4) {
    return stored;
  }
  return process.env.EXPO_PUBLIC_DEV_TRANSACTION_PIN || '0000';
};

const PaymentVerificationScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const route = useRoute<VerificationRoute>();

  const params = route.name === 'PaymentVerification' ? route.params : null;
  const intent: AppStackParamList['PaymentVerification']['intent'] =
    params?.intent ?? 'request_payment';
  const requestId =
    route.name === 'RequestPaymentAuth'
      ? route.params.requestId
      : params?.intent === 'request_payment'
        ? params.requestId
        : '';

  const transferParams = params?.intent === 'transfer' ? params : null;
  const withdrawParams = params?.intent === 'withdraw' ? params : null;

  const [pin, setPin] = useState(['', '', '', '']);
  const pinInputRefs = useRef<Array<TextInput | null>>([]);
  const [error, setError] = useState<string | null>(null);
  const [modalVisible, setModalVisible] = useState(false);
  const [modalStatus, setModalStatus] = useState<'processing' | 'success'>('processing');
  const [result, setResult] = useState<VerificationResult | null>(null);
  const [hasAutoSubmitted, setHasAutoSubmitted] = useState(false);

  const modalTranslateY = useSharedValue(SCREEN_HEIGHT);

  const { biometricsEnabled, getPin } = useSecurityStore();
  const { data: profile } = useUserProfile();
  const { data: fees, isLoading: isLoadingFees } = useTransactionFees();
  const { data: request, isLoading: isLoadingRequest } = useGetIncomingPaymentRequest(requestId);

  const p2pTransfer = useP2PTransfer();
  const bulkP2PTransfer = useBulkP2PTransfer();
  const selfTransfer = useSelfTransfer();
  const payIncomingPaymentRequest = usePayIncomingPaymentRequest();

  const isSubmitting =
    p2pTransfer.isPending ||
    bulkP2PTransfer.isPending ||
    selfTransfer.isPending ||
    payIncomingPaymentRequest.isPending;

  const senderUsername = normalizeUsername(profile?.username || 'you');
  const p2pFeeKobo = fees?.p2p_fee_kobo ?? 0;
  const selfFeeKobo = fees?.self_fee_kobo ?? 0;

  const transferUsers: TransferPayloadItem[] = useMemo(
    () => transferParams?.transfers ?? [],
    [transferParams]
  );
  const transferAmount = transferUsers.reduce((sum, user) => sum + user.amount, 0);
  const transferFee = transferUsers.length * p2pFeeKobo;
  const withdrawAmount = withdrawParams?.amount ?? 0;
  const withdrawFee = withdrawAmount > 0 ? selfFeeKobo : 0;
  const requestAmount = request?.amount ?? 0;
  const requestFee = p2pFeeKobo;

  const totalAmount = useMemo(() => {
    if (intent === 'withdraw') {
      return withdrawAmount + withdrawFee;
    }
    if (intent === 'request_payment') {
      return requestAmount + requestFee;
    }
    return transferAmount + transferFee;
  }, [intent, requestAmount, requestFee, transferAmount, transferFee, withdrawAmount, withdrawFee]);

  const firstTransferUser = transferUsers[0];
  const isFromList = !!transferParams?.fromList;
  const isMultipleUsers = transferUsers.length > 1;
  const listName = transferParams?.listName || 'List';
  const listEmoji = transferParams?.listEmoji || '📋';
  const requestReceiverUsername = normalizeUsername(request?.creator_username || 'recipient');
  const requestReceiverAvatarIndex = avatarIndexFromSeed(requestReceiverUsername);
  const PrimaryReceiverAvatar = getAvatarComponent(firstTransferUser?.avatarIndex);
  const RequestReceiverAvatar = getAvatarComponent(requestReceiverAvatarIndex);

  const modalAnimatedStyle = useAnimatedStyle(() => {
    return {
      transform: [{ translateY: modalTranslateY.value }],
    };
  });

  const closeModal = useCallback(
    (afterClose?: () => void) => {
      modalTranslateY.value = withTiming(SCREEN_HEIGHT, { duration: 280 });
      setTimeout(() => {
        setModalVisible(false);
        if (afterClose) {
          afterClose();
        }
      }, 280);
    },
    [modalTranslateY]
  );

  useEffect(() => {
    if (modalVisible) {
      modalTranslateY.value = withTiming(0, { duration: 300 });
    } else {
      modalTranslateY.value = withTiming(SCREEN_HEIGHT, { duration: 300 });
    }
  }, [modalTranslateY, modalVisible]);

  const submitWithPin = useCallback(
    async (transactionPIN: string) => {
      if (isSubmitting) {
        return;
      }

      setError(null);
      setModalStatus('processing');
      setModalVisible(true);
      const startedAt = Date.now();

      try {
        let nextResult: VerificationResult;

        if (intent === 'request_payment') {
          if (!request) {
            throw new Error('Payment request is unavailable.');
          }

          const response = await payIncomingPaymentRequest.mutateAsync({
            requestId: request.id,
            payload: { transaction_pin: transactionPIN },
          });

          const receiverUsername = normalizeUsername(request.creator_username || 'recipient');
          nextResult = {
            submitMode: 'request_payment',
            type: 'success',
            title: 'Success!',
            message: 'Your transaction was successful.',
            receipts: [
              {
                transactionId: response.transaction.transaction_id,
                amount: response.transaction.amount ?? request.amount,
                fee: response.transaction.fee ?? requestFee,
                description: `Request payment to ${receiverUsername}`,
                recipientUsername: receiverUsername,
                transferType: 'p2p',
                initialStatus: 'completed',
              },
            ],
            failures: [],
          };
        } else if (intent === 'withdraw') {
          if (!withdrawParams || withdrawParams.amount <= 0) {
            throw new Error('Complete withdrawal details before continuing.');
          }

          const response = await selfTransfer.mutateAsync({
            beneficiary_id: withdrawParams.beneficiaryId,
            amount: withdrawParams.amount,
            description: buildWithdrawalDescription(withdrawParams.bankName),
            transaction_pin: transactionPIN,
          });

          const settlement = await waitForSingleTransferSettlement(
            response.transaction_id,
            response.status
          );

          if (settlement.status === 'failed') {
            throw new Error(settlement.failureReason || 'Your withdrawal could not be completed.');
          }

          nextResult = {
            submitMode: 'withdraw',
            type: 'success',
            title: 'Success!',
            message: 'Your transaction was successful.',
            receipts: [
              {
                transactionId: response.transaction_id,
                amount: withdrawParams.amount,
                fee: response.fee ?? withdrawFee,
                description: buildWithdrawalDescription(withdrawParams.bankName),
                recipientUsername: withdrawParams.accountName,
                transferType: 'self_transfer',
                initialStatus: 'completed',
              },
            ],
            failures: [],
          };
        } else {
          const payload = transferUsers.map((item) => ({
            recipientUserId: item.recipientUserId,
            recipientUsername: normalizeUsername(item.recipientUsername),
            recipientFullName: item.recipientFullName,
            amount: item.amount,
            narration: item.narration,
            avatarIndex: item.avatarIndex,
            verified: item.verified,
          }));

          if (payload.length === 0) {
            throw new Error('Add at least one transfer before continuing.');
          }

          if (payload.length === 1) {
            const single = payload[0];
            const response = await p2pTransfer.mutateAsync({
              recipient_username: single.recipientUsername,
              amount: single.amount,
              description: single.narration,
              transaction_pin: transactionPIN,
            });

            const settlement = await waitForSingleTransferSettlement(
              response.transaction_id,
              response.status
            );

            if (settlement.status === 'failed') {
              throw new Error(settlement.failureReason || 'Your transfer could not be completed.');
            }

            nextResult = {
              submitMode: isFromList ? 'list' : 'transfer',
              type: 'success',
              title: 'Success!',
              message: 'Your transaction was successful.',
              receipts: [
                {
                  transactionId: response.transaction_id,
                  amount: single.amount,
                  fee: response.fee ?? p2pFeeKobo,
                  description: single.narration,
                  recipientUsername: single.recipientUsername,
                  transferType: 'p2p',
                  initialStatus: 'completed',
                },
              ],
              failures: [],
            };
          } else {
            const bulkResponse = await bulkP2PTransfer.mutateAsync({
              transaction_pin: transactionPIN,
              transfers: payload.map((item) => ({
                recipient_username: item.recipientUsername,
                amount: item.amount,
                description: item.narration,
              })),
            });

            const settlement = await waitForBulkTransferSettlement(
              bulkResponse,
              payload,
              p2pFeeKobo
            );

            if (settlement.receipts.length === 0) {
              throw new Error(settlement.failures[0]?.error || 'No transfer was completed.');
            }

            const isPartial = settlement.failures.length > 0;
            nextResult = {
              submitMode: isFromList ? 'list' : 'transfer',
              type: isPartial ? 'partial' : 'success',
              title: isPartial ? 'Partially Completed' : 'Success!',
              message: isPartial
                ? 'Some transfers failed. Review receipts for details.'
                : 'Your transaction was successful.',
              receipts: settlement.receipts,
              failures: settlement.failures,
            };
          }
        }

        await ensureMinimumProcessingDisplay(startedAt);
        setResult(nextResult);
        setModalStatus('success');
      } catch (caughtError) {
        await ensureMinimumProcessingDisplay(startedAt);
        closeModal();
        const rawMessage =
          caughtError instanceof Error ? caughtError.message : 'Could not process verification.';
        setError(toFriendlyError(rawMessage));
      } finally {
        setPin(['', '', '', '']);
      }
    },
    [
      bulkP2PTransfer,
      closeModal,
      intent,
      isFromList,
      isSubmitting,
      p2pFeeKobo,
      p2pTransfer,
      payIncomingPaymentRequest,
      request,
      requestFee,
      selfTransfer,
      transferUsers,
      withdrawFee,
      withdrawParams,
    ]
  );

  const handlePinChange = useCallback(
    async (value: string, index: number) => {
      if (value && !/^\d$/.test(value)) {
        return;
      }

      const next = [...pin];
      next[index] = value;
      setPin(next);
      setError(null);

      if (value && index < 3) {
        pinInputRefs.current[index + 1]?.focus();
      }

      if (value && index === 3 && next.every((digit) => digit !== '')) {
        await submitWithPin(next.join(''));
      }
    },
    [pin, submitWithPin]
  );

  const handlePinKeyPress = (key: string, index: number) => {
    if (key === 'Backspace' && !pin[index] && index > 0) {
      pinInputRefs.current[index - 1]?.focus();
    }
  };

  const handleBiometricVerify = useCallback(async () => {
    setError(null);
    if (!biometricsEnabled) {
      setError('Biometrics is disabled. Enable it in settings.');
      return;
    }

    try {
      const { available, biometryType } = await rnBiometrics.isSensorAvailable();
      if (!available || !biometryType) {
        setError('Biometric authentication is not available on this device.');
        return;
      }

      const promptMessage =
        intent === 'withdraw'
          ? 'Verify to continue withdrawal'
          : intent === 'request_payment'
            ? 'Verify to continue payment'
            : 'Verify to continue transfer';

      const { success } = await rnBiometrics.simplePrompt({
        promptMessage,
        cancelButtonText: 'Cancel',
      });

      if (!success) {
        return;
      }

      const storedPin = await getPin();
      if (!storedPin) {
        setError('PIN is required for biometric verification. Use PIN instead.');
        return;
      }

      await submitWithPin(storedPin);
    } catch {
      setError('Biometric verification failed.');
    }
  }, [biometricsEnabled, getPin, intent, submitWithPin]);

  useEffect(() => {
    const shouldSkipPrompt = process.env.EXPO_PUBLIC_SKIP_PIN_CHECK === 'true';
    if (!shouldSkipPrompt || hasAutoSubmitted || isSubmitting) {
      return;
    }

    if (intent === 'request_payment' && (isLoadingRequest || !request)) {
      return;
    }

    setHasAutoSubmitted(true);
    resolveDevelopmentPin(getPin).then((pinValue) => {
      submitWithPin(pinValue);
    });
  }, [getPin, hasAutoSubmitted, intent, isLoadingRequest, isSubmitting, request, submitWithPin]);

  const handleDone = () => {
    closeModal(() => {
      navigation.navigate('AppTabs', { screen: 'Home' });
    });
  };

  const handleViewReceipt = () => {
    if (!result) {
      return;
    }

    closeModal(() => {
      if (result.receipts.length > 1 || result.failures.length > 0) {
        navigation.navigate('MultiTransferReceipts', {
          receipts: result.receipts.map((receipt) => ({
            transactionId: receipt.transactionId,
            amount: receipt.amount,
            fee: receipt.fee,
            description: receipt.description,
            recipientUsername: receipt.recipientUsername,
            initialStatus: receipt.initialStatus,
          })),
          failures: result.failures,
        });
        return;
      }

      const first = result.receipts[0];
      if (!first) {
        navigation.navigate('AppTabs', { screen: 'Home' });
        return;
      }

      navigation.navigate('TransferStatus', {
        transactionId: first.transactionId,
        amount: first.amount,
        fee: first.fee,
        description: first.description,
        recipientUsername: first.recipientUsername,
        transferType: first.transferType,
        initialStatus: first.initialStatus ?? 'completed',
      });
    });
  };

  if (intent === 'request_payment' && (isLoadingRequest || isLoadingFees || !request)) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="small" color="#FFD300" />
        <Text style={styles.loadingText}>Preparing verification...</Text>
      </View>
    );
  }

  if (intent === 'transfer' && transferUsers.length === 0) {
    return (
      <View style={styles.loadingRoot}>
        <Text style={styles.loadingText}>No transfer to verify.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.goBackButton}>
          <Text style={styles.goBackButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (intent === 'withdraw' && !withdrawParams) {
    return (
      <View style={styles.loadingRoot}>
        <Text style={styles.loadingText}>Withdrawal details unavailable.</Text>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.goBackButton}>
          <Text style={styles.goBackButtonText}>Go Back</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.backgroundContainer}>
        <SvgXml xml={backgroundSvg} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} />
      </View>

      <View style={styles.content}>
        <View style={styles.header}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <BackIcon width={24} height={24} />
          </TouchableOpacity>
        </View>

        <View style={styles.transactionSection}>
          <View style={styles.userContainer}>
            <View style={styles.avatarWrapper}>
              <View style={styles.avatarContainer}>
                <Avatar width={64} height={64} />
              </View>
              <View style={styles.badgeIcon}>
                <VerifiedBadge width={20} height={20} />
              </View>
            </View>
            <Text style={styles.username}>{senderUsername}</Text>
          </View>

          <View style={styles.arrowContainer}>
            <BetweenIcon width={54} height={8} />
          </View>

          <View style={styles.userContainer}>
            {intent === 'withdraw' && withdrawParams ? (
              <>
                <View style={styles.avatarWrapper}>
                  <View style={styles.bankIconContainer}>
                    <BankIcon width={64} height={64} />
                  </View>
                </View>
                <Text style={styles.username}>
                  {maskAccountNumber(withdrawParams.accountNumberMasked)}
                </Text>
              </>
            ) : intent === 'transfer' && isFromList ? (
              <>
                <View style={styles.avatarWrapper}>
                  <View style={styles.listIconContainer}>
                    <Text style={styles.listEmojiText}>{listEmoji}</Text>
                  </View>
                </View>
                <Text style={styles.username}>{listName}</Text>
              </>
            ) : intent === 'transfer' && isMultipleUsers ? (
              <>
                <View style={styles.groupAvatarWrapper}>
                  {transferUsers.slice(0, 3).map((user, index) => {
                    const GroupAvatarComponent = getAvatarComponent(
                      typeof user.avatarIndex === 'number'
                        ? user.avatarIndex
                        : avatarIndexFromSeed(user.recipientUsername)
                    );
                    return (
                      <View
                        key={`${user.recipientUsername}-${index}`}
                        style={[
                          styles.groupAvatar,
                          index === 1 && { left: 36, zIndex: 1 },
                          index === 2 && { left: 72, zIndex: 2 },
                        ]}
                      >
                        <GroupAvatarComponent width={64} height={64} />
                      </View>
                    );
                  })}
                </View>
                <Text style={styles.username}>
                  {`${firstTransferUser?.recipientUsername || 'User'}...+${
                    transferUsers.length - 1
                  } users`}
                </Text>
              </>
            ) : intent === 'request_payment' ? (
              <>
                <View style={styles.avatarWrapper}>
                  <View style={styles.avatarContainer}>
                    <RequestReceiverAvatar width={64} height={64} />
                  </View>
                </View>
                <Text style={styles.username}>{requestReceiverUsername}</Text>
              </>
            ) : (
              <>
                <View style={styles.avatarWrapper}>
                  <View style={styles.avatarContainer}>
                    <PrimaryReceiverAvatar width={64} height={64} />
                  </View>
                </View>
                <Text style={styles.username}>
                  {firstTransferUser?.recipientUsername || 'Transfa User'}
                </Text>
              </>
            )}
          </View>
        </View>

        <View style={styles.amountContainer}>
          <Text style={styles.amountText}>{formatCurrency(totalAmount)}</Text>
        </View>

        <View style={styles.pinSection}>
          <Text style={styles.pinPrompt}>
            {intent === 'withdraw'
              ? 'Enter PIN to Withdraw'
              : intent === 'request_payment'
                ? 'Enter PIN to Pay'
                : 'Enter PIN to Pay'}
          </Text>
          <View style={styles.pinInputContainer}>
            {pin.map((digit, index) => (
              <View key={index} style={styles.pinInput}>
                <TextInput
                  ref={(ref) => {
                    pinInputRefs.current[index] = ref;
                  }}
                  style={styles.pinInputText}
                  value={digit}
                  onChangeText={(value) => {
                    handlePinChange(value, index);
                  }}
                  onKeyPress={({ nativeEvent }) => handlePinKeyPress(nativeEvent.key, index)}
                  keyboardType="number-pad"
                  keyboardAppearance="dark"
                  maxLength={1}
                  secureTextEntry={false}
                  textAlign="center"
                  autoFocus={index === 0}
                  placeholder="—"
                  placeholderTextColor="#6C6B6B"
                  selectionColor="#FFD300"
                />
              </View>
            ))}
          </View>
          <TouchableOpacity
            style={styles.switchModeButton}
            onPress={() => {
              if (isSubmitting) {
                return;
              }
              handleBiometricVerify();
            }}
          >
            <Text style={styles.switchModeText}>
              {intent === 'withdraw' ? 'Withdraw with Biometrics' : 'Pay with Biometrics'}
            </Text>
          </TouchableOpacity>
        </View>

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </View>

      <Modal visible={modalVisible} transparent animationType="none" onRequestClose={() => {}}>
        <View style={styles.modalOverlay}>
          <Animated.View style={[styles.modalContent, modalAnimatedStyle]}>
            {modalStatus === 'processing' ? (
              <View style={styles.successContent}>
                <View style={styles.successIconContainer}>
                  <Image
                    source={ProcessIllustration}
                    style={styles.successIllustration}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.successTitle}>Processing</Text>
                <Text style={styles.successMessage}>Your transfer is processing</Text>
              </View>
            ) : (
              <View style={styles.successContent}>
                <View style={styles.successIconContainer}>
                  <Image
                    source={require('@/assets/images/a.png')}
                    style={styles.successIllustration}
                    resizeMode="contain"
                  />
                </View>
                <Text style={styles.successTitle}>{result?.title || 'Success!'}</Text>
                <Text style={styles.successMessage}>
                  {result?.message || 'Your transaction was successful.'}
                </Text>
                <TouchableOpacity style={styles.doneButton} onPress={handleDone}>
                  <Text style={styles.doneButtonText}>Done</Text>
                </TouchableOpacity>
                {(result?.receipts.length ?? 0) > 0 ? (
                  <TouchableOpacity style={styles.viewReceiptButton} onPress={handleViewReceipt}>
                    <Text style={styles.viewReceiptText}>
                      {result && result.receipts.length > 1 ? 'View Receipts' : 'View Receipt'}
                    </Text>
                  </TouchableOpacity>
                ) : null}
              </View>
            )}
          </Animated.View>
        </View>
      </Modal>
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
  content: {
    flex: 1,
    zIndex: 1,
    paddingHorizontal: 20,
    paddingTop: 20,
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  loadingText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  goBackButton: {
    marginTop: 10,
    paddingVertical: 10,
    paddingHorizontal: 18,
    borderRadius: 10,
    backgroundColor: '#FFD300',
  },
  goBackButtonText: {
    color: '#000000',
    fontSize: 14,
    fontFamily: 'Montserrat_700Bold',
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 40,
  },
  backButton: {
    padding: 4,
  },
  transactionSection: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 32,
  },
  userContainer: {
    alignItems: 'center',
    flex: 1,
  },
  avatarWrapper: {
    position: 'relative',
    marginBottom: 12,
  },
  avatarContainer: {
    width: 80,
    height: 80,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    overflow: 'hidden',
  },
  bankIconContainer: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFD300',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFE5F0',
    overflow: 'hidden',
  },
  listIconContainer: {
    width: 70,
    height: 70,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#FFFFFF',
    overflow: 'hidden',
  },
  listEmojiText: {
    fontSize: 48,
  },
  badgeIcon: {
    position: 'absolute',
    bottom: -2,
    right: -2,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  username: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
    textAlign: 'center',
  },
  arrowContainer: {
    width: 60,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 8,
  },
  groupAvatarWrapper: {
    marginBottom: 12,
    position: 'relative',
    height: 80,
    width: 160,
    flexDirection: 'row',
    justifyContent: 'flex-start',
    alignItems: 'center',
  },
  groupAvatar: {
    width: 80,
    height: 80,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#FFD300',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#1A1A1A',
    position: 'absolute',
  },
  amountContainer: {
    alignItems: 'center',
    marginBottom: 8,
  },
  amountText: {
    fontSize: 48,
    color: '#FFFFFF',
    fontFamily: 'ArtificTrial-Semibold',
    textAlign: 'center',
  },
  pinSection: {
    alignItems: 'center',
  },
  pinPrompt: {
    fontSize: 18,
    color: '#6C6B6B',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 24,
    textAlign: 'center',
  },
  pinInputContainer: {
    flexDirection: 'row',
    gap: 16,
    marginBottom: 32,
    justifyContent: 'center',
  },
  pinInput: {
    width: 60,
    height: 60,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.04)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinInputText: {
    fontSize: 24,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
    width: '100%',
    textAlign: 'center',
    letterSpacing: 2,
  },
  switchModeButton: {
    paddingVertical: 12,
  },
  switchModeText: {
    fontSize: 16,
    color: '#FFD300',
    fontFamily: 'Montserrat_400Regular',
  },
  errorText: {
    marginTop: 20,
    textAlign: 'center',
    color: '#FF7A7A',
    fontFamily: 'Montserrat_400Regular',
    fontSize: 13,
    paddingHorizontal: 12,
  },
  modalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.85)',
    justifyContent: 'flex-end',
  },
  modalContent: {
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingBottom: 20,
    paddingHorizontal: 24,
    alignItems: 'center',
  },
  successContent: {
    alignItems: 'center',
    width: '100%',
    minHeight: SCREEN_HEIGHT * 0.5,
    justifyContent: 'center',
  },
  successIconContainer: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  successIllustration: {
    width: 300,
    height: 300,
  },
  successTitle: {
    fontSize: 32,
    color: '#000000',
    fontFamily: 'Montserrat_700Bold',
    marginTop: -50,
    marginBottom: 10,
    textAlign: 'center',
  },
  successMessage: {
    fontSize: 18,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 18,
    textAlign: 'center',
  },
  doneButton: {
    backgroundColor: '#000000',
    borderRadius: 12,
    paddingVertical: 18,
    paddingHorizontal: 24,
    minWidth: 130,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  doneButtonText: {
    fontSize: 20,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_700Bold',
  },
  viewReceiptButton: {
    paddingVertical: 12,
  },
  viewReceiptText: {
    fontSize: 18,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
    textDecorationLine: 'underline',
  },
});

export default PaymentVerificationScreen;

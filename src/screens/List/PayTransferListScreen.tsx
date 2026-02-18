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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import ReactNativeBiometrics from 'react-native-biometrics';

import {
  useAccountBalance,
  useBulkP2PTransfer,
  useGetTransferList,
  useTransactionFees,
  useUserProfile,
} from '@/api/transactionApi';
import type { AppNavigationProp } from '@/types/navigation';
import type { AppStackParamList } from '@/navigation/AppStack';
import type { BulkP2PTransferResponse } from '@/types/api';
import { useSecurityStore } from '@/store/useSecurityStore';
import { formatCurrency, nairaToKobo } from '@/utils/formatCurrency';
import { normalizeUsername, usernameKey } from '@/utils/username';

const BRAND_YELLOW = '#FFD300';
const BG_BOTTOM = '#050607';
const rnBiometrics = new ReactNativeBiometrics();

type ScreenRoute = RouteProp<AppStackParamList, 'PayTransferList'>;
type ListTransferResultState = {
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
  failures: BulkP2PTransferResponse['failed_transfers'];
};

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

const amountInputFromKobo = (amount: number) => {
  if (!amount || amount <= 0) {
    return '';
  }
  return (amount / 100).toFixed(2);
};

const isValidNarration = (value: string) => {
  const len = value.trim().length;
  return len >= 3 && len <= 100;
};

const PayTransferListScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const route = useRoute<ScreenRoute>();
  const { listId } = route.params;

  const { data: list, isLoading: isLoadingList } = useGetTransferList(listId);
  const { data: profile } = useUserProfile();
  const { data: balance } = useAccountBalance();
  const { data: fees } = useTransactionFees();

  const [globalAmountInput, setGlobalAmountInput] = useState('');
  const [narrationInput, setNarrationInput] = useState('');
  const [memberAmounts, setMemberAmounts] = useState<Record<string, number>>({});

  const [selectedMemberID, setSelectedMemberID] = useState<string | null>(null);
  const [editAmountInput, setEditAmountInput] = useState('');

  const [authVisible, setAuthVisible] = useState(false);
  const [authMode, setAuthMode] = useState<'pin' | 'biometric'>('pin');
  const [pinValue, setPinValue] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isProcessingVisible, setProcessingVisible] = useState(false);
  const [resultState, setResultState] = useState<ListTransferResultState | null>(null);

  const pinInputRef = useRef<TextInput | null>(null);

  const { biometricsEnabled, getPin } = useSecurityStore();
  const bulkTransferMutation = useBulkP2PTransfer();

  const feePerTransfer = fees?.p2p_fee_kobo ?? 0;

  useEffect(() => {
    if (!list?.members) {
      return;
    }

    const globalAmount = parseAmountInputToKobo(globalAmountInput);
    setMemberAmounts((prev) => {
      const next: Record<string, number> = {};
      list.members.forEach((member) => {
        if (typeof prev[member.user_id] === 'number') {
          next[member.user_id] = prev[member.user_id];
        } else {
          next[member.user_id] = globalAmount;
        }
      });
      return next;
    });
  }, [globalAmountInput, list?.members]);

  useEffect(() => {
    if (!authVisible || authMode !== 'pin') {
      return;
    }

    const timer = setTimeout(() => {
      pinInputRef.current?.focus();
    }, 120);

    return () => clearTimeout(timer);
  }, [authMode, authVisible]);

  const members = useMemo(() => list?.members ?? [], [list?.members]);

  const totalAmount = useMemo(() => {
    return members.reduce((sum, member) => sum + (memberAmounts[member.user_id] ?? 0), 0);
  }, [memberAmounts, members]);

  const validTransferCount = useMemo(() => {
    return members.filter((member) => (memberAmounts[member.user_id] ?? 0) > 0).length;
  }, [memberAmounts, members]);

  const totalFee = validTransferCount * feePerTransfer;
  const total = totalAmount + totalFee;

  const applyGlobalAmount = (input: string) => {
    setGlobalAmountInput(input);
    const amount = parseAmountInputToKobo(input);

    setMemberAmounts(() => {
      const next: Record<string, number> = {};
      members.forEach((member) => {
        next[member.user_id] = amount;
      });
      return next;
    });
  };

  const openMemberEditor = (memberID: string) => {
    setSelectedMemberID(memberID);
    setEditAmountInput(amountInputFromKobo(memberAmounts[memberID] ?? 0));
  };

  const saveMemberAmount = () => {
    if (!selectedMemberID) {
      return;
    }

    const amount = parseAmountInputToKobo(editAmountInput);
    setMemberAmounts((prev) => ({
      ...prev,
      [selectedMemberID]: amount,
    }));
    setSelectedMemberID(null);
    setEditAmountInput('');
  };

  const buildTransfersPayload = () => {
    return members.map((member) => ({
      member,
      amount: memberAmounts[member.user_id] ?? 0,
      description: narrationInput.trim(),
    }));
  };

  const buildReceiptsFromBulkResponse = (
    response: BulkP2PTransferResponse,
    transferPayload: ReturnType<typeof buildTransfersPayload>
  ) => {
    const failedSet = new Set(
      response.failed_transfers.map((failure) => usernameKey(failure.recipient_username))
    );

    const successfulPayloadItems = transferPayload.filter(
      (item) => !failedSet.has(usernameKey(item.member.username))
    );

    return response.successful_transfers.map((transaction, index) => {
      const item = successfulPayloadItems[index];
      return {
        transactionId: transaction.transaction_id,
        amount: transaction.amount ?? item?.amount ?? 0,
        fee: transaction.fee ?? feePerTransfer,
        description: item?.description ?? '',
        recipientUsername: normalizeUsername(item?.member.username ?? ''),
      };
    });
  };

  const submitTransfer = async (pin: string) => {
    const narration = narrationInput.trim();
    const transferPayload = buildTransfersPayload();

    if (!isValidNarration(narration)) {
      setFormError('Narration must be between 3 and 100 characters.');
      return;
    }

    if (transferPayload.some((item) => item.amount <= 0)) {
      setFormError('Set an amount for every user in the list.');
      return;
    }

    if ((balance?.available_balance ?? 0) < total) {
      setFormError('Insufficient balance for this transfer.');
      return;
    }

    setFormError(null);
    setAuthError(null);
    setProcessingVisible(true);

    try {
      const response = await bulkTransferMutation.mutateAsync({
        transaction_pin: pin,
        transfers: transferPayload.map((item) => ({
          recipient_username: normalizeUsername(item.member.username),
          amount: item.amount,
          description: item.description,
        })),
      });

      const receipts = buildReceiptsFromBulkResponse(response, transferPayload);

      setAuthVisible(false);
      setPinValue('');
      setAuthMode('pin');

      if (response.status === 'completed') {
        setResultState({
          type: 'success',
          title: 'Success!',
          message: 'Your transaction was successful.',
          receipts,
          failures: response.failed_transfers,
        });
        return;
      }

      if (response.status === 'partial_failed') {
        setResultState({
          type: 'partial',
          title: 'Partially Completed',
          message: 'Some transfers failed. Review receipts for details.',
          receipts,
          failures: response.failed_transfers,
        });
        return;
      }

      setResultState({
        type: 'failure',
        title: 'Transfer Failed',
        message:
          response.failed_transfers[0]?.error || response.message || 'No transfer succeeded.',
        receipts,
        failures: response.failed_transfers,
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Could not process transfer.';
      const normalized = message.toLowerCase();
      if (normalized.includes('invalid transaction pin') || normalized.includes('unauthorized')) {
        setAuthError('Wrong PIN. Please try again.');
      } else if (normalized.includes('temporarily locked') || normalized.includes('too many')) {
        setAuthError('PIN is temporarily locked. Please wait and try again.');
      } else {
        setAuthError(message);
      }
    } finally {
      await new Promise((resolve) => setTimeout(resolve, 800));
      setProcessingVisible(false);
    }
  };

  const handlePinInput = async (value: string) => {
    const normalized = value.replace(/[^0-9]/g, '').slice(0, 4);
    setPinValue(normalized);

    if (normalized.length === 4 && !bulkTransferMutation.isPending) {
      await submitTransfer(normalized);
    }
  };

  const handleBiometricSubmit = async () => {
    setAuthError(null);

    if (!biometricsEnabled) {
      setAuthError('Biometrics is disabled. Enable it in settings.');
      return;
    }

    try {
      const { available, biometryType } = await rnBiometrics.isSensorAvailable();
      if (!available || !biometryType) {
        setAuthError('Biometric authentication is not available on this device.');
        return;
      }

      const { success } = await rnBiometrics.simplePrompt({
        promptMessage: 'Verify to approve transfer',
        cancelButtonText: 'Cancel',
      });

      if (!success) {
        setAuthError('Biometric verification was cancelled.');
        return;
      }

      const pin = await getPin();
      if (!pin) {
        setAuthError('PIN is required for biometrics. Use PIN instead.');
        return;
      }

      await submitTransfer(pin);
    } catch {
      setAuthError('Biometric verification failed.');
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
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#ECECEC" />
        </TouchableOpacity>

        <View style={styles.headerRow}>
          <View>
            <Text style={styles.username}>{normalizeUsername(profile?.username || 'user')}</Text>
            <Text style={styles.balanceLabel}>AVAILABLE BALANCE</Text>
            <Text style={styles.balanceAmount}>
              {formatCurrency(balance?.available_balance ?? 0)}
            </Text>
          </View>
        </View>

        <View style={styles.listCard}>
          <Text style={styles.listCardLabel}>List</Text>
          <Text style={styles.listCardName}>{list?.name || 'Loading...'}</Text>
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Amount</Text>
          <TextInput
            style={styles.input}
            value={globalAmountInput}
            onChangeText={applyGlobalAmount}
            keyboardType="decimal-pad"
            placeholder="Enter amount"
            placeholderTextColor="#6E7076"
          />
        </View>

        <View style={styles.fieldWrap}>
          <Text style={styles.fieldLabel}>Narration</Text>
          <TextInput
            style={styles.input}
            value={narrationInput}
            onChangeText={setNarrationInput}
            placeholder="Add narration"
            placeholderTextColor="#6E7076"
          />
        </View>

        {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

        <ScrollView
          style={[styles.memberScroll, members.length > 2 && styles.memberScrollFixed]}
          contentContainerStyle={styles.memberScrollContent}
          showsVerticalScrollIndicator={false}
        >
          {isLoadingList ? (
            <ActivityIndicator size="small" color={BRAND_YELLOW} />
          ) : (
            members.map((member) => {
              const clean = normalizeUsername(member.username);
              const amount = memberAmounts[member.user_id] ?? 0;
              return (
                <TouchableOpacity
                  key={member.user_id}
                  style={styles.memberCard}
                  activeOpacity={0.9}
                  onPress={() => openMemberEditor(member.user_id)}
                >
                  <View style={styles.memberInfo}>
                    <View style={styles.memberAvatar}>
                      <Text style={styles.memberAvatarInitial}>
                        {clean.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>
                    <View style={styles.memberTextWrap}>
                      <Text style={styles.memberUsername}>{clean}</Text>
                      <Text style={styles.memberFullName}>
                        {member.full_name || 'Transfa User'}
                      </Text>
                    </View>
                  </View>

                  <Text style={styles.memberAmount}>{formatCurrency(amount)}</Text>
                </TouchableOpacity>
              );
            })
          )}
        </ScrollView>

        <View style={styles.summaryCard}>
          <Text style={styles.summaryTitle}>Summary</Text>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Amount</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totalAmount)}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Transaction fee</Text>
            <Text style={styles.summaryValue}>{formatCurrency(totalFee)}</Text>
          </View>
          <View style={styles.summaryDivider} />
          <View style={styles.summaryRow}>
            <Text style={styles.summaryTotalLabel}>Total</Text>
            <Text style={styles.summaryTotalValue}>{formatCurrency(total)}</Text>
          </View>
        </View>

        <TouchableOpacity
          style={[
            styles.confirmButton,
            (members.length === 0 || bulkTransferMutation.isPending) &&
              styles.confirmButtonDisabled,
          ]}
          disabled={members.length === 0 || bulkTransferMutation.isPending}
          onPress={() => {
            setAuthVisible(true);
            setAuthMode('pin');
          }}
        >
          <Text style={styles.confirmButtonText}>Confirm</Text>
        </TouchableOpacity>
      </SafeAreaView>

      <Modal visible={selectedMemberID !== null} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.amountEditorCard}>
            <Text style={styles.amountEditorTitle}>Adjust amount</Text>
            <TextInput
              style={styles.amountEditorInput}
              value={editAmountInput}
              onChangeText={setEditAmountInput}
              keyboardType="decimal-pad"
              placeholder="Enter amount"
              placeholderTextColor="#777980"
              autoFocus
            />
            <View style={styles.modalActions}>
              <TouchableOpacity
                style={styles.cancelButton}
                onPress={() => setSelectedMemberID(null)}
              >
                <Text style={styles.cancelButtonText}>Cancel</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.saveAmountButton} onPress={saveMemberAmount}>
                <Text style={styles.saveAmountButtonText}>Save</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      <Modal
        visible={authVisible}
        transparent
        animationType="fade"
        onRequestClose={() => setAuthVisible(false)}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.modalBackdrop}
        >
          <View style={styles.authCard}>
            <View style={styles.authIdentityRow}>
              <View style={styles.authUserNode}>
                <View style={styles.authUserAvatar}>
                  <Text style={styles.authUserInitial}>
                    {normalizeUsername(profile?.username || 'u')
                      .slice(0, 1)
                      .toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.authUserLabel}>
                  {normalizeUsername(profile?.username || 'you')}
                </Text>
              </View>

              <Ionicons name="arrow-forward" size={16} color="#A8AAB0" />

              <View style={styles.authUserNode}>
                <View style={[styles.authUserAvatar, { backgroundColor: '#F4DDB5' }]}>
                  <Text style={styles.authUserInitial}>
                    {(list?.name || 'L').slice(0, 1).toUpperCase()}
                  </Text>
                </View>
                <Text style={styles.authUserLabel}>{list?.name || 'List'}</Text>
              </View>
            </View>

            <Text style={styles.authAmount}>{formatCurrency(total)}</Text>

            {authMode === 'pin' ? (
              <>
                <Text style={styles.authSubtitle}>Enter PIN to Pay</Text>
                <Pressable style={styles.pinRow} onPress={() => pinInputRef.current?.focus()}>
                  {[0, 1, 2, 3].map((index) => (
                    <View key={index} style={styles.pinBox}>
                      <Text style={styles.pinBoxText}>{pinValue[index] || '-'}</Text>
                    </View>
                  ))}
                </Pressable>

                <TextInput
                  ref={pinInputRef}
                  style={styles.hiddenInput}
                  value={pinValue}
                  onChangeText={handlePinInput}
                  keyboardType="number-pad"
                  maxLength={4}
                  secureTextEntry
                />

                <TouchableOpacity onPress={() => setAuthMode('biometric')}>
                  <Text style={styles.altAction}>Pay with Biometrics</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <TouchableOpacity style={styles.bioButton} onPress={handleBiometricSubmit}>
                  <Text style={styles.bioButtonText}>Verify Biometrics</Text>
                </TouchableOpacity>
                <TouchableOpacity onPress={() => setAuthMode('pin')}>
                  <Text style={styles.altAction}>Pay with PIN</Text>
                </TouchableOpacity>
              </>
            )}

            {authError ? <Text style={styles.authError}>{authError}</Text> : null}

            <TouchableOpacity
              style={styles.closeAuthButton}
              onPress={() => {
                if (bulkTransferMutation.isPending) {
                  return;
                }
                setAuthVisible(false);
                setPinValue('');
                setAuthError(null);
                setAuthMode('pin');
              }}
            >
              <Text style={styles.closeAuthButtonText}>Close</Text>
            </TouchableOpacity>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <Modal visible={isProcessingVisible} transparent animationType="fade">
        <View style={styles.modalBackdrop}>
          <View style={styles.processingCard}>
            <ActivityIndicator size="large" color={BRAND_YELLOW} />
            <Text style={styles.processingTitle}>Processing</Text>
            <Text style={styles.processingText}>Your transfer is processing</Text>
          </View>
        </View>
      </Modal>

      <Modal
        visible={!!resultState}
        transparent
        animationType="fade"
        onRequestClose={() => setResultState(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.resultCard}>
            <View style={styles.resultIconWrap}>
              <Ionicons
                name={resultState?.type === 'failure' ? 'close-circle' : 'checkmark-circle'}
                size={62}
                color={resultState?.type === 'failure' ? '#EA5959' : BRAND_YELLOW}
              />
            </View>

            <Text style={styles.resultTitle}>{resultState?.title ?? 'Success!'}</Text>
            <Text style={styles.resultMessage}>
              {resultState?.message ?? 'Your transaction was successful.'}
            </Text>

            <TouchableOpacity
              style={styles.resultDoneButton}
              onPress={() => {
                setResultState(null);
                navigation.navigate('AppTabs', { screen: 'Home' });
              }}
            >
              <Text style={styles.resultDoneButtonText}>Done</Text>
            </TouchableOpacity>

            {(resultState?.receipts.length ?? 0) > 0 || (resultState?.failures.length ?? 0) > 0 ? (
              <TouchableOpacity
                onPress={() => {
                  if (!resultState) {
                    return;
                  }
                  setResultState(null);
                  navigation.navigate('MultiTransferReceipts', {
                    receipts: resultState.receipts,
                    failures: resultState.failures,
                  });
                }}
              >
                <Text style={styles.viewReceiptsText}>
                  {resultState
                    ? resultState.receipts.length > 1
                      ? 'View Receipts'
                      : resultState.receipts.length === 1
                        ? 'View Receipt'
                        : resultState.failures.length > 1
                          ? 'View Failures'
                          : 'View Failure'
                    : 'View Details'}
                </Text>
              </TouchableOpacity>
            ) : null}
          </View>
        </View>
      </Modal>
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
    paddingHorizontal: 16,
    paddingBottom: 14,
  },
  backButton: {
    width: 28,
    marginTop: 4,
  },
  headerRow: {
    marginTop: 8,
  },
  username: {
    color: '#ECEDEF',
    fontSize: 16,
    fontWeight: '700',
  },
  balanceLabel: {
    marginTop: 10,
    color: '#A4A7AD',
    fontSize: 12,
    letterSpacing: 0.4,
  },
  balanceAmount: {
    marginTop: 2,
    color: '#F5F5F7',
    fontSize: 34,
    fontWeight: '700',
  },
  listCard: {
    marginTop: 10,
    borderRadius: 10,
    padding: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  listCardLabel: {
    color: '#9EA0A6',
    fontSize: 12,
  },
  listCardName: {
    marginTop: 2,
    color: '#ECEDEF',
    fontSize: 18,
    fontWeight: '700',
  },
  fieldWrap: {
    marginTop: 10,
  },
  fieldLabel: {
    color: '#D3D5DA',
    fontSize: 16,
    marginBottom: 5,
  },
  input: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    color: '#ECEDEF',
    paddingHorizontal: 12,
    fontSize: 15,
  },
  errorText: {
    marginTop: 8,
    color: '#E05D5D',
    fontSize: 13,
  },
  memberScroll: {
    marginTop: 10,
  },
  memberScrollFixed: {
    maxHeight: 176,
  },
  memberScrollContent: {
    gap: 8,
    paddingBottom: 6,
  },
  memberCard: {
    minHeight: 74,
    borderRadius: 10,
    backgroundColor: '#F2F2F3',
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  memberInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  memberAvatar: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: '#F3ABA7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  memberAvatarInitial: {
    color: '#111214',
    fontSize: 15,
    fontWeight: '800',
  },
  memberTextWrap: {
    marginLeft: 10,
    flex: 1,
  },
  memberUsername: {
    color: '#17181B',
    fontSize: 17,
    fontWeight: '700',
  },
  memberFullName: {
    marginTop: 1,
    color: '#65676D',
    fontSize: 13,
  },
  memberAmount: {
    color: '#1A1B1D',
    fontSize: 15,
    fontWeight: '700',
  },
  summaryCard: {
    marginTop: 10,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  summaryTitle: {
    color: '#D8B926',
    fontSize: 16,
    fontWeight: '700',
    marginBottom: 4,
  },
  summaryRow: {
    minHeight: 24,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  summaryLabel: {
    color: '#ACAFB5',
    fontSize: 13,
  },
  summaryValue: {
    color: '#ECEEF1',
    fontSize: 13,
    fontWeight: '600',
  },
  summaryDivider: {
    marginVertical: 3,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.18)',
  },
  summaryTotalLabel: {
    color: '#F5F5F7',
    fontSize: 16,
    fontWeight: '700',
  },
  summaryTotalValue: {
    color: '#F5F5F7',
    fontSize: 18,
    fontWeight: '700',
  },
  confirmButton: {
    marginTop: 10,
    height: 48,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonDisabled: {
    opacity: 0.55,
  },
  confirmButtonText: {
    color: '#111214',
    fontSize: 18,
    fontWeight: '700',
  },
  modalBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.58)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  amountEditorCard: {
    width: '100%',
    borderRadius: 12,
    backgroundColor: '#FFFFFF',
    padding: 14,
  },
  amountEditorTitle: {
    color: '#151619',
    fontSize: 17,
    fontWeight: '700',
  },
  amountEditorInput: {
    marginTop: 10,
    borderWidth: 1,
    borderColor: '#D4D6DA',
    borderRadius: 9,
    height: 42,
    paddingHorizontal: 12,
    color: '#111214',
  },
  modalActions: {
    marginTop: 12,
    flexDirection: 'row',
    gap: 10,
  },
  cancelButton: {
    flex: 1,
    height: 42,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#D3D4D8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelButtonText: {
    color: '#2A2D32',
    fontSize: 15,
    fontWeight: '600',
  },
  saveAmountButton: {
    flex: 1,
    height: 42,
    borderRadius: 9,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  saveAmountButtonText: {
    color: '#111214',
    fontSize: 15,
    fontWeight: '700',
  },
  authCard: {
    width: '100%',
    borderRadius: 16,
    backgroundColor: '#0E1013',
    borderWidth: 1,
    borderColor: '#1A1D22',
    padding: 16,
    alignItems: 'center',
  },
  authIdentityRow: {
    width: '100%',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  authUserNode: {
    alignItems: 'center',
    width: 96,
  },
  authUserAvatar: {
    width: 46,
    height: 46,
    borderRadius: 14,
    backgroundColor: '#ABABFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authUserInitial: {
    color: '#111214',
    fontSize: 17,
    fontWeight: '800',
  },
  authUserLabel: {
    marginTop: 4,
    color: '#D8DADE',
    fontSize: 12,
    textAlign: 'center',
  },
  authAmount: {
    marginTop: 12,
    color: '#F4F5F7',
    fontSize: 38,
    fontWeight: '700',
  },
  authSubtitle: {
    marginTop: 3,
    color: '#8D9096',
    fontSize: 20,
  },
  pinRow: {
    marginTop: 14,
    width: '100%',
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 10,
  },
  pinBox: {
    width: 44,
    height: 46,
    borderRadius: 9,
    backgroundColor: '#1D2025',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBoxText: {
    color: '#E9EAED',
    fontSize: 18,
    fontWeight: '600',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  bioButton: {
    marginTop: 18,
    width: '100%',
    height: 48,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bioButtonText: {
    color: '#111214',
    fontSize: 18,
    fontWeight: '700',
  },
  altAction: {
    marginTop: 16,
    color: '#D6B614',
    fontSize: 17,
    fontWeight: '500',
  },
  authError: {
    marginTop: 8,
    color: '#E35C5C',
    fontSize: 14,
    textAlign: 'center',
  },
  closeAuthButton: {
    marginTop: 14,
  },
  closeAuthButtonText: {
    color: '#C8CAD0',
    fontSize: 13,
    fontWeight: '600',
  },
  processingCard: {
    width: '80%',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    paddingVertical: 20,
  },
  processingTitle: {
    marginTop: 10,
    color: '#121315',
    fontSize: 20,
    fontWeight: '700',
  },
  processingText: {
    marginTop: 4,
    color: '#666A71',
    fontSize: 16,
  },
  resultCard: {
    width: '86%',
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 16,
    paddingVertical: 18,
    alignItems: 'center',
  },
  resultIconWrap: {
    marginTop: 4,
  },
  resultTitle: {
    marginTop: 12,
    color: '#121315',
    fontSize: 26,
    fontWeight: '700',
    textAlign: 'center',
  },
  resultMessage: {
    marginTop: 6,
    color: '#5E6168',
    fontSize: 16,
    textAlign: 'center',
  },
  resultDoneButton: {
    marginTop: 14,
    width: '72%',
    height: 46,
    borderRadius: 10,
    backgroundColor: '#0C0D10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resultDoneButtonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
  },
  viewReceiptsText: {
    marginTop: 12,
    color: '#111214',
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

export default PayTransferListScreen;

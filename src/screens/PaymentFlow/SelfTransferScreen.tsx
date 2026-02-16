import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { useFocusEffect, useNavigation } from '@react-navigation/native';

import { useListBeneficiaries } from '@/api/accountApi';
import {
  useAccountBalance,
  useSelfTransfer,
  useTransactionFees,
  useUserProfile,
} from '@/api/transactionApi';
import type { Beneficiary } from '@/types/api';
import type { AppNavigationProp } from '@/types/navigation';
import { useSecurityStore } from '@/store/useSecurityStore';
import { formatCurrency, nairaToKobo } from '@/utils/formatCurrency';

const BRAND_YELLOW = '#FFD300';
const BG_BOTTOM = '#050607';
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BORDER = 'rgba(255,255,255,0.06)';

const rnBiometrics = new ReactNativeBiometrics();

type ResultState = {
  type: 'success' | 'failure';
  title: string;
  message: string;
  transactionId?: string;
  amount?: number;
  fee?: number;
  description?: string;
};

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

const buildWithdrawalDescription = (beneficiary: Beneficiary): string => {
  const bankName = beneficiary.bank_name?.trim();
  if (!bankName) {
    return 'Wallet withdrawal';
  }
  const value = `Wallet withdrawal to ${bankName}`;
  return value.slice(0, 100);
};

const SelfTransferScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const pinInputRef = useRef<TextInput | null>(null);

  const [amountInput, setAmountInput] = useState('');
  const [selectedBeneficiaryId, setSelectedBeneficiaryId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [isAuthVisible, setAuthVisible] = useState(false);
  const [authMode, setAuthMode] = useState<'pin' | 'biometric'>('pin');
  const [pinValue, setPinValue] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);

  const [isProcessingVisible, setProcessingVisible] = useState(false);
  const [resultState, setResultState] = useState<ResultState | null>(null);

  const { getPin, biometricsEnabled } = useSecurityStore();

  const { data: userProfile } = useUserProfile();
  const {
    data: balanceData,
    isLoading: isLoadingBalance,
    refetch: refetchBalance,
  } = useAccountBalance();
  const { data: feeData } = useTransactionFees();

  const {
    data: beneficiariesData,
    isLoading: isLoadingBeneficiaries,
    error: beneficiariesError,
    refetch: refetchBeneficiaries,
  } = useListBeneficiaries();

  const selfTransfer = useSelfTransfer();

  const isSubmitting = selfTransfer.isPending;
  const transferFeeKobo = feeData?.self_fee_kobo ?? 0;
  const amountKobo = useMemo(() => parseAmountInputToKobo(amountInput), [amountInput]);
  const totalKobo = amountKobo + transferFeeKobo;
  const availableBalance = balanceData?.available_balance ?? 0;
  const linkedAccounts = useMemo(() => beneficiariesData ?? [], [beneficiariesData]);

  const selectedBeneficiary = useMemo(
    () => linkedAccounts.find((account) => account.id === selectedBeneficiaryId) ?? null,
    [linkedAccounts, selectedBeneficiaryId]
  );

  useFocusEffect(
    useCallback(() => {
      refetchBeneficiaries();
      refetchBalance();
    }, [refetchBalance, refetchBeneficiaries])
  );

  useEffect(() => {
    if (linkedAccounts.length === 0) {
      setSelectedBeneficiaryId(null);
      return;
    }

    if (!selectedBeneficiaryId) {
      setSelectedBeneficiaryId(linkedAccounts[0].id);
      return;
    }

    const stillExists = linkedAccounts.some((account) => account.id === selectedBeneficiaryId);
    if (!stillExists) {
      setSelectedBeneficiaryId(linkedAccounts[0].id);
    }
  }, [linkedAccounts, selectedBeneficiaryId]);

  useEffect(() => {
    if (isAuthVisible && authMode === 'pin') {
      const timer = setTimeout(() => pinInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [isAuthVisible, authMode]);

  const closeAuthModal = () => {
    if (isSubmitting) {
      return;
    }
    setAuthVisible(false);
    setAuthMode('pin');
    setPinValue('');
    setAuthError(null);
  };

  const resolveDevelopmentPin = async () => {
    const stored = await getPin();
    if (stored && stored.length === 4) {
      return stored;
    }
    return process.env.EXPO_PUBLIC_DEV_TRANSACTION_PIN || '0000';
  };

  const runWithdrawalSubmission = async (transactionPin: string) => {
    if (!selectedBeneficiary) {
      setFormError('Select a destination account.');
      return;
    }

    const description = buildWithdrawalDescription(selectedBeneficiary);

    setAuthError(null);
    setProcessingVisible(true);

    try {
      const response = await selfTransfer.mutateAsync({
        beneficiary_id: selectedBeneficiary.id,
        amount: amountKobo,
        description,
        transaction_pin: transactionPin,
      });

      setAuthVisible(false);
      setAmountInput('');
      setFormError(null);

      setResultState({
        type: 'success',
        title: 'Success!',
        message: 'Your transaction was successful.',
        transactionId: response.transaction_id,
        amount: amountKobo,
        fee: response.fee ?? transferFeeKobo,
        description,
      });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : 'Withdrawal failed. Please try again.';
      const normalized = message.toLowerCase();

      if (normalized.includes('invalid transaction pin') || normalized.includes('unauthorized')) {
        setAuthError('Wrong PIN. Please try again.');
        return;
      }
      if (normalized.includes('pin is not set')) {
        setAuthVisible(false);
        navigation.navigate('CreatePin');
        return;
      }
      if (normalized.includes('temporarily locked') || normalized.includes('too many')) {
        setAuthError('PIN is temporarily locked. Please wait and try again.');
        return;
      }

      setAuthVisible(false);
      setResultState({
        type: 'failure',
        title: 'Transfer Failed',
        message,
      });
    } finally {
      setProcessingVisible(false);
      setPinValue('');
    }
  };

  const handlePinValueChange = async (value: string) => {
    const normalized = value.replace(/[^0-9]/g, '').slice(0, 4);
    setPinValue(normalized);
    setAuthError(null);

    if (normalized.length === 4 && !isSubmitting) {
      await runWithdrawalSubmission(normalized);
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
        promptMessage: 'Verify to continue withdrawal',
        cancelButtonText: 'Cancel',
      });
      if (!success) {
        setAuthError('Biometric verification was cancelled.');
        return;
      }

      const pin = await getPin();
      if (!pin) {
        setAuthError('PIN is required for biometric withdrawal. Use PIN instead.');
        return;
      }

      await runWithdrawalSubmission(pin);
    } catch {
      setAuthError('Biometric verification failed. Use PIN instead.');
    }
  };

  const validateBeforeConfirm = (): string | null => {
    if (!selectedBeneficiary) {
      return 'Select a destination account.';
    }
    if (amountKobo <= 0) {
      return 'Enter a valid amount.';
    }
    if (totalKobo > availableBalance) {
      return 'Amount plus fee exceeds your available balance.';
    }
    return null;
  };

  const handleConfirm = async () => {
    const validationError = validateBeforeConfirm();
    if (validationError) {
      setFormError(validationError);
      return;
    }

    setFormError(null);
    const shouldSkipPrompt = process.env.EXPO_PUBLIC_SKIP_PIN_CHECK === 'true';
    if (shouldSkipPrompt) {
      const devPin = await resolveDevelopmentPin();
      await runWithdrawalSubmission(devPin);
      return;
    }

    setPinValue('');
    setAuthError(null);
    setAuthMode('pin');
    setAuthVisible(true);
  };

  const currentUserDisplay = stripUsernamePrefix(userProfile?.username) || 'you';
  const selectedAccountMask = selectedBeneficiary?.account_number_masked || 'No account';
  const selectedAccountName = selectedBeneficiary?.account_name || 'No account selected';
  const canConfirm = !!selectedBeneficiary && amountKobo > 0 && totalKobo <= availableBalance;

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
                  <Text style={styles.balanceValue}>{formatCurrency(availableBalance)}</Text>
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
                style={styles.segmentButton}
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="swap-horizontal-outline" size={15} color="#DADADA" />
                <Text style={styles.segmentText}>Transfer</Text>
              </TouchableOpacity>
              <TouchableOpacity
                activeOpacity={0.85}
                style={[styles.segmentButton, styles.segmentButtonActive]}
              >
                <Ionicons name="wallet-outline" size={15} color="#DADADA" />
                <Text style={styles.segmentText}>Withdraw</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.divider} />

            <Text style={styles.fieldLabel}>Amount</Text>
            <View style={styles.fieldWrap}>
              <Ionicons name="cash-outline" size={15} color="#D2D2D4" />
              <TextInput
                style={styles.fieldInput}
                value={amountInput}
                onChangeText={(value) => {
                  setAmountInput(value.replace(/[^0-9.]/g, ''));
                  setFormError(null);
                }}
                placeholder="Amount"
                placeholderTextColor="#8D8D90"
                keyboardType="decimal-pad"
              />
            </View>

            <View style={styles.destinationHeaderRow}>
              <Text style={styles.fieldLabel}>Account destination</Text>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('AppTabs', {
                    screen: 'Settings',
                    params: { screen: 'AddBeneficiary' },
                  })
                }
                style={styles.linkAccountButton}
              >
                <Ionicons name="add-outline" size={14} color={BRAND_YELLOW} />
                <Text style={styles.linkAccountText}>Link New Account</Text>
              </TouchableOpacity>
            </View>

            {isLoadingBeneficiaries ? (
              <View style={styles.loadingDestinationWrap}>
                <ActivityIndicator size="small" color={BRAND_YELLOW} />
              </View>
            ) : linkedAccounts.length === 0 ? (
              <View style={styles.emptyDestinationCard}>
                <Text style={styles.emptyDestinationTitle}>No linked account</Text>
                <Text style={styles.emptyDestinationText}>
                  Add a destination account to continue with withdrawals.
                </Text>
              </View>
            ) : (
              <View style={styles.destinationList}>
                {linkedAccounts.map((account) => {
                  const isSelected = account.id === selectedBeneficiaryId;
                  return (
                    <TouchableOpacity
                      key={account.id}
                      style={[styles.destinationCard, isSelected && styles.destinationCardSelected]}
                      onPress={() => {
                        setSelectedBeneficiaryId(account.id);
                        setFormError(null);
                      }}
                      activeOpacity={0.85}
                    >
                      <View style={styles.destinationTopRow}>
                        <Text style={styles.destinationName} numberOfLines={1}>
                          {account.account_name}
                        </Text>
                        {isSelected ? (
                          <Ionicons name="checkmark-circle" size={16} color={BRAND_YELLOW} />
                        ) : null}
                      </View>
                      <Text style={styles.destinationMask}>{account.account_number_masked}</Text>
                      <Text style={styles.destinationBank}>{account.bank_name}</Text>
                    </TouchableOpacity>
                  );
                })}
              </View>
            )}

            {beneficiariesError ? (
              <Text style={styles.errorText}>{beneficiariesError.message}</Text>
            ) : null}
            {formError ? <Text style={styles.errorText}>{formError}</Text> : null}

            <View style={styles.summarySection}>
              <Text style={styles.summaryTitle}>Summary</Text>
              <View style={[styles.summaryCard, !canConfirm && styles.summaryCardMuted]}>
                <SummaryRow label="Amount" value={formatCurrency(amountKobo)} />
                <SummaryRow label="Transaction fee" value={formatCurrency(transferFeeKobo)} />
                <View style={styles.summaryDivider} />
                <SummaryRow label="Total" value={formatCurrency(totalKobo)} isTotal />
              </View>
            </View>
          </ScrollView>

          <View style={styles.bottomActions}>
            <TouchableOpacity
              style={[styles.confirmButton, (!canConfirm || isSubmitting) && styles.buttonDisabled]}
              onPress={handleConfirm}
              disabled={!canConfirm || isSubmitting}
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
                <View style={styles.authAvatarDestination}>
                  <Ionicons name="card-outline" size={21} color="#111" />
                </View>
                <Text style={styles.authIdentityLabel} numberOfLines={1}>
                  {selectedAccountMask}
                </Text>
              </View>
            </View>

            <Text style={styles.authAmount}>{formatCurrency(totalKobo)}</Text>

            {authMode === 'pin' ? (
              <>
                <Text style={styles.authSubtitle}>Enter PIN to Withdraw</Text>

                <Pressable style={styles.pinBoxesRow} onPress={() => pinInputRef.current?.focus()}>
                  {[0, 1, 2, 3].map((index) => (
                    <View key={index} style={styles.pinBox}>
                      <Text style={styles.pinBoxText}>{pinValue[index] ? '•' : '-'}</Text>
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
                  <Text style={styles.authLinkText}>Withdraw with Biometrics</Text>
                </TouchableOpacity>
              </>
            ) : (
              <>
                <Text style={styles.authSubtitle}>{selectedAccountName}</Text>
                <Ionicons
                  name="scan-circle-outline"
                  size={38}
                  color="#DFDFDF"
                  style={styles.biometricIcon}
                />
                <TouchableOpacity
                  style={[styles.biometricVerifyButton, isSubmitting && styles.buttonDisabled]}
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
                  <Text style={styles.authLinkText}>Withdraw with PIN</Text>
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

            <TouchableOpacity
              style={styles.resultDoneButton}
              onPress={() => {
                setResultState(null);
                navigation.navigate('AppTabs', { screen: 'Home' });
              }}
            >
              <Text style={styles.resultDoneButtonText}>Done</Text>
            </TouchableOpacity>

            {resultState?.type === 'success' && resultState.transactionId ? (
              <TouchableOpacity
                onPress={() => {
                  if (!resultState || resultState.type !== 'success' || !resultState.transactionId) {
                    return;
                  }
                  const txId = resultState.transactionId;
                  const amount = resultState.amount ?? 0;
                  const fee = resultState.fee ?? transferFeeKobo;
                  const description = resultState.description ?? 'Wallet withdrawal';
                  setResultState(null);
                  navigation.navigate('TransferStatus', {
                    transactionId: txId,
                    amount,
                    fee,
                    description,
                    transferType: 'self_transfer',
                  });
                }}
              >
                <Text style={styles.resultReceiptText}>View Receipt</Text>
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
    paddingBottom: 130,
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
  fieldLabel: {
    marginTop: 12,
    marginBottom: 6,
    color: '#D4D4D6',
    fontSize: 13,
    fontWeight: '500',
  },
  fieldWrap: {
    height: 42,
    borderRadius: 8,
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  fieldInput: {
    flex: 1,
    color: '#ECECEC',
    fontSize: 14,
    paddingVertical: 0,
  },
  destinationHeaderRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  linkAccountButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingVertical: 4,
  },
  linkAccountText: {
    color: BRAND_YELLOW,
    fontSize: 12,
    fontWeight: '600',
  },
  loadingDestinationWrap: {
    marginTop: 14,
    alignItems: 'center',
  },
  emptyDestinationCard: {
    marginTop: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#2F3135',
    paddingHorizontal: 12,
    paddingVertical: 12,
  },
  emptyDestinationTitle: {
    color: '#D8D8DA',
    fontSize: 13,
    fontWeight: '600',
  },
  emptyDestinationText: {
    marginTop: 4,
    color: '#8A8B8F',
    fontSize: 12,
  },
  destinationList: {
    marginTop: 8,
    gap: 8,
  },
  destinationCard: {
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 10,
    paddingVertical: 10,
  },
  destinationCardSelected: {
    borderColor: BRAND_YELLOW,
  },
  destinationTopRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  destinationName: {
    color: '#ECECEE',
    fontSize: 13,
    fontWeight: '600',
    flex: 1,
    marginRight: 8,
  },
  destinationMask: {
    marginTop: 2,
    color: '#C6C7CA',
    fontSize: 12,
    fontWeight: '500',
  },
  destinationBank: {
    marginTop: 2,
    color: '#8E9095',
    fontSize: 11,
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
  confirmButtonText: {
    color: '#111213',
    fontSize: 18,
    fontWeight: '700',
  },
  buttonDisabled: {
    opacity: 0.45,
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
  authAvatarDestination: {
    width: 48,
    height: 48,
    borderRadius: 14,
    backgroundColor: '#F3ABA7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  authIdentityLabel: {
    color: '#CFCFD1',
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
    maxWidth: 110,
    textAlign: 'center',
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
    paddingHorizontal: 18,
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

export default SelfTransferScreen;

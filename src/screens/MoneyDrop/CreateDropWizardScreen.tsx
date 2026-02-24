import React, { useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useAccountBalance, useCreateMoneyDrop, useTransactionFees } from '@/api/transactionApi';
import PinInputModal from '@/components/PinInputModal';
import { useSecureAction } from '@/hooks/useSecureAction';
import { formatCurrency, nairaToKobo } from '@/utils/formatCurrency';
import type { AppNavigationProp } from '@/types/navigation';

const BRAND_YELLOW = '#FFD300';
const BG_BOTTOM = '#050607';
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BORDER = 'rgba(255,255,255,0.07)';

const MIN_TITLE_LENGTH = 3;
const MAX_TITLE_LENGTH = 80;
const MIN_PASSWORD_LENGTH = 4;
const MAX_PASSWORD_LENGTH = 64;
const MIN_EXPIRY_MINUTES = 1;
const MAX_EXPIRY_MINUTES = 1440;

const parseNairaTextToKobo = (raw: string): number => {
  const cleaned = raw.replace(/[^0-9.]/g, '');
  const parsed = Number.parseFloat(cleaned);
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0;
  }
  return nairaToKobo(parsed);
};

const formatPercent = (value: number): string => {
  if (!Number.isFinite(value)) {
    return '0%';
  }
  const isWhole = Number.isInteger(value);
  return `${value.toFixed(isWhole ? 0 : 2)}%`;
};

const CreateDropWizardScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const [title, setTitle] = useState('');
  const [totalAmountInput, setTotalAmountInput] = useState('');
  const [numberOfPeopleInput, setNumberOfPeopleInput] = useState('');
  const [expiryMinutesInput, setExpiryMinutesInput] = useState('60');

  const [lockDrop, setLockDrop] = useState(false);
  const [passwordDraft, setPasswordDraft] = useState('');
  const [savedPassword, setSavedPassword] = useState('');
  const [showSavedPassword, setShowSavedPassword] = useState(false);
  const [isEditingPassword, setIsEditingPassword] = useState(false);

  const { data: balanceData } = useAccountBalance();
  const { data: feeData } = useTransactionFees();
  const {
    isModalVisible,
    error: pinError,
    triggerSecureAction,
    handlePinSuccess,
    clearError: clearPinError,
    closeModal,
  } = useSecureAction();

  const { mutate: createMoneyDrop, isPending: isCreating } = useCreateMoneyDrop({
    onSuccess: (data) => {
      navigation.replace('MoneyDropSuccess', {
        dropDetails: data,
        lockPassword: lockDrop ? savedPassword : undefined,
      });
    },
    onError: (error) => {
      const normalized = (error.message || '').toLowerCase();
      if (normalized.includes('pin is not set')) {
        Alert.alert('Transaction PIN Required', 'Please create your transaction PIN to continue.', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Set PIN', onPress: () => navigation.navigate('CreatePin') },
        ]);
        return;
      }
      Alert.alert('Create MoneyDrop Failed', error.message || 'Could not create money drop.');
    },
  });

  const parsedTitle = title.trim();
  const totalAmountKobo = useMemo(() => parseNairaTextToKobo(totalAmountInput), [totalAmountInput]);
  const numberOfPeople = useMemo(
    () => Number.parseInt(numberOfPeopleInput, 10) || 0,
    [numberOfPeopleInput]
  );
  const expiryInMinutes = useMemo(
    () => Number.parseInt(expiryMinutesInput, 10) || 0,
    [expiryMinutesInput]
  );

  const amountPerPersonKobo = useMemo(() => {
    if (totalAmountKobo <= 0 || numberOfPeople <= 0) {
      return 0;
    }
    if (totalAmountKobo % numberOfPeople !== 0) {
      return 0;
    }
    return totalAmountKobo / numberOfPeople;
  }, [totalAmountKobo, numberOfPeople]);

  const moneyDropFeePercent = feeData?.money_drop_fee_percent ?? 0;
  const fallbackFlatFee = feeData?.money_drop_fee_kobo ?? 0;
  const moneyDropFeeKobo = useMemo(() => {
    if (totalAmountKobo <= 0) {
      return 0;
    }
    if (moneyDropFeePercent > 0) {
      return Math.round((totalAmountKobo * moneyDropFeePercent) / 100);
    }
    return fallbackFlatFee;
  }, [fallbackFlatFee, moneyDropFeePercent, totalAmountKobo]);
  const displayFeePercent = useMemo(() => {
    if (moneyDropFeePercent > 0) {
      return moneyDropFeePercent;
    }
    if (totalAmountKobo > 0 && moneyDropFeeKobo > 0) {
      return (moneyDropFeeKobo / totalAmountKobo) * 100;
    }
    return 0;
  }, [moneyDropFeeKobo, moneyDropFeePercent, totalAmountKobo]);
  const totalRequiredKobo = totalAmountKobo + moneyDropFeeKobo;

  const lockPasswordToSubmit = lockDrop ? savedPassword : '';
  const canSavePassword = useMemo(() => {
    const trimmed = passwordDraft.trim();
    return trimmed.length >= MIN_PASSWORD_LENGTH && trimmed.length <= MAX_PASSWORD_LENGTH;
  }, [passwordDraft]);

  const validateForm = (): string | null => {
    if (parsedTitle.length < MIN_TITLE_LENGTH || parsedTitle.length > MAX_TITLE_LENGTH) {
      return 'Title must be between 3 and 80 characters.';
    }
    if (totalAmountKobo <= 0) {
      return 'Enter a valid total money drop amount.';
    }
    if (numberOfPeople <= 0) {
      return 'Number of people must be greater than zero.';
    }
    if (expiryInMinutes < MIN_EXPIRY_MINUTES || expiryInMinutes > MAX_EXPIRY_MINUTES) {
      return 'Expiry time must be between 1 and 1440 minutes.';
    }
    if (totalAmountKobo % numberOfPeople !== 0) {
      return 'Total amount must divide equally by number of people.';
    }
    if (lockDrop) {
      if (isEditingPassword) {
        return 'Save your drop password before creating the money drop.';
      }
      const password = lockPasswordToSubmit.trim();
      if (password.length < MIN_PASSWORD_LENGTH || password.length > MAX_PASSWORD_LENGTH) {
        return 'Drop password must be between 4 and 64 characters.';
      }
    }
    if (balanceData && balanceData.available_balance < totalRequiredKobo) {
      return `Insufficient balance. You need ${formatCurrency(totalRequiredKobo)} to proceed.`;
    }
    return null;
  };

  const saveDropPassword = () => {
    const trimmed = passwordDraft.trim();
    if (trimmed.length < MIN_PASSWORD_LENGTH || trimmed.length > MAX_PASSWORD_LENGTH) {
      Alert.alert('Invalid Password', 'Drop password must be between 4 and 64 characters.');
      return;
    }
    setSavedPassword(trimmed);
    setPasswordDraft('');
    setIsEditingPassword(false);
    setShowSavedPassword(false);
  };

  const onToggleLockDrop = (enabled: boolean) => {
    setLockDrop(enabled);
    if (!enabled) {
      setPasswordDraft('');
      setSavedPassword('');
      setShowSavedPassword(false);
      setIsEditingPassword(false);
    }
  };

  const openConfirmAndCreate = () => {
    const validationError = validateForm();
    if (validationError) {
      Alert.alert('Invalid MoneyDrop', validationError);
      return;
    }

    Alert.alert(
      'Proceed With MoneyDrop?',
      `You will move ${formatCurrency(totalAmountKobo)} to your MoneyDrop account and pay ${formatCurrency(moneyDropFeeKobo)} as fee.\n\nIf you do not already have a MoneyDrop account, one will be created for you automatically.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Yes, Proceed',
          style: 'default',
          onPress: () => {
            triggerSecureAction((transactionPin: string) =>
              createMoneyDrop({
                title: parsedTitle,
                total_amount: totalAmountKobo,
                number_of_people: numberOfPeople,
                expiry_in_minutes: expiryInMinutes,
                lock_drop: lockDrop,
                lock_password: lockDrop ? lockPasswordToSubmit : undefined,
                transaction_pin: transactionPin,
              })
            );
          },
        },
      ]
    );
  };

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
          style={styles.flex}
        >
          <ScrollView
            showsVerticalScrollIndicator={false}
            contentContainerStyle={styles.scrollContent}
          >
            <View style={styles.topRow}>
              <TouchableOpacity
                activeOpacity={0.8}
                style={styles.backButton}
                onPress={() => navigation.goBack()}
              >
                <Ionicons name="arrow-back" size={24} color="#F4F4F5" />
              </TouchableOpacity>
            </View>

            <View style={styles.infoCard}>
              <View style={styles.infoHeader}>
                <Ionicons name="shield-checkmark" size={20} color={BRAND_YELLOW} />
                <Text style={styles.infoTitle}>Secure MoneyDrop</Text>
              </View>

              <View style={styles.infoRow}>
                <Ionicons name="lock-closed-outline" size={17} color="#8A8E95" />
                <Text style={styles.infoText}>
                  Funds are stored in a dedicated secure account separate from your main wallet
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="share-social-outline" size={17} color="#8A8E95" />
                <Text style={styles.infoText}>
                  Share via QR code or link and claimers receive instantly to their account
                </Text>
              </View>
              <View style={styles.infoRow}>
                <Ionicons name="time-outline" size={17} color="#8A8E95" />
                <Text style={styles.infoText}>
                  Auto-refund on expiry. Unclaimed funds return to your wallet automatically
                </Text>
              </View>
            </View>

            <View style={styles.separator} />

            <Text style={styles.fieldLabel}>Title</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="e.g December Giveaway"
              placeholderTextColor="#686C73"
              value={title}
              onChangeText={setTitle}
              maxLength={MAX_TITLE_LENGTH}
            />

            <Text style={styles.fieldLabel}>Total MoneyDrop Amount (₦)</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="Enter total amount"
              placeholderTextColor="#686C73"
              value={totalAmountInput}
              onChangeText={setTotalAmountInput}
              keyboardType="decimal-pad"
            />

            <Text style={styles.fieldLabel}>Number of people</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="e.g 15"
              placeholderTextColor="#686C73"
              value={numberOfPeopleInput}
              onChangeText={setNumberOfPeopleInput}
              keyboardType="number-pad"
            />
            <Text style={styles.helperText}>
              Amount per Person{' '}
              <Text style={styles.helperHighlight}>
                {amountPerPersonKobo > 0 ? formatCurrency(amountPerPersonKobo) : '—'}
              </Text>
            </Text>

            <Text style={styles.fieldLabel}>Expiry Time (Minutes)</Text>
            <TextInput
              style={styles.fieldInput}
              placeholder="e.g 60"
              placeholderTextColor="#686C73"
              value={expiryMinutesInput}
              onChangeText={setExpiryMinutesInput}
              keyboardType="number-pad"
            />

            <View style={styles.lockHeader}>
              <Text style={styles.fieldLabel}>Lock Drop</Text>
              <Switch
                value={lockDrop}
                onValueChange={onToggleLockDrop}
                thumbColor={lockDrop ? '#111315' : '#E8EAEE'}
                trackColor={{ false: '#C9CBD1', true: BRAND_YELLOW }}
              />
            </View>

            {lockDrop && (
              <View style={styles.lockBlock}>
                <View style={styles.lockOptionRow}>
                  <Text style={styles.lockOptionLabel}>Lock Option</Text>
                  <Text style={styles.lockOptionValue}>Password</Text>
                </View>

                {savedPassword && !isEditingPassword ? (
                  <View style={styles.savedPasswordWrap}>
                    <Text style={styles.savedPasswordValue}>
                      {showSavedPassword
                        ? savedPassword
                        : '*'.repeat(Math.max(savedPassword.length, 8))}
                    </Text>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.smallButton}
                      onPress={() => setShowSavedPassword((prev) => !prev)}
                    >
                      <Text style={styles.smallButtonText}>
                        {showSavedPassword ? 'Hide Password' : 'View Password'}
                      </Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      activeOpacity={0.85}
                      style={styles.smallButton}
                      onPress={() => {
                        setIsEditingPassword(true);
                        setPasswordDraft(savedPassword);
                      }}
                    >
                      <Text style={styles.smallButtonText}>Edit Drop Password</Text>
                    </TouchableOpacity>
                  </View>
                ) : (
                  <>
                    <TextInput
                      style={styles.fieldInput}
                      placeholder="Enter password"
                      placeholderTextColor="#686C73"
                      secureTextEntry
                      value={passwordDraft}
                      onChangeText={setPasswordDraft}
                      maxLength={MAX_PASSWORD_LENGTH}
                    />
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={[
                        styles.passwordSaveButton,
                        !canSavePassword && styles.passwordSaveButtonDisabled,
                      ]}
                      disabled={!canSavePassword}
                      onPress={saveDropPassword}
                    >
                      <Text style={styles.passwordSaveButtonText}>Save Drop Password</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            )}

            <View style={styles.separator} />

            <Text style={styles.summaryTitle}>Summary</Text>
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Amount per Person</Text>
                <Text style={styles.summaryValue}>
                  {amountPerPersonKobo > 0 ? formatCurrency(amountPerPersonKobo) : '—'}
                </Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Fees</Text>
                <Text style={styles.summaryValue}>{formatPercent(displayFeePercent)}</Text>
              </View>
              <View style={styles.summaryDivider} />
              <View style={styles.summaryRow}>
                <Text style={styles.summaryTotalLabel}>Total Required</Text>
                <Text style={styles.summaryTotalValue}>{formatCurrency(totalRequiredKobo)}</Text>
              </View>
            </View>

            <TouchableOpacity
              activeOpacity={0.92}
              style={[styles.createDropButton, isCreating && styles.createDropButtonDisabled]}
              onPress={openConfirmAndCreate}
              disabled={isCreating}
            >
              <Text style={styles.createDropButtonText}>
                {isCreating ? 'Creating MoneyDrop...' : 'Create MoneyDrop'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>

      <PinInputModal
        visible={isModalVisible}
        onClose={closeModal}
        onSuccess={handlePinSuccess}
        error={pinError}
        clearError={clearPinError}
      />
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
  },
  flex: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  topRow: {
    marginBottom: 8,
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
  },
  infoCard: {
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(255,255,255,0.03)',
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  infoHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 14,
  },
  infoTitle: {
    color: '#F4F5F7',
    fontSize: 24,
    fontWeight: '700',
    marginLeft: 8,
  },
  infoRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  infoText: {
    flex: 1,
    color: '#888C93',
    fontSize: 15,
    lineHeight: 21,
    marginLeft: 10,
  },
  separator: {
    marginTop: 14,
    marginBottom: 18,
    height: 1,
    backgroundColor: '#51545C',
  },
  fieldLabel: {
    color: '#EDEEF0',
    fontSize: 16,
    marginBottom: 10,
  },
  fieldInput: {
    height: 52,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    color: '#F1F2F4',
    fontSize: 16,
    paddingHorizontal: 14,
    marginBottom: 14,
  },
  helperText: {
    color: '#6E7279',
    fontSize: 14,
    marginTop: -8,
    marginBottom: 14,
    textDecorationLine: 'underline',
  },
  helperHighlight: {
    color: '#ECEDEF',
    textDecorationLine: 'none',
  },
  lockHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  lockBlock: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: 'rgba(255,255,255,0.04)',
    padding: 12,
    marginBottom: 8,
  },
  lockOptionRow: {
    height: 46,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'space-between',
    flexDirection: 'row',
    marginBottom: 12,
  },
  lockOptionLabel: {
    color: '#797D84',
    fontSize: 16,
  },
  lockOptionValue: {
    color: '#E5E7EB',
    fontSize: 16,
    fontWeight: '600',
  },
  passwordSaveButton: {
    height: 52,
    borderRadius: 12,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 2,
  },
  passwordSaveButtonDisabled: {
    opacity: 0.5,
  },
  passwordSaveButtonText: {
    color: '#0A0C0D',
    fontSize: 17,
    fontWeight: '700',
  },
  savedPasswordWrap: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6E7178',
    backgroundColor: CARD_BG,
    padding: 12,
  },
  savedPasswordValue: {
    color: '#F1F2F4',
    fontSize: 16,
    marginBottom: 10,
  },
  smallButton: {
    height: 42,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#6E7178',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
    backgroundColor: 'rgba(0,0,0,0.24)',
  },
  smallButtonText: {
    color: '#D2D5DA',
    fontSize: 16,
    fontWeight: '600',
  },
  summaryTitle: {
    color: BRAND_YELLOW,
    fontSize: 30,
    fontWeight: '700',
    marginBottom: 10,
  },
  summaryCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 12,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  summaryLabel: {
    color: '#7E8289',
    fontSize: 15,
  },
  summaryValue: {
    color: '#ECEDEF',
    fontSize: 15,
    fontWeight: '500',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#5C5F67',
    marginVertical: 4,
  },
  summaryTotalLabel: {
    color: '#8D9198',
    fontSize: 18,
    fontWeight: '700',
  },
  summaryTotalValue: {
    color: '#F5F6F8',
    fontSize: 28,
    fontWeight: '700',
  },
  createDropButton: {
    marginTop: 16,
    height: 56,
    borderRadius: 12,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  createDropButtonDisabled: {
    opacity: 0.75,
  },
  createDropButtonText: {
    color: '#0A0B0D',
    fontSize: 18,
    fontWeight: '700',
  },
});

export default CreateDropWizardScreen;

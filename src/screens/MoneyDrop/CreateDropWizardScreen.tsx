import BackIcon from '@/assets/icons/back.svg';
import CheckmarkIcon from '@/assets/icons/checkmark.svg';
import ClockIcon from '@/assets/icons/clock.svg';
import LinkIcon from '@/assets/icons/link.svg';
import NairaIcon from '@/assets/icons/naira.svg';
import PasswordIcon from '@/assets/icons/password.svg';
import { useAccountBalance, useCreateMoneyDrop, useTransactionFees } from '@/api/transactionApi';
import DashedRectBorder from '@/components/DashedRectBorder';
import PinInputModal from '@/components/PinInputModal';
import { useSecureAction } from '@/hooks/useSecureAction';
import type { AppNavigationProp } from '@/types/navigation';
import { formatCurrency, nairaToKobo } from '@/utils/formatCurrency';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import {
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  LayoutChangeEvent,
  Platform,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
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
  const [bannerSize, setBannerSize] = useState({ width: 0, height: 0 });

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

  const onBannerLayout = (event: LayoutChangeEvent) => {
    const { width, height } = event.nativeEvent.layout;
    setBannerSize({ width, height });
  };

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
    <SafeAreaView style={styles.container}>
      <View style={styles.backgroundContainer}>
        <SvgXml xml={backgroundSvg} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} />
      </View>

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <BackIcon width={24} height={24} />
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={styles.flex}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.bannerWrapper} onLayout={onBannerLayout}>
            {bannerSize.width > 0 ? (
              <DashedRectBorder
                width={bannerSize.width}
                height={bannerSize.height}
                borderRadius={16}
                color="rgba(255, 255, 255, 0.2)"
                borderWidth={1}
                dashCount={30}
              />
            ) : null}

            <View style={styles.bannerContent}>
              <View style={styles.bannerHeader}>
                <View style={styles.shieldIconContainer}>
                  <CheckmarkIcon width={12} height={12} color="#000" />
                </View>
                <Text style={styles.bannerTitle}>Secure MoneyDrop</Text>
              </View>

              <View style={styles.bannerRow}>
                <PasswordIcon width={16} height={16} color="#6C6B6B" />
                <Text style={styles.bannerText}>
                  Funds are stored in a dedicated secure account separate from your main wallet
                </Text>
              </View>

              <View style={styles.bannerRow}>
                <LinkIcon width={16} height={16} color="#6C6B6B" />
                <Text style={styles.bannerText}>
                  Share via QR code or link and claimers receive instantly to their account
                </Text>
              </View>

              <View style={styles.bannerRow}>
                <ClockIcon width={16} height={16} color="#6C6B6B" />
                <Text style={styles.bannerText}>
                  Auto-refund on expiry. Unclaimed funds return to your wallet automatically
                </Text>
              </View>
            </View>
          </View>

          <View style={styles.divider} />

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Title</Text>
            <TextInput
              style={styles.input}
              placeholder="Enter Title"
              placeholderTextColor="#6C6B6B"
              value={title}
              onChangeText={setTitle}
              maxLength={MAX_TITLE_LENGTH}
            />
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Total MoneyDrop Amount</Text>
            <View style={styles.amountInputContainer}>
              <View style={styles.nairaIconBox}>
                <NairaIcon width={14} height={14} color="#FFFFFF" />
              </View>
              <TextInput
                style={styles.amountInput}
                placeholder="Enter Amount"
                placeholderTextColor="#6C6B6B"
                keyboardType="decimal-pad"
                value={totalAmountInput}
                onChangeText={setTotalAmountInput}
              />
            </View>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Number of people</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g 15"
              placeholderTextColor="#6C6B6B"
              keyboardType="number-pad"
              value={numberOfPeopleInput}
              onChangeText={setNumberOfPeopleInput}
            />
            <Text style={styles.inputHint}>
              Amount per Person:{' '}
              <Text style={styles.inputHintValue}>
                {amountPerPersonKobo > 0 ? formatCurrency(amountPerPersonKobo) : '—'}
              </Text>
            </Text>
          </View>

          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Expiry Time (Minutes)</Text>
            <TextInput
              style={styles.input}
              placeholder="e.g 60"
              placeholderTextColor="#6C6B6B"
              keyboardType="number-pad"
              value={expiryMinutesInput}
              onChangeText={setExpiryMinutesInput}
            />
          </View>

          <View style={styles.lockRow}>
            <Text style={styles.lockLabel}>Lock Drop</Text>
            <Switch
              value={lockDrop}
              onValueChange={onToggleLockDrop}
              trackColor={{ false: '#1A1A1A', true: '#FFD300' }}
              thumbColor="#000000"
              style={styles.switchSmall}
            />
          </View>

          {lockDrop ? (
            <View style={styles.lockOptionsContainer}>
              <View style={styles.selectedLockBox}>
                <Text style={styles.selectedLockText}>Lock Option: Password</Text>
              </View>

              <View style={styles.pinSection}>
                {savedPassword && !isEditingPassword ? (
                  <>
                    <Text style={styles.enterPinLabel}>Saved Password</Text>
                    <View style={styles.savedPasswordBox}>
                      <Text style={styles.savedPasswordValue}>
                        {showSavedPassword
                          ? savedPassword
                          : '*'.repeat(Math.max(savedPassword.length, 8))}
                      </Text>
                    </View>

                    <TouchableOpacity
                      style={[styles.savePinButton, styles.editPinButton]}
                      onPress={() => setShowSavedPassword((prev) => !prev)}
                    >
                      <Text style={[styles.savePinButtonText, styles.editPinButtonText]}>
                        {showSavedPassword ? 'Hide Password' : 'View Password'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={[styles.savePinButton, styles.editPinButton]}
                      onPress={() => {
                        setIsEditingPassword(true);
                        setPasswordDraft(savedPassword);
                      }}
                    >
                      <Text style={[styles.savePinButtonText, styles.editPinButtonText]}>
                        Edit Drop Password
                      </Text>
                    </TouchableOpacity>
                  </>
                ) : (
                  <>
                    <Text style={styles.enterPinLabel}>Enter Password</Text>
                    <TextInput
                      style={styles.input}
                      placeholder="Enter password"
                      placeholderTextColor="#6C6B6B"
                      secureTextEntry
                      value={passwordDraft}
                      onChangeText={setPasswordDraft}
                      maxLength={MAX_PASSWORD_LENGTH}
                    />

                    <TouchableOpacity
                      style={[
                        styles.savePinButton,
                        !canSavePassword && styles.savePinButtonDisabled,
                      ]}
                      onPress={saveDropPassword}
                      disabled={!canSavePassword}
                    >
                      <Text style={styles.savePinButtonText}>Save Drop Password</Text>
                    </TouchableOpacity>
                  </>
                )}
              </View>
            </View>
          ) : null}

          <View style={styles.mainDivider} />

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
              <Text style={styles.totalRequiredLabel}>Total Required</Text>
              <Text style={styles.totalRequiredValue}>{formatCurrency(totalRequiredKobo)}</Text>
            </View>
          </View>

          <TouchableOpacity
            style={[styles.createMainButton, isCreating && styles.createMainButtonDisabled]}
            activeOpacity={0.8}
            onPress={openConfirmAndCreate}
            disabled={isCreating}
          >
            <Text style={styles.createMainButtonText}>
              {isCreating ? 'Creating MoneyDrop...' : 'Create MoneyDrop'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <PinInputModal
        visible={isModalVisible}
        onClose={closeModal}
        onSuccess={handlePinSuccess}
        error={pinError}
        clearError={clearPinError}
      />
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
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
    zIndex: 1,
  },
  backButton: {
    padding: 4,
  },
  flex: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  bannerWrapper: {
    position: 'relative',
    paddingVertical: 16,
    paddingHorizontal: 24,
    marginBottom: 24,
  },
  bannerContent: {
    gap: 12,
  },
  bannerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    marginBottom: 4,
  },
  shieldIconContainer: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: '#FFD300',
    alignItems: 'center',
    justifyContent: 'center',
  },
  bannerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_600SemiBold',
  },
  bannerRow: {
    flexDirection: 'row',
    gap: 12,
    alignItems: 'center',
  },
  bannerText: {
    color: '#6C6B6B',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
    flex: 1,
    lineHeight: 18,
  },
  divider: {
    height: 1,
    backgroundColor: '#6C6B6B',
    marginBottom: 24,
  },
  inputGroup: {
    marginBottom: 20,
  },
  inputLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 8,
  },
  input: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  amountInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    height: 56,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  nairaIconBox: {
    paddingLeft: 16,
    paddingRight: 8,
  },
  amountInput: {
    flex: 1,
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
    height: '100%',
  },
  inputHint: {
    color: '#6C6B6B',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
    marginTop: 8,
  },
  inputHintValue: {
    color: '#FFFFFF',
  },
  lockRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  lockLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
  },
  switchSmall: {
    transform: [{ scale: 0.8 }],
    marginRight: -4,
  },
  lockOptionsContainer: {
    marginBottom: 24,
    gap: 12,
  },
  selectedLockBox: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 12,
    paddingHorizontal: 16,
    height: 56,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  selectedLockText: {
    color: '#6B6B6B',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
  },
  pinSection: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: 16,
    padding: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  enterPinLabel: {
    color: '#6C6B6B',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 16,
    textAlign: 'center',
  },
  savedPasswordBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    height: 56,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
    paddingHorizontal: 12,
  },
  savedPasswordValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_600SemiBold',
  },
  savePinButton: {
    backgroundColor: '#FFD300',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 40,
    width: '100%',
    alignItems: 'center',
    marginTop: 8,
  },
  savePinButtonDisabled: {
    opacity: 0.5,
  },
  savePinButtonText: {
    color: '#000000',
    fontSize: 16,
    fontFamily: 'Montserrat_700Bold',
  },
  editPinButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#6C6B6B',
  },
  editPinButtonText: {
    color: '#6C6B6B',
    fontSize: 16,
    fontFamily: 'Montserrat_700Bold',
  },
  mainDivider: {
    height: 1,
    backgroundColor: '#6C6B6B',
    marginVertical: 12,
  },
  summaryTitle: {
    color: '#FFD300',
    fontSize: 18,
    fontFamily: 'Montserrat_700Bold',
    marginBottom: 12,
  },
  summaryCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 32,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 12,
  },
  summaryLabel: {
    color: '#6C6B6B',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
  },
  summaryValue: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
  },
  summaryDivider: {
    height: 1,
    backgroundColor: '#6C6B6B',
    marginBottom: 12,
  },
  totalRequiredLabel: {
    color: '#6C6B6B',
    fontSize: 16,
    fontFamily: 'Montserrat_700Bold',
  },
  totalRequiredValue: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Montserrat_700Bold',
  },
  createMainButton: {
    backgroundColor: '#FFD300',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    marginBottom: 20,
  },
  createMainButtonDisabled: {
    opacity: 0.75,
  },
  createMainButtonText: {
    color: '#000000',
    fontSize: 18,
    fontFamily: 'Montserrat_700Bold',
  },
});

export default CreateDropWizardScreen;

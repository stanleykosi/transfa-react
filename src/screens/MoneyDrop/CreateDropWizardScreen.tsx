/**
 * @description
 * This screen provides a wizard-style interface for users to create a "Money Drop".
 * It showcases the unique features of money drops: separate secure account, fee transparency,
 * and easy distribution. Enhanced UI/UX with feature highlights and comprehensive fee display.
 *
 * @dependencies
 * - react, react-native: For UI components and state management.
 * - @react-navigation/native: For navigation actions.
 * - @/components/*: Reusable UI components.
 * - @/hooks/useSecureAction: For authorizing the transaction with biometrics or PIN.
 * - @/api/transactionApi: For the `useCreateMoneyDrop` mutation hook and fees.
 * - @/utils/formatCurrency: For formatting and parsing currency values.
 */
import React, { useState, useMemo } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { TouchableOpacity } from 'react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import FormInput from '@/components/FormInput';
import PrimaryButton from '@/components/PrimaryButton';
import PinInputModal from '@/components/PinInputModal';
import Card from '@/components/Card';
import { theme } from '@/constants/theme';
import { useCreateMoneyDrop, useAccountBalance, useTransactionFees } from '@/api/transactionApi';
import { useSecureAction } from '@/hooks/useSecureAction';
import { AppNavigationProp } from '@/types/navigation';
import { formatCurrency, nairaToKobo } from '@/utils/formatCurrency';

const CreateDropWizardScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const [amountPerClaim, setAmountPerClaim] = useState('');
  const [numberOfPeople, setNumberOfPeople] = useState('');
  const [expiryInMinutes, setExpiryInMinutes] = useState('60'); // Default to 1 hour

  const { data: balanceData } = useAccountBalance();
  const { data: feesData } = useTransactionFees();
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
      // On success, navigate to a new screen to show the QR code and link
      navigation.replace('MoneyDropSuccess', { dropDetails: data });
    },
    onError: (error) => {
      Alert.alert('Error Creating Drop', error.message || 'An unexpected error occurred.');
    },
  });

  const totalAmount = useMemo(() => {
    const amount = parseFloat(amountPerClaim);
    const people = parseInt(numberOfPeople, 10);
    if (!isNaN(amount) && !isNaN(people) && amount > 0 && people > 0) {
      return amount * people;
    }
    return 0;
  }, [amountPerClaim, numberOfPeople]);

  const moneyDropFee = feesData?.money_drop_fee_kobo || 0;
  const moneyDropFeeNaira = moneyDropFee / 100; // Convert kobo to naira
  const totalWithFee = useMemo(() => {
    return totalAmount > 0 ? totalAmount + moneyDropFeeNaira : 0;
  }, [totalAmount, moneyDropFeeNaira]);

  const handleCreateDrop = () => {
    const amountKobo = nairaToKobo(parseFloat(amountPerClaim));
    const people = parseInt(numberOfPeople, 10);
    const expiry = parseInt(expiryInMinutes, 10);
    const totalAmountKobo = nairaToKobo(totalAmount);
    const totalRequiredKobo = totalAmountKobo + moneyDropFee;

    if (isNaN(amountKobo) || amountKobo <= 0) {
      Alert.alert('Invalid Input', 'Please enter a valid amount per person.');
      return;
    }
    if (isNaN(people) || people <= 0) {
      Alert.alert('Invalid Input', 'Please enter a valid number of people.');
      return;
    }
    if (isNaN(expiry) || expiry <= 0) {
      Alert.alert('Invalid Input', 'Please enter a valid expiry time in minutes.');
      return;
    }
    if (balanceData && balanceData.available_balance < totalRequiredKobo) {
      Alert.alert(
        'Insufficient Funds',
        `You need ${formatCurrency(totalRequiredKobo)} to create this money drop (including ${formatCurrency(moneyDropFee)} fee).`
      );
      return;
    }

    const payload = {
      amount_per_claim: amountKobo,
      number_of_people: people,
      expiry_in_minutes: expiry,
    };

    // Use the secure action hook to get authorization before creating the drop
    triggerSecureAction(() => createMoneyDrop(payload));
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity
          onPress={() => navigation.goBack()}
          style={styles.backButton}
          accessibilityRole="button"
          accessibilityLabel="Go back"
        >
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Create a Money Drop</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.flex}
      >
        <ScrollView
          contentContainerStyle={styles.contentWrapper}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* Feature Highlights Card */}
          <Card style={styles.featuresCard}>
            <View style={styles.featuresHeader}>
              <Ionicons name="shield-checkmark" size={24} color={theme.colors.success} />
              <Text style={styles.featuresTitle}>Secure Money Drop</Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="lock-closed" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.featureText}>
                Funds are stored in a dedicated secure account separate from your main wallet
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="share-social" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.featureText}>
                Share via QR code or link - recipients claim instantly to their account
              </Text>
            </View>
            <View style={styles.featureItem}>
              <Ionicons name="time" size={16} color={theme.colors.textSecondary} />
              <Text style={styles.featureText}>
                Auto-refund if not claimed - your money returns to your wallet automatically
              </Text>
            </View>
          </Card>

          {/* Step 1: Amount per Claim */}
          <FormInput
            label="Amount per Person (₦)"
            value={amountPerClaim}
            onChangeText={setAmountPerClaim}
            placeholder="e.g., 500"
            keyboardType="numeric"
          />

          {/* Step 2: Number of People */}
          <FormInput
            label="Number of People"
            value={numberOfPeople}
            onChangeText={setNumberOfPeople}
            placeholder="e.g., 10"
            keyboardType="number-pad"
          />

          {/* Step 3: Expiry Time */}
          <FormInput
            label="Expiry Time (minutes)"
            value={expiryInMinutes}
            onChangeText={setExpiryInMinutes}
            placeholder="e.g., 60 for 1 hour"
            keyboardType="number-pad"
          />

          {/* Summary Card */}
          {totalAmount > 0 && (
            <Card style={styles.summaryCard}>
              <Text style={styles.summaryTitle}>Payment Summary</Text>

              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Total Amount:</Text>
                <Text style={styles.summaryValue}>{formatCurrency(nairaToKobo(totalAmount))}</Text>
              </View>

              {moneyDropFee > 0 && (
                <View style={styles.summaryRow}>
                  <View style={styles.feeRow}>
                    <Text style={styles.summaryLabel}>Creation Fee:</Text>
                    <Ionicons
                      name="information-circle-outline"
                      size={16}
                      color={theme.colors.textSecondary}
                    />
                  </View>
                  <Text style={styles.summaryFee}>
                    {formatCurrency(nairaToKobo(moneyDropFeeNaira))}
                  </Text>
                </View>
              )}

              <View style={styles.summaryDivider} />

              <View style={styles.summaryRow}>
                <Text style={styles.summaryTotalLabel}>Total Required:</Text>
                <Text style={styles.summaryTotalValue}>
                  {formatCurrency(nairaToKobo(totalWithFee))}
                </Text>
              </View>

              {balanceData && (
                <View style={styles.balanceRow}>
                  <Text style={styles.balanceLabel}>Available Balance:</Text>
                  <Text
                    style={[
                      styles.balanceValue,
                      balanceData.available_balance < nairaToKobo(totalWithFee) &&
                        styles.balanceInsufficient,
                    ]}
                  >
                    {formatCurrency(balanceData.available_balance)}
                  </Text>
                </View>
              )}
            </Card>
          )}

          <View style={styles.buttonContainer}>
            <PrimaryButton
              title="Create Money Drop"
              onPress={handleCreateDrop}
              isLoading={isCreating}
              disabled={totalAmount <= 0}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>

      <PinInputModal
        visible={isModalVisible}
        onClose={closeModal}
        onSuccess={handlePinSuccess}
        error={pinError}
        clearError={clearPinError}
      />
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingBottom: theme.spacing.s24,
  },
  backButton: {
    padding: theme.spacing.s4,
  },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
  },
  flex: {
    flex: 1,
  },
  contentWrapper: {
    paddingTop: theme.spacing.s16,
    paddingBottom: theme.spacing.s80,
  },
  featuresCard: {
    marginBottom: theme.spacing.s20,
    padding: theme.spacing.s16,
  },
  featuresHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: theme.spacing.s16,
  },
  featuresTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginLeft: theme.spacing.s8,
  },
  featureItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: theme.spacing.s12,
  },
  featureText: {
    flex: 1,
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginLeft: theme.spacing.s8,
    lineHeight: 20,
  },
  summaryCard: {
    marginTop: theme.spacing.s16,
    padding: theme.spacing.s16,
  },
  summaryTitle: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.s12,
  },
  summaryLabel: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
  },
  summaryValue: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeights.semibold,
  },
  feeRow: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  summaryFee: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
  },
  summaryDivider: {
    height: 1,
    backgroundColor: theme.colors.border,
    marginVertical: theme.spacing.s12,
  },
  summaryTotalLabel: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
  },
  summaryTotalValue: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.primary,
  },
  balanceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: theme.spacing.s12,
    paddingTop: theme.spacing.s12,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
  },
  balanceLabel: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
  },
  balanceValue: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.success,
    fontWeight: theme.fontWeights.semibold,
  },
  balanceInsufficient: {
    color: theme.colors.error,
  },
  buttonContainer: {
    marginTop: theme.spacing.s32,
  },
});

export default CreateDropWizardScreen;

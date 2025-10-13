/**
 * @description
 * This screen provides the user interface for the "Self Transfer" flow, which allows
 * a user to withdraw funds from their Transfa wallet to a linked external bank account.
 *
 * Key features:
 * - Displays the user's Transfa wallet balance as the source.
 * - Uses `useListBeneficiaries` and the `BeneficiaryDropdown` component to select a destination.
 * - Secure action authorization using biometrics or PIN via `useSecureAction`.
 * - Integration with `useSelfTransfer` mutation to handle the backend API call.
 * - Clear display of transaction fees before confirmation.
 * - Robust handling of loading, success, and error states.
 *
 * @dependencies
 * - react, react-native: For UI components and state management.
 * - @react-navigation/native: For navigation actions.
 * - @/components/*: Reusable UI components, including the new `BeneficiaryDropdown`.
 * - @/hooks/useSecureAction: For authorizing the transaction.
 * - @/api/accountApi: For listing beneficiaries.
 * - @/api/transactionApi: For the self-transfer mutation hook.
 * - @/utils/formatCurrency: For displaying currency values.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  TouchableOpacity,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ScreenWrapper from '@/components/ScreenWrapper';
import FormInput from '@/components/FormInput';
import PrimaryButton from '@/components/PrimaryButton';
import { theme } from '@/constants/theme';
import { useSecureAction } from '@/hooks/useSecureAction';
import { useSelfTransfer, useAccountBalance } from '@/api/transactionApi';
import { useListBeneficiaries } from '@/api/accountApi';
import PinInputModal from '@/components/PinInputModal';
import { Ionicons } from '@expo/vector-icons';
import { Beneficiary } from '@/types/api';
import BeneficiaryDropdown from '@/components/BeneficiaryDropdown';
import { formatCurrency, nairaToKobo } from '@/utils/formatCurrency';

const SelfTransferScreen = () => {
  const navigation = useNavigation();
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<Beneficiary | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  // Fetch real wallet balance
  const { data: accountBalance, isLoading: isLoadingBalance } = useAccountBalance();
  const walletBalanceInKobo = accountBalance?.available_balance || 0;

  const {
    data: beneficiaries,
    isLoading: isLoadingBeneficiaries,
    error: beneficiariesError,
  } = useListBeneficiaries();

  const {
    isModalVisible,
    error: pinError,
    triggerSecureAction,
    handlePinSuccess,
    clearError: clearPinError,
    closeModal,
  } = useSecureAction();

  const { mutate: sendWithdrawal, isPending: isSending } = useSelfTransfer({
    onSuccess: (data) => {
      Alert.alert(
        'Withdrawal Initiated',
        `Your withdrawal is being processed. Transaction ID: ${data.transaction_id}`,
        [
          {
            text: 'OK',
            onPress: () => navigation.goBack(),
          },
        ]
      );
    },
    onError: (error) => {
      Alert.alert(
        'Withdrawal Failed',
        error.message || 'An error occurred while processing your withdrawal. Please try again.'
      );
    },
  });

  const handleWithdrawal = () => {
    const amountInKobo = nairaToKobo(parseFloat(amount));

    if (!selectedBeneficiary) {
      Alert.alert('Invalid Input', 'Please select a destination account.');
      return;
    }

    if (!amount.trim() || isNaN(amountInKobo) || amountInKobo <= 0) {
      Alert.alert('Invalid Input', 'Please enter a valid amount.');
      return;
    }

    if (amountInKobo > walletBalanceInKobo) {
      Alert.alert('Insufficient Funds', 'The amount exceeds your wallet balance.');
      return;
    }

    const action = () => {
      sendWithdrawal({
        beneficiary_id: selectedBeneficiary.id,
        amount: amountInKobo,
        description: description.trim() || undefined,
      });
    };

    triggerSecureAction(action);
  };

  const amountInKobo = nairaToKobo(parseFloat(amount)) || 0;
  // TODO: Fetch fee dynamically from API.
  const feeInKobo = 1000; // ₦10.00 fee
  const totalAmountInKobo = amountInKobo + feeInKobo;

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
        <Text style={styles.title}>Self Transfer</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <View style={styles.accountCard}>
            <Text style={styles.accountLabel}>From</Text>
            <Text style={styles.accountName}>Transfa Wallet</Text>
            {isLoadingBalance ? (
              <Text style={styles.accountBalance}>Loading balance...</Text>
            ) : (
              <Text style={styles.accountBalance}>
                Balance: {formatCurrency(walletBalanceInKobo)}
              </Text>
            )}
          </View>

          <BeneficiaryDropdown
            beneficiaries={beneficiaries || []}
            selectedBeneficiary={selectedBeneficiary}
            onSelectBeneficiary={setSelectedBeneficiary}
            isLoading={isLoadingBeneficiaries}
            error={beneficiariesError?.message}
          />

          <FormInput
            label="Amount to Withdraw (₦)"
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="numeric"
          />

          <FormInput
            label="Description (Optional)"
            value={description}
            onChangeText={setDescription}
            placeholder="e.g., Savings"
            multiline
            numberOfLines={2}
          />

          {amountInKobo > 0 && (
            <View style={styles.summaryCard}>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Amount</Text>
                <Text style={styles.summaryValue}>{formatCurrency(amountInKobo)}</Text>
              </View>
              <View style={styles.summaryRow}>
                <Text style={styles.summaryLabel}>Withdrawal Fee</Text>
                <Text style={styles.summaryValue}>{formatCurrency(feeInKobo)}</Text>
              </View>
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.summaryTotalLabel}>Total to be Debited</Text>
                <Text style={styles.summaryTotalValue}>{formatCurrency(totalAmountInKobo)}</Text>
              </View>
            </View>
          )}

          <PrimaryButton
            title="Withdraw Funds"
            onPress={handleWithdrawal}
            isLoading={isSending}
            disabled={!selectedBeneficiary || !amount.trim() || isSending}
          />
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
  keyboardView: {
    flex: 1,
  },
  container: {
    flexGrow: 1,
    paddingTop: theme.spacing.s16,
  },
  accountCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.md,
    padding: theme.spacing.s16,
    marginBottom: theme.spacing.s16,
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  accountLabel: {
    fontSize: theme.fontSizes.sm,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.s4,
  },
  accountName: {
    fontSize: theme.fontSizes.lg,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
  },
  accountBalance: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    marginTop: theme.spacing.s4,
  },
  summaryCard: {
    backgroundColor: theme.colors.surface,
    borderRadius: theme.radii.lg,
    padding: theme.spacing.s16,
    marginBottom: theme.spacing.s24,
    borderWidth: 1,
    borderColor: theme.colors.border,
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
    fontWeight: theme.fontWeights.medium,
  },
  totalRow: {
    borderTopWidth: 1,
    borderColor: theme.colors.border,
    paddingTop: theme.spacing.s12,
    marginBottom: 0,
  },
  summaryTotalLabel: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeights.bold,
  },
  summaryTotalValue: {
    fontSize: theme.fontSizes.lg,
    color: theme.colors.primary,
    fontWeight: theme.fontWeights.bold,
  },
});

export default SelfTransferScreen;

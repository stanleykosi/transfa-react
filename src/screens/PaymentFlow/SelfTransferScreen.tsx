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
import React, { useMemo, useState } from 'react';
import { View, Text, StyleSheet, KeyboardAvoidingView, Platform, ScrollView } from 'react-native';
import Animated from 'react-native-reanimated';
import * as Haptics from 'expo-haptics';
import { useNavigation } from '@react-navigation/native';
import ScreenWrapper from '@/components/ScreenWrapper';
import FormInput from '@/components/FormInput';
import PrimaryButton from '@/components/PrimaryButton';
import EnhancedBackButton from '@/components/EnhancedBackButton';
import { theme } from '@/constants/theme';
import { useSecureAction } from '@/hooks/useSecureAction';
import { useAccountBalance, useSelfTransfer, useTransactionFees } from '@/api/transactionApi';
import { useListBeneficiaries } from '@/api/accountApi';
import PinInputModal from '@/components/PinInputModal';
import { Beneficiary } from '@/types/api';
import BeneficiaryDropdown from '@/components/BeneficiaryDropdown';
import { formatCurrency, nairaToKobo } from '@/utils/formatCurrency';
import { AppNavigationProp } from '@/types/navigation';
import { useEntranceAnimation } from '@/hooks/useEntranceAnimation';

const SelfTransferScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const [selectedBeneficiary, setSelectedBeneficiary] = useState<Beneficiary | null>(null);
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

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

  const { data: fees, isLoading: isLoadingFees } = useTransactionFees();

  const { mutate: sendWithdrawal, isPending: isSending } = useSelfTransfer({
    onSuccess: (data) => {
      navigation.navigate('TransferStatus', {
        transactionId: data.transaction_id,
        amount: data.amount ?? nairaToKobo(parseFloat(amount)),
        fee: data.fee ?? fees?.self_fee_kobo ?? 0,
        description,
        transferType: 'self_transfer',
      });
    },
    onError: (error) => {
      if (error.message.toLowerCase().includes('pin is not set')) {
        navigation.navigate('CreatePin');
        return;
      }
      navigation.navigate('TransferStatus', {
        transactionId: '',
        amount: nairaToKobo(parseFloat(amount)),
        fee: fees?.self_fee_kobo ?? 0,
        description,
        transferType: 'self_transfer',
        initialStatus: 'failed',
        failureReason: error.message,
      });
    },
  });

  const handleWithdrawal = () => {
    const amountInKobo = nairaToKobo(parseFloat(amount));

    if (!selectedBeneficiary) {
      navigation.navigate('TransferStatus', {
        transactionId: '',
        amount: amountInKobo,
        fee: fees?.self_fee_kobo ?? 0,
        description,
        transferType: 'self_transfer',
        initialStatus: 'failed',
        failureReason: 'Please select a destination account.',
      });
      return;
    }

    if (!amount.trim() || isNaN(amountInKobo) || amountInKobo <= 0) {
      navigation.navigate('TransferStatus', {
        transactionId: '',
        amount: amountInKobo,
        fee: fees?.self_fee_kobo ?? 0,
        description,
        transferType: 'self_transfer',
        initialStatus: 'failed',
        failureReason: 'Please enter a valid amount.',
      });
      return;
    }

    if (amountInKobo > walletBalanceInKobo) {
      navigation.navigate('TransferStatus', {
        transactionId: '',
        amount: amountInKobo,
        fee: fees?.self_fee_kobo ?? 0,
        description,
        transferType: 'self_transfer',
        initialStatus: 'failed',
        failureReason: 'The amount exceeds your wallet balance.',
      });
      return;
    }

    if (!description.trim() || description.trim().length < 3 || description.trim().length > 100) {
      navigation.navigate('TransferStatus', {
        transactionId: '',
        amount: amountInKobo,
        fee: fees?.self_fee_kobo ?? 0,
        description,
        transferType: 'self_transfer',
        initialStatus: 'failed',
        failureReason: 'Description must be between 3 and 100 characters.',
      });
      return;
    }

    const action = (transactionPin: string) => {
      sendWithdrawal({
        beneficiary_id: selectedBeneficiary.id,
        amount: amountInKobo,
        description: description.trim(),
        transaction_pin: transactionPin,
      });
    };

    triggerSecureAction(action);
  };

  const amountInKobo = nairaToKobo(parseFloat(amount)) || 0;
  const feeInKobo = useMemo(() => fees?.self_fee_kobo ?? 0, [fees]);
  const totalAmountInKobo = amountInKobo + feeInKobo;

  const headerAnimation = useEntranceAnimation({ delay: 0, duration: 400 });
  const contentAnimation = useEntranceAnimation({ delay: 100, duration: 500 });
  const summaryAnimation = useEntranceAnimation({ delay: 200, duration: 500 });

  return (
    <ScreenWrapper>
      <Animated.View style={[styles.header, headerAnimation.animatedStyle]}>
        <EnhancedBackButton onPress={() => navigation.goBack()} />
        <Text style={styles.title}>Self Transfer</Text>
        <View style={{ width: 40 }} />
      </Animated.View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <Animated.View style={contentAnimation.animatedStyle}>
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
          </Animated.View>

          {amountInKobo > 0 && (
            <Animated.View style={summaryAnimation.animatedStyle}>
              <View style={styles.summaryCard}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Amount</Text>
                  <Text style={styles.summaryValue}>{formatCurrency(amountInKobo)}</Text>
                </View>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Withdrawal Fee</Text>
                  <Text style={styles.summaryValue}>
                    {isLoadingFees ? 'Calculating…' : formatCurrency(feeInKobo)}
                  </Text>
                </View>
                <View style={[styles.summaryRow, styles.totalRow]}>
                  <Text style={styles.summaryTotalLabel}>Total to be Debited</Text>
                  <Text style={styles.summaryTotalValue}>{formatCurrency(totalAmountInKobo)}</Text>
                </View>
              </View>
            </Animated.View>
          )}

          <PrimaryButton
            title="Withdraw Funds"
            onPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              handleWithdrawal();
            }}
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
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    letterSpacing: -0.5,
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
    borderRadius: theme.radii.xl,
    padding: theme.spacing.s20,
    marginBottom: theme.spacing.s20,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
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
    borderRadius: theme.radii.xl,
    padding: theme.spacing.s20,
    marginBottom: theme.spacing.s24,
    ...Platform.select({
      ios: {
        shadowColor: '#000',
        shadowOffset: { width: 0, height: 8 },
        shadowOpacity: 0.12,
        shadowRadius: 16,
      },
      android: {
        elevation: 8,
      },
    }),
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: theme.spacing.s16,
  },
  summaryLabel: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    fontWeight: theme.fontWeights.medium,
  },
  summaryValue: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeights.semibold,
    letterSpacing: -0.3,
  },
  totalRow: {
    borderTopWidth: 2,
    borderColor: theme.colors.border,
    paddingTop: theme.spacing.s16,
    marginTop: theme.spacing.s4,
    marginBottom: 0,
  },
  summaryTotalLabel: {
    fontSize: theme.fontSizes.lg,
    color: theme.colors.textPrimary,
    fontWeight: theme.fontWeights.bold,
  },
  summaryTotalValue: {
    fontSize: theme.fontSizes.lg,
    color: theme.colors.primary,
    fontWeight: theme.fontWeights.bold,
    letterSpacing: -0.5,
  },
});

export default SelfTransferScreen;

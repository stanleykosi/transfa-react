/**
 * @description
 * This screen provides the user interface for the Peer-to-Peer (P2P) payment flow.
 * Users can enter a recipient's username and an amount to send money.
 *
 * Key features:
 * - Form for recipient username and amount.
 * - Secure action authorization using biometrics or PIN via `useSecureAction`.
 * - Integration with `useP2PTransfer` mutation to handle the backend API call.
 * - Clear display of transaction fees before confirmation.
 * - Robust handling of loading, success, and error states.
 *
 * @dependencies
 * - react, react-native: For UI components and state management.
 * - @react-navigation/native: For navigation actions.
 * - @/components/*: Reusable UI components.
 * - @/hooks/useSecureAction: For authorizing the transaction.
 * - @/api/transactionApi: For the P2P transfer mutation hook.
 * - @/utils/formatCurrency: For displaying currency values.
 */
import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
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
import { useP2PTransfer, useTransactionFees } from '@/api/transactionApi';
import PinInputModal from '@/components/PinInputModal';
import { Ionicons } from '@expo/vector-icons';
import { formatCurrency, nairaToKobo } from '@/utils/formatCurrency';
import { AppNavigationProp } from '@/types/navigation';

const PayUserScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const [username, setUsername] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');

  const {
    isModalVisible,
    error: pinError,
    triggerSecureAction,
    handlePinSuccess,
    clearError: clearPinError,
    closeModal,
  } = useSecureAction();

  const { data: fees, isLoading: isLoadingFees } = useTransactionFees();

  const { mutate: sendPayment, isPending: isSending } = useP2PTransfer({
    onSuccess: (data) => {
      navigation.navigate('TransferStatus', {
        transactionId: data.transaction_id,
        amount: data.amount ?? nairaToKobo(parseFloat(amount)),
        fee: data.fee ?? fees?.p2p_fee_kobo ?? 0,
        description,
        recipientUsername: username,
        transferType: 'p2p',
      });
    },
    onError: (error) => {
      navigation.navigate('TransferStatus', {
        transactionId: '',
        amount: nairaToKobo(parseFloat(amount)),
        fee: fees?.p2p_fee_kobo ?? 0,
        description,
        recipientUsername: username,
        transferType: 'p2p',
        initialStatus: 'failed',
        failureReason: error.message,
      });
    },
  });

  const handlePayment = () => {
    const amountInKobo = nairaToKobo(parseFloat(amount));

    if (!username.trim()) {
      navigation.navigate('TransferStatus', {
        transactionId: '',
        amount: amountInKobo,
        fee: fees?.p2p_fee_kobo ?? 0,
        description,
        recipientUsername: username,
        transferType: 'p2p',
        initialStatus: 'failed',
        failureReason: 'Please enter a recipient username.',
      });
      return;
    }

    if (!amount.trim() || isNaN(amountInKobo) || amountInKobo <= 0) {
      navigation.navigate('TransferStatus', {
        transactionId: '',
        amount: amountInKobo,
        fee: fees?.p2p_fee_kobo ?? 0,
        description,
        recipientUsername: username,
        transferType: 'p2p',
        initialStatus: 'failed',
        failureReason: 'Please enter a valid amount.',
      });
      return;
    }

    if (!description.trim() || description.trim().length < 3 || description.trim().length > 100) {
      navigation.navigate('TransferStatus', {
        transactionId: '',
        amount: amountInKobo,
        fee: fees?.p2p_fee_kobo ?? 0,
        description,
        recipientUsername: username,
        transferType: 'p2p',
        initialStatus: 'failed',
        failureReason: 'Description must be between 3 and 100 characters.',
      });
      return;
    }

    const action = () => {
      sendPayment({
        recipient_username: username.trim(),
        amount: amountInKobo,
        description: description.trim(),
      });
    };

    triggerSecureAction(action);
  };

  const amountInKobo = nairaToKobo(parseFloat(amount)) || 0;
  const feeInKobo = useMemo(() => fees?.p2p_fee_kobo ?? 0, [fees]);
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
        <Text style={styles.title}>Pay Someone</Text>
        <View style={{ width: 24 }} />
      </View>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardView}
      >
        <ScrollView contentContainerStyle={styles.container} showsVerticalScrollIndicator={false}>
          <FormInput
            label="Recipient's @username"
            value={username}
            onChangeText={setUsername}
            placeholder="@john.doe"
            autoCapitalize="none"
            autoCorrect={false}
          />

          <FormInput
            label="Amount (₦)"
            value={amount}
            onChangeText={setAmount}
            placeholder="0.00"
            keyboardType="numeric"
          />

          <FormInput
            label="Description (Optional)"
            value={description}
            onChangeText={setDescription}
            placeholder="e.g., For lunch"
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
                <Text style={styles.summaryLabel}>Transaction Fee</Text>
                <Text style={styles.summaryValue}>
                  {isLoadingFees ? 'Calculating…' : formatCurrency(feeInKobo)}
                </Text>
              </View>
              <View style={[styles.summaryRow, styles.totalRow]}>
                <Text style={styles.summaryTotalLabel}>Total to be Debited</Text>
                <Text style={styles.summaryTotalValue}>{formatCurrency(totalAmountInKobo)}</Text>
              </View>
            </View>
          )}

          <PrimaryButton
            title="Send Payment"
            onPress={handlePayment}
            isLoading={isSending}
            disabled={!username.trim() || !amount.trim() || isSending}
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

export default PayUserScreen;

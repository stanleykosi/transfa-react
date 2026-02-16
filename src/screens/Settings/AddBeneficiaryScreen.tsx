/**
 * @description
 * This screen provides a form for adding a new beneficiary.
 * The backend handles verification internally during the creation process,
 * so this is a single-step form that submits bank code and account number.
 *
 * Key features:
 * - Simple form with bank code and account number fields.
 * - Uses `useAddBeneficiary` to create the beneficiary (backend handles verification).
 * - Handles loading and error states for the API call.
 * - Navigates back to the beneficiaries list upon successful addition.
 * - Catches and displays API errors.
 *
 * @dependencies
 * - react-native: For UI components and `Alert`.
 * - @react-navigation/native: For navigation actions.
 * - @/components/*: Reusable UI components.
 * - @/api/accountApi: Hook for adding beneficiaries.
 */
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import ScreenWrapper from '@/components/ScreenWrapper';
import FormInput from '@/components/FormInput';
import PrimaryButton from '@/components/PrimaryButton';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAddBeneficiary, useListBanks } from '@/api/accountApi';
import BankDropdown from '@/components/BankDropdown';
import { Bank } from '@/types/api';
import { ProfileStackParamList } from '@/navigation/ProfileStack';

type AddBeneficiaryScreenNavigationProp = NativeStackNavigationProp<
  ProfileStackParamList,
  'AddBeneficiary'
>;

const AddBeneficiaryScreen = () => {
  const navigation = useNavigation<AddBeneficiaryScreenNavigationProp>();
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [transactionPin, setTransactionPin] = useState('');

  const { data: banksData, isLoading: isLoadingBanks, error: banksError } = useListBanks();
  const { mutate: addBeneficiary, isPending: isAdding } = useAddBeneficiary({
    onSuccess: () => {
      Alert.alert('Success', 'Beneficiary added successfully!');
      navigation.goBack();
    },
    onError: (error: any) => {
      // Extract the actual error message from the response
      let errorMessage = 'Failed to add beneficiary.';
      const statusCode = error?.response?.status;

      if (error.response?.data) {
        // If response.data is a string, use it directly
        if (typeof error.response.data === 'string') {
          errorMessage = error.response.data;
        } else if (error.response.data.message) {
          // If response.data is an object with a message property
          errorMessage = error.response.data.message;
        }
      } else if (error.message) {
        errorMessage = error.message;
      }

      if (statusCode === 412) {
        Alert.alert(
          'Transaction PIN Required',
          'Set your transaction PIN in Security Settings before linking an account.',
          [
            {
              text: 'Go to Security',
              onPress: () => navigation.navigate('SecuritySettings'),
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return;
      }

      if (statusCode === 423) {
        Alert.alert(
          'PIN Temporarily Locked',
          'Too many incorrect PIN attempts. Please wait and try again.'
        );
        return;
      }

      Alert.alert('Error', errorMessage);
    },
  });

  const handleAdd = () => {
    if (!selectedBank) {
      Alert.alert('Invalid Input', 'Please select a bank.');
      return;
    }
    if (!accountNumber.trim() || accountNumber.length < 10) {
      Alert.alert('Invalid Input', 'Please enter a valid 10-digit account number.');
      return;
    }
    if (!/^\d{4}$/.test(transactionPin.trim())) {
      Alert.alert('Invalid PIN', 'Enter your 4-digit transaction PIN to link this account.');
      return;
    }

    addBeneficiary({
      bank_code: selectedBank.attributes.nipCode,
      account_number: accountNumber.trim(),
      transaction_pin: transactionPin.trim(),
    });
  };

  return (
    <ScreenWrapper>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
          <Ionicons name="arrow-back" size={24} color={theme.colors.textPrimary} />
        </TouchableOpacity>
        <Text style={styles.title}>Add New Account</Text>
        <View style={{ width: 24 }} />
      </View>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.sectionTitle}>Account Details</Text>
          <Text style={styles.sectionSubtitle}>
            Select your bank, enter the account number, and confirm with your transaction PIN.
          </Text>

          <BankDropdown
            banks={banksData?.data || []}
            selectedBank={selectedBank}
            onSelectBank={setSelectedBank}
            isLoading={isLoadingBanks}
            error={banksError?.message}
            placeholder="Select your bank"
          />
          <FormInput
            label="Account Number"
            value={accountNumber}
            onChangeText={setAccountNumber}
            placeholder="Enter 10-digit NUBAN"
            keyboardType="number-pad"
            maxLength={10}
            editable={!isAdding}
          />
          <FormInput
            label="Transaction PIN"
            value={transactionPin}
            onChangeText={(value) => setTransactionPin(value.replace(/[^0-9]/g, ''))}
            placeholder="Enter 4-digit PIN"
            keyboardType="number-pad"
            secureTextEntry
            maxLength={4}
            editable={!isAdding}
          />

          <PrimaryButton
            title="Add Beneficiary"
            onPress={handleAdd}
            isLoading={isAdding}
            disabled={isAdding || !selectedBank || transactionPin.length !== 4}
          />
        </ScrollView>
      </KeyboardAvoidingView>
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
  backButton: { padding: theme.spacing.s4 },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
  },
  container: { flexGrow: 1, paddingTop: theme.spacing.s16 },
  sectionTitle: {
    fontSize: theme.fontSizes.xl,
    fontWeight: theme.fontWeights.semibold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s8,
  },
  sectionSubtitle: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    marginBottom: theme.spacing.s24,
    lineHeight: 20,
  },
});

export default AddBeneficiaryScreen;

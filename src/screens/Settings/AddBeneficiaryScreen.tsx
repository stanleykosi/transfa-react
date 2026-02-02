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
import ScreenWrapper from '@/components/ScreenWrapper';
import FormInput from '@/components/FormInput';
import PrimaryButton from '@/components/PrimaryButton';
import { theme } from '@/constants/theme';
import { Ionicons } from '@expo/vector-icons';
import { useAddBeneficiary, useListBanks } from '@/api/accountApi';
import BankDropdown from '@/components/BankDropdown';
import { Bank } from '@/types/api';

const AddBeneficiaryScreen = () => {
  const navigation = useNavigation();
  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState('');

  const { data: banksData, isLoading: isLoadingBanks, error: banksError } = useListBanks();
  const { mutate: addBeneficiary, isPending: isAdding } = useAddBeneficiary({
    onSuccess: () => {
      Alert.alert('Success', 'Beneficiary added successfully!');
      navigation.goBack();
    },
    onError: (error: any) => {
      // Extract the actual error message from the response
      let errorMessage = 'Failed to add beneficiary.';

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

    addBeneficiary({
      bank_code: selectedBank.attributes.nipCode,
      account_number: accountNumber.trim(),
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
            Select your bank and enter the account number. We'll verify the account details
            automatically.
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

          <PrimaryButton
            title="Add Beneficiary"
            onPress={handleAdd}
            isLoading={isAdding}
            disabled={isAdding || !selectedBank}
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

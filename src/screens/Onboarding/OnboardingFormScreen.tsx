/**
 * @description
 * Onboarding screen for new users to provide essential details after signing up.
 * This form captures a unique username and KYC/KYB information based on the
 * selected account type ('Personal' or 'Merchant').
 *
 * @dependencies
 * - react: For state management (`useState`).
 * - react-native: For core UI components and ScrollView for long forms.
 * - @/components/*: Utilizes reusable components like ScreenWrapper, FormInput, PrimaryButton.
 * - UserTypeSelector: A dedicated component for selecting the user type.
 *
 * @notes
 * - The form state is managed locally with `useState`.
 * - A submit handler (`handleOnboardingSubmit`) is included as a placeholder. In a future
 *   step, this will be connected to a TanStack Query mutation to call the backend API.
 * - Input validation is not yet implemented but should be added for a robust user experience.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, ScrollView, KeyboardAvoidingView, Platform } from 'react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import FormInput from '@/components/FormInput';
import PrimaryButton from '@/components/PrimaryButton';
import { theme } from '@/constants/theme';
import UserTypeSelector from './components/UserTypeSelector';

type UserType = 'personal' | 'merchant';

const OnboardingFormScreen = () => {
  // State for the selected user type
  const [userType, setUserType] = useState<UserType>('personal');

  // State for all form fields
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [bvn, setBvn] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [rcNumber, setRcNumber] = useState('');

  // Loading state for the submission
  const [isLoading, setIsLoading] = useState(false);

  // Placeholder for the form submission logic
  const handleOnboardingSubmit = () => {
    setIsLoading(true);
    // TODO: Connect this to a TanStack Query mutation in a future step (Step 15).
    const formData = {
      userType,
      username,
      ...(userType === 'personal' ? { fullName, bvn, dateOfBirth } : { businessName, rcNumber }),
    };
    console.log('Submitting Onboarding Data:', formData);

    // Simulate an API call
    setTimeout(() => {
      setIsLoading(false);
      // On success, navigate to the main app (e.g., navigation.replace('AppTabs'))
    }, 1500);
  };

  return (
    <ScreenWrapper style={{ paddingHorizontal: 0 }}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView contentContainerStyle={styles.container} keyboardShouldPersistTaps="handled">
          <Text style={styles.title}>Tell us about yourself</Text>
          <Text style={styles.subtitle}>
            This information is required to set up your secure wallet.
          </Text>

          <UserTypeSelector selectedType={userType} onSelectType={setUserType} />

          <FormInput
            label="Unique Username"
            value={username}
            onChangeText={setUsername}
            placeholder="@yourname"
            autoCapitalize="none"
          />

          {userType === 'personal' ? (
            <>
              <FormInput
                label="Full Name"
                value={fullName}
                onChangeText={setFullName}
                placeholder="Enter your full legal name"
              />
              <FormInput
                label="Bank Verification Number (BVN)"
                value={bvn}
                onChangeText={setBvn}
                placeholder="Enter your 11-digit BVN"
                keyboardType="number-pad"
                maxLength={11}
              />
              <FormInput
                label="Date of Birth"
                value={dateOfBirth}
                onChangeText={setDateOfBirth}
                placeholder="YYYY-MM-DD"
              />
            </>
          ) : (
            <>
              <FormInput
                label="Registered Business Name"
                value={businessName}
                onChangeText={setBusinessName}
                placeholder="Enter your business name"
              />
              <FormInput
                label="RC Number"
                value={rcNumber}
                onChangeText={setRcNumber}
                placeholder="Enter your registration number"
              />
            </>
          )}

          <View style={styles.buttonContainer}>
            <PrimaryButton
              title="Save & Continue"
              onPress={handleOnboardingSubmit}
              isLoading={isLoading}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: theme.spacing.s24,
    paddingBottom: theme.spacing.s48,
  },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.s8,
  },
  subtitle: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.s32,
  },
  buttonContainer: {
    marginTop: theme.spacing.s32,
  },
});

export default OnboardingFormScreen;

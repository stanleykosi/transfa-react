/**
 * @description
 * Onboarding screen for new users to provide essential details after signing up.
 * This form captures a unique username and KYC/KYB information based on the
 * selected account type ('Personal' or 'Merchant'). Upon submission, it calls the
 * backend's `/onboarding` endpoint.
 *
 * @dependencies
 * - react, @clerk/clerk-expo, @react-navigation/native: For state, auth, and navigation.
 * - react-native: For core UI components and alerts.
 * - @/components/*: Reusable UI components.
 * - @/api/authApi: The `useOnboardingMutation` hook for the API call.
 * - UserTypeSelector: Component for selecting user type.
 *
 * @notes
 * - The form state is managed locally with `useState`.
 * - The submission logic is handled by the `useOnboardingMutation` hook.
 * - On successful submission, the user is navigated to the main app interface.
 */
import React, { useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useUser } from '@clerk/clerk-expo';
import { useNavigation, StackActions } from '@react-navigation/native';
import ScreenWrapper from '@/components/ScreenWrapper';
import FormInput from '@/components/FormInput';
import PrimaryButton from '@/components/PrimaryButton';
import { theme } from '@/constants/theme';
import UserTypeSelector from './components/UserTypeSelector';
import { useOnboardingMutation } from '@/api/authApi';
import { OnboardingPayload } from '@/types/api';

type UserType = 'personal' | 'merchant';

const OnboardingFormScreen = () => {
  const navigation = useNavigation();
  const { user } = useUser();

  // State for the selected user type
  const [userType, setUserType] = useState<UserType>('personal');

  // State for all form fields
  const [username, setUsername] = useState('');
  const [fullName, setFullName] = useState('');
  const [bvn, setBvn] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [businessName, setBusinessName] = useState('');
  const [rcNumber, setRcNumber] = useState('');

  // TanStack Query mutation for handling the API call
  const { mutate: submitOnboarding, isPending: isLoading } = useOnboardingMutation({
    onSuccess: (data) => {
      console.log('Onboarding successful:', data);
      Alert.alert('Success', 'Your profile has been created. Welcome to Transfa!');
      // Replace the entire navigation stack with the main app tabs,
      // so the user cannot go back to the onboarding screen.
      navigation.dispatch(StackActions.replace('AppTabs'));
    },
    onError: (error) => {
      // Provide user-friendly feedback on error.
      const errorMessage =
        (error as any)?.response?.data?.message ||
        'An unexpected error occurred. Please try again.';
      Alert.alert('Onboarding Failed', errorMessage);
      console.error('Onboarding error:', error);
    },
  });

  // Handles the form submission by calling the mutation.
  const handleOnboardingSubmit = () => {
    // Basic validation
    if (!username) {
      Alert.alert('Validation Error', 'Please enter a unique username.');
      return;
    }

    const payload: OnboardingPayload = {
      username,
      userType,
      email: user?.primaryEmailAddress?.emailAddress,
      phoneNumber: user?.primaryPhoneNumber?.phoneNumber,
      kycData: {
        userType,
        ...(userType === 'personal'
          ? { fullName, bvn, dateOfBirth }
          : { businessName, rcNumber }),
      },
    };

    submitOnboarding(payload);
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

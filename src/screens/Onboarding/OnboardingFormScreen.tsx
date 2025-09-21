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

  const [userType, setUserType] = useState<UserType>('personal');

  // Shared
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState<string>(user?.primaryPhoneNumber?.phoneNumber || '');

  // Personal Tier 0
  const [fullName, setFullName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('NG');

  // Merchant basics
  const [businessName, setBusinessName] = useState('');
  const [rcNumber, setRcNumber] = useState('');

  const { mutate: submitOnboarding, isPending: isLoading } = useOnboardingMutation({
    onSuccess: () => {
      Alert.alert('Success', 'Profile created. Next, verify to open your account.');
      // Proceed to Tier 1 create-account screen (guarded by backend status)
      navigation.dispatch(StackActions.replace('CreateAccount'));
    },
    onError: (error) => {
      const errorMessage =
        (error as any)?.response?.data?.message ||
        'An unexpected error occurred. Please try again.';
      Alert.alert('Onboarding Failed', errorMessage);
      console.error('Onboarding error:', error);
    },
  });

  const handleOnboardingSubmit = () => {
    if (!username) {
      Alert.alert('Validation Error', 'Please enter a unique username.');
      return;
    }
    if (!phone) {
      Alert.alert('Validation Error', 'Please provide a phone number.');
      return;
    }

    let kycData: OnboardingPayload['kycData'];

    if (userType === 'personal') {
      // Tier 0 only
      if (!fullName || !addressLine1 || !city || !stateVal || !country) {
        Alert.alert('Validation Error', 'Please complete your address and full name.');
        return;
      }
      kycData = {
        userType,
        fullName,
        addressLine1,
        city,
        state: stateVal,
        postalCode,
        country,
      };
    } else {
      // Merchant basics only for onboarding
      if (!businessName || !rcNumber) {
        Alert.alert(
          'Validation Error',
          'Please provide your registered business name and RC number.'
        );
        return;
      }
      kycData = { userType, businessName, rcNumber };
    }

    const payload: OnboardingPayload = {
      username,
      userType,
      email: user?.primaryEmailAddress?.emailAddress,
      phoneNumber: phone,
      kycData,
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
          <Text style={styles.subtitle}>This information is required to set up your profile.</Text>

          <UserTypeSelector selectedType={userType} onSelectType={setUserType} />

          <FormInput
            label="Unique Username"
            value={username}
            onChangeText={setUsername}
            placeholder="@yourname"
            autoCapitalize="none"
          />

          <FormInput
            label="Phone Number"
            value={phone}
            onChangeText={setPhone}
            placeholder="Enter your phone number"
            keyboardType="phone-pad"
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
                label="Address Line 1"
                value={addressLine1}
                onChangeText={setAddressLine1}
                placeholder="Street address"
              />
              <FormInput label="City" value={city} onChangeText={setCity} placeholder="City" />
              <FormInput
                label="State"
                value={stateVal}
                onChangeText={setStateVal}
                placeholder="State"
              />
              <FormInput
                label="Postal Code"
                value={postalCode}
                onChangeText={setPostalCode}
                placeholder="Postal code"
              />
              <FormInput
                label="Country"
                value={country}
                onChangeText={setCountry}
                placeholder="Country"
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

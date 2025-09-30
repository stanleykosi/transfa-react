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
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  StyleSheet,
  Text,
  View,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import { useUser, useAuth } from '@clerk/clerk-expo';
import { useNavigation, StackActions } from '@react-navigation/native';
import ScreenWrapper from '@/components/ScreenWrapper';
import FormInput from '@/components/FormInput';
import PrimaryButton from '@/components/PrimaryButton';
import { theme } from '@/constants/theme';
import UserTypeSelector from './components/UserTypeSelector';
import { useOnboardingMutation } from '@/api/authApi';
import { OnboardingPayload } from '@/types/api';
import apiClient from '@/api/apiClient';

type UserType = 'personal' | 'merchant';

const OnboardingFormScreen = () => {
  const navigation = useNavigation();
  const { user } = useUser();
  const { signOut } = useAuth();

  const [userType, setUserType] = useState<UserType>('personal');

  // Shared
  const [username, setUsername] = useState('');
  const [phone, setPhone] = useState<string>(user?.primaryPhoneNumber?.phoneNumber || '');

  // Personal Tier 0
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [maidenName, setMaidenName] = useState('');
  const [addressLine1, setAddressLine1] = useState('');
  const [city, setCity] = useState('');
  const [stateVal, setStateVal] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('NG');

  // Merchant basics
  const [businessName, setBusinessName] = useState('');
  const [rcNumber, setRcNumber] = useState('');

  const { mutate: submitOnboarding, isPending: isLoading } = useOnboardingMutation({
    onSuccess: async (response) => {
      console.log('✅ Tier 1 submission successful:', response.status);
      // Immediately poll backend for tier1_created with a tight timeout and brief inline loader
      setIsVerifying(true);
      await pollTier1Created();
    },
    onError: (error) => {
      const errorMessage =
        (error as any)?.response?.data?.message ||
        'An unexpected error occurred. Please try again.';
      Alert.alert('Onboarding Failed', errorMessage);
      console.error('Onboarding error:', error);
    },
  });

  const [isVerifying, setIsVerifying] = useState(false);
  const isMountedRef = useRef(true);
  const { getToken } = useAuth();
  const authHeaders = useMemo(() => ({ 'X-Clerk-User-Id': (user as any)?.id || '' }), [user]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const pollTier1Created = async () => {
    // Poll quickly up to ~3 seconds total, then fallback to CreateAccount to avoid any stall
    const attempts = 6; // 6 * 500ms = 3s max
    for (let i = 0; i < attempts; i++) {
      try {
        const token = await getToken().catch(() => undefined);
        const { data } = await apiClient.get<{ status: string }>('/onboarding/status', {
          headers: {
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
            ...authHeaders,
          },
        });
        if (
          data?.status === 'tier1_created' ||
          data?.status === 'tier2_created' ||
          data?.status === 'completed'
        ) {
          if (!isMountedRef.current) {
            return;
          }
          // Move to Tier 2 immediately
          navigation.dispatch(StackActions.replace('CreateAccount'));
          setIsVerifying(false);
          return;
        }
      } catch (e) {
        // ignore transient errors
      }
      await new Promise((res) => setTimeout(res, 500));
    }
    // If still not ready, route to CreateAccount optimistically (backend guard will handle)
    if (!isMountedRef.current) {
      return;
    }
    setIsVerifying(false);
    navigation.dispatch(StackActions.replace('CreateAccount'));
  };

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? You can use a different account to test the onboarding flow.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => signOut(),
        },
      ]
    );
  };

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
      // Tier 0 only - firstName and lastName are required
      if (!firstName || !lastName || !addressLine1 || !city || !stateVal || !country) {
        Alert.alert(
          'Validation Error',
          'Please complete your address and name (first name and last name are required).'
        );
        return;
      }
      kycData = {
        userType,
        firstName,
        lastName,
        middleName: middleName || undefined,
        maidenName: maidenName || undefined,
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
                label="First Name *"
                value={firstName}
                onChangeText={setFirstName}
                placeholder="Enter your first name"
              />
              <FormInput
                label="Last Name *"
                value={lastName}
                onChangeText={setLastName}
                placeholder="Enter your last name"
              />
              <FormInput
                label="Middle Name"
                value={middleName}
                onChangeText={setMiddleName}
                placeholder="Enter your middle name (optional)"
              />
              <FormInput
                label="Maiden Name"
                value={maidenName}
                onChangeText={setMaidenName}
                placeholder="Enter your maiden name (optional)"
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
              title={isLoading || isVerifying ? 'Please wait…' : 'Save & Continue'}
              onPress={handleOnboardingSubmit}
              isLoading={isLoading || isVerifying}
            />
            <PrimaryButton
              title="Sign Out (Test Different Account)"
              onPress={handleSignOut}
              style={styles.signOutButton}
              textStyle={styles.signOutButtonText}
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
    gap: theme.spacing.s12,
  },
  signOutButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  signOutButtonText: {
    color: theme.colors.textSecondary,
  },
});

export default OnboardingFormScreen;

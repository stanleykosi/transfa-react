import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, ActivityIndicator, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, StackActions, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useUser } from '@clerk/clerk-expo';

import { AppStackParamList } from '@/navigation/AppStack';
import {
  clearOnboardingProgress,
  fetchOnboardingStatus,
  saveOnboardingProgress,
  submitOnboarding,
  submitTier1ProfileUpdate,
  submitTier2Verification,
} from '@/api/authApi';
import { OnboardingPayload, OnboardingStatusResponse } from '@/types/api';
import {
  isValidAnchorNigerianPhoneNumber,
  normalizeNigerianPhoneInput,
  toAnchorNigerianPhoneNumber,
} from '@/utils/phone';
import AuthCompleteAddress from '@/components/source-auth/auth-complete-address';
import AuthCompleteBvnDob from '@/components/source-auth/auth-complete-bvn-dob';
import AuthCompleteProfile from '@/components/source-auth/auth-complete-profile';

type UserType = 'personal' | 'merchant';
type OnboardingRoute = RouteProp<AppStackParamList, 'OnboardingForm'>;
type OnboardingNavigation = NativeStackNavigationProp<AppStackParamList, 'OnboardingForm'>;

const NIGERIA_DIAL_CODE = '+234';

const cleanDigits = (value: string): string => value.replace(/\D/g, '');

const parseDobToApiFormat = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    const date = new Date(`${trimmed}T00:00:00Z`);
    if (Number.isNaN(date.getTime())) {
      return null;
    }
    return trimmed;
  }

  const slashMatch = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(trimmed);
  if (!slashMatch) {
    return null;
  }

  const day = Number(slashMatch[1]);
  const month = Number(slashMatch[2]);
  const year = Number(slashMatch[3]);
  const date = new Date(Date.UTC(year, month - 1, day));

  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCFullYear() !== year ||
    date.getUTCMonth() !== month - 1 ||
    date.getUTCDate() !== day
  ) {
    return null;
  }

  return `${year.toString().padStart(4, '0')}-${month
    .toString()
    .padStart(2, '0')}-${day.toString().padStart(2, '0')}`;
};

const formatDobForUi = (value: string): string => {
  const trimmed = value.trim();
  if (!trimmed) {
    return '';
  }
  if (/^\d{2}\/\d{2}\/\d{4}$/.test(trimmed)) {
    return trimmed;
  }
  const hyphenMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (!hyphenMatch) {
    return trimmed;
  }
  return `${hyphenMatch[3]}/${hyphenMatch[2]}/${hyphenMatch[1]}`;
};

const errorMessage = (error: unknown, fallback: string): string => {
  const message = (error as any)?.response?.data?.message || (error as any)?.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  return fallback;
};

const httpStatusCode = (error: unknown): number | undefined => {
  const status = (error as any)?.response?.status;
  return typeof status === 'number' ? status : undefined;
};

const isBvnAlreadyUsedConflict = (message: string): boolean => {
  const normalized = message.trim().toLowerCase();
  if (!normalized.includes('bvn')) {
    return false;
  }

  return (
    normalized.includes('already') ||
    normalized.includes('exists') ||
    normalized.includes('in use') ||
    normalized.includes('used') ||
    normalized.includes('linked')
  );
};

const isPhoneAlreadyUsedConflict = (message: string): boolean => {
  const normalized = message.trim().toLowerCase();
  if (!normalized.includes('phone')) {
    return false;
  }
  return (
    normalized.includes('already') ||
    normalized.includes('exists') ||
    normalized.includes('in use') ||
    normalized.includes('used') ||
    normalized.includes('linked')
  );
};

const isEmailAlreadyUsedConflict = (message: string): boolean => {
  const normalized = message.trim().toLowerCase();
  if (!normalized.includes('email')) {
    return false;
  }
  return (
    normalized.includes('already') ||
    normalized.includes('exists') ||
    normalized.includes('in use') ||
    normalized.includes('used') ||
    normalized.includes('linked')
  );
};

const OnboardingFormScreen = () => {
  const navigation = useNavigation<OnboardingNavigation>();
  const route = useRoute<OnboardingRoute>();
  const { user } = useUser();

  const selectedUserType: UserType = route.params?.userType || 'personal';
  const forceTier1Update = route.params?.forceTier1Update === true;
  const startStepParam = route.params?.startStep;

  const [isBootstrapping, setIsBootstrapping] = useState(true);
  const [currentStep, setCurrentStep] = useState<number>(startStepParam || 1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [hasTier1Created, setHasTier1Created] = useState(false);

  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [middleName, setMiddleName] = useState('');
  const [maidenName, setMaidenName] = useState('');
  const [phoneNumber, setPhoneNumber] = useState(
    normalizeNigerianPhoneInput(user?.primaryPhoneNumber?.phoneNumber || '')
  );

  const [addressLine1, setAddressLine1] = useState('');
  const [stateCity, setStateCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('Nigeria');

  const [bvn, setBvn] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');

  const normalizedPhoneForApi = useMemo(
    () => toAnchorNigerianPhoneNumber(phoneNumber),
    [phoneNumber]
  );

  const applyDraft = (draft?: Record<string, unknown>) => {
    if (!draft) {
      return;
    }
    const asString = (value: unknown) => (typeof value === 'string' ? value : '');

    const nextFirstName = asString(draft.firstName);
    const nextLastName = asString(draft.lastName);
    const nextMiddleName = asString(draft.middleName);
    const nextMaidenName = asString(draft.maidenName);
    const nextPhone = asString(draft.phoneNumber);
    const nextAddressLine1 = asString(draft.addressLine1);
    const nextStateCity = asString(draft.stateCity);
    const nextPostalCode = asString(draft.postalCode);
    const nextCountry = asString(draft.country);
    const nextBvn = asString(draft.bvn);
    const nextDateOfBirth = asString(draft.dateOfBirth);
    const nextGender = asString(draft.gender);

    if (nextFirstName) {
      setFirstName(nextFirstName);
    }
    if (nextLastName) {
      setLastName(nextLastName);
    }
    if (nextMiddleName) {
      setMiddleName(nextMiddleName);
    }
    if (nextMaidenName) {
      setMaidenName(nextMaidenName);
    }
    if (nextPhone) {
      setPhoneNumber(normalizeNigerianPhoneInput(nextPhone));
    }
    if (nextAddressLine1) {
      setAddressLine1(nextAddressLine1);
    }
    if (nextStateCity) {
      setStateCity(nextStateCity);
    }
    if (nextPostalCode) {
      setPostalCode(nextPostalCode);
    }
    if (nextCountry) {
      setCountry(nextCountry);
    }
    if (nextBvn) {
      setBvn(nextBvn);
    }
    if (nextDateOfBirth) {
      setDateOfBirth(nextDateOfBirth);
    }
    if (nextGender) {
      setGender(nextGender);
    }
  };

  const buildDraftPayload = useCallback(
    (): Record<string, unknown> => ({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      middleName: middleName.trim(),
      maidenName: maidenName.trim(),
      phoneNumber: phoneNumber.trim(),
      addressLine1: addressLine1.trim(),
      stateCity: stateCity.trim(),
      postalCode: postalCode.trim(),
      country: country.trim(),
      bvn: cleanDigits(bvn),
      dateOfBirth: dateOfBirth.trim(),
      gender: gender.trim(),
    }),
    [
      firstName,
      lastName,
      middleName,
      maidenName,
      phoneNumber,
      addressLine1,
      stateCity,
      postalCode,
      country,
      bvn,
      dateOfBirth,
      gender,
    ]
  );

  const persistProgress = useCallback(
    async (step: 1 | 2 | 3) => {
      try {
        await saveOnboardingProgress({
          userType: selectedUserType,
          currentStep: step,
          payload: buildDraftPayload(),
        });
      } catch (error) {
        console.warn('Failed to persist onboarding progress', error);
      }
    },
    [selectedUserType, buildDraftPayload]
  );

  useEffect(() => {
    if (isBootstrapping || isSubmitting) {
      return;
    }

    const autosaveStep = (Math.min(3, Math.max(1, currentStep)) as 1 | 2 | 3) || 1;
    const timer = setTimeout(() => {
      persistProgress(autosaveStep);
    }, 700);

    return () => clearTimeout(timer);
  }, [
    isBootstrapping,
    isSubmitting,
    currentStep,
    firstName,
    lastName,
    middleName,
    maidenName,
    phoneNumber,
    addressLine1,
    stateCity,
    postalCode,
    country,
    bvn,
    dateOfBirth,
    gender,
    persistProgress,
  ]);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      try {
        const statusResponse = await fetchOnboardingStatus();
        if (!active) {
          return;
        }

        if (statusResponse.status === 'completed') {
          navigation.dispatch(StackActions.replace('AppTabs'));
          return;
        }

        if (!forceTier1Update) {
          applyDraft(statusResponse.draft);
        }

        if (statusResponse.status.startsWith('tier2_') && !forceTier1Update) {
          navigation.dispatch(StackActions.replace('CreateAccount'));
          return;
        }

        if (statusResponse.status === 'tier1_created') {
          setHasTier1Created(true);
          const resumeFromServer = statusResponse.resume_step;
          setCurrentStep(
            forceTier1Update ? startStepParam || 1 : resumeFromServer || startStepParam || 3
          );
          return;
        }

        if (forceTier1Update && startStepParam) {
          setCurrentStep(startStepParam);
        } else if (statusResponse.resume_step) {
          setCurrentStep(statusResponse.resume_step);
        }
      } catch (err: any) {
        if (err?.response?.status !== 404) {
          console.warn('Failed to load onboarding status, proceeding with fresh onboarding.', err);
        }
        if (forceTier1Update && startStepParam) {
          setCurrentStep(startStepParam);
        }
      } finally {
        if (active) {
          setIsBootstrapping(false);
        }
      }
    };

    bootstrap();

    return () => {
      active = false;
    };
  }, [forceTier1Update, navigation, startStepParam]);

  const validateProfileStep = (nextFirstName: string, nextLastName: string, nextPhone: string) => {
    if (!nextFirstName.trim() || !nextLastName.trim()) {
      Alert.alert('Missing details', 'First name and last name are required.');
      return false;
    }

    if (!isValidAnchorNigerianPhoneNumber(nextPhone)) {
      Alert.alert('Invalid phone', 'Enter a valid Nigerian phone number.');
      return false;
    }

    return true;
  };

  const validateAddressStep = (
    nextAddress: string,
    nextStateCity: string,
    nextPostalCode: string,
    nextCountry: string
  ) => {
    if (
      !nextAddress.trim() ||
      !nextStateCity.trim() ||
      !nextPostalCode.trim() ||
      !nextCountry.trim()
    ) {
      Alert.alert('Missing details', 'Address, State/City, Postal Code and Country are required.');
      return false;
    }
    return true;
  };

  const validateBvnStep = (nextBvn: string, nextDob: string, nextGender: string): string | null => {
    const cleanedBvn = cleanDigits(nextBvn);
    if (cleanedBvn.length !== 11) {
      Alert.alert('Invalid BVN', 'BVN must be exactly 11 digits.');
      return null;
    }

    const normalizedDob = parseDobToApiFormat(nextDob);
    if (!normalizedDob) {
      Alert.alert('Invalid date', 'Enter date of birth in DD/MM/YYYY format.');
      return null;
    }

    if (nextGender !== 'Male' && nextGender !== 'Female') {
      Alert.alert('Invalid gender', 'Select your gender.');
      return null;
    }

    return normalizedDob;
  };

  const waitForTier1Created = async (stayOnForm = false): Promise<boolean> => {
    const maxAttempts = 30;
    const delayMs = 1500;

    for (let index = 0; index < maxAttempts; index += 1) {
      const statusResponse = await fetchOnboardingStatus();

      if (statusResponse.status === 'tier1_created') {
        return true;
      }

      if (statusResponse.status === 'completed') {
        navigation.dispatch(StackActions.replace('AppTabs'));
        return false;
      }

      if (statusResponse.status.startsWith('tier2_')) {
        console.log('✅ Tier 2 status detected, assuming Tier 1 is ready:', statusResponse.status);
        return true;
      }

      if (
        statusResponse.status === 'tier1_failed' ||
        statusResponse.status === 'tier1_system_error' ||
        statusResponse.status === 'tier1_rate_limited'
      ) {
        const reason = statusResponse.reason || 'Tier 1 verification failed.';
        throw new Error(reason);
      }

      await new Promise((resolve) => setTimeout(resolve, delayMs));
    }

    throw new Error('Tier 1 verification is taking longer than expected.');
  };

  const redirectFromStatus = useCallback(
    (statusResponse: OnboardingStatusResponse): boolean => {
      switch (statusResponse.next_step) {
        case 'app_tabs':
          navigation.dispatch(StackActions.replace('AppTabs'));
          return true;
        case 'create_account':
          navigation.dispatch(StackActions.replace('CreateAccount'));
          return true;
        case 'create_username':
          navigation.dispatch(StackActions.replace('CreateUsername'));
          return true;
        case 'create_pin':
          navigation.dispatch(StackActions.replace('CreatePin'));
          return true;
        case 'onboarding_form':
        default:
          return false;
      }
    },
    [navigation]
  );

  const recoverFromConflict = useCallback(
    async (conflictError?: unknown): Promise<boolean> => {
      try {
        const conflictReason = errorMessage(conflictError, '');
        if (isBvnAlreadyUsedConflict(conflictReason)) {
          navigation.dispatch(
            StackActions.replace('OnboardingResult', {
              outcome: 'failure',
              status: 'tier2_rejected',
              reason:
                conflictReason ||
                'This BVN is already linked to another account. Sign in with that account or use a different BVN.',
            })
          );
          return true;
        }

        if (isPhoneAlreadyUsedConflict(conflictReason) || isEmailAlreadyUsedConflict(conflictReason)) {
          Alert.alert('Duplicate Information', conflictReason);
          setCurrentStep(1); // Profile step has phone and email
          return true;
        }

        const latestStatus = await fetchOnboardingStatus();

        if (latestStatus.draft) {
          applyDraft(latestStatus.draft);
        }

        if (latestStatus.status === 'tier1_created' || latestStatus.status.startsWith('tier2_')) {
          setHasTier1Created(true);
        }

        if (redirectFromStatus(latestStatus)) {
          return true;
        }

        const normalizedStatus = latestStatus.status?.toLowerCase?.() ?? '';

        if (normalizedStatus === 'tier2_manual_review') {
          navigation.dispatch(
            StackActions.replace('OnboardingResult', {
              outcome: 'manual_review',
              status: normalizedStatus,
              reason: latestStatus.reason,
            })
          );
          return true;
        }

        if (
          normalizedStatus === 'tier2_rejected' ||
          normalizedStatus === 'tier2_error' ||
          normalizedStatus === 'tier2_failed' ||
          normalizedStatus === 'tier2_reenter_information' ||
          normalizedStatus === 'tier2_awaiting_document'
        ) {
          navigation.dispatch(
            StackActions.replace('OnboardingResult', {
              outcome: 'failure',
              status: normalizedStatus,
              reason: latestStatus.reason || conflictReason || 'Tier 2 verification failed.',
            })
          );
          return true;
        }

        if (normalizedStatus.startsWith('tier2_')) {
          navigation.dispatch(StackActions.replace('CreateAccount'));
          return true;
        }

        const resumeStep = latestStatus.resume_step || 3;
        navigation.dispatch(
          StackActions.replace('OnboardingForm', {
            userType: latestStatus.user_type || selectedUserType,
            startStep: resumeStep,
            forceTier1Update: resumeStep === 1,
          })
        );
        return true;
      } catch (recoveryError) {
        console.warn('Failed to recover onboarding state after conflict', recoveryError);
        navigation.dispatch(
          StackActions.replace('OnboardingForm', {
            userType: selectedUserType,
            startStep: 3,
            forceTier1Update: false,
          })
        );
        return true;
      }
    },
    [navigation, redirectFromStatus, selectedUserType]
  );

  const submitAllSteps = async (overrides?: {
    bvn: string;
    dateOfBirth: string;
    gender: string;
  }) => {
    if (selectedUserType !== 'personal') {
      Alert.alert('Unavailable', 'Merchant onboarding is not yet available on this flow.');
      return;
    }

    const finalBvn = overrides?.bvn ?? bvn;
    const finalDateOfBirth = overrides?.dateOfBirth ?? dateOfBirth;
    const finalGender = overrides?.gender ?? gender;

    const normalizedDob = validateBvnStep(finalBvn, finalDateOfBirth, finalGender);
    if (!normalizedDob) {
      return;
    }

    if (!normalizedPhoneForApi) {
      Alert.alert('Invalid phone', 'Enter a valid Nigerian phone number.');
      return;
    }

    setIsSubmitting(true);
    console.log('🚀 Starting onboarding submission flow. forceTier1Update:', forceTier1Update);
    try {
      // Re-sync status just before submit to avoid duplicate tier requests.
      try {
        const latestStatus = await fetchOnboardingStatus();
        console.log('🔍 Current onboarding status pre-submit:', latestStatus.status);
        if (latestStatus.status === 'completed') {
          navigation.dispatch(StackActions.replace('AppTabs'));
          return;
        }

        if (latestStatus.status === 'tier1_created' || latestStatus.status.startsWith('tier2_')) {
          setHasTier1Created(true);
        }

        if (redirectFromStatus(latestStatus)) {
          return;
        }
      } catch (statusError) {
        console.warn('Could not refresh onboarding status before submit', statusError);
      }

      const tier1ProfilePayload: OnboardingPayload = {
        userType: 'personal',
        phoneNumber: normalizedPhoneForApi,
        kycData: {
          userType: 'personal',
          firstName: firstName.trim(),
          lastName: lastName.trim(),
          middleName: middleName.trim() || undefined,
          maidenName: maidenName.trim() || undefined,
          addressLine1: addressLine1.trim(),
          city: stateCity.trim(),
          state: stateCity.trim(),
          postalCode: postalCode.trim(),
          country: country.trim().toUpperCase() === 'NIGERIA' ? 'NG' : country.trim(),
        },
      };

      let tier1Ready = hasTier1Created;

      if (!tier1Ready) {
        await submitOnboarding(tier1ProfilePayload);
        tier1Ready = await waitForTier1Created();
      } else if (forceTier1Update) {
        await submitTier1ProfileUpdate({
          userType: 'personal',
          phoneNumber: tier1ProfilePayload.phoneNumber,
          kycData: {
            userType: 'personal',
            firstName: tier1ProfilePayload.kycData.firstName || '',
            lastName: tier1ProfilePayload.kycData.lastName || '',
            middleName: tier1ProfilePayload.kycData.middleName,
            maidenName: tier1ProfilePayload.kycData.maidenName,
            addressLine1: tier1ProfilePayload.kycData.addressLine1 || '',
            addressLine2: tier1ProfilePayload.kycData.addressLine2,
            city: tier1ProfilePayload.kycData.city || '',
            state: tier1ProfilePayload.kycData.state || '',
            postalCode: tier1ProfilePayload.kycData.postalCode || '',
            country: tier1ProfilePayload.kycData.country || 'NG',
          },
        });
        tier1Ready = await waitForTier1Created(true);
      }

      if (!tier1Ready) {
        console.log('⚠️ Tier 1 not ready. Aborting submission.');
        return;
      }

      console.log('🚀 Submitting Tier 2 (BVN) verification details...');
      await submitTier2Verification({
        dob: normalizedDob,
        bvn: cleanDigits(finalBvn),
        gender: finalGender.toLowerCase() as 'male' | 'female',
      });
      console.log('✅ Tier 2 submission accepted.');

      await clearOnboardingProgress().catch(() => undefined);
      navigation.dispatch(StackActions.replace('CreateAccount'));
    } catch (err) {
      if (httpStatusCode(err) === 409) {
        const recovered = await recoverFromConflict(err);
        if (recovered) {
          return;
        }
      }

      Alert.alert(
        'Could not complete onboarding',
        errorMessage(err, 'We could not submit your profile. Please try again.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleProfileNext = async (data: {
    firstName: string;
    lastName: string;
    middleName?: string;
    maidenName?: string;
    phoneNumber: string;
    countryCode: string;
  }) => {
    if (isSubmitting) {
      return;
    }

    const nextPhone = normalizeNigerianPhoneInput(
      `${data.countryCode || NIGERIA_DIAL_CODE}${data.phoneNumber}`
    );
    if (!validateProfileStep(data.firstName, data.lastName, nextPhone)) {
      return;
    }

    setFirstName(data.firstName.trim());
    setLastName(data.lastName.trim());
    setMiddleName((data.middleName || '').trim());
    setMaidenName((data.maidenName || '').trim());
    setPhoneNumber(nextPhone);

    await persistProgress(2);
    setCurrentStep(2);
  };

  const handleAddressNext = async (data: {
    address: string;
    stateCity: string;
    postalCode: string;
    country: string;
  }) => {
    if (isSubmitting) {
      return;
    }

    if (!validateAddressStep(data.address, data.stateCity, data.postalCode, data.country)) {
      return;
    }

    setAddressLine1(data.address.trim());
    setStateCity(data.stateCity.trim());
    setPostalCode(data.postalCode.trim());
    setCountry(data.country.trim());

    await persistProgress(3);
    setCurrentStep(3);
  };

  const handleBvnNext = async (data: { bvn: string; dateOfBirth: string; gender: string }) => {
    if (isSubmitting) {
      return;
    }

    setBvn(data.bvn);
    setDateOfBirth(data.dateOfBirth);
    setGender(data.gender);

    await persistProgress(3);
    await submitAllSteps(data);
  };

  const onBack = () => {
    if (isSubmitting) {
      return;
    }

    if (currentStep > 1 && (!hasTier1Created || forceTier1Update)) {
      setCurrentStep((value) => value - 1);
      return;
    }

    if (navigation.canGoBack()) {
      navigation.goBack();
      return;
    }

    navigation.navigate('SelectAccountType');
  };

  if (isBootstrapping) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <ActivityIndicator size="small" color="#FFD300" />
          <Text style={styles.text}>Loading profile setup...</Text>
        </View>
      </SafeAreaView>
    );
  }

  if (selectedUserType === 'merchant') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <View style={styles.centered}>
          <Text style={styles.text}>Merchant onboarding will be enabled in the next release.</Text>
          <Text style={styles.linkText} onPress={onBack}>
            Go Back
          </Text>
        </View>
      </SafeAreaView>
    );
  }

  if (currentStep === 1) {
    return (
      <AuthCompleteProfile
        onNext={handleProfileNext}
        onBack={onBack}
        initialValues={{
          firstName,
          lastName,
          middleName,
          maidenName,
          phoneNumber,
          countryCode: NIGERIA_DIAL_CODE,
        }}
      />
    );
  }

  if (currentStep === 2) {
    return (
      <AuthCompleteAddress
        onNext={handleAddressNext}
        onBack={onBack}
        initialValues={{
          address: addressLine1,
          stateCity,
          postalCode,
          country,
        }}
      />
    );
  }

  return (
    <AuthCompleteBvnDob
      onNext={handleBvnNext}
      onBack={onBack}
      initialValues={{
        bvn,
        dateOfBirth: formatDobForUi(dateOfBirth),
        gender,
      }}
    />
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#08090A',
  },
  centered: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: 24,
    gap: 12,
  },
  text: {
    color: '#E9E9E9',
    fontSize: 15,
    textAlign: 'center',
  },
  linkText: {
    marginTop: 8,
    color: '#FFD300',
    fontSize: 15,
    textDecorationLine: 'underline',
  },
});

export default OnboardingFormScreen;

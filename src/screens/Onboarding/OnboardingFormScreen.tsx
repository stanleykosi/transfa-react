import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
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
import { OnboardingPayload } from '@/types/api';

type UserType = 'personal' | 'merchant';
type OnboardingRoute = RouteProp<AppStackParamList, 'OnboardingForm'>;
type OnboardingNavigation = NativeStackNavigationProp<AppStackParamList, 'OnboardingForm'>;

const NIGERIA_DIAL_CODE = '+234';
const steps = [1, 2, 3] as const;

const stateOptions = ['Lagos', 'Abuja', 'Rivers', 'Kano', 'Oyo'];
const countryOptions = ['Nigeria'];
const genderOptions = ['Male', 'Female'];

const TransfaMark = () => {
  return (
    <View style={styles.logoMark}>
      <View style={styles.logoSlash} />
      <View style={styles.logoBottomMark} />
    </View>
  );
};

const cleanDigits = (value: string): string => value.replace(/\D/g, '');

const normalizeLocalPhone = (value: string): string => {
  const digits = cleanDigits(value);
  if (digits.startsWith('234')) {
    return digits.slice(3);
  }
  if (digits.startsWith('0')) {
    return digits.slice(1);
  }
  return digits;
};

const buildPhoneNumberForApi = (localPhone: string): string => {
  const normalized = normalizeLocalPhone(localPhone);
  return `${NIGERIA_DIAL_CODE}${normalized}`;
};

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

const errorMessage = (error: unknown, fallback: string): string => {
  const message = (error as any)?.response?.data?.message || (error as any)?.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  return fallback;
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
    normalizeLocalPhone(user?.primaryPhoneNumber?.phoneNumber || '')
  );

  const [addressLine1, setAddressLine1] = useState('');
  const [stateCity, setStateCity] = useState('');
  const [postalCode, setPostalCode] = useState('');
  const [country, setCountry] = useState('Nigeria');

  const [bvn, setBvn] = useState('');
  const [dateOfBirth, setDateOfBirth] = useState('');
  const [gender, setGender] = useState('');

  const normalizedPhoneForApi = useMemo(() => buildPhoneNumberForApi(phoneNumber), [phoneNumber]);

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
      setPhoneNumber(normalizeLocalPhone(nextPhone));
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

  const pickState = () => {
    Alert.alert(
      'Select State/City',
      'Choose your state/city',
      stateOptions.map((item) => ({
        text: item,
        onPress: () => setStateCity(item),
      }))
    );
  };

  const pickCountry = () => {
    Alert.alert(
      'Select Country',
      'Choose your country',
      countryOptions.map((item) => ({
        text: item,
        onPress: () => setCountry(item),
      }))
    );
  };

  const pickGender = () => {
    Alert.alert(
      'Select Gender',
      'Choose your gender',
      genderOptions.map((item) => ({
        text: item,
        onPress: () => setGender(item),
      }))
    );
  };

  const validateStepOne = (): boolean => {
    if (!firstName.trim() || !lastName.trim()) {
      Alert.alert('Missing details', 'First name and last name are required.');
      return false;
    }

    const localDigits = normalizeLocalPhone(phoneNumber);
    if (localDigits.length < 7 || localDigits.length > 11) {
      Alert.alert('Invalid phone', 'Enter a valid Nigerian phone number.');
      return false;
    }
    return true;
  };

  const validateStepTwo = (): boolean => {
    if (!addressLine1.trim() || !stateCity.trim() || !postalCode.trim() || !country.trim()) {
      Alert.alert('Missing details', 'Address, State/City, Postal Code and Country are required.');
      return false;
    }
    return true;
  };

  const validateStepThree = (): string | null => {
    const cleanedBvn = cleanDigits(bvn);
    if (cleanedBvn.length !== 11) {
      Alert.alert('Invalid BVN', 'BVN must be exactly 11 digits.');
      return null;
    }

    const normalizedDob = parseDobToApiFormat(dateOfBirth);
    if (!normalizedDob) {
      Alert.alert('Invalid date', 'Enter date of birth in DD/MM/YYYY format.');
      return null;
    }

    if (gender !== 'Male' && gender !== 'Female') {
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
        if (stayOnForm) {
          await new Promise((resolve) => setTimeout(resolve, delayMs));
          continue;
        }
        navigation.dispatch(StackActions.replace('CreateAccount'));
        return false;
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

  const submitAllSteps = async () => {
    if (selectedUserType !== 'personal') {
      Alert.alert('Unavailable', 'Merchant onboarding is not yet available on this flow.');
      return;
    }

    const normalizedDob = validateStepThree();
    if (!normalizedDob) {
      return;
    }

    setIsSubmitting(true);
    try {
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
        return;
      }

      await submitTier2Verification({
        dob: normalizedDob,
        bvn: cleanDigits(bvn),
        gender: gender.toLowerCase() as 'male' | 'female',
      });

      await clearOnboardingProgress().catch(() => undefined);

      navigation.dispatch(StackActions.replace('CreateAccount'));
    } catch (err) {
      Alert.alert(
        'Could not complete onboarding',
        errorMessage(err, 'We could not submit your profile. Please try again.')
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  const onNext = async () => {
    if (isSubmitting) {
      return;
    }

    if (currentStep === 1) {
      if (!validateStepOne()) {
        return;
      }
      await persistProgress(2);
      setCurrentStep(2);
      return;
    }

    if (currentStep === 2) {
      if (!validateStepTwo()) {
        return;
      }
      await persistProgress(3);
      setCurrentStep(3);
      return;
    }

    await persistProgress(3);
    await submitAllSteps();
  };

  const onBack = () => {
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
        <LinearGradient colors={['#242424', '#121212', '#060708']} style={styles.gradient}>
          <View style={styles.loadingWrap}>
            <Text style={styles.loadingText}>Loading profile setup...</Text>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  if (selectedUserType === 'merchant') {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LinearGradient colors={['#242424', '#121212', '#060708']} style={styles.gradient}>
          <View style={styles.loadingWrap}>
            <Text style={styles.loadingText}>
              Merchant onboarding will be enabled in the next release.
            </Text>
            <TouchableOpacity style={styles.nextButton} onPress={onBack} activeOpacity={0.85}>
              <Text style={styles.nextButtonText}>Go Back</Text>
            </TouchableOpacity>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right', 'bottom']}>
      <LinearGradient colors={['#242424', '#121212', '#060708']} style={styles.gradient}>
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : undefined}
          style={styles.keyboardContainer}
        >
          <ScrollView
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator={false}
          >
            <TouchableOpacity style={styles.backButton} onPress={onBack} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.contentContainer}>
              <TransfaMark />
              <Text style={styles.title}>Complete your profile</Text>
              <Text style={styles.subtitle}>Fill your information below</Text>

              <View style={styles.stepRow}>
                {steps.map((step) => (
                  <View
                    key={step}
                    style={[
                      styles.stepDot,
                      step <= currentStep && styles.stepDotActive,
                      step < currentStep && styles.stepDotDone,
                    ]}
                  />
                ))}
              </View>

              <View style={styles.formSection}>
                {currentStep === 1 && (
                  <>
                    <Text style={styles.label}>First name *</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.textInput}
                        value={firstName}
                        onChangeText={setFirstName}
                        placeholder="e.g Samuel"
                        placeholderTextColor="#707070"
                      />
                    </View>

                    <Text style={styles.label}>Last name *</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.textInput}
                        value={lastName}
                        onChangeText={setLastName}
                        placeholder="e.g Ogunmekpon"
                        placeholderTextColor="#707070"
                      />
                    </View>

                    <View style={styles.rowInputs}>
                      <View style={styles.rowInputItem}>
                        <Text style={styles.label}>Middle name</Text>
                        <View style={styles.inputWrapper}>
                          <TextInput
                            style={styles.textInput}
                            value={middleName}
                            onChangeText={setMiddleName}
                            placeholder="e.g Usman"
                            placeholderTextColor="#707070"
                          />
                        </View>
                      </View>

                      <View style={styles.rowInputItem}>
                        <Text style={styles.label}>Maiden name (if any)</Text>
                        <View style={styles.inputWrapper}>
                          <TextInput
                            style={styles.textInput}
                            value={maidenName}
                            onChangeText={setMaidenName}
                            placeholder="e.g Peters"
                            placeholderTextColor="#707070"
                          />
                        </View>
                      </View>
                    </View>

                    <Text style={styles.label}>Phone number *</Text>
                    <View style={styles.phoneWrapper}>
                      <View style={styles.phonePrefix}>
                        <Text style={styles.flagText}>🇳🇬</Text>
                        <Ionicons name="chevron-down" size={16} color="#DCDCDC" />
                        <Text style={styles.phonePrefixText}>{NIGERIA_DIAL_CODE}</Text>
                      </View>
                      <TextInput
                        style={styles.phoneInput}
                        value={phoneNumber}
                        onChangeText={setPhoneNumber}
                        placeholder="8012345678"
                        placeholderTextColor="#707070"
                        keyboardType="number-pad"
                      />
                    </View>
                  </>
                )}

                {currentStep === 2 && (
                  <>
                    <Text style={styles.label}>Address *</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.textInput}
                        value={addressLine1}
                        onChangeText={setAddressLine1}
                        placeholder="e.g 18, Babalola street, Magodo"
                        placeholderTextColor="#707070"
                      />
                    </View>

                    <View style={styles.rowInputs}>
                      <View style={styles.rowInputItem}>
                        <Text style={styles.label}>State/City *</Text>
                        <TouchableOpacity
                          style={styles.selectWrapper}
                          onPress={pickState}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.selectText, !stateCity && styles.selectPlaceholder]}>
                            {stateCity || 'e.g Lagos'}
                          </Text>
                          <Ionicons name="chevron-down" size={18} color="#9B9B9B" />
                        </TouchableOpacity>
                      </View>

                      <View style={styles.rowInputItem}>
                        <Text style={styles.label}>Postal Code *</Text>
                        <View style={styles.inputWrapper}>
                          <TextInput
                            style={styles.textInput}
                            value={postalCode}
                            onChangeText={setPostalCode}
                            placeholder="e.g 100011"
                            placeholderTextColor="#707070"
                            keyboardType="number-pad"
                          />
                        </View>
                      </View>
                    </View>

                    <Text style={styles.label}>Country *</Text>
                    <TouchableOpacity
                      style={styles.selectWrapper}
                      onPress={pickCountry}
                      activeOpacity={0.75}
                    >
                      <Text style={[styles.selectText, !country && styles.selectPlaceholder]}>
                        {country || 'Search Country'}
                      </Text>
                      <Ionicons name="chevron-down" size={18} color="#9B9B9B" />
                    </TouchableOpacity>
                  </>
                )}

                {currentStep === 3 && (
                  <>
                    <Text style={styles.label}>BVN *</Text>
                    <View style={styles.inputWrapper}>
                      <TextInput
                        style={styles.textInput}
                        value={bvn}
                        onChangeText={setBvn}
                        placeholder="e.g 22456987341"
                        placeholderTextColor="#707070"
                        keyboardType="number-pad"
                        maxLength={11}
                      />
                    </View>

                    <View style={styles.rowInputs}>
                      <View style={styles.rowInputItem}>
                        <Text style={styles.label}>Date of birth *</Text>
                        <View style={styles.inputWrapper}>
                          <TextInput
                            style={styles.textInput}
                            value={dateOfBirth}
                            onChangeText={setDateOfBirth}
                            placeholder="DD/MM/YYYY"
                            placeholderTextColor="#707070"
                          />
                        </View>
                      </View>

                      <View style={styles.rowInputItem}>
                        <Text style={styles.label}>Gender *</Text>
                        <TouchableOpacity
                          style={styles.selectWrapper}
                          onPress={pickGender}
                          activeOpacity={0.75}
                        >
                          <Text style={[styles.selectText, !gender && styles.selectPlaceholder]}>
                            {gender || 'Select gender'}
                          </Text>
                          <Ionicons name="chevron-down" size={18} color="#9B9B9B" />
                        </TouchableOpacity>
                      </View>
                    </View>
                  </>
                )}

                <TouchableOpacity
                  style={[styles.nextButton, isSubmitting && styles.nextButtonDisabled]}
                  onPress={onNext}
                  activeOpacity={0.85}
                  disabled={isSubmitting}
                >
                  <Text style={styles.nextButtonText}>
                    {isSubmitting ? 'Please wait...' : 'Next'}
                  </Text>
                </TouchableOpacity>
              </View>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </LinearGradient>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: '#0A0A0A',
  },
  gradient: {
    flex: 1,
  },
  keyboardContainer: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 24,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 6,
  },
  contentContainer: {
    flex: 1,
    alignItems: 'center',
    paddingTop: 40,
  },
  logoMark: {
    width: 42,
    height: 20,
    borderRadius: 3,
    backgroundColor: '#FFD300',
    marginBottom: 16,
    overflow: 'hidden',
    justifyContent: 'flex-end',
  },
  logoSlash: {
    position: 'absolute',
    width: 60,
    height: 11,
    backgroundColor: '#0A0A0A',
    transform: [{ rotate: '-12deg' }],
    top: 4,
    right: -17,
  },
  logoBottomMark: {
    width: 8,
    height: 6,
    borderTopLeftRadius: 1,
    borderTopRightRadius: 1,
    backgroundColor: '#0A0A0A',
    alignSelf: 'center',
    marginBottom: 2,
  },
  title: {
    color: '#F4F4F4',
    fontSize: 48,
    fontWeight: '700',
    letterSpacing: -0.5,
  },
  subtitle: {
    marginTop: 8,
    color: '#55565A',
    fontSize: 17,
    fontWeight: '500',
    textAlign: 'center',
  },
  stepRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 16,
  },
  stepDot: {
    width: 20,
    height: 4,
    borderRadius: 10,
    backgroundColor: '#2C2D30',
  },
  stepDotActive: {
    backgroundColor: '#615211',
  },
  stepDotDone: {
    backgroundColor: '#D2B108',
  },
  formSection: {
    width: '100%',
    marginTop: 28,
  },
  label: {
    color: '#D7D7D7',
    fontSize: 15,
    fontWeight: '600',
    marginBottom: 10,
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(79, 79, 79, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  textInput: {
    flex: 1,
    color: '#E9E9E9',
    fontSize: 15,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },
  rowInputs: {
    flexDirection: 'row',
    gap: 10,
  },
  rowInputItem: {
    flex: 1,
  },
  phoneWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(79, 79, 79, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    minHeight: 48,
    marginBottom: 18,
    overflow: 'hidden',
  },
  phonePrefix: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    gap: 4,
    borderRightWidth: 1,
    borderRightColor: 'rgba(255,255,255,0.08)',
  },
  flagText: {
    fontSize: 18,
  },
  phonePrefixText: {
    color: '#CFCFCF',
    fontSize: 14,
    fontWeight: '500',
  },
  phoneInput: {
    flex: 1,
    color: '#E9E9E9',
    fontSize: 15,
    paddingHorizontal: 12,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },
  selectWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: 'rgba(79, 79, 79, 0.45)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
    minHeight: 48,
    paddingHorizontal: 12,
    marginBottom: 18,
  },
  selectText: {
    color: '#E9E9E9',
    fontSize: 15,
    flex: 1,
  },
  selectPlaceholder: {
    color: '#7E7E7E',
  },
  nextButton: {
    marginTop: 6,
    backgroundColor: '#FFD300',
    borderRadius: 8,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  nextButtonDisabled: {
    opacity: 0.6,
  },
  nextButtonText: {
    color: '#121212',
    fontSize: 18,
    fontWeight: '700',
  },
  loadingWrap: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    color: '#DADADA',
    fontSize: 16,
  },
});

export default OnboardingFormScreen;

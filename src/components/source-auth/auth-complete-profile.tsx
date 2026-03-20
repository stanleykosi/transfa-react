import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useMemo, useRef, useState } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

import BackIcon from '@/assets/icons/back.svg';
import Logo from '@/assets/images/logo.svg';
import SvgAsset from '@/components/SvgAsset';
import { globalStyles } from '@/styles/global';
import { moderateScale, scale, verticalScale } from '@/utils/responsive';

const nigerianFlagSvg = `<svg width="24" height="18" viewBox="0 0 24 18" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="24" height="18" fill="#008751"/>
<rect x="8" width="8" height="18" fill="#FFFFFF"/>
</svg>`;

interface AuthCompleteProfileProps {
  onNext: (data: {
    firstName: string;
    lastName: string;
    middleName?: string;
    maidenName?: string;
    phoneNumber: string;
    countryCode: string;
  }) => void;
  onBack?: () => void;
  initialValues?: {
    firstName?: string;
    lastName?: string;
    middleName?: string;
    maidenName?: string;
    phoneNumber?: string;
    countryCode?: string;
  };
}

export default function AuthCompleteProfile({
  onNext,
  onBack,
  initialValues,
}: AuthCompleteProfileProps) {
  const insets = useSafeAreaInsets();
  const normalizedPhone = useMemo(() => {
    const digits = (initialValues?.phoneNumber || '').replace(/[^0-9]/g, '');
    if (!digits) {
      return '';
    }
    if (digits.startsWith('234')) {
      return digits.slice(3);
    }
    if (digits.startsWith('0')) {
      return digits.slice(1);
    }
    return digits;
  }, [initialValues?.phoneNumber]);

  const [firstName, setFirstName] = useState(initialValues?.firstName || '');
  const [lastName, setLastName] = useState(initialValues?.lastName || '');
  const [middleName, setMiddleName] = useState(initialValues?.middleName || '');
  const [maidenName, setMaidenName] = useState(initialValues?.maidenName || '');
  const [phoneNumber, setPhoneNumber] = useState(normalizedPhone);
  const [countryCode] = useState(initialValues?.countryCode || '+234');
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [errors, setErrors] = useState<{
    firstName?: string;
    lastName?: string;
    phoneNumber?: string;
  }>({});

  const firstNameRef = useRef<TextInput>(null);
  const lastNameRef = useRef<TextInput>(null);
  const middleNameRef = useRef<TextInput>(null);
  const maidenNameRef = useRef<TextInput>(null);
  const phoneRef = useRef<TextInput>(null);

  const handleNext = useCallback(() => {
    const newErrors: typeof errors = {};

    if (!firstName.trim()) newErrors.firstName = 'First name is required';
    if (!lastName.trim()) newErrors.lastName = 'Last name is required';
    if (!phoneNumber.trim()) newErrors.phoneNumber = 'Phone number is required';

    if (Object.keys(newErrors).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrors(newErrors);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onNext({
      firstName: firstName.trim(),
      lastName: lastName.trim(),
      middleName: middleName.trim() || undefined,
      maidenName: maidenName.trim() || undefined,
      phoneNumber: phoneNumber.trim(),
      countryCode,
    });
  }, [firstName, lastName, middleName, maidenName, phoneNumber, countryCode, onNext]);

  const validateName = useCallback((name: string): string => {
    return name.replace(/[^a-zA-Z\s'-]/g, '').slice(0, 50);
  }, []);

  const handleFirstNameChange = useCallback(
    (value: string) => {
      setFirstName(validateName(value));
      if (errors.firstName) setErrors((prev) => ({ ...prev, firstName: undefined }));
    },
    [errors.firstName, validateName]
  );

  const handleLastNameChange = useCallback(
    (value: string) => {
      setLastName(validateName(value));
      if (errors.lastName) setErrors((prev) => ({ ...prev, lastName: undefined }));
    },
    [errors.lastName, validateName]
  );

  const handlePhoneNumberChange = useCallback(
    (value: string) => {
      const validated = value.replace(/[^0-9]/g, '').slice(0, 11);
      setPhoneNumber(validated);
      if (errors.phoneNumber) setErrors((prev) => ({ ...prev, phoneNumber: undefined }));
    },
    [errors.phoneNumber]
  );

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBack?.();
  }, [onBack]);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#2B2B2B', '#0F0F0F', '#0F0F0F']}
        locations={[0, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + verticalScale(20),
              paddingBottom: insets.bottom + verticalScale(20),
            },
          ]}
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          {/* Back Button */}
          {onBack && (
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressedOpacity]}
              onPress={handleBack}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <SvgAsset source={BackIcon} width={scale(24)} height={scale(24)} />
            </Pressable>
          )}

          {/* Logo */}
          <Animated.View entering={FadeIn.duration(500)} style={styles.logoContainer}>
            <SvgAsset source={Logo} width={scale(49)} height={scale(23)} />
          </Animated.View>

          {/* Title and Subtitle */}
          <Animated.View entering={FadeInUp.duration(400).delay(100)} style={styles.titleContainer}>
            <Text style={styles.title}>Complete your profile</Text>
            <Text style={styles.subtitle}>Fill your information below</Text>
          </Animated.View>

          {/* Input Fields */}
          <Animated.View entering={FadeInUp.duration(400).delay(200)} style={styles.inputContainer}>
            {/* First Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                First name <Text style={styles.required}>*</Text>
              </Text>
              <Pressable
                onPress={() => firstNameRef.current?.focus()}
                style={[
                  styles.inputWrapper,
                  focusedInput === 'firstName' && styles.inputWrapperFocused,
                  errors.firstName ? styles.inputWrapperError : null,
                ]}
              >
                <TextInput
                  ref={firstNameRef}
                  style={styles.input}
                  placeholder="e.g Samuel"
                  placeholderTextColor="rgba(255, 255, 255, 0.32)"
                  value={firstName}
                  onChangeText={handleFirstNameChange}
                  onFocus={() => setFocusedInput('firstName')}
                  onBlur={() => setFocusedInput(null)}
                  returnKeyType="next"
                  onSubmitEditing={() => lastNameRef.current?.focus()}
                  autoComplete="name-given"
                  textContentType="givenName"
                  maxLength={50}
                />
              </Pressable>
              {errors.firstName && <Text style={styles.errorText}>{errors.firstName}</Text>}
            </View>

            {/* Last Name */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Last name <Text style={styles.required}>*</Text>
              </Text>
              <Pressable
                onPress={() => lastNameRef.current?.focus()}
                style={[
                  styles.inputWrapper,
                  focusedInput === 'lastName' && styles.inputWrapperFocused,
                  errors.lastName ? styles.inputWrapperError : null,
                ]}
              >
                <TextInput
                  ref={lastNameRef}
                  style={styles.input}
                  placeholder="e.g Ogunmekpon"
                  placeholderTextColor="rgba(255, 255, 255, 0.32)"
                  value={lastName}
                  onChangeText={handleLastNameChange}
                  onFocus={() => setFocusedInput('lastName')}
                  onBlur={() => setFocusedInput(null)}
                  returnKeyType="next"
                  onSubmitEditing={() => middleNameRef.current?.focus()}
                  autoComplete="name-family"
                  textContentType="familyName"
                  maxLength={50}
                />
              </Pressable>
              {errors.lastName && <Text style={styles.errorText}>{errors.lastName}</Text>}
            </View>

            {/* Middle and Maiden Name - Using Flex for proper layout */}
            <View style={styles.rowContainer}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: scale(8) }]}>
                <Text style={styles.inputLabel}>Middle name</Text>
                <Pressable
                  onPress={() => middleNameRef.current?.focus()}
                  style={[
                    styles.inputWrapper,
                    focusedInput === 'middleName' && styles.inputWrapperFocused,
                  ]}
                >
                  <TextInput
                    ref={middleNameRef}
                    style={styles.input}
                    placeholder="e.g Usman"
                    placeholderTextColor="rgba(255, 255, 255, 0.32)"
                    value={middleName}
                    onChangeText={(val) => setMiddleName(validateName(val))}
                    onFocus={() => setFocusedInput('middleName')}
                    onBlur={() => setFocusedInput(null)}
                    returnKeyType="next"
                    onSubmitEditing={() => maidenNameRef.current?.focus()}
                    autoComplete="name-middle"
                    textContentType="middleName"
                    maxLength={50}
                  />
                </Pressable>
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: scale(8) }]}>
                <Text style={styles.inputLabel}>
                  Maiden name <Text style={styles.optionalText}>(if any)</Text>
                </Text>
                <Pressable
                  onPress={() => maidenNameRef.current?.focus()}
                  style={[
                    styles.inputWrapper,
                    focusedInput === 'maidenName' && styles.inputWrapperFocused,
                  ]}
                >
                  <TextInput
                    ref={maidenNameRef}
                    style={styles.input}
                    placeholder="e.g Peters"
                    placeholderTextColor="rgba(255, 255, 255, 0.32)"
                    value={maidenName}
                    onChangeText={(val) => setMaidenName(validateName(val))}
                    onFocus={() => setFocusedInput('maidenName')}
                    onBlur={() => setFocusedInput(null)}
                    returnKeyType="next"
                    onSubmitEditing={() => phoneRef.current?.focus()}
                    maxLength={50}
                  />
                </Pressable>
              </View>
            </View>

            {/* Phone Number */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Phone number <Text style={styles.required}>*</Text>
              </Text>
              <Pressable
                onPress={() => phoneRef.current?.focus()}
                style={[
                  styles.inputWrapper,
                  focusedInput === 'phoneNumber' && styles.inputWrapperFocused,
                  errors.phoneNumber ? styles.inputWrapperError : null,
                ]}
              >
                <Pressable
                  style={styles.countryCodeContainer}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    console.log('Country selector requested');
                  }}
                >
                  <SvgXml xml={nigerianFlagSvg} width={scale(24)} height={scale(18)} />
                  <Text style={styles.countryCodeText}>{countryCode}</Text>
                  <Text style={styles.chevron}>▼</Text>
                </Pressable>

                <TextInput
                  ref={phoneRef}
                  style={styles.phoneInput}
                  placeholder="Phone number"
                  placeholderTextColor="rgba(255, 255, 255, 0.32)"
                  value={phoneNumber}
                  onChangeText={handlePhoneNumberChange}
                  keyboardType="phone-pad"
                  autoComplete="tel"
                  textContentType="telephoneNumber"
                  onFocus={() => setFocusedInput('phoneNumber')}
                  onBlur={() => setFocusedInput(null)}
                  returnKeyType="done"
                  onSubmitEditing={handleNext}
                  maxLength={11}
                />
              </Pressable>
              {errors.phoneNumber && <Text style={styles.errorText}>{errors.phoneNumber}</Text>}
            </View>
          </Animated.View>

          {/* Next Button */}
          <Animated.View entering={FadeInUp.duration(400).delay(300)}>
            <Pressable
              style={({ pressed }) => [
                globalStyles.primaryButtonWithMargin,
                pressed && styles.buttonPressed,
              ]}
              onPress={handleNext}
            >
              <Text style={globalStyles.primaryButtonText}>Next</Text>
            </Pressable>
          </Animated.View>
        </ScrollView>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  scrollView: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    paddingHorizontal: scale(20),
  },
  backButton: {
    marginBottom: verticalScale(20),
  },
  logoContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(12),
  },
  titleContainer: {
    alignItems: 'center',
    marginBottom: verticalScale(32),
  },
  title: {
    fontSize: moderateScale(36),
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: verticalScale(8),
    fontFamily: 'ArtificTrial-Semibold',
  },
  subtitle: {
    maxWidth: scale(260),
    fontSize: moderateScale(20),
    textAlign: 'center',
    color: '#6C6B6B',
    fontFamily: 'Montserrat_400Regular',
  },
  inputContainer: {
    marginBottom: verticalScale(24),
  },
  inputGroup: {
    marginBottom: verticalScale(20),
  },
  rowContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  inputLabel: {
    fontSize: moderateScale(18),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: verticalScale(12),
  },
  required: {
    color: '#FFD300',
  },
  optionalText: {
    color: '#6C6B6B',
  },
  inputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: scale(10),
    borderCurve: 'continuous',
    paddingHorizontal: scale(16),
    height: verticalScale(56),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    overflow: 'hidden',
  },
  inputWrapperFocused: {
    borderColor: 'rgba(255, 211, 0, 0.5)',
  },
  inputWrapperError: {
    borderColor: 'rgba(255, 59, 48, 0.8)',
  },
  input: {
    flex: 1,
    fontSize: moderateScale(16),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  countryCodeContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginRight: scale(12),
    paddingRight: scale(12),
    borderRightWidth: 1,
    borderRightColor: 'rgba(255, 255, 255, 0.2)',
  },
  countryCodeText: {
    fontSize: moderateScale(16),
    color: '#FFFFFF',
    marginLeft: scale(8),
    marginRight: scale(4),
    fontFamily: 'Montserrat_400Regular',
  },
  chevron: {
    fontSize: moderateScale(10),
    color: '#FFFFFF',
    opacity: 0.6,
  },
  phoneInput: {
    flex: 1,
    fontSize: moderateScale(16),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  errorText: {
    fontSize: moderateScale(14),
    color: '#FF3B30',
    marginTop: verticalScale(8),
    fontFamily: 'Montserrat_400Regular',
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  buttonPressedOpacity: {
    opacity: 0.7,
  },
});

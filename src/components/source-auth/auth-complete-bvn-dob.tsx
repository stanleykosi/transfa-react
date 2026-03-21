import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useRef, useState } from 'react';
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
import NativeSheet from '@/components/ui/NativeSheet';
import { globalStyles } from '@/styles/global';
import { moderateScale, scale, verticalScale } from '@/utils/responsive';

const chevronDownSvg = `<svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M1 1L6 6L11 1" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const genderOptions = ['Male', 'Female', 'Other'];

interface AuthCompleteBvnDobProps {
  onNext: (data: { bvn: string; dateOfBirth: string; gender: string }) => void;
  onBack?: () => void;
  initialValues?: {
    bvn?: string;
    dateOfBirth?: string;
    gender?: string;
  };
}

export default function AuthCompleteBvnDob({
  onNext,
  onBack,
  initialValues,
}: AuthCompleteBvnDobProps) {
  const insets = useSafeAreaInsets();
  const [bvn, setBvn] = useState(initialValues?.bvn || '');
  const [dateOfBirth, setDateOfBirth] = useState(initialValues?.dateOfBirth || '');
  const [gender, setGender] = useState(initialValues?.gender || '');
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [showGenderModal, setShowGenderModal] = useState(false);
  const [errors, setErrors] = useState<{
    bvn?: string;
    dateOfBirth?: string;
    gender?: string;
  }>({});

  const bvnRef = useRef<TextInput>(null);
  const dobRef = useRef<TextInput>(null);

  const handleNext = useCallback(() => {
    const newErrors: typeof errors = {};

    if (!bvn.trim()) {
      newErrors.bvn = 'BVN is required';
    } else if (bvn.trim().length !== 11) {
      newErrors.bvn = 'BVN must be 11 digits';
    }

    if (!dateOfBirth.trim()) {
      newErrors.dateOfBirth = 'Date of birth is required';
    } else if (!/^\d{2}\/\d{2}\/\d{4}$/.test(dateOfBirth.trim())) {
      newErrors.dateOfBirth = 'Format: DD/MM/YYYY';
    }

    if (!gender) {
      newErrors.gender = 'Gender is required';
    }

    if (Object.keys(newErrors).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrors(newErrors);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onNext({
      bvn: bvn.trim(),
      dateOfBirth: dateOfBirth.trim(),
      gender,
    });
  }, [bvn, dateOfBirth, gender, onNext]);

  const handleBVNChange = useCallback(
    (val: string) => {
      const numeric = val.replace(/[^0-9]/g, '').slice(0, 11);
      setBvn(numeric);
      if (errors.bvn) setErrors((prev) => ({ ...prev, bvn: undefined }));
      if (numeric.length === 11) dobRef.current?.focus();
    },
    [errors.bvn]
  );

  const handleDOBChange = useCallback(
    (val: string) => {
      const numeric = val.replace(/[^0-9]/g, '');
      let formatted = numeric;
      if (numeric.length > 2) formatted = `${numeric.slice(0, 2)}/${numeric.slice(2)}`;
      if (numeric.length > 4)
        formatted = `${numeric.slice(0, 2)}/${numeric.slice(2, 4)}/${numeric.slice(4, 8)}`;

      setDateOfBirth(formatted);
      if (errors.dateOfBirth) setErrors((prev) => ({ ...prev, dateOfBirth: undefined }));
    },
    [errors.dateOfBirth]
  );

  const handleSelectGender = (val: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setGender(val);
    setShowGenderModal(false);
    if (errors.gender) setErrors((prev) => ({ ...prev, gender: undefined }));
  };

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
            {/* BVN */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                BVN <Text style={styles.required}>*</Text>
              </Text>
              <Pressable
                onPress={() => bvnRef.current?.focus()}
                style={[
                  styles.inputWrapper,
                  focusedInput === 'bvn' && styles.inputWrapperFocused,
                  errors.bvn ? styles.inputWrapperError : null,
                ]}
              >
                <TextInput
                  ref={bvnRef}
                  style={styles.input}
                  placeholder="e.g 22456987341"
                  placeholderTextColor="rgba(255, 255, 255, 0.32)"
                  value={bvn}
                  onChangeText={handleBVNChange}
                  keyboardType="number-pad"
                  textContentType="none"
                  onFocus={() => setFocusedInput('bvn')}
                  onBlur={() => setFocusedInput(null)}
                  maxLength={11}
                  returnKeyType="next"
                />
              </Pressable>
              {errors.bvn && <Text style={styles.errorText}>{errors.bvn}</Text>}
            </View>

            {/* DOB and Gender */}
            <View style={styles.rowContainer}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: scale(8) }]}>
                <Text style={styles.inputLabel}>
                  Date of birth <Text style={styles.required}>*</Text>
                </Text>
                <Pressable
                  onPress={() => dobRef.current?.focus()}
                  style={[
                    styles.inputWrapper,
                    focusedInput === 'dob' && styles.inputWrapperFocused,
                    errors.dateOfBirth ? styles.inputWrapperError : null,
                  ]}
                >
                  <TextInput
                    ref={dobRef}
                    style={styles.input}
                    placeholder="DD/MM/YYYY"
                    placeholderTextColor="rgba(255, 255, 255, 0.32)"
                    value={dateOfBirth}
                    onChangeText={handleDOBChange}
                    keyboardType="number-pad"
                    onFocus={() => setFocusedInput('dob')}
                    onBlur={() => setFocusedInput(null)}
                    maxLength={10}
                  />
                </Pressable>
                {errors.dateOfBirth && <Text style={styles.errorText}>{errors.dateOfBirth}</Text>}
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: scale(8) }]}>
                <Text style={styles.inputLabel}>
                  Gender <Text style={styles.required}>*</Text>
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.inputWrapper,
                    styles.selectWrapper,
                    focusedInput === 'gender' && styles.inputWrapperFocused,
                    errors.gender ? styles.inputWrapperError : null,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setFocusedInput('gender');
                    setShowGenderModal(true);
                  }}
                >
                  <Text
                    style={[styles.selectText, !gender && styles.placeholderText]}
                    numberOfLines={1}
                  >
                    {gender || 'Select'}
                  </Text>
                  <SvgXml xml={chevronDownSvg} width={scale(12)} height={verticalScale(8)} />
                </Pressable>
                {errors.gender && <Text style={styles.errorText}>{errors.gender}</Text>}
              </View>
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

      {/* Gender Modal */}
      <NativeSheet
        visible={showGenderModal}
        title="Select Gender"
        onClose={() => setShowGenderModal(false)}
      >
        <ScrollView
          style={styles.modalList}
          contentContainerStyle={styles.modalListContent}
          showsVerticalScrollIndicator={false}
        >
          {genderOptions.map((opt) => (
            <Pressable
              key={opt}
              style={({ pressed }) => [
                styles.modalItem,
                pressed && { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
              ]}
              onPress={() => handleSelectGender(opt)}
            >
              <Text style={styles.modalItemText}>{opt}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </NativeSheet>
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
  selectWrapper: {
    paddingVertical: verticalScale(16),
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
    padding: 0,
  },
  selectText: {
    flex: 1,
    fontSize: moderateScale(16),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  placeholderText: {
    color: 'rgba(255, 255, 255, 0.32)',
  },
  errorText: {
    fontSize: moderateScale(14),
    color: '#FF3B30',
    marginTop: verticalScale(8),
    fontFamily: 'Montserrat_400Regular',
  },
  modalList: {
    flex: 1,
    paddingHorizontal: scale(8),
  },
  modalListContent: {
    paddingBottom: verticalScale(80),
  },
  modalItem: {
    padding: scale(20),
    borderRadius: scale(12),
    borderCurve: 'continuous',
    marginVertical: verticalScale(2),
  },
  modalItemText: {
    fontSize: moderateScale(17),
    color: '#FFFFFF',
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

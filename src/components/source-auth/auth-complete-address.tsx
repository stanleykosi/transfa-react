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
import SearchNormalIcon from '@/assets/icons/search-normal.svg';
import Logo from '@/assets/images/logo.svg';
import SvgAsset from '@/components/SvgAsset';
import NativeSheet from '@/components/ui/NativeSheet';
import { globalStyles } from '@/styles/global';
import { moderateScale, scale, verticalScale } from '@/utils/responsive';

const chevronDownSvg = `<svg width="12" height="8" viewBox="0 0 12 8" fill="none" xmlns="http://www.w3.org/2000/svg">
<path d="M1 1L6 6L11 1" stroke="white" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`;

const nigerianStates = [
  'Lagos',
  'Ogun',
  'Abia',
  'Adamawa',
  'Akwa Ibom',
  'Anambra',
  'Bauchi',
  'Bayelsa',
  'Benue',
  'Borno',
  'Cross River',
  'Delta',
];

const countries = ['Nigeria', 'Ghana', 'Kenya', 'South Africa', 'United Kingdom'];

interface AuthCompleteAddressProps {
  onNext: (data: {
    address: string;
    stateCity: string;
    postalCode: string;
    country: string;
  }) => void;
  onBack?: () => void;
  initialValues?: {
    address?: string;
    stateCity?: string;
    postalCode?: string;
    country?: string;
  };
}

export default function AuthCompleteAddress({
  onNext,
  onBack,
  initialValues,
}: AuthCompleteAddressProps) {
  const insets = useSafeAreaInsets();
  const [address, setAddress] = useState(initialValues?.address || '');
  const [stateCity, setStateCity] = useState(initialValues?.stateCity || '');
  const [postalCode, setPostalCode] = useState(initialValues?.postalCode || '');
  const [country, setCountry] = useState(initialValues?.country || '');
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [showStateModal, setShowStateModal] = useState(false);
  const [showCountryModal, setShowCountryModal] = useState(false);
  const [countrySearch, setCountrySearch] = useState('');
  const [errors, setErrors] = useState<{
    address?: string;
    stateCity?: string;
    postalCode?: string;
    country?: string;
  }>({});

  const addressRef = useRef<TextInput>(null);
  const postalCodeRef = useRef<TextInput>(null);

  const handleNext = useCallback(() => {
    const newErrors: typeof errors = {};
    if (!address.trim()) newErrors.address = 'Address is required';
    if (!stateCity.trim()) newErrors.stateCity = 'State/City is required';
    if (!postalCode.trim()) newErrors.postalCode = 'Postal code is required';
    if (!country.trim()) newErrors.country = 'Country is required';

    if (Object.keys(newErrors).length > 0) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setErrors(newErrors);
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onNext({
      address: address.trim(),
      stateCity: stateCity.trim(),
      postalCode: postalCode.trim(),
      country: country.trim(),
    });
  }, [address, stateCity, postalCode, country, onNext]);

  const handleSelectState = (selectedState: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setStateCity(selectedState);
    setShowStateModal(false);
    setErrors((prev) => ({ ...prev, stateCity: undefined }));
  };

  const handleSelectCountry = (selectedCountry: string) => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setCountry(selectedCountry);
    setShowCountryModal(false);
    setCountrySearch('');
    setErrors((prev) => ({ ...prev, country: undefined }));
  };

  const handleBack = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    onBack?.();
  }, [onBack]);

  const filteredCountries = countries.filter((c) =>
    c.toLowerCase().includes(countrySearch.toLowerCase())
  );

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
            {/* Address */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Address <Text style={styles.required}>*</Text>
              </Text>
              <Pressable
                onPress={() => addressRef.current?.focus()}
                style={[
                  styles.inputWrapper,
                  focusedInput === 'address' && styles.inputWrapperFocused,
                  errors.address ? styles.inputWrapperError : null,
                ]}
              >
                <TextInput
                  ref={addressRef}
                  style={[styles.input, { textAlignVertical: 'top' }]}
                  placeholder="e.g 18, Babalola street, Magodo"
                  placeholderTextColor="rgba(255, 255, 255, 0.32)"
                  value={address}
                  onChangeText={(val) => {
                    setAddress(val);
                    if (errors.address) setErrors((prev) => ({ ...prev, address: undefined }));
                  }}
                  onFocus={() => setFocusedInput('address')}
                  onBlur={() => setFocusedInput(null)}
                  multiline
                  autoComplete="street-address"
                  textContentType="fullStreetAddress"
                  maxLength={256}
                />
              </Pressable>
              {errors.address && <Text style={styles.errorText}>{errors.address}</Text>}
            </View>

            {/* State and Postal Code */}
            <View style={styles.rowContainer}>
              <View style={[styles.inputGroup, { flex: 1, marginRight: scale(8) }]}>
                <Text style={styles.inputLabel}>
                  State/City <Text style={styles.required}>*</Text>
                </Text>
                <Pressable
                  style={({ pressed }) => [
                    styles.inputWrapper,
                    styles.selectWrapper,
                    focusedInput === 'stateCity' && styles.inputWrapperFocused,
                    errors.stateCity ? styles.inputWrapperError : null,
                    pressed && { opacity: 0.7 },
                  ]}
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setFocusedInput('stateCity');
                    setShowStateModal(true);
                  }}
                >
                  <Text
                    style={[styles.selectText, !stateCity && styles.placeholderText]}
                    numberOfLines={1}
                  >
                    {stateCity || 'e.g Lagos'}
                  </Text>
                  <SvgXml xml={chevronDownSvg} width={scale(12)} height={verticalScale(8)} />
                </Pressable>
                {errors.stateCity && <Text style={styles.errorText}>{errors.stateCity}</Text>}
              </View>

              <View style={[styles.inputGroup, { flex: 1, marginLeft: scale(8) }]}>
                <Text style={styles.inputLabel}>
                  Postal Code <Text style={styles.required}>*</Text>
                </Text>
                <Pressable
                  onPress={() => postalCodeRef.current?.focus()}
                  style={[
                    styles.inputWrapper,
                    focusedInput === 'postalCode' && styles.inputWrapperFocused,
                    errors.postalCode ? styles.inputWrapperError : null,
                  ]}
                >
                  <TextInput
                    ref={postalCodeRef}
                    style={styles.input}
                    placeholder="e.g 100011"
                    placeholderTextColor="rgba(255, 255, 255, 0.32)"
                    value={postalCode}
                    onChangeText={(val) => {
                      setPostalCode(val.replace(/[^0-9]/g, '').slice(0, 6));
                      if (errors.postalCode)
                        setErrors((prev) => ({
                          ...prev,
                          postalCode: undefined,
                        }));
                    }}
                    autoComplete="postal-code"
                    textContentType="postalCode"
                    keyboardType="number-pad"
                    onFocus={() => setFocusedInput('postalCode')}
                    onBlur={() => setFocusedInput(null)}
                    maxLength={6}
                  />
                </Pressable>
                {errors.postalCode && <Text style={styles.errorText}>{errors.postalCode}</Text>}
              </View>
            </View>

            {/* Country */}
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>
                Country <Text style={styles.required}>*</Text>
              </Text>
              <Pressable
                style={({ pressed }) => [
                  styles.inputWrapper,
                  styles.selectWrapper,
                  focusedInput === 'country' && styles.inputWrapperFocused,
                  errors.country ? styles.inputWrapperError : null,
                  pressed && { opacity: 0.7 },
                ]}
                onPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                  setFocusedInput('country');
                  setShowCountryModal(true);
                }}
              >
                <View style={[styles.iconContainer, { marginRight: scale(12) }]}>
                  <SvgAsset source={SearchNormalIcon} width={scale(20)} height={scale(20)} />
                </View>
                <Text style={[styles.selectText, !country && styles.placeholderText]}>
                  {country || 'Search Country'}
                </Text>
                <SvgXml xml={chevronDownSvg} width={scale(12)} height={verticalScale(8)} />
              </Pressable>
              {errors.country && <Text style={styles.errorText}>{errors.country}</Text>}
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

      {/* State/City Modal */}
      <NativeSheet
        visible={showStateModal}
        onClose={() => setShowStateModal(false)}
        title="Select State/City"
        maxHeight="60%"
      >
        <ScrollView
          style={styles.modalList}
          contentContainerStyle={styles.modalListContent}
          showsVerticalScrollIndicator={false}
        >
          {nigerianStates.map((state) => (
            <Pressable
              key={state}
              style={({ pressed }) => [
                styles.modalItem,
                pressed && { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
              ]}
              onPress={() => handleSelectState(state)}
            >
              <Text style={styles.modalItemText}>{state}</Text>
            </Pressable>
          ))}
        </ScrollView>
      </NativeSheet>

      {/* Country Modal */}
      <NativeSheet
        visible={showCountryModal}
        title="Select Country"
        maxHeight="60%"
        onClose={() => {
          setShowCountryModal(false);
          setCountrySearch('');
        }}
      >
        <View style={styles.modalSearchContainer}>
          <View style={styles.searchInputWrapper}>
            <SvgAsset source={SearchNormalIcon} width={scale(18)} height={scale(18)} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search Country"
              placeholderTextColor="rgba(255, 255, 255, 0.32)"
              value={countrySearch}
              onChangeText={setCountrySearch}
            />
          </View>
        </View>
        <ScrollView
          style={styles.modalList}
          contentContainerStyle={styles.modalListContent}
          showsVerticalScrollIndicator={false}
        >
          {filteredCountries.map((countryItem) => (
            <Pressable
              key={countryItem}
              style={({ pressed }) => [
                styles.modalItem,
                pressed && { backgroundColor: 'rgba(255, 255, 255, 0.05)' },
              ]}
              onPress={() => handleSelectCountry(countryItem)}
            >
              <Text style={styles.modalItemText}>{countryItem}</Text>
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
    // paddingVertical: verticalScale(16),
    minHeight: verticalScale(56),
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
  iconContainer: {
    justifyContent: 'center',
  },
  errorText: {
    fontSize: moderateScale(14),
    color: '#FF3B30',
    marginTop: verticalScale(8),
    fontFamily: 'Montserrat_400Regular',
  },
  modalSearchContainer: {
    padding: scale(20),
  },
  searchInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderRadius: scale(12),
    borderCurve: 'continuous',
    paddingHorizontal: scale(16),
    height: verticalScale(50),
  },
  searchInput: {
    flex: 1,
    fontSize: moderateScale(16),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
    marginLeft: scale(12),
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

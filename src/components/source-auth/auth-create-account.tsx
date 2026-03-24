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

import BackIcon from '@/assets/icons/back.svg';
import EmailIcon from '@/assets/icons/email.svg';
import PasswordIcon from '@/assets/icons/password.svg';
import Logo from '@/assets/images/logo.svg';
import SvgAsset from '@/components/SvgAsset';
import { globalStyles } from '@/styles/global';
import { moderateScale, scale, verticalScale } from '@/utils/responsive';

interface AuthCreateAccountProps {
  onNext: (email: string, password: string) => void;
  onLogin: () => void;
  onBack?: () => void;
  isSubmitting?: boolean;
}

export default function AuthCreateAccount({
  onNext,
  onLogin,
  onBack,
  isSubmitting = false,
}: AuthCreateAccountProps) {
  const insets = useSafeAreaInsets();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [emailError, setEmailError] = useState('');
  const [passwordError, setPasswordError] = useState('');

  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);
  const confirmPasswordRef = useRef<TextInput>(null);

  const validateEmail = useCallback((emailValue: string): boolean => {
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    return emailRegex.test(emailValue);
  }, []);

  const handleEmailChange = useCallback(
    (value: string) => {
      setEmail(value);
      if (emailError) setEmailError('');
    },
    [emailError]
  );

  const handleEmailBlur = useCallback(() => {
    setFocusedInput(null);
    if (isSubmitting) {
      return;
    }
    const trimmedEmail = email.trim();
    if (trimmedEmail && !validateEmail(trimmedEmail)) {
      setEmailError('Please enter a valid email address');
    } else {
      setEmailError('');
    }
  }, [email, isSubmitting, validateEmail]);

  const handleCreateAccount = useCallback(() => {
    if (isSubmitting) {
      return;
    }
    const trimmedEmail = email.trim();

    if (!trimmedEmail) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setEmailError('Email is required');
      return;
    }

    if (!validateEmail(trimmedEmail)) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setEmailError('Please enter a valid email address');
      return;
    }

    if (!password.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPasswordError('Password is required');
      return;
    }

    if (password !== confirmPassword) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error);
      setPasswordError('Passwords do not match');
      return;
    }

    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    onNext(trimmedEmail, password);
  }, [isSubmitting, email, password, confirmPassword, onNext, validateEmail]);

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
          contentContainerStyle={[
            styles.scrollContent,
            {
              paddingTop: insets.top + verticalScale(20),
              paddingBottom: insets.bottom + verticalScale(20),
            },
          ]}
          keyboardShouldPersistTaps="handled"
        >
          {onBack && (
            <Pressable
              style={({ pressed }) => [styles.backButton, pressed && styles.buttonPressedOpacity]}
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onBack();
              }}
              hitSlop={{ top: 20, bottom: 20, left: 20, right: 20 }}
            >
              <SvgAsset source={BackIcon} width={scale(24)} height={scale(24)} />
            </Pressable>
          )}

          <Animated.View entering={FadeIn.duration(500)} style={styles.logoContainer}>
            <SvgAsset source={Logo} width={scale(49)} height={scale(23)} />
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(400).delay(100)} style={styles.titleContainer}>
            <Text style={styles.title}>Create Account</Text>
            <Text style={styles.subtitle}>Create your preferred username & password</Text>
          </Animated.View>

          <Animated.View entering={FadeInUp.duration(400).delay(200)}>
            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Email</Text>
              <Pressable
                onPress={() => emailRef.current?.focus()}
                style={[
                  styles.inputWrapper,
                  focusedInput === 'email' && styles.inputWrapperFocused,
                  emailError ? styles.inputWrapperError : null,
                ]}
              >
                <View style={styles.iconContainer}>
                  <SvgAsset source={EmailIcon} width={scale(20)} height={scale(21)} />
                </View>
                <TextInput
                  ref={emailRef}
                  style={styles.input}
                  placeholder="Email"
                  placeholderTextColor="rgba(255, 255, 255, 0.32)"
                  value={email}
                  onChangeText={handleEmailChange}
                  keyboardType="email-address"
                  keyboardAppearance="dark"
                  autoCapitalize="none"
                  autoComplete="email"
                  textContentType="emailAddress"
                  returnKeyType="next"
                  onSubmitEditing={() => passwordRef.current?.focus()}
                  onFocus={() => setFocusedInput('email')}
                  onBlur={handleEmailBlur}
                />
              </Pressable>
              {emailError ? <Text style={styles.errorText}>{emailError}</Text> : null}
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Password</Text>
              <Pressable
                onPress={() => passwordRef.current?.focus()}
                style={[
                  styles.inputWrapper,
                  focusedInput === 'password' && styles.inputWrapperFocused,
                ]}
              >
                <View style={styles.iconContainer}>
                  <SvgAsset source={PasswordIcon} width={scale(20)} height={scale(21)} />
                </View>
                <TextInput
                  ref={passwordRef}
                  style={styles.input}
                  placeholder="Password"
                  placeholderTextColor="rgba(255, 255, 255, 0.32)"
                  value={password}
                  onChangeText={(val) => {
                    setPassword(val);
                    if (passwordError) setPasswordError('');
                  }}
                  keyboardAppearance="dark"
                  secureTextEntry={!showPassword}
                  autoComplete="password-new"
                  textContentType="newPassword"
                  returnKeyType="next"
                  onSubmitEditing={() => confirmPasswordRef.current?.focus()}
                  onFocus={() => setFocusedInput('password')}
                  onBlur={() => setFocusedInput(null)}
                />
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowPassword(!showPassword);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.eyeIcon}>{showPassword ? '👁' : '👁‍🗨'}</Text>
                </Pressable>
              </Pressable>
            </View>

            <View style={styles.inputGroup}>
              <Text style={styles.inputLabel}>Confirm Password</Text>
              <Pressable
                onPress={() => confirmPasswordRef.current?.focus()}
                style={[
                  styles.inputWrapper,
                  focusedInput === 'confirmPassword' && styles.inputWrapperFocused,
                  passwordError ? styles.inputWrapperError : null,
                ]}
              >
                <View style={styles.iconContainer}>
                  <SvgAsset source={PasswordIcon} width={scale(20)} height={scale(21)} />
                </View>
                <TextInput
                  ref={confirmPasswordRef}
                  style={styles.input}
                  placeholder="Confirm Password"
                  placeholderTextColor="rgba(255, 255, 255, 0.32)"
                  value={confirmPassword}
                  onChangeText={(val) => {
                    setConfirmPassword(val);
                    if (passwordError) setPasswordError('');
                  }}
                  keyboardAppearance="dark"
                  secureTextEntry={!showConfirmPassword}
                  autoComplete="password-new"
                  textContentType="newPassword"
                  returnKeyType="done"
                  onSubmitEditing={handleCreateAccount}
                  onFocus={() => setFocusedInput('confirmPassword')}
                  onBlur={() => setFocusedInput(null)}
                />
                <Pressable
                  onPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                    setShowConfirmPassword(!showConfirmPassword);
                  }}
                  hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
                >
                  <Text style={styles.eyeIcon}>{showConfirmPassword ? '👁' : '👁‍🗨'}</Text>
                </Pressable>
              </Pressable>
              {passwordError ? <Text style={styles.errorText}>{passwordError}</Text> : null}
            </View>
          </Animated.View>

          {/* Create Account Button */}
          <Animated.View entering={FadeInUp.duration(400).delay(300)}>
            <Pressable
              style={({ pressed }) => [
                globalStyles.primaryButtonWithMargin,
                isSubmitting && styles.buttonDisabled,
                pressed && !isSubmitting && styles.buttonPressed,
              ]}
              onPress={handleCreateAccount}
              disabled={isSubmitting}
            >
              <Text style={globalStyles.primaryButtonText}>
                {isSubmitting ? 'Creating...' : 'Create Account'}
              </Text>
            </Pressable>
          </Animated.View>

          {/* Login Link */}
          <Animated.View entering={FadeInUp.duration(400).delay(350)} style={styles.loginContainer}>
            <Text style={styles.loginText}>Already have an account? </Text>
            <Pressable
              onPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
                onLogin();
              }}
            >
              <Text style={styles.loginLink}>Login</Text>
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
  scrollContent: {
    paddingHorizontal: scale(20),
    zIndex: 1,
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
    marginBottom: verticalScale(40),
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
  inputGroup: {
    marginBottom: verticalScale(24),
  },
  inputLabel: {
    fontSize: moderateScale(18),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: verticalScale(12),
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
  iconContainer: {
    marginRight: scale(12),
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
    marginLeft: scale(6),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  errorText: {
    fontSize: moderateScale(14),
    color: '#FF3B30',
    marginTop: verticalScale(8),
    fontFamily: 'Montserrat_400Regular',
  },
  eyeIcon: {
    fontSize: moderateScale(20),
    color: '#999999',
  },
  loginContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loginText: {
    fontSize: moderateScale(14),
    color: '#ffffff',
    fontFamily: 'Montserrat_400Regular',
  },
  loginLink: {
    fontSize: moderateScale(14),
    color: '#FFD300',
    fontWeight: '600',
    fontFamily: 'Montserrat_400Regular',
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonPressedOpacity: {
    opacity: 0.7,
  },
});

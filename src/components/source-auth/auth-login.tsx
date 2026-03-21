import * as Haptics from 'expo-haptics';
import { LinearGradient } from 'expo-linear-gradient';
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import Animated, { FadeIn, FadeInUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import PasswordIcon from '@/assets/icons/password.svg';
import UsernameIcon from '@/assets/icons/username.svg';
import Logo from '@/assets/images/logo.svg';
import SvgAsset from '@/components/SvgAsset';
import { globalStyles } from '@/styles/global';
import { moderateScale, scale, verticalScale } from '@/utils/responsive';

interface AuthLoginProps {
  onLogin: (username: string, password: string, rememberMe: boolean) => void;
  onSignUp: () => void;
  onForgotPassword: () => void;
  defaultIdentifier?: string;
  defaultRememberMe?: boolean;
  isLoading?: boolean;
  onIdentifierChange?: (value: string) => void;
}

export default function AuthLogin({
  onLogin,
  onSignUp,
  onForgotPassword,
  defaultIdentifier = '',
  defaultRememberMe = false,
  isLoading = false,
  onIdentifierChange,
}: AuthLoginProps) {
  const insets = useSafeAreaInsets();
  const [username, setUsername] = useState(defaultIdentifier);
  const [password, setPassword] = useState('');
  const [rememberMe, setRememberMe] = useState(defaultRememberMe);
  const [showPassword, setShowPassword] = useState(false);
  const [focusedInput, setFocusedInput] = useState<string | null>(null);

  useEffect(() => {
    if (defaultIdentifier) {
      setUsername(defaultIdentifier);
    }
  }, [defaultIdentifier]);

  useEffect(() => {
    setRememberMe(defaultRememberMe);
  }, [defaultRememberMe]);

  // Refs for chaining keyboard focus between inputs
  const usernameRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const handleLogin = useCallback(() => {
    if (!isLoading && username.trim() && password.trim()) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onLogin(username.trim(), password, rememberMe);
    }
  }, [isLoading, username, password, rememberMe, onLogin]);

  const togglePasswordVisibility = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setShowPassword((prev) => !prev);
  }, []);

  const toggleRememberMe = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setRememberMe((prev) => !prev);
  }, []);

  return (
    <View style={styles.container}>
      <LinearGradient
        colors={['#2B2B2B', '#0F0F0F', '#0F0F0F']}
        locations={[0, 0.78, 1]}
        style={StyleSheet.absoluteFill}
      />

      <View
        style={[
          styles.content,
          {
            paddingTop: insets.top + verticalScale(60),
            paddingBottom: insets.bottom + verticalScale(20),
          },
        ]}
      >
        {/* Logo */}
        <Animated.View entering={FadeIn.duration(500)} style={styles.logoContainer}>
          <SvgAsset source={Logo} width={scale(49)} height={scale(23)} />
        </Animated.View>

        {/* Title */}
        <Animated.View entering={FadeInUp.duration(400).delay(100)} style={styles.titleContainer}>
          <Text style={styles.title}>Login to Transfa</Text>
          <Text style={styles.welcomeText}>Hi! Welcome back</Text>
        </Animated.View>

        {/* Input fields */}
        <Animated.View entering={FadeInUp.duration(400).delay(200)} style={styles.inputContainer}>
          {/* Username */}
          <View style={styles.inputGroup}>
            <Text style={styles.inputLabel}>Username or Email</Text>
            <Pressable
              onPress={() => usernameRef.current?.focus()}
              style={[
                styles.inputWrapper,
                focusedInput === 'username' && styles.inputWrapperFocused,
              ]}
            >
              <View style={styles.iconContainer}>
                <SvgAsset source={UsernameIcon} width={20} height={21} />
              </View>
              <TextInput
                ref={usernameRef}
                style={styles.input}
                placeholder="Username or Email"
                placeholderTextColor="rgba(255, 255, 255, 0.32)"
                value={username}
                onChangeText={(value) => {
                  setUsername(value);
                  onIdentifierChange?.(value);
                }}
                autoCapitalize="none"
                autoComplete="username"
                textContentType="username"
                returnKeyType="next"
                onSubmitEditing={() => passwordRef.current?.focus()}
                onFocus={() => setFocusedInput('username')}
                onBlur={() => setFocusedInput(null)}
              />
            </Pressable>
          </View>

          {/* Password */}
          <View style={styles.inputGroup}>
            <View style={styles.passwordHeader}>
              <Text style={styles.inputLabel}>Password</Text>
              <Pressable
                onPress={onForgotPassword}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.forgotPasswordText}>Forgot Password?</Text>
              </Pressable>
            </View>
            <Pressable
              onPress={() => passwordRef.current?.focus()}
              style={[
                styles.inputWrapper,
                focusedInput === 'password' && styles.inputWrapperFocused,
              ]}
            >
              <View style={styles.iconContainer}>
                <SvgAsset source={PasswordIcon} width={20} height={21} />
              </View>
              <TextInput
                ref={passwordRef}
                style={styles.input}
                placeholder="Password"
                placeholderTextColor="rgba(255, 255, 255, 0.32)"
                value={password}
                onChangeText={setPassword}
                secureTextEntry={!showPassword}
                autoComplete="password"
                textContentType="password"
                returnKeyType="done"
                onSubmitEditing={handleLogin}
                onFocus={() => setFocusedInput('password')}
                onBlur={() => setFocusedInput(null)}
              />
              <Pressable
                onPress={togglePasswordVisibility}
                hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
              >
                <Text style={styles.eyeIcon}>{showPassword ? '👁' : '👁‍🗨'}</Text>
              </Pressable>
            </Pressable>
          </View>
        </Animated.View>

        {/* Remember me */}
        <Animated.View
          entering={FadeInUp.duration(400).delay(300)}
          style={styles.rememberMeContainer}
        >
          <Pressable style={styles.checkboxContainer} onPress={toggleRememberMe}>
            <View style={[styles.checkbox, rememberMe && styles.checkboxChecked]}>
              {rememberMe ? <Text style={styles.checkmark}>✓</Text> : null}
            </View>
            <Text style={styles.rememberMeText}>Remember Me</Text>
          </Pressable>
        </Animated.View>

        {/* Log In button */}
        <Animated.View entering={FadeInUp.duration(400).delay(350)}>
          <Pressable
            style={({ pressed }) => [
              globalStyles.primaryButtonWithMargin,
              styles.loginButton,
              (isLoading || !username.trim() || !password.trim()) && styles.buttonDisabled,
              pressed && !isLoading && styles.buttonPressed,
            ]}
            onPress={handleLogin}
            disabled={isLoading || !username.trim() || !password.trim()}
          >
            <Text style={globalStyles.primaryButtonText}>
              {isLoading ? 'Logging in...' : 'Log In'}
            </Text>
          </Pressable>
        </Animated.View>

        {/* Sign up link */}
        <Animated.View entering={FadeInUp.duration(400).delay(400)} style={styles.signUpContainer}>
          <Text style={styles.signUpText}>Do not have an account? </Text>
          <Pressable onPress={onSignUp}>
            <Text style={styles.signUpLink}>Sign Up</Text>
          </Pressable>
        </Animated.View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  content: {
    flex: 1,
    paddingHorizontal: scale(20),
    zIndex: 1,
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
  welcomeText: {
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
    marginBottom: verticalScale(24),
  },
  passwordHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: verticalScale(8),
  },
  inputLabel: {
    fontSize: moderateScale(18),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: verticalScale(12),
  },
  forgotPasswordText: {
    fontSize: moderateScale(14),
    color: '#FFD300',
    fontFamily: 'Montserrat_400Regular',
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
  input: {
    flex: 1,
    fontSize: moderateScale(16),
    marginLeft: scale(6),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  eyeIcon: {
    fontSize: moderateScale(20),
    color: '#999999',
  },
  rememberMeContainer: {
    marginBottom: verticalScale(32),
  },
  checkboxContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
  },
  checkbox: {
    width: scale(20),
    height: scale(20),
    borderWidth: 2,
    borderColor: '#FFD300',
    borderRadius: scale(4),
    borderCurve: 'continuous',
    justifyContent: 'center',
    alignItems: 'center',
  },
  checkboxChecked: {
    backgroundColor: '#FFD300',
  },
  checkmark: {
    fontSize: moderateScale(14),
    color: '#000000',
    fontWeight: 'bold',
  },
  rememberMeText: {
    fontSize: moderateScale(16),
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  loginButton: {
    borderCurve: 'continuous',
  },
  buttonDisabled: {
    opacity: 0.65,
  },
  buttonPressed: {
    opacity: 0.85,
    transform: [{ scale: 0.97 }],
  },
  signUpContainer: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  signUpText: {
    fontSize: moderateScale(14),
    color: '#ffffff',
    fontFamily: 'Montserrat_400Regular',
  },
  signUpLink: {
    fontSize: moderateScale(14),
    color: '#FFD300',
    fontWeight: '600',
    fontFamily: 'Montserrat_400Regular',
  },
});

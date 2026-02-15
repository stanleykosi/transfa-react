import React, { useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  TouchableOpacity,
  Platform,
  KeyboardAvoidingView,
  ScrollView,
  TextInput,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useSignUp } from '@/hooks/useSignUp';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SignUp as ClerkSignUp } from '@/components/ClerkComponents';
import { AuthStackParamList } from '@/navigation/AuthStack';
import { fetchAuthSession } from '@/api/authApi';

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const MIN_PASSWORD_LENGTH = 8;

type AuthNavigation = NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;

const TransfaMark = () => {
  return (
    <View style={styles.logoMark}>
      <View style={styles.logoSlash} />
      <View style={styles.logoBottomMark} />
    </View>
  );
};

const getErrorMessage = (err: unknown, fallback: string): string => {
  const message = (err as any)?.errors?.[0]?.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  return fallback;
};

const SignUpScreen = () => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const navigation = useNavigation<AuthNavigation>();

  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [verificationCode, setVerificationCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResendingCode, setIsResendingCode] = useState(false);
  const [isPasswordVisible, setIsPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);

  const normalizedEmail = useMemo(() => emailAddress.trim().toLowerCase(), [emailAddress]);
  const isEmailValid = useMemo(() => EMAIL_REGEX.test(normalizedEmail), [normalizedEmail]);
  const isPasswordValid = useMemo(() => password.length >= MIN_PASSWORD_LENGTH, [password]);
  const isConfirmPasswordValid = useMemo(
    () => confirmPassword.length > 0 && confirmPassword === password,
    [confirmPassword, password]
  );
  const canSubmit = useMemo(
    () => isLoaded && isEmailValid && isPasswordValid && isConfirmPasswordValid && !isLoading,
    [isLoaded, isEmailValid, isPasswordValid, isConfirmPasswordValid, isLoading]
  );

  const onSignUpPress = async () => {
    if (!isLoaded || isLoading) {
      return;
    }

    if (!isEmailValid) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }
    if (!isPasswordValid) {
      Alert.alert(
        'Weak password',
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
      );
      return;
    }
    if (!isConfirmPasswordValid) {
      Alert.alert('Password mismatch', 'Password and confirm password do not match.');
      return;
    }

    setIsLoading(true);
    try {
      const signUpResult = await signUp.create({ emailAddress: normalizedEmail, password });

      if (signUpResult.status === 'complete' && signUpResult.createdSessionId) {
        await setActive({ session: signUpResult.createdSessionId });
        try {
          await fetchAuthSession();
        } catch (bootstrapError) {
          console.warn('Auth bootstrap check failed after sign-up', bootstrapError);
        }
        return;
      }

      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: unknown) {
      Alert.alert('Sign up failed', getErrorMessage(err, 'Unable to create account. Try again.'));
    } finally {
      setIsLoading(false);
    }
  };

  const onPressVerify = async () => {
    if (!isLoaded || isLoading) {
      return;
    }
    if (!verificationCode.trim()) {
      Alert.alert('Missing code', 'Enter the verification code sent to your email.');
      return;
    }

    setIsLoading(true);
    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code: verificationCode.trim(),
      });
      if (completeSignUp.status === 'complete') {
        await setActive({ session: completeSignUp.createdSessionId });
        try {
          await fetchAuthSession();
        } catch (bootstrapError) {
          console.warn('Auth bootstrap check failed after verification', bootstrapError);
        }
        return;
      }
      Alert.alert('Verification pending', 'Complete verification to continue.');
    } catch (err: unknown) {
      Alert.alert(
        'Verification failed',
        getErrorMessage(err, 'Unable to verify your email code. Try again.')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const onResendCode = async () => {
    if (!isLoaded || isResendingCode) {
      return;
    }
    setIsResendingCode(true);
    try {
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      Alert.alert('Code sent', 'A new verification code has been sent to your email.');
    } catch (err: unknown) {
      Alert.alert('Resend failed', getErrorMessage(err, 'Unable to resend code right now.'));
    } finally {
      setIsResendingCode(false);
    }
  };

  // Use platform-specific SignUp component for web
  if (Platform.OS === 'web') {
    return <ClerkSignUp />;
  }

  if (!isLoaded) {
    return (
      <SafeAreaView style={styles.safeArea}>
        <LinearGradient colors={['#242424', '#121212', '#060708']} style={styles.gradient}>
          <View style={styles.loadingContainer}>
            <Text style={styles.loadingText}>Loading...</Text>
          </View>
        </LinearGradient>
      </SafeAreaView>
    );
  }

  if (pendingVerification) {
    return (
      <SafeAreaView style={styles.safeArea}>
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
              <TouchableOpacity
                style={styles.backButton}
                onPress={() => setPendingVerification(false)}
                activeOpacity={0.7}
              >
                <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
              </TouchableOpacity>

              <View style={styles.contentContainer}>
                <TransfaMark />
                <Text style={styles.title}>Verify Email</Text>
                <Text style={styles.subtitle}>Enter the code sent to {normalizedEmail}</Text>

                <View style={styles.formSection}>
                  <Text style={styles.label}>Verification Code</Text>
                  <View style={styles.inputWrapper}>
                    <Ionicons name="mail-unread-outline" size={20} color="#9B9B9B" />
                    <TextInput
                      style={styles.textInput}
                      value={verificationCode}
                      onChangeText={setVerificationCode}
                      placeholder="Enter code"
                      placeholderTextColor="#7E7E7E"
                      autoCapitalize="none"
                      keyboardType="number-pad"
                      textContentType="oneTimeCode"
                    />
                  </View>

                  <TouchableOpacity
                    style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
                    onPress={onPressVerify}
                    disabled={isLoading}
                    activeOpacity={0.85}
                  >
                    <Text style={styles.primaryButtonText}>
                      {isLoading ? 'Verifying...' : 'Verify Email'}
                    </Text>
                  </TouchableOpacity>

                  <TouchableOpacity
                    style={styles.secondaryAction}
                    onPress={onResendCode}
                    disabled={isResendingCode}
                    activeOpacity={0.7}
                  >
                    <Text style={styles.secondaryActionText}>
                      {isResendingCode ? 'Sending...' : 'Resend Code'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </View>
            </ScrollView>
          </KeyboardAvoidingView>
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
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => {
                if (navigation.canGoBack()) {
                  navigation.goBack();
                  return;
                }
                navigation.navigate('SignIn');
              }}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.contentContainer}>
              <TransfaMark />
              <Text style={styles.title}>Create Account</Text>
              <Text style={styles.subtitle}>Create your preferred username & password</Text>

              <View style={styles.formSection}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={20} color="#9B9B9B" />
                  <TextInput
                    style={styles.textInput}
                    value={emailAddress}
                    onChangeText={setEmailAddress}
                    placeholder="Email"
                    placeholderTextColor="#7E7E7E"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    autoCorrect={false}
                    textContentType="emailAddress"
                  />
                </View>

                <Text style={styles.label}>Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={20} color="#9B9B9B" />
                  <TextInput
                    style={styles.textInput}
                    value={password}
                    onChangeText={setPassword}
                    placeholder="Password"
                    placeholderTextColor="#7E7E7E"
                    autoCapitalize="none"
                    secureTextEntry={!isPasswordVisible}
                    textContentType="newPassword"
                  />
                  <TouchableOpacity
                    onPress={() => setIsPasswordVisible((prev) => !prev)}
                    activeOpacity={0.7}
                    style={styles.eyeButton}
                  >
                    <Ionicons
                      name={isPasswordVisible ? 'eye-outline' : 'eye-off-outline'}
                      size={20}
                      color="#9B9B9B"
                    />
                  </TouchableOpacity>
                </View>

                <Text style={styles.label}>Confirm Password</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="lock-closed-outline" size={20} color="#9B9B9B" />
                  <TextInput
                    style={styles.textInput}
                    value={confirmPassword}
                    onChangeText={setConfirmPassword}
                    placeholder="Password"
                    placeholderTextColor="#7E7E7E"
                    autoCapitalize="none"
                    secureTextEntry={!isConfirmPasswordVisible}
                    textContentType="newPassword"
                  />
                  <TouchableOpacity
                    onPress={() => setIsConfirmPasswordVisible((prev) => !prev)}
                    activeOpacity={0.7}
                    style={styles.eyeButton}
                  >
                    <Ionicons
                      name={isConfirmPasswordVisible ? 'eye-outline' : 'eye-off-outline'}
                      size={20}
                      color="#9B9B9B"
                    />
                  </TouchableOpacity>
                </View>

                <TouchableOpacity
                  style={[styles.primaryButton, !canSubmit && styles.primaryButtonDisabled]}
                  onPress={onSignUpPress}
                  disabled={!canSubmit}
                  activeOpacity={0.85}
                >
                  <Text style={styles.primaryButtonText}>
                    {isLoading ? 'Creating...' : 'Create Account'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity
                  style={styles.loginRow}
                  onPress={() => navigation.navigate('SignIn')}
                  activeOpacity={0.7}
                >
                  <Text style={styles.loginText}>
                    Already have an account? <Text style={styles.loginAccent}>Login</Text>
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
    paddingHorizontal: 24,
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
    paddingTop: 38,
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
    lineHeight: 24,
    maxWidth: 286,
  },
  formSection: {
    width: '100%',
    marginTop: 50,
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
    marginBottom: 20,
  },
  textInput: {
    flex: 1,
    color: '#E9E9E9',
    fontSize: 15,
    marginLeft: 10,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },
  eyeButton: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  primaryButton: {
    marginTop: 2,
    backgroundColor: '#FFD300',
    borderRadius: 8,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryButtonDisabled: {
    opacity: 0.6,
  },
  primaryButtonText: {
    color: '#121212',
    fontSize: 18,
    fontWeight: '700',
  },
  loginRow: {
    marginTop: 18,
    alignItems: 'center',
  },
  loginText: {
    color: '#C5C5C5',
    fontSize: 15,
    fontWeight: '500',
  },
  loginAccent: {
    color: '#D2B108',
    fontWeight: '700',
  },
  secondaryAction: {
    marginTop: 14,
    alignItems: 'center',
  },
  secondaryActionText: {
    color: '#D2B108',
    fontSize: 15,
    fontWeight: '600',
  },
  loadingContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  loadingText: {
    color: '#D5D5D5',
    fontSize: 16,
  },
});

export default SignUpScreen;

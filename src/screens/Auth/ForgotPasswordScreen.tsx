import React, { useMemo, useState } from 'react';
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
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useSignIn } from '@/hooks/useSignIn';
import { fetchAuthSession } from '@/api/authApi';
import { AuthStackParamList } from '@/navigation/AuthStack';
import OtpCodeField from '@/components/auth/OtpCodeField';

const OTP_LENGTH = 6;
const MIN_PASSWORD_LENGTH = 8;

type ForgotPasswordRoute = RouteProp<AuthStackParamList, 'ForgotPassword'>;
type AuthNavigation = NativeStackNavigationProp<AuthStackParamList, 'ForgotPassword'>;

type EmailCodeFactor = {
  strategy?: string;
  emailAddressId?: string;
};

const TransfaMark = () => {
  return (
    <View style={styles.logoMark}>
      <View style={styles.logoSlash} />
      <View style={styles.logoBottomMark} />
    </View>
  );
};

const extractErrorMessage = (err: unknown, fallback: string): string => {
  const message = (err as any)?.errors?.[0]?.message;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  return fallback;
};

const getEmailSecondFactor = (value: any): EmailCodeFactor | null => {
  const secondFactors = value?.supportedSecondFactors;
  if (!Array.isArray(secondFactors)) {
    return null;
  }
  const emailFactor = secondFactors.find(
    (factor: any) => factor?.strategy === 'email_code' && typeof factor?.emailAddressId === 'string'
  );
  return emailFactor || null;
};

const ForgotPasswordScreen = () => {
  const { signIn, setActive, isLoaded } = useSignIn();
  const route = useRoute<ForgotPasswordRoute>();
  const navigation = useNavigation<AuthNavigation>();

  const [identifier, setIdentifier] = useState(route.params?.identifier?.trim() ?? '');
  const [step, setStep] = useState<'request' | 'verify'>('request');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isSendingCode, setIsSendingCode] = useState(false);
  const [isResendingCode, setIsResendingCode] = useState(false);
  const [isResetting, setIsResetting] = useState(false);
  const [isNewPasswordVisible, setIsNewPasswordVisible] = useState(false);
  const [isConfirmPasswordVisible, setIsConfirmPasswordVisible] = useState(false);

  const trimmedIdentifier = identifier.trim();
  const canSendCode = useMemo(
    () => isLoaded && trimmedIdentifier.length > 0 && !isSendingCode,
    [isLoaded, isSendingCode, trimmedIdentifier.length]
  );
  const canResetPassword = useMemo(
    () =>
      isLoaded &&
      code.length === OTP_LENGTH &&
      newPassword.length >= MIN_PASSWORD_LENGTH &&
      confirmPassword.length >= MIN_PASSWORD_LENGTH &&
      !isResetting,
    [isLoaded, code.length, confirmPassword.length, isResetting, newPassword.length]
  );

  const requestPasswordResetCode = async (isResend: boolean) => {
    if (!isLoaded || !signIn) {
      return;
    }

    if (!trimmedIdentifier) {
      Alert.alert('Missing identifier', 'Enter your account email to continue.');
      return;
    }

    if (isResend) {
      setIsResendingCode(true);
    } else {
      setIsSendingCode(true);
    }

    try {
      await signIn.create({
        strategy: 'reset_password_email_code',
        identifier: trimmedIdentifier,
      } as any);

      setStep('verify');
      if (!isResend) {
        setCode('');
      }

      Alert.alert(
        isResend ? 'Code resent' : 'Check your inbox',
        'If your account exists, a password reset code has been sent.'
      );
    } catch (err: unknown) {
      Alert.alert(
        isResend ? 'Unable to resend code' : 'Could not start reset',
        extractErrorMessage(err, 'Please verify your email and try again.')
      );
    } finally {
      if (isResend) {
        setIsResendingCode(false);
      } else {
        setIsSendingCode(false);
      }
    }
  };

  const onResetPasswordPress = async () => {
    if (!canResetPassword || !signIn) {
      return;
    }

    if (newPassword !== confirmPassword) {
      Alert.alert('Password mismatch', 'New password and confirm password must match.');
      return;
    }

    setIsResetting(true);
    try {
      const result: any = await signIn.attemptFirstFactor({
        strategy: 'reset_password_email_code',
        code,
        password: newPassword,
      });

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        try {
          await fetchAuthSession();
        } catch (bootstrapError) {
          console.warn('Auth bootstrap check failed after password reset', bootstrapError);
        }
        return;
      }

      if (result.status === 'needs_second_factor') {
        const emailFactor = getEmailSecondFactor(result);
        if (!emailFactor?.emailAddressId) {
          Alert.alert(
            'Verification required',
            'Your account requires an additional sign-in factor that is not configured in this app yet.'
          );
          return;
        }

        await signIn.prepareSecondFactor({
          strategy: 'email_code',
          emailAddressId: emailFactor.emailAddressId,
        });

        navigation.navigate('VerifyCode', {
          emailAddressId: emailFactor.emailAddressId,
        });
        return;
      }

      Alert.alert('Reset incomplete', 'Password reset is not complete yet. Please try again.');
    } catch (err: unknown) {
      Alert.alert(
        'Reset failed',
        extractErrorMessage(err, 'Unable to reset your password with this code.')
      );
    } finally {
      setIsResetting(false);
    }
  };

  const handleBack = () => {
    if (step === 'verify') {
      setStep('request');
      return;
    }
    navigation.navigate('SignIn');
  };

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
            <TouchableOpacity style={styles.backButton} onPress={handleBack} activeOpacity={0.7}>
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.contentContainer}>
              <TransfaMark />
              <Text style={styles.title}>Forgot Password</Text>
              <Text style={styles.subtitle}>
                {step === 'request'
                  ? 'Enter your account email to receive a reset code'
                  : 'Enter the code and your new password'}
              </Text>

              <View style={styles.formSection}>
                <Text style={styles.label}>Email</Text>
                <View style={styles.inputWrapper}>
                  <Ionicons name="mail-outline" size={20} color="#9B9B9B" />
                  <TextInput
                    style={styles.textInput}
                    value={identifier}
                    onChangeText={setIdentifier}
                    placeholder="Email address"
                    placeholderTextColor="#7E7E7E"
                    autoCapitalize="none"
                    keyboardType="email-address"
                    textContentType="emailAddress"
                    autoCorrect={false}
                    editable={step === 'request'}
                  />
                </View>

                {step === 'request' ? (
                  <TouchableOpacity
                    style={[styles.primaryButton, !canSendCode && styles.primaryButtonDisabled]}
                    onPress={() => requestPasswordResetCode(false)}
                    activeOpacity={0.85}
                    disabled={!canSendCode}
                  >
                    <Text style={styles.primaryButtonText}>
                      {isSendingCode ? 'Sending...' : 'Send Reset Code'}
                    </Text>
                  </TouchableOpacity>
                ) : (
                  <>
                    <Text style={styles.label}>Verification Code</Text>
                    <OtpCodeField
                      value={code}
                      onChangeCode={setCode}
                      length={OTP_LENGTH}
                      rowStyle={styles.otpRowCompact}
                    />

                    <Text style={styles.label}>New Password</Text>
                    <View style={styles.inputWrapper}>
                      <Ionicons name="lock-closed-outline" size={20} color="#9B9B9B" />
                      <TextInput
                        style={styles.textInput}
                        value={newPassword}
                        onChangeText={setNewPassword}
                        placeholder="At least 8 characters"
                        placeholderTextColor="#7E7E7E"
                        autoCapitalize="none"
                        secureTextEntry={!isNewPasswordVisible}
                        textContentType="newPassword"
                      />
                      <TouchableOpacity
                        onPress={() => setIsNewPasswordVisible((prev) => !prev)}
                        activeOpacity={0.7}
                        style={styles.eyeButton}
                      >
                        <Ionicons
                          name={isNewPasswordVisible ? 'eye-outline' : 'eye-off-outline'}
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
                        placeholder="Re-enter password"
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
                      style={[
                        styles.primaryButton,
                        !canResetPassword && styles.primaryButtonDisabled,
                      ]}
                      onPress={onResetPasswordPress}
                      activeOpacity={0.85}
                      disabled={!canResetPassword}
                    >
                      <Text style={styles.primaryButtonText}>
                        {isResetting ? 'Resetting...' : 'Reset Password'}
                      </Text>
                    </TouchableOpacity>

                    <TouchableOpacity
                      style={styles.linkRow}
                      onPress={() => requestPasswordResetCode(true)}
                      activeOpacity={0.75}
                      disabled={isResendingCode}
                    >
                      <Text style={styles.linkText}>
                        {isResendingCode ? 'Sending...' : 'Resend Code'}
                      </Text>
                    </TouchableOpacity>
                  </>
                )}
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
    fontSize: 36,
    fontWeight: '700',
    letterSpacing: -0.5,
    textAlign: 'center',
  },
  subtitle: {
    color: '#8A8A8A',
    fontSize: 15,
    fontWeight: '500',
    marginTop: 10,
    textAlign: 'center',
    maxWidth: 320,
  },
  formSection: {
    width: '100%',
    marginTop: 40,
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
    marginLeft: 10,
    paddingVertical: Platform.OS === 'ios' ? 12 : 8,
  },
  eyeButton: {
    paddingLeft: 8,
    paddingVertical: 4,
  },
  otpRowCompact: {
    marginTop: 0,
    marginBottom: 18,
  },
  primaryButton: {
    marginTop: 8,
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
    fontSize: 17,
    fontWeight: '700',
  },
  linkRow: {
    marginTop: 16,
    alignItems: 'center',
  },
  linkText: {
    color: '#D2B108',
    fontSize: 15,
    fontWeight: '600',
  },
});

export default ForgotPasswordScreen;

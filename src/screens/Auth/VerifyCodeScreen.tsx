import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
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

const OTP_LENGTH = 6;

type VerifyCodeRoute = RouteProp<AuthStackParamList, 'VerifyCode'>;
type AuthNavigation = NativeStackNavigationProp<AuthStackParamList, 'VerifyCode'>;

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

const getEmailFactor = (value: any): EmailCodeFactor | null => {
  const secondFactors = value?.supportedSecondFactors;
  if (!Array.isArray(secondFactors)) {
    return null;
  }
  const emailFactor = secondFactors.find(
    (factor: any) => factor?.strategy === 'email_code' && typeof factor?.emailAddressId === 'string'
  );
  return emailFactor || null;
};

const VerifyCodeScreen = () => {
  const { signIn, setActive, isLoaded } = useSignIn();
  const route = useRoute<VerifyCodeRoute>();
  const navigation = useNavigation<AuthNavigation>();
  const inputRef = useRef<TextInput | null>(null);

  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const canSubmit = useMemo(
    () => isLoaded && code.length === OTP_LENGTH && !isLoading,
    [isLoaded, code.length, isLoading]
  );

  const resolveEmailAddressId = () => {
    if (route.params?.emailAddressId) {
      return route.params.emailAddressId;
    }
    return getEmailFactor(signIn)?.emailAddressId;
  };

  const focusCodeInput = () => {
    inputRef.current?.focus();
  };

  const onCodeChange = (value: string) => {
    const sanitized = value.replace(/[^\d]/g, '').slice(0, OTP_LENGTH);
    setCode(sanitized);
  };

  const onVerifyPress = async () => {
    if (!isLoaded || !canSubmit) {
      return;
    }

    setIsLoading(true);
    try {
      const result = await signIn.attemptSecondFactor({
        strategy: 'email_code',
        code,
      });

      if (result.status === 'complete' && result.createdSessionId) {
        await setActive({ session: result.createdSessionId });
        try {
          await fetchAuthSession();
        } catch (bootstrapError) {
          console.warn(
            'Auth bootstrap check failed after second-factor verification',
            bootstrapError
          );
        }
        return;
      }

      Alert.alert('Verification incomplete', 'The code was not accepted. Please try again.');
    } catch (err: unknown) {
      Alert.alert(
        'Verification failed',
        extractErrorMessage(err, 'Unable to verify code. Please check and try again.')
      );
    } finally {
      setIsLoading(false);
    }
  };

  const onResendPress = async () => {
    if (!isLoaded || isResending) {
      return;
    }

    const emailAddressId = resolveEmailAddressId();
    if (!emailAddressId) {
      Alert.alert('Cannot resend', 'Email verification is unavailable for this sign-in attempt.');
      return;
    }

    setIsResending(true);
    try {
      await signIn.prepareSecondFactor({
        strategy: 'email_code',
        emailAddressId,
      });
      Alert.alert('Code sent', 'A new verification code has been sent to your email.');
    } catch (err: unknown) {
      Alert.alert('Resend failed', extractErrorMessage(err, 'Unable to resend code right now.'));
    } finally {
      setIsResending(false);
    }
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
            <TouchableOpacity
              style={styles.backButton}
              onPress={() => navigation.navigate('SignIn')}
              activeOpacity={0.7}
            >
              <Ionicons name="arrow-back" size={24} color="#FFFFFF" />
            </TouchableOpacity>

            <View style={styles.contentContainer}>
              <TransfaMark />
              <Text style={styles.title}>Verify Code</Text>
              <Text style={styles.subtitle}>Please enter the code we just sent to your email</Text>

              <Pressable style={styles.otpRow} onPress={focusCodeInput}>
                {Array.from({ length: OTP_LENGTH }).map((_, index) => {
                  const digit = code[index];
                  const isActive = index === code.length && code.length < OTP_LENGTH;
                  return (
                    <View key={index} style={[styles.otpBox, isActive && styles.otpBoxActive]}>
                      <Text style={styles.otpValue}>{digit || '-'}</Text>
                    </View>
                  );
                })}
              </Pressable>

              <TextInput
                ref={inputRef}
                value={code}
                onChangeText={onCodeChange}
                keyboardType="number-pad"
                textContentType="oneTimeCode"
                autoComplete="one-time-code"
                autoFocus
                style={styles.hiddenInput}
                maxLength={OTP_LENGTH}
              />

              <TouchableOpacity
                style={[styles.verifyButton, !canSubmit && styles.verifyButtonDisabled]}
                onPress={onVerifyPress}
                activeOpacity={0.85}
                disabled={!canSubmit}
              >
                <Text style={styles.verifyButtonText}>{isLoading ? 'Verifying...' : 'Verify'}</Text>
              </TouchableOpacity>

              <Text style={styles.helperText}>Didn’t receive OTP?</Text>
              <TouchableOpacity onPress={onResendPress} activeOpacity={0.75} disabled={isResending}>
                <Text style={styles.resendText}>{isResending ? 'Sending...' : 'Resend Code'}</Text>
              </TouchableOpacity>
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
    lineHeight: 24,
    maxWidth: 275,
  },
  otpRow: {
    width: '100%',
    marginTop: 42,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  otpBox: {
    width: 44,
    height: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.07)',
    backgroundColor: 'rgba(79, 79, 79, 0.35)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpBoxActive: {
    borderColor: '#FFD300',
    backgroundColor: 'rgba(79, 79, 79, 0.5)',
  },
  otpValue: {
    color: '#DCDCDC',
    fontSize: 21,
    fontWeight: '500',
  },
  hiddenInput: {
    position: 'absolute',
    opacity: 0,
    height: 1,
    width: 1,
  },
  verifyButton: {
    width: '100%',
    marginTop: 34,
    backgroundColor: '#FFD300',
    borderRadius: 8,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButtonDisabled: {
    opacity: 0.6,
  },
  verifyButtonText: {
    color: '#121212',
    fontSize: 18,
    fontWeight: '700',
  },
  helperText: {
    marginTop: 20,
    color: '#A0A0A0',
    fontSize: 15,
    fontWeight: '500',
  },
  resendText: {
    marginTop: 6,
    color: '#D2B108',
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});

export default VerifyCodeScreen;

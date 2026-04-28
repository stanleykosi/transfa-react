import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useUser } from '@clerk/clerk-expo';

import { useSignIn } from '@/hooks/useSignIn';
import type { ProfileStackParamList } from '@/types/navigation';
import type { EmailCodeFactor } from '@/types/auth';
import { useSensitiveFlowStore } from '@/store/useSensitiveFlowStore';
import theme from '@/constants/theme';

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList, 'PinOtp'>;

const BRAND_YELLOW = '#FFD400';
const BG_BOTTOM = '#060708';
const OTP_LENGTH = 6;
const { fontSizes, fontWeights, spacing } = theme;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const extractErrorMessage = (error: unknown, fallback: string): string => {
  const errors = isRecord(error) ? error.errors : undefined;
  const firstError = Array.isArray(errors) ? errors[0] : undefined;
  const clerkMessage = isRecord(firstError) ? firstError.message : undefined;
  const errorMessage = isRecord(error) ? error.message : undefined;
  const message = clerkMessage || errorMessage;
  return typeof message === 'string' && message.trim() !== '' ? message : fallback;
};

const getFirstEmailFactor = (value: unknown): EmailCodeFactor | null => {
  const supportedFactors = isRecord(value) ? value.supportedFirstFactors : undefined;
  if (!Array.isArray(supportedFactors)) {
    return null;
  }

  return (
    supportedFactors.find(
      (factor): factor is EmailCodeFactor =>
        isRecord(factor) &&
        factor.strategy === 'email_code' &&
        typeof factor.emailAddressId === 'string'
    ) ?? null
  );
};

const PinOtpScreen = () => {
  const { signIn, setActive, isLoaded } = useSignIn();
  const { user } = useUser();
  const navigation = useNavigation<NavigationProp>();
  const clearPinChangeFlow = useSensitiveFlowStore((state) => state.clearPinChangeFlow);
  const inputRef = useRef<TextInput | null>(null);
  const requestedRef = useRef(false);

  const [code, setCode] = useState('');
  const [emailAddressId, setEmailAddressId] = useState<string>('');
  const [isSending, setIsSending] = useState(false);
  const [isVerifying, setIsVerifying] = useState(false);

  const primaryEmail =
    user?.primaryEmailAddress?.emailAddress || user?.emailAddresses?.[0]?.emailAddress || '';

  const sendCode = useCallback(async () => {
    if (!isLoaded || !signIn) {
      return;
    }
    if (!primaryEmail || !primaryEmail.trim()) {
      Alert.alert('No email found', 'Add a verified email to your account before changing PIN.');
      return;
    }

    setIsSending(true);
    try {
      const signInAttempt = await signIn.create({
        strategy: 'email_code',
        identifier: primaryEmail.trim(),
      } as Parameters<typeof signIn.create>[0]);

      const emailFactor = getFirstEmailFactor(signInAttempt);

      if (!emailFactor?.emailAddressId) {
        throw new Error('Unable to prepare email verification for this account.');
      }

      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: emailFactor.emailAddressId,
      } as Parameters<typeof signIn.prepareFirstFactor>[0]);

      setEmailAddressId(emailFactor.emailAddressId);
    } catch (error: unknown) {
      Alert.alert(
        'OTP request failed',
        extractErrorMessage(error, 'Unable to send verification code.')
      );
    } finally {
      setIsSending(false);
    }
  }, [isLoaded, signIn, primaryEmail]);

  useEffect(() => {
    if (!isLoaded || !signIn) {
      return;
    }
    if (requestedRef.current) {
      return;
    }
    requestedRef.current = true;
    sendCode();
  }, [isLoaded, sendCode, signIn]);

  const onCodeChange = (value: string) => {
    const next = value.replace(/[^0-9]/g, '').slice(0, OTP_LENGTH);
    setCode(next);
  };

  const verify = async () => {
    if (code.length !== OTP_LENGTH) {
      Alert.alert('Invalid OTP', 'Enter the verification code sent to your email.');
      return;
    }
    if (!isLoaded || !signIn) {
      return;
    }
    if (!emailAddressId) {
      Alert.alert('Request OTP first', 'Please request a new OTP code.');
      return;
    }

    setIsVerifying(true);
    try {
      const result = await signIn.attemptFirstFactor({
        strategy: 'email_code',
        code,
      } as Parameters<typeof signIn.attemptFirstFactor>[0]);

      if (result?.status !== 'complete' || !result?.createdSessionId) {
        throw new Error('Verification incomplete. Please try again.');
      }

      await setActive({ session: result.createdSessionId });
      clearPinChangeFlow();
      navigation.replace('PinCurrent');
    } catch (error: unknown) {
      Alert.alert('Verification failed', extractErrorMessage(error, 'Invalid verification code.'));
    } finally {
      setIsVerifying(false);
    }
  };

  const resendCode = async () => {
    if (!isLoaded || !signIn) {
      return;
    }
    if (!emailAddressId) {
      await sendCode();
      return;
    }

    setIsSending(true);
    try {
      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId,
      } as Parameters<typeof signIn.prepareFirstFactor>[0]);
    } catch (error: unknown) {
      Alert.alert(
        'Resend failed',
        extractErrorMessage(error, 'Unable to resend verification code.')
      );
    } finally {
      setIsSending(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1B1C1E', '#111214', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.container}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#ECECEC" />
          </TouchableOpacity>

          <Text style={styles.title}>Enter OTP</Text>
          <Text style={styles.subtitle}>
            OTP has been sent to the email registered to this account
          </Text>

          <Pressable style={styles.otpRow} onPress={() => inputRef.current?.focus()}>
            {Array.from({ length: OTP_LENGTH }).map((_, index) => (
              <View key={index} style={styles.otpBox}>
                <Text style={styles.otpValue}>{code[index] || '-'}</Text>
              </View>
            ))}
          </Pressable>

          <TextInput
            ref={inputRef}
            style={styles.hiddenInput}
            value={code}
            onChangeText={onCodeChange}
            keyboardType="number-pad"
            maxLength={OTP_LENGTH}
            autoFocus
          />

          <TouchableOpacity
            style={styles.verifyButton}
            onPress={verify}
            disabled={isVerifying || isSending}
          >
            <Text style={styles.verifyButtonText}>{isVerifying ? 'Verifying...' : 'Verify'}</Text>
          </TouchableOpacity>

          <Text style={styles.helperText}>Didn’t recieve OTP?</Text>
          <TouchableOpacity onPress={resendCode}>
            <Text style={styles.resendText}>{isSending ? 'Sending...' : 'Resend Code'}</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#090A0B' },
  safeArea: { flex: 1 },
  container: { flex: 1, paddingHorizontal: spacing.s20 },
  backButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  title: {
    marginTop: 76,
    color: '#F2F2F2',
    fontSize: fontSizes['4xl'],
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  subtitle: {
    marginTop: 8,
    color: '#72757D',
    fontSize: fontSizes.sm,
    lineHeight: 21,
    textAlign: 'center',
    paddingHorizontal: 18,
  },
  otpRow: {
    marginTop: 26,
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 12,
  },
  otpBox: {
    width: 42,
    height: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  otpValue: {
    color: '#D4D6DA',
    fontSize: fontSizes.xl,
    fontWeight: fontWeights.medium,
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  verifyButton: {
    marginTop: 24,
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButtonText: {
    color: '#111214',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  helperText: {
    marginTop: 16,
    textAlign: 'center',
    color: '#A7AAB0',
    fontSize: fontSizes.sm,
  },
  resendText: {
    marginTop: 6,
    textAlign: 'center',
    color: BRAND_YELLOW,
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
    textDecorationLine: 'underline',
  },
});

export default PinOtpScreen;

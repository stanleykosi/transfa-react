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
import { ProfileStackParamList } from '@/navigation/ProfileStack';
import { useSensitiveFlowStore } from '@/store/useSensitiveFlowStore';
import theme from '@/constants/theme';

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList, 'PinOtp'>;

const BRAND_YELLOW = '#FFD400';
const BG_BOTTOM = '#060708';
const OTP_LENGTH = 6;
const { fontSizes, fontWeights, spacing } = theme;

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

  const primaryEmail = ((user as any)?.primaryEmailAddress?.emailAddress ||
    (user as any)?.emailAddresses?.[0]?.emailAddress ||
    '') as string;

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
      const signInAttempt: any = await signIn.create({
        strategy: 'email_code',
        identifier: primaryEmail.trim(),
      } as any);

      const supportedFactors = Array.isArray(signInAttempt?.supportedFirstFactors)
        ? signInAttempt.supportedFirstFactors
        : [];
      const emailFactor = supportedFactors.find(
        (factor: any) =>
          factor?.strategy === 'email_code' && typeof factor?.emailAddressId === 'string'
      );

      if (!emailFactor?.emailAddressId) {
        throw new Error('Unable to prepare email verification for this account.');
      }

      await signIn.prepareFirstFactor({
        strategy: 'email_code',
        emailAddressId: emailFactor.emailAddressId,
      } as any);

      setEmailAddressId(emailFactor.emailAddressId);
    } catch (error: any) {
      Alert.alert(
        'OTP request failed',
        error?.errors?.[0]?.message || error?.message || 'Unable to send verification code.'
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
      const result: any = await signIn.attemptFirstFactor({
        strategy: 'email_code',
        code,
      } as any);

      if (result?.status !== 'complete' || !result?.createdSessionId) {
        throw new Error('Verification incomplete. Please try again.');
      }

      await setActive({ session: result.createdSessionId });
      clearPinChangeFlow();
      navigation.replace('PinCurrent');
    } catch (error: any) {
      Alert.alert(
        'Verification failed',
        error?.errors?.[0]?.message || error?.message || 'Invalid verification code.'
      );
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
      } as any);
    } catch (error: any) {
      Alert.alert(
        'Resend failed',
        error?.errors?.[0]?.message || error?.message || 'Unable to resend verification code.'
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

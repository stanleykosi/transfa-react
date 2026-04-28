import React, { useState } from 'react';
import { Alert } from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useSignIn } from '@/hooks/useSignIn';
import { fetchAuthSession } from '@/api/authApi';
import type { AuthStackParamList } from '@/types/navigation';
import AuthVerifyCode from '@/components/source-auth/auth-verify-code';
import type { EmailCodeFactor } from '@/types/auth';

type VerifyCodeRoute = RouteProp<AuthStackParamList, 'VerifyCode'>;
type AuthNavigation = NativeStackNavigationProp<AuthStackParamList, 'VerifyCode'>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const extractErrorMessage = (err: unknown, fallback: string): string => {
  const errors = isRecord(err) ? err.errors : undefined;
  const firstError = Array.isArray(errors) ? errors[0] : undefined;
  const message = isRecord(firstError) ? firstError.message : undefined;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  return fallback;
};

const getEmailFactor = (value: unknown): EmailCodeFactor | null => {
  const secondFactors = isRecord(value) ? value.supportedSecondFactors : undefined;
  if (!Array.isArray(secondFactors)) {
    return null;
  }
  const emailFactor = secondFactors.find(
    (factor): factor is EmailCodeFactor =>
      isRecord(factor) &&
      factor.strategy === 'email_code' &&
      typeof factor.emailAddressId === 'string'
  );
  return emailFactor || null;
};

const VerifyCodeScreen = () => {
  const { signIn, setActive, isLoaded } = useSignIn();
  const route = useRoute<VerifyCodeRoute>();
  const navigation = useNavigation<AuthNavigation>();

  const [isLoading, setIsLoading] = useState(false);
  const [isResending, setIsResending] = useState(false);

  const resolveEmailAddressId = () => {
    if (route.params?.emailAddressId) {
      return route.params.emailAddressId;
    }
    return getEmailFactor(signIn)?.emailAddressId;
  };

  const onVerifyPress = async (code: string) => {
    if (!isLoaded || isLoading) {
      return;
    }

    const trimmedCode = code.trim();
    if (!trimmedCode) {
      Alert.alert('Missing code', 'Enter the verification code sent to your email.');
      return;
    }

    setIsLoading(true);
    try {
      const result = await signIn.attemptSecondFactor({
        strategy: 'email_code',
        code: trimmedCode,
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
    <AuthVerifyCode
      onVerify={onVerifyPress}
      onResend={onResendPress}
      onBack={() => navigation.navigate('SignIn')}
      email=""
      isVerifying={isLoading || isResending}
    />
  );
};

export default VerifyCodeScreen;

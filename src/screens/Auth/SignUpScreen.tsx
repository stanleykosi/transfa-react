import React, { useMemo, useState } from 'react';
import { Alert, Platform } from 'react-native';
import { useSignUp } from '@/hooks/useSignUp';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { SignUp as ClerkSignUp } from '@/components/ClerkComponents';
import AuthCreateAccount from '@/components/source-auth/auth-create-account';
import AuthVerifyCode from '@/components/source-auth/auth-verify-code';
import type { AuthStackParamList } from '@/types/navigation';
import { fetchAuthSession } from '@/api/authApi';

const MIN_PASSWORD_LENGTH = 8;

type AuthNavigation = NativeStackNavigationProp<AuthStackParamList, 'SignUp'>;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const getErrorMessage = (err: unknown, fallback: string): string => {
  const errors = isRecord(err) ? err.errors : undefined;
  const firstError = Array.isArray(errors) ? errors[0] : undefined;
  const message = isRecord(firstError) ? firstError.message : undefined;
  if (typeof message === 'string' && message.trim().length > 0) {
    return message;
  }
  return fallback;
};

const SignUpScreen = () => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const navigation = useNavigation<AuthNavigation>();

  const [pendingVerification, setPendingVerification] = useState(false);
  const [signupEmail, setSignupEmail] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [isResendingCode, setIsResendingCode] = useState(false);

  const normalizedEmail = useMemo(() => signupEmail.trim().toLowerCase(), [signupEmail]);

  const handleCreateAccount = async (emailAddress: string, password: string) => {
    if (!isLoaded || isLoading) {
      return;
    }

    const email = emailAddress.trim().toLowerCase();

    if (!email) {
      Alert.alert('Invalid email', 'Enter a valid email address.');
      return;
    }

    if (password.length < MIN_PASSWORD_LENGTH) {
      Alert.alert(
        'Weak password',
        `Password must be at least ${MIN_PASSWORD_LENGTH} characters long.`
      );
      return;
    }

    setIsLoading(true);
    try {
      const signUpResult = await signUp.create({ emailAddress: email, password });
      setSignupEmail(email);

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

  const onPressVerify = async (code: string) => {
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
      const completeSignUp = await signUp.attemptEmailAddressVerification({
        code: trimmedCode,
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

  if (Platform.OS === 'web') {
    return <ClerkSignUp />;
  }

  if (!isLoaded) {
    return null;
  }

  if (pendingVerification) {
    return (
      <AuthVerifyCode
        onVerify={onPressVerify}
        onResend={onResendCode}
        onBack={() => setPendingVerification(false)}
        email={normalizedEmail}
        isVerifying={isLoading || isResendingCode}
      />
    );
  }

  return (
    <AuthCreateAccount
      onNext={handleCreateAccount}
      onLogin={() => navigation.navigate('SignIn')}
      onBack={() => {
        if (navigation.canGoBack()) {
          navigation.goBack();
          return;
        }
        navigation.navigate('SignIn');
      }}
      isSubmitting={isLoading}
    />
  );
};

export default SignUpScreen;

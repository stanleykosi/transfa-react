import React, { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useSignIn } from '@/hooks/useSignIn';
import { fetchAuthSession } from '@/api/authApi';
import type { AuthStackParamList } from '@/types/navigation';
import AuthLogin from '@/components/source-auth/auth-login';
import type { EmailCodeFactor } from '@/types/auth';

const REMEMBER_ME_KEY = 'auth.remember_me';
const REMEMBERED_IDENTIFIER_KEY = 'auth.remembered_identifier';

type AuthNavigation = NativeStackNavigationProp<AuthStackParamList, 'SignIn'>;

type BrowserStorage = {
  getItem: (key: string) => string | null;
  setItem: (key: string, value: string) => void;
  removeItem: (key: string) => void;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null;

const extractErrorMessage = (err: unknown, fallback: string): string => {
  const errors = isRecord(err) ? err.errors : undefined;
  const firstError = Array.isArray(errors) ? errors[0] : undefined;
  const message = isRecord(firstError) ? firstError.message : undefined;
  return typeof message === 'string' && message.trim().length > 0 ? message : fallback;
};

const getEmailFactor = (value: unknown): EmailCodeFactor | null => {
  const secondFactors = isRecord(value) ? value.supportedSecondFactors : undefined;
  if (!Array.isArray(secondFactors)) {
    return null;
  }

  return (
    secondFactors.find(
      (factor): factor is EmailCodeFactor =>
        isRecord(factor) &&
        factor.strategy === 'email_code' &&
        typeof factor.emailAddressId === 'string'
    ) ?? null
  );
};

const getBrowserStorage = (): BrowserStorage | undefined =>
  (globalThis as typeof globalThis & { localStorage?: BrowserStorage }).localStorage;

const SignInScreen = () => {
  const { signIn, setActive, isLoaded } = useSignIn();
  const navigation = useNavigation<AuthNavigation>();

  const [identifier, setIdentifier] = useState('');
  const [rememberMe, setRememberMe] = useState(true);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    let mounted = true;

    const loadRememberedIdentity = async () => {
      try {
        const storedRememberMe = await loadStoredValue(REMEMBER_ME_KEY);
        const enabled = storedRememberMe !== 'false';
        const storedIdentifier = await loadStoredValue(REMEMBERED_IDENTIFIER_KEY);

        if (!mounted) {
          return;
        }

        setRememberMe(enabled);
        if (enabled && storedIdentifier) {
          setIdentifier(storedIdentifier);
        }
      } catch {
        // Ignore storage failures. Login should still function.
      }
    };

    loadRememberedIdentity();

    return () => {
      mounted = false;
    };
  }, []);

  const persistRememberedIdentifier = async (value: string, shouldRemember: boolean) => {
    await storeValue(REMEMBER_ME_KEY, shouldRemember ? 'true' : 'false');
    if (shouldRemember) {
      await storeValue(REMEMBERED_IDENTIFIER_KEY, value.trim());
      return;
    }
    await deleteValue(REMEMBERED_IDENTIFIER_KEY);
  };

  const onLogin = async (
    submittedIdentifier: string,
    password: string,
    selectedRememberMe: boolean
  ) => {
    if (!isLoaded || isLoading) {
      return;
    }

    const trimmedIdentifier = submittedIdentifier.trim();
    if (!trimmedIdentifier || !password.trim()) {
      return;
    }

    setIsLoading(true);
    try {
      const completeSignIn = await signIn.create({
        identifier: trimmedIdentifier,
        password,
      });

      if (completeSignIn.status === 'complete' && completeSignIn.createdSessionId) {
        await setActive({ session: completeSignIn.createdSessionId });
        await persistRememberedIdentifier(trimmedIdentifier, selectedRememberMe);

        try {
          await fetchAuthSession();
        } catch (bootstrapError) {
          console.warn('Auth bootstrap check failed after sign-in', bootstrapError);
        }
        return;
      }

      if (completeSignIn.status === 'needs_second_factor') {
        const emailFactor = getEmailFactor(completeSignIn);

        if (!emailFactor?.emailAddressId) {
          Alert.alert(
            'Verification required',
            'This account needs a second verification step that is not yet configured in this app.'
          );
          return;
        }

        await signIn.prepareSecondFactor({
          strategy: 'email_code',
          emailAddressId: emailFactor.emailAddressId,
        });

        await persistRememberedIdentifier(trimmedIdentifier, selectedRememberMe);

        navigation.navigate('VerifyCode', {
          emailAddressId: emailFactor.emailAddressId,
        });
        return;
      }

      Alert.alert('Sign in incomplete', 'Additional verification is required to continue.');
    } catch (err: unknown) {
      Alert.alert(
        'Login failed',
        extractErrorMessage(err, 'Unable to sign in with these credentials.')
      );
    } finally {
      setRememberMe(selectedRememberMe);
      setIsLoading(false);
    }
  };

  return (
    <AuthLogin
      onLogin={onLogin}
      onSignUp={() => navigation.navigate('SignUp')}
      onForgotPassword={() =>
        navigation.navigate('ForgotPassword', {
          identifier: identifier.trim() || undefined,
        })
      }
      defaultIdentifier={identifier}
      defaultRememberMe={rememberMe}
      isLoading={isLoading}
      onIdentifierChange={setIdentifier}
    />
  );
};

const storeValue = async (key: string, value: string) => {
  if (Platform.OS === 'web') {
    const localStorageRef = getBrowserStorage();
    if (localStorageRef) {
      localStorageRef.setItem(key, value);
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
};

const loadStoredValue = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    const localStorageRef = getBrowserStorage();
    if (!localStorageRef) {
      return null;
    }
    return localStorageRef.getItem(key);
  }
  return SecureStore.getItemAsync(key);
};

const deleteValue = async (key: string) => {
  if (Platform.OS === 'web') {
    const localStorageRef = getBrowserStorage();
    if (localStorageRef) {
      localStorageRef.removeItem(key);
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
};

export default SignInScreen;

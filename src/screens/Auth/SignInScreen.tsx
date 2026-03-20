import React, { useEffect, useState } from 'react';
import { Alert, Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';

import { useSignIn } from '@/hooks/useSignIn';
import { fetchAuthSession } from '@/api/authApi';
import { AuthStackParamList } from '@/navigation/AuthStack';
import AuthLogin from '@/components/source-auth/auth-login';

const REMEMBER_ME_KEY = 'auth.remember_me';
const REMEMBERED_IDENTIFIER_KEY = 'auth.remembered_identifier';

type AuthNavigation = NativeStackNavigationProp<AuthStackParamList, 'SignIn'>;

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
        const emailFactor = Array.isArray((completeSignIn as any)?.supportedSecondFactors)
          ? (completeSignIn as any).supportedSecondFactors.find(
              (factor: any) =>
                factor?.strategy === 'email_code' && typeof factor?.emailAddressId === 'string'
            )
          : null;

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
    } catch (err: any) {
      Alert.alert(
        'Login failed',
        err?.errors?.[0]?.message || 'Unable to sign in with these credentials.'
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
    const localStorageRef = (globalThis as any)?.localStorage;
    if (localStorageRef) {
      localStorageRef.setItem(key, value);
    }
    return;
  }
  await SecureStore.setItemAsync(key, value);
};

const loadStoredValue = async (key: string): Promise<string | null> => {
  if (Platform.OS === 'web') {
    const localStorageRef = (globalThis as any)?.localStorage;
    if (!localStorageRef) {
      return null;
    }
    return localStorageRef.getItem(key);
  }
  return SecureStore.getItemAsync(key);
};

const deleteValue = async (key: string) => {
  if (Platform.OS === 'web') {
    const localStorageRef = (globalThis as any)?.localStorage;
    if (localStorageRef) {
      localStorageRef.removeItem(key);
    }
    return;
  }
  await SecureStore.deleteItemAsync(key);
};

export default SignInScreen;

/**
 * @description
 * The Sign Up screen uses Clerk's pre-built `<SignUp />` component to manage the
 * entire user registration and verification process. This component provides a
 * comprehensive UI for new users to create an account using various methods
 * (email, social providers) and complete any necessary verification steps.
 *
 * @dependencies
 * - @clerk/clerk-expo: Provides the `<SignUp />` component.
 * - @/components/ScreenWrapper: For consistent screen layout with safe areas.
 * - @/constants/theme: Used for styling the container.
 *
 * @notes
 * - Using `<SignUp />` abstracts away the complexity of the multi-step registration
 *   flow (e.g., entering details, verifying email with a code).
 * - Upon successful completion of the sign-up process, Clerk's auth state
 *   updates, `isSignedIn` becomes true, and the `RootNavigator` will transition
 *   the user to the `AppStack`. The `AppStack` will then be responsible for
 *   directing the new user to the onboarding form.
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, Platform } from 'react-native';
import { useSignUp } from '@/hooks/useSignUp';
import { useNavigation } from '@react-navigation/native';
import ScreenWrapper from '@/components/ScreenWrapper';
import FormInput from '@/components/FormInput';
import PrimaryButton from '@/components/PrimaryButton';
import { SignUp as ClerkSignUp } from '@/components/ClerkComponents';
import { theme } from '@/constants/theme';

const SignUpScreen = () => {
  const { isLoaded, signUp, setActive } = useSignUp();
  const navigation = useNavigation();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [pendingVerification, setPendingVerification] = useState(false);
  const [code, setCode] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onSignUpPress = async () => {
    if (!isLoaded) {
      return;
    }
    setIsLoading(true);
    try {
      await signUp.create({ emailAddress, password });
      await signUp.prepareEmailAddressVerification({ strategy: 'email_code' });
      setPendingVerification(true);
    } catch (err: any) {
      Alert.alert('Error', err.errors?.[0]?.message || 'An error occurred during sign up');
    } finally {
      setIsLoading(false);
    }
  };

  const onPressVerify = async () => {
    if (!isLoaded) {
      return;
    }
    setIsLoading(true);
    try {
      const completeSignUp = await signUp.attemptEmailAddressVerification({ code });
      if (completeSignUp.status === 'complete') {
        await setActive({ session: completeSignUp.createdSessionId });
      }
    } catch (err: any) {
      Alert.alert('Error', err.errors?.[0]?.message || 'An error occurred during verification');
    } finally {
      setIsLoading(false);
    }
  };

  // Use platform-specific SignUp component for web
  if (Platform.OS === 'web') {
    return (
      <ScreenWrapper>
        <View style={styles.container}>
          <ClerkSignUp />
        </View>
      </ScreenWrapper>
    );
  }

  if (!isLoaded) {
    return (
      <ScreenWrapper>
        <View style={styles.container}>
          <Text>Loading...</Text>
        </View>
      </ScreenWrapper>
    );
  }

  if (pendingVerification) {
    return (
      <ScreenWrapper>
        <View style={styles.container}>
          <Text style={styles.title}>Verify Your Email</Text>
          <FormInput
            label="Verification Code"
            value={code}
            onChangeText={setCode}
            placeholder="Enter verification code"
            keyboardType="number-pad"
          />
          <PrimaryButton title="Verify Email" onPress={onPressVerify} isLoading={isLoading} />
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Create Account</Text>
        <FormInput
          label="Email"
          value={emailAddress}
          onChangeText={setEmailAddress}
          placeholder="Enter your email"
          keyboardType="email-address"
          autoCapitalize="none"
        />
        <FormInput
          label="Password"
          value={password}
          onChangeText={setPassword}
          placeholder="Enter your password"
          secureTextEntry
        />
        <PrimaryButton title="Sign Up" onPress={onSignUpPress} isLoading={isLoading} />

        <TouchableOpacity
          style={styles.signInLink}
          onPress={() => navigation.navigate('SignIn' as never)}
        >
          <Text style={styles.signInText}>
            Already have an account? <Text style={styles.signInLinkText}>Sign In</Text>
          </Text>
        </TouchableOpacity>
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: theme.spacing.s24,
  },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    marginBottom: theme.spacing.s16,
  },
  signInLink: {
    marginTop: theme.spacing.s24,
    alignItems: 'center',
  },
  signInText: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
  },
  signInLinkText: {
    color: theme.colors.primary,
    fontWeight: theme.fontWeights.semibold,
  },
});

export default SignUpScreen;

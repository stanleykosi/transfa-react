/**
 * @description
 * The Sign In screen utilizes Clerk's pre-built `<SignIn />` component to provide
 * a complete and secure authentication flow. This component handles all aspects
 * of the sign-in process, including UI for entering credentials, handling social
 * logins, and managing multi-factor authentication challenges.
 *
 * @dependencies
 * - @clerk/clerk-expo: Provides the `<SignIn />` component.
 * - @/components/ScreenWrapper: Ensures consistent screen layout with safe areas.
 * - @/constants/theme: Used for styling the container.
 *
 * @notes
 * - By using the pre-built component, we delegate the complexity of the auth UI
 *   to Clerk, reducing our code footprint and ensuring a robust implementation.
 * - After a successful sign-in, Clerk's context updates, and the `RootNavigator`
 *   will automatically transition the user to the main application stack (`AppStack`).
 */
import React, { useState } from 'react';
import { View, Text, StyleSheet, Alert, TouchableOpacity, Platform } from 'react-native';
import { useSignIn } from '@/hooks/useSignIn';
import { useNavigation } from '@react-navigation/native';
import ScreenWrapper from '@/components/ScreenWrapper';
import FormInput from '@/components/FormInput';
import PrimaryButton from '@/components/PrimaryButton';
import { SignIn as ClerkSignIn } from '@/components/ClerkComponents';
import { theme } from '@/constants/theme';

const SignInScreen = () => {
  const { signIn, setActive, isLoaded } = useSignIn();
  const navigation = useNavigation();
  const [emailAddress, setEmailAddress] = useState('');
  const [password, setPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const onSignInPress = async () => {
    if (!isLoaded) {
      return;
    }
    setIsLoading(true);
    try {
      const completeSignIn = await signIn.create({ identifier: emailAddress, password });
      if (completeSignIn.status === 'complete') {
        await setActive({ session: completeSignIn.createdSessionId });
      }
    } catch (err: any) {
      Alert.alert('Error', err.errors?.[0]?.message || 'An error occurred during sign in');
    } finally {
      setIsLoading(false);
    }
  };

  // Use platform-specific SignIn component for web
  if (Platform.OS === 'web') {
    return (
      <ScreenWrapper>
        <View style={styles.container}>
          <ClerkSignIn />
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

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Welcome Back</Text>
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
        <PrimaryButton title="Sign In" onPress={onSignInPress} isLoading={isLoading} />

        <TouchableOpacity
          style={styles.signUpLink}
          onPress={() => navigation.navigate('SignUp' as never)}
        >
          <Text style={styles.signUpText}>
            Don't have an account? <Text style={styles.signUpLinkText}>Sign Up</Text>
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
  signUpLink: {
    marginTop: theme.spacing.s24,
    alignItems: 'center',
  },
  signUpText: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
  },
  signUpLinkText: {
    color: theme.colors.primary,
    fontWeight: theme.fontWeights.semibold,
  },
});

export default SignInScreen;

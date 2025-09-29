/**
 * @description
 * Tier 1 Create Account screen.
 * Guarded by Tier 0 status: will not render form unless backend reports `tier0_created`.
 * Collects Tier 1 fields (DOB, gender, BVN) and submits to backend (placeholder for now).
 */
import React, { useEffect, useMemo, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Alert,
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
} from 'react-native';
import { useNavigation } from '@react-navigation/native';
import ScreenWrapper from '@/components/ScreenWrapper';
import PrimaryButton from '@/components/PrimaryButton';
import FormInput from '@/components/FormInput';
import { theme } from '@/constants/theme';
import apiClient from '@/api/apiClient';
import { useAuth, useUser } from '@clerk/clerk-expo';

const CreateAccountScreen = () => {
  const { getToken, signOut } = useAuth();
  const { user } = useUser();
  const navigation = useNavigation();
  const [status, setStatus] = useState<'checking' | 'tier0_pending' | 'tier0_created' | 'error'>(
    'checking'
  );
  const [dob, setDob] = useState(''); // YYYY-MM-DD
  const [gender, setGender] = useState('');
  const [bvn, setBvn] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const headers = useMemo(
    () => ({
      'X-Clerk-User-Id': user?.id || '',
    }),
    [user?.id]
  );

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const token = await getToken().catch(() => undefined);
        const { data } = await apiClient.get<{ status: string }>('/onboarding/status', {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        });
        if (!mounted) {
          return;
        }

        console.log('🔍 Status check response:', data?.status);
        console.log('🔍 Full response data:', data);

        if (data?.status === 'completed') {
          // Already fully enabled -> go to main app
          navigation.navigate('AppTabs' as never);
          return;
        } else if (data?.status === 'tier1_pending' || data?.status === 'tier0_created') {
          setStatus('tier0_created');
          return;
        } else if (data?.status === 'tier0_processing' || data?.status === 'tier0_pending') {
          Alert.alert(
            'Processing',
            'Your Tier 0 KYC is being processed. Please wait a moment and try again.'
          );
          setStatus('tier0_pending');
        } else if (data?.status === 'tier0_failed') {
          Alert.alert(
            'Verification Failed',
            'There was an issue with your verification. Please contact support or try again.'
          );
          setStatus('error');
        } else {
          // Still pending - show loading state and poll for updates
          console.log('⚠️ Unknown status, defaulting to pending:', data?.status);
          setStatus('tier0_pending');
        }
      } catch (e) {
        if (!mounted) {
          return;
        }
        setStatus('error');
        Alert.alert('Error', 'Unable to confirm verification status. Try again later.');
      }
    })();
    return () => {
      mounted = false;
    };
  }, [getToken, headers, navigation]);

  // No more polling - users come here when tier0 is already created

  const handleSignOut = () => {
    Alert.alert(
      'Sign Out',
      'Are you sure you want to sign out? You can use a different account to test the onboarding flow.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: () => signOut(),
        },
      ]
    );
  };

  const handleSubmitTier1 = async () => {
    if (status !== 'tier0_created') {
      Alert.alert('Please wait', 'Your Tier 0 verification has not completed yet.');
      return;
    }
    const normalizedGender = gender.trim().toLowerCase();
    if (!dob || !normalizedGender || !bvn) {
      Alert.alert('Validation Error', 'Please provide BVN, date of birth, and gender.');
      return;
    }
    if (normalizedGender !== 'male' && normalizedGender !== 'female') {
      Alert.alert('Validation Error', "Gender must be 'male' or 'female'.");
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken().catch(() => undefined);
      // Submit Tier 1 details to backend (records intent only)
      await apiClient.post(
        '/onboarding/tier1',
        { dob, gender: normalizedGender, bvn },
        { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } }
      );

      // Poll for completion (Anchor webhook -> account-service creates account -> status: completed)
      const maxMs = 20000; // up to 20s
      const stepMs = 1000;
      const started = Date.now();
      while (Date.now() - started < maxMs) {
        const { data } = await apiClient.get<{ status: string }>('/onboarding/status', {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        });
        if (data?.status === 'completed') {
          navigation.navigate('AppTabs' as never);
          return;
        }
        await new Promise((res) => setTimeout(res, stepMs));
      }
      // Fallback: navigate; the app tabs can lazy-load account details
      navigation.navigate('AppTabs' as never);
    } catch (e) {
      console.error('Error submitting Tier 1:', e);
      Alert.alert('Error', 'Failed to submit verification. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // If tier0 is not created, we rely on AppStack and OnboardingForm to drive the flow.
  if (status !== 'tier0_created') {
    return (
      <ScreenWrapper>
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={[styles.subtitle, { marginTop: theme.spacing.s16 }]}>
            Preparing your form…
          </Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 64 : 0}
      >
        <ScrollView
          style={{ flex: 1 }}
          contentContainerStyle={styles.scrollContainer}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <Text style={styles.title}>Complete Your Verification</Text>
            <Text style={styles.subtitle}>
              Please provide your additional details to complete your account setup.
            </Text>

            <FormInput
              label="BVN"
              value={bvn}
              onChangeText={setBvn}
              placeholder="Enter your 11-digit BVN"
              keyboardType="number-pad"
              maxLength={11}
            />
            <FormInput
              label="Date of Birth"
              value={dob}
              onChangeText={setDob}
              placeholder="YYYY-MM-DD"
            />
            <FormInput
              label="Gender"
              value={gender}
              onChangeText={(t) => setGender(t)}
              placeholder="male or female"
            />

            <PrimaryButton title="Submit" onPress={handleSubmitTier1} isLoading={submitting} />
            <PrimaryButton
              title="Sign Out (Test Different Account)"
              onPress={handleSignOut}
              style={styles.signOutButton}
              textStyle={styles.signOutButtonText}
            />
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  scrollContainer: {
    flexGrow: 1,
  },
  container: {
    padding: theme.spacing.s24,
    gap: theme.spacing.s16,
    paddingBottom: theme.spacing.s48,
  },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.s24 },
  title: {
    fontSize: theme.fontSizes['2xl'],
    fontWeight: theme.fontWeights.bold,
    color: theme.colors.textPrimary,
    textAlign: 'center',
    marginBottom: theme.spacing.s8,
  },
  subtitle: {
    fontSize: theme.fontSizes.base,
    color: theme.colors.textSecondary,
    textAlign: 'center',
    marginBottom: theme.spacing.s24,
  },
  signOutButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.border,
  },
  signOutButtonText: {
    color: theme.colors.textSecondary,
  },
  debugButton: {
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: theme.colors.primary,
    marginTop: theme.spacing.s16,
  },
  debugButtonText: {
    color: theme.colors.primary,
  },
});

export default CreateAccountScreen;

/**
 * @description
 * Tier 2 KYC screen.
 * Guarded by Tier 1 status: will not render form unless backend reports `tier1_created`.
 * Collects Tier 2 fields (DOB, gender, BVN) and submits to backend.
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
  const [status, setStatus] = useState<
    | 'checking'
    | 'tier1_pending'
    | 'tier1_created'
    | 'tier2_processing'
    | 'tier2_manual_review'
    | 'tier2_failed'
    | 'tier2_completed'
    | 'error'
  >('checking');
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

  const statusMessage = useMemo(() => {
    switch (status) {
      case 'tier2_processing':
        return 'Your Tier 2 verification is processing. We will refresh automatically.';
      case 'tier2_manual_review':
        return 'Your documents are under manual review. We will notify you once complete.';
      case 'tier2_failed':
        return 'Tier 2 verification needs attention. Please reach out to support.';
      default:
        return 'Preparing your form…';
    }
  }, [status]);

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

        if (data?.status === 'completed' || data?.status === 'tier2_completed') {
          // Already fully enabled -> go to main app
          navigation.navigate('AppTabs' as never);
          return;
        } else if (data?.status === 'tier2_processing') {
          setStatus('tier2_processing');
          return;
        } else if (data?.status === 'tier2_manual_review') {
          setStatus('tier2_manual_review');
          return;
        } else if (data?.status === 'tier2_error' || data?.status === 'tier2_failed') {
          setStatus('tier2_failed');
          Alert.alert(
            'Verification Issue',
            data?.status === 'tier2_error'
              ? 'There was an error completing your verification. Our team has been notified. Please try again later or contact support.'
              : 'Your Tier 2 verification was rejected. Please contact support to continue.'
          );
          return;
        } else if (data?.status === 'tier2_pending' || data?.status === 'tier1_created') {
          setStatus('tier1_created');
          return;
        } else if (data?.status === 'tier1_processing' || data?.status === 'tier1_pending') {
          Alert.alert(
            'Processing',
            'Your Tier 1 KYC is being processed. Please wait a moment and try again.'
          );
          setStatus('tier1_pending');
        } else if (data?.status === 'tier1_failed') {
          Alert.alert(
            'Verification Failed',
            'There was an issue with your verification. Please contact support or try again.'
          );
          setStatus('error');
        } else {
          // Still pending - show loading state and poll for updates
          console.log('⚠️ Unknown status, defaulting to pending:', data?.status);
          setStatus('tier1_pending');
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

  // No more polling - users come here when tier1 is already created

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

  const handleSubmitTier2 = async () => {
    if (status !== 'tier1_created') {
      Alert.alert('Please wait', 'Your Tier 1 verification has not completed yet.');
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
      console.log('🚀 Submitting Tier 2 details...');

      // Submit Tier 2 details to backend
      await apiClient.post(
        '/onboarding/tier2',
        { dob, gender: normalizedGender, bvn },
        { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } }
      );

      console.log('✅ Tier 2 submitted successfully, checking status...');

      // Poll briefly for completion, then navigate to let HomeScreen handle the polling
      const maxMs = 5000; // up to 5s
      const stepMs = 1000;
      const started = Date.now();
      while (Date.now() - started < maxMs) {
        const { data } = await apiClient.get<{ status: string }>('/onboarding/status', {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        });
        console.log('🔍 Status check response:', data?.status);
        if (data?.status === 'completed') {
          console.log('🎉 Account completed, navigating to app...');
          navigation.navigate('AppTabs' as never);
          return;
        }
        await new Promise((res) => setTimeout(res, stepMs));
      }

      console.log('⏰ Timeout reached, navigating to HomeScreen for polling...');
      // Navigate to HomeScreen which will handle account polling
      navigation.navigate('AppTabs' as never);
    } catch (e) {
      console.error('Error submitting Tier 1:', e);
      Alert.alert('Error', 'Failed to submit verification. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // If tier1 is not created, we rely on AppStack and OnboardingForm to drive the flow.
  if (status !== 'tier1_created') {
    return (
      <ScreenWrapper>
        <View style={styles.centered}>
          <ActivityIndicator size="large" />
          <Text style={[styles.subtitle, { marginTop: theme.spacing.s16 }]}>{statusMessage}</Text>
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
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.container}>
            <Text style={styles.title}>Complete Your Verification</Text>
            <Text style={styles.subtitle}>
              Please provide your additional details to finish your account setup.
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

            <PrimaryButton
              title={submitting ? 'Processing...' : 'Submit'}
              onPress={handleSubmitTier2}
              isLoading={submitting}
            />
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

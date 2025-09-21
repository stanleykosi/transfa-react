/**
 * @description
 * Tier 1 Create Account screen.
 * Guarded by Tier 0 status: will not render form unless backend reports `tier0_created`.
 * Collects Tier 1 fields (DOB, gender, BVN) and submits to backend (placeholder for now).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { View, Text, StyleSheet, Alert } from 'react-native';
import ScreenWrapper from '@/components/ScreenWrapper';
import PrimaryButton from '@/components/PrimaryButton';
import FormInput from '@/components/FormInput';
import { theme } from '@/constants/theme';
import apiClient from '@/api/apiClient';
import { useAuth, useUser } from '@clerk/clerk-expo';

const CreateAccountScreen = () => {
  const { getToken } = useAuth();
  const { user } = useUser();
  const [status, setStatus] = useState<'checking' | 'tier0_pending' | 'tier0_created' | 'error'>('checking');
  const [dob, setDob] = useState(''); // YYYY-MM-DD
  const [gender, setGender] = useState<'male' | 'female' | ''>('');
  const [bvn, setBvn] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const headers = useMemo(() => ({
    'X-Clerk-User-Id': user?.id || '',
  }), [user?.id]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      try {
        const token = await getToken().catch(() => undefined);
        const { data } = await apiClient.get<{ status: string }>('/onboarding/status', {
          headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers },
        });
        if (!mounted) return;
        setStatus(data?.status === 'tier0_created' ? 'tier0_created' : 'tier0_pending');
        if (data?.status !== 'tier0_created') {
          Alert.alert('Verification in progress', 'We are verifying your details. Please try again shortly.');
        }
      } catch (e) {
        if (!mounted) return;
        setStatus('error');
        Alert.alert('Error', 'Unable to confirm verification status. Try again later.');
      }
    })();
    return () => { mounted = false; };
  }, [getToken, headers]);

  const handleSubmitTier1 = async () => {
    if (status !== 'tier0_created') {
      Alert.alert('Please wait', 'Your Tier 0 verification has not completed yet.');
      return;
    }
    if (!dob || !gender || !bvn) {
      Alert.alert('Validation Error', 'Please provide BVN, date of birth, and gender.');
      return;
    }
    setSubmitting(true);
    try {
      const token = await getToken().catch(() => undefined);
      // Placeholder: call your Tier 1 endpoint when available
      // await apiClient.post('/verification/tier1', { bvn, dob, gender }, { headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...headers } });
      Alert.alert('Submitted', 'Tier 1 details submitted. We will notify you once approved.');
    } catch (e) {
      Alert.alert('Error', 'Failed to submit verification. Please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  if (status !== 'tier0_created') {
    return (
      <ScreenWrapper>
        <View style={styles.centered}>
          <Text style={styles.title}>Verifying your details…</Text>
          <Text style={styles.subtitle}>You can return to this step once verification is complete.</Text>
        </View>
      </ScreenWrapper>
    );
  }

  return (
    <ScreenWrapper>
      <View style={styles.container}>
        <Text style={styles.title}>Create your account</Text>
        <Text style={styles.subtitle}>Provide the details required to finish verification.</Text>

        <FormInput label="BVN" value={bvn} onChangeText={setBvn} placeholder="Enter your 11-digit BVN" keyboardType="number-pad" maxLength={11} />
        <FormInput label="Date of Birth" value={dob} onChangeText={setDob} placeholder="YYYY-MM-DD" />
        <FormInput label="Gender (male/female)" value={gender} onChangeText={(t) => setGender((t as any).toLowerCase() as any)} placeholder="male or female" />

        <PrimaryButton title="Submit" onPress={handleSubmitTier1} isLoading={submitting} />
      </View>
    </ScreenWrapper>
  );
};

const styles = StyleSheet.create({
  container: { padding: theme.spacing.s24, gap: theme.spacing.s16 },
  centered: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: theme.spacing.s24 },
  title: { fontSize: theme.fontSizes['2xl'], fontWeight: theme.fontWeights.bold, color: theme.colors.textPrimary, textAlign: 'center', marginBottom: theme.spacing.s8 },
  subtitle: { fontSize: theme.fontSizes.base, color: theme.colors.textSecondary, textAlign: 'center', marginBottom: theme.spacing.s24 },
});

export default CreateAccountScreen;



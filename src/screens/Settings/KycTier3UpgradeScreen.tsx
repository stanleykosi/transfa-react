import React, { useMemo, useState } from 'react';
import {
  Alert,
  ScrollView,
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
import { launchImageLibrary } from 'react-native-image-picker';
import { useMutation, useQueryClient } from '@tanstack/react-query';

import { submitTier3Upgrade } from '@/api/authApi';
import { ProfileStackParamList } from '@/navigation/ProfileStack';
import type { Tier3UpgradePayload } from '@/types/api';
import theme from '@/constants/theme';

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList, 'KycTier3Upgrade'>;

const BRAND_YELLOW = '#FFD400';
const BG_BOTTOM = '#060708';
const { fontSizes, fontWeights, spacing } = theme;

const idTypes: Tier3UpgradePayload['id_type'][] = [
  'DRIVERS_LICENSE',
  'VOTERS_CARD',
  'PASSPORT',
  'NATIONAL_ID',
  'NIN_SLIP',
];

const formatIDType = (value: Tier3UpgradePayload['id_type']) =>
  value
    .toLowerCase()
    .split('_')
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');

const KycTier3UpgradeScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const queryClient = useQueryClient();

  const [idType, setIDType] = useState<Tier3UpgradePayload['id_type']>('DRIVERS_LICENSE');
  const [idNumber, setIDNumber] = useState('');
  const [expiryDate, setExpiryDate] = useState('');
  const [docName, setDocName] = useState<string | null>(null);

  const mutation = useMutation({
    mutationFn: submitTier3Upgrade,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['kyc-status'] });
      Alert.alert(
        'Tier 3 Submitted',
        'Your tier 3 request has been submitted successfully. If additional documents are required, your status will update to Awaiting Document.'
      );
      navigation.goBack();
    },
    onError: (error: any) => {
      const detail =
        error?.response?.data?.detail || error?.message || 'Unable to submit tier 3 request.';
      Alert.alert('Submission failed', detail);
    },
  });

  const canSubmit = useMemo(() => {
    return idNumber.trim().length >= 4 && /^\d{4}-\d{2}-\d{2}$/.test(expiryDate.trim());
  }, [expiryDate, idNumber]);

  const cycleIDType = () => {
    const currentIndex = idTypes.indexOf(idType);
    const nextIndex = (currentIndex + 1) % idTypes.length;
    setIDType(idTypes[nextIndex]);
  };

  const pickDocument = async () => {
    const result = await launchImageLibrary({
      mediaType: 'photo',
      selectionLimit: 1,
      quality: 0.7,
    });
    const asset = result.assets?.[0];
    if (asset?.fileName) {
      setDocName(asset.fileName);
    }
  };

  const submit = () => {
    if (!canSubmit) {
      Alert.alert('Invalid form', 'Enter a valid ID number and expiry date in YYYY-MM-DD format.');
      return;
    }

    mutation.mutate({
      id_type: idType,
      id_number: idNumber.trim(),
      expiry_date: expiryDate.trim(),
    });
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
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#ECECEC" />
          </TouchableOpacity>

          <Text style={styles.title}>Tier 3 Upgrade</Text>

          <Text style={styles.label}>ID Type</Text>
          <TouchableOpacity style={styles.input} onPress={cycleIDType} activeOpacity={0.8}>
            <Text style={styles.inputText}>{formatIDType(idType)}</Text>
            <Ionicons name="chevron-down" size={18} color="#DFDFDF" />
          </TouchableOpacity>

          <Text style={styles.label}>Document Number</Text>
          <TextInput
            style={styles.textInput}
            value={idNumber}
            onChangeText={setIDNumber}
            placeholder="Enter ID number"
            placeholderTextColor="#7C7F84"
            autoCapitalize="characters"
          />

          <Text style={styles.label}>Expiry Date</Text>
          <TextInput
            style={styles.textInput}
            value={expiryDate}
            onChangeText={setExpiryDate}
            placeholder="YYYY-MM-DD"
            placeholderTextColor="#7C7F84"
            keyboardType="numbers-and-punctuation"
          />

          <Text style={styles.label}>Document Upload (Optional)</Text>
          <TouchableOpacity style={styles.input} onPress={pickDocument} activeOpacity={0.8}>
            <Text style={styles.inputText}>{docName || 'Upload ID image'}</Text>
            <Ionicons name="cloud-upload-outline" size={18} color="#DFDFDF" />
          </TouchableOpacity>

          <View style={styles.infoCard}>
            <Ionicons name="information-circle" size={18} color={BRAND_YELLOW} />
            <Text style={styles.infoText}>
              Some tier 3 requests may require extra document verification from Anchor before final
              approval.
            </Text>
          </View>

          <TouchableOpacity
            style={[
              styles.submitButton,
              (!canSubmit || mutation.isPending) && styles.submitButtonDisabled,
            ]}
            onPress={submit}
            disabled={!canSubmit || mutation.isPending}
          >
            <Text style={styles.submitButtonText}>
              {mutation.isPending ? 'Submitting...' : 'Submit Tier 3 Request'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#090A0B',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.s20,
    paddingBottom: spacing.s32,
  },
  backButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  title: {
    marginTop: 20,
    color: '#F2F2F2',
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    marginBottom: 24,
  },
  label: {
    color: '#EAEAEC',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.medium,
    marginBottom: 8,
    marginTop: 8,
  },
  input: {
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  inputText: {
    color: '#EDEDED',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
    flex: 1,
    marginRight: 8,
  },
  textInput: {
    minHeight: 52,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    color: '#EFEFEF',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  infoCard: {
    marginTop: 18,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    borderStyle: 'dashed',
    backgroundColor: 'rgba(0,0,0,0.2)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 8,
  },
  infoText: {
    color: '#C2C4C8',
    fontSize: fontSizes.sm,
    lineHeight: 18,
    flex: 1,
  },
  submitButton: {
    marginTop: 22,
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    color: '#101214',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
});

export default KycTier3UpgradeScreen;

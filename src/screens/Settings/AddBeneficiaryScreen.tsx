import React, { useEffect, useMemo, useRef, useState } from 'react';
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

import { ProfileStackParamList } from '@/navigation/ProfileStack';
import { useAddBeneficiary, useListBanks, useVerifyBeneficiaryAccount } from '@/api/accountApi';
import BankDropdown from '@/components/BankDropdown';
import type { Bank } from '@/types/api';
import { useSensitiveFlowStore } from '@/store/useSensitiveFlowStore';
import theme from '@/constants/theme';

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList, 'AddBeneficiary'>;

const BRAND_YELLOW = '#FFD400';
const BG_BOTTOM = '#060708';
const { fontSizes, fontWeights, spacing } = theme;

const extractApiErrorMessage = (error: any, fallback: string): string => {
  const responseData = error?.response?.data;

  if (typeof responseData === 'string' && responseData.trim() !== '') {
    return responseData.trim();
  }

  if (responseData && typeof responseData === 'object') {
    if (typeof responseData.detail === 'string' && responseData.detail.trim() !== '') {
      return responseData.detail.trim();
    }
    if (typeof responseData.message === 'string' && responseData.message.trim() !== '') {
      return responseData.message.trim();
    }
    if (typeof responseData.error === 'string' && responseData.error.trim() !== '') {
      return responseData.error.trim();
    }
  }

  if (typeof error?.message === 'string' && error.message.trim() !== '') {
    return error.message.trim();
  }

  return fallback;
};

const AddBeneficiaryScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const transactionPin = useSensitiveFlowStore((state) => state.linkAccountPin);
  const clearLinkAccountPin = useSensitiveFlowStore((state) => state.clearLinkAccountPin);

  const [selectedBank, setSelectedBank] = useState<Bank | null>(null);
  const [accountNumber, setAccountNumber] = useState('');
  const [agree, setAgree] = useState(false);
  const [resolvedName, setResolvedName] = useState('');
  const [verifiedAccountKey, setVerifiedAccountKey] = useState<string | null>(null);
  const latestVerificationRequestKeyRef = useRef<string | null>(null);

  useEffect(() => {
    return () => {
      clearLinkAccountPin();
    };
  }, [clearLinkAccountPin]);

  const { data: banksData, isLoading: loadingBanks, error: banksError } = useListBanks();

  const verifyMutation = useVerifyBeneficiaryAccount({
    onSuccess: (response, variables) => {
      const responseKey = `${variables.bank_code}:${variables.account_number}`;
      if (latestVerificationRequestKeyRef.current !== responseKey) {
        return;
      }

      setResolvedName(response.account_name);
      setVerifiedAccountKey(responseKey);
    },
    onError: (error: any, variables) => {
      const responseKey = `${variables.bank_code}:${variables.account_number}`;
      if (latestVerificationRequestKeyRef.current !== responseKey) {
        return;
      }

      setResolvedName('');
      setVerifiedAccountKey(null);
      Alert.alert(
        'Unable to verify account',
        extractApiErrorMessage(error, 'Check the account details and try again.')
      );
    },
  });

  const addMutation = useAddBeneficiary({
    onSuccess: () => {
      clearLinkAccountPin();
      Alert.alert('Linked', 'Account linked successfully.');
      navigation.navigate('Beneficiaries');
    },
    onError: (error: any) => {
      const statusCode = error?.response?.status;
      const detail = extractApiErrorMessage(error, 'Failed to link account.');

      if (statusCode === 412) {
        Alert.alert(
          'Transaction PIN required',
          'Set your transaction PIN before linking an account.',
          [
            {
              text: 'Set PIN',
              onPress: () =>
                navigation
                  .getParent()
                  ?.getParent()
                  ?.navigate('CreatePin' as never),
            },
            { text: 'Cancel', style: 'cancel' },
          ]
        );
        return;
      }

      if (statusCode === 401) {
        clearLinkAccountPin();
        Alert.alert('Incorrect PIN', 'Enter your transaction PIN again to link this account.', [
          {
            text: 'Enter PIN',
            onPress: () => navigation.replace('LinkAccountPin'),
          },
        ]);
        return;
      }

      if (statusCode === 423) {
        clearLinkAccountPin();
        Alert.alert(
          'PIN temporarily locked',
          'Too many incorrect PIN attempts. Wait a bit, then enter your PIN again.',
          [
            {
              text: 'OK',
              onPress: () => navigation.replace('LinkAccountPin'),
            },
          ]
        );
        return;
      }

      Alert.alert('Link failed', detail);
    },
  });

  const canResolve = useMemo(
    () => selectedBank && accountNumber.trim().length === 10,
    [accountNumber, selectedBank]
  );
  const currentAccountKey = useMemo(
    () => (selectedBank ? `${selectedBank.attributes.nipCode}:${accountNumber.trim()}` : null),
    [accountNumber, selectedBank]
  );
  const canSubmit = useMemo(
    () =>
      Boolean(
        selectedBank &&
          transactionPin &&
          accountNumber.trim().length === 10 &&
          verifiedAccountKey !== null &&
          verifiedAccountKey === currentAccountKey &&
          resolvedName.trim() !== '' &&
          agree
      ),
    [
      selectedBank,
      transactionPin,
      accountNumber,
      verifiedAccountKey,
      currentAccountKey,
      resolvedName,
      agree,
    ]
  );

  const resolveAccount = () => {
    if (!selectedBank || accountNumber.trim().length !== 10) {
      Alert.alert('Invalid details', 'Select a bank and enter a valid 10-digit account number.');
      return;
    }

    const requestKey = `${selectedBank.attributes.nipCode}:${accountNumber.trim()}`;
    latestVerificationRequestKeyRef.current = requestKey;
    setResolvedName('');
    setVerifiedAccountKey(null);

    verifyMutation.mutate({
      bank_code: selectedBank.attributes.nipCode,
      account_number: accountNumber.trim(),
    });
  };

  const submit = () => {
    if (!transactionPin) {
      Alert.alert('PIN required', 'Please restart account linking and enter your transaction PIN.');
      clearLinkAccountPin();
      navigation.replace('LinkAccountPin');
      return;
    }

    if (!canSubmit || !selectedBank) {
      Alert.alert(
        'Incomplete form',
        'Resolve account details and accept the terms before linking.'
      );
      return;
    }

    addMutation.mutate({
      bank_code: selectedBank.attributes.nipCode,
      account_number: accountNumber.trim(),
      transaction_pin: transactionPin,
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

          <Text style={styles.title}>Link New Account</Text>

          <Text style={styles.label}>Bank</Text>
          <BankDropdown
            banks={banksData?.data || []}
            selectedBank={selectedBank}
            onSelectBank={(bank) => {
              setSelectedBank(bank);
              latestVerificationRequestKeyRef.current = null;
              setResolvedName('');
              setVerifiedAccountKey(null);
            }}
            isLoading={loadingBanks}
            error={banksError?.message}
            placeholder="Search bank"
          />

          <Text style={styles.label}>Account number</Text>
          <TextInput
            style={styles.input}
            value={accountNumber}
            onChangeText={(value) => {
              setAccountNumber(value.replace(/[^0-9]/g, '').slice(0, 10));
              latestVerificationRequestKeyRef.current = null;
              setResolvedName('');
              setVerifiedAccountKey(null);
            }}
            keyboardType="number-pad"
            placeholder="Enter your account number"
            placeholderTextColor="#7C7F84"
            maxLength={10}
          />

          <TouchableOpacity
            style={[styles.resolveButton, !canResolve && styles.resolveButtonDisabled]}
            onPress={resolveAccount}
            disabled={!canResolve || verifyMutation.isPending}
          >
            <Text style={styles.resolveButtonText}>
              {verifyMutation.isPending ? 'Verifying...' : 'Verify Account'}
            </Text>
          </TouchableOpacity>

          {resolvedName ? (
            <View style={styles.resolvedCard}>
              <Text style={styles.resolvedLabel}>Account Name</Text>
              <Text style={styles.resolvedValue}>{resolvedName}</Text>
            </View>
          ) : null}

          <TouchableOpacity style={styles.termsRow} onPress={() => setAgree((prev) => !prev)}>
            <Text style={styles.termsText}>
              I have read, and i agree to the{' '}
              <Text style={styles.termsLink}>Terms & Conditions</Text> for linking my account
            </Text>
            <View style={[styles.checkCircle, agree && styles.checkCircleActive]}>
              {agree ? <Ionicons name="checkmark" size={14} color="#0F1113" /> : null}
            </View>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.submitButton,
              (!canSubmit || addMutation.isPending) && styles.submitDisabled,
            ]}
            onPress={submit}
            disabled={!canSubmit || addMutation.isPending}
          >
            <Text style={styles.submitText}>
              {addMutation.isPending ? 'Linking...' : 'Link account'}
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
    marginTop: 16,
    marginBottom: 22,
    color: '#F2F2F2',
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    textAlign: 'center',
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
    color: '#EFEFEF',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  resolveButton: {
    marginTop: 10,
    minHeight: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.22)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  resolveButtonDisabled: {
    opacity: 0.55,
  },
  resolveButtonText: {
    color: '#D3D5D9',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.semibold,
  },
  resolvedCard: {
    marginTop: 12,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  resolvedLabel: {
    color: '#A4A7AC',
    fontSize: fontSizes.xs,
    marginBottom: 2,
  },
  resolvedValue: {
    color: '#F4F4F4',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.semibold,
  },
  termsRow: {
    marginTop: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  termsText: {
    color: '#8F9298',
    fontSize: fontSizes.sm,
    lineHeight: 20,
    flex: 1,
  },
  termsLink: {
    color: BRAND_YELLOW,
    textDecorationLine: 'underline',
    fontWeight: fontWeights.semibold,
  },
  checkCircle: {
    width: 18,
    height: 18,
    borderRadius: 9,
    borderWidth: 1,
    borderColor: '#8B8E94',
    marginTop: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  checkCircleActive: {
    borderColor: BRAND_YELLOW,
    backgroundColor: BRAND_YELLOW,
  },
  submitButton: {
    marginTop: 14,
    minHeight: 52,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  submitDisabled: {
    opacity: 0.6,
  },
  submitText: {
    color: '#101214',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
});

export default AddBeneficiaryScreen;

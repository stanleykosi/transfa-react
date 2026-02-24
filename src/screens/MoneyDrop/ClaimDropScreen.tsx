import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useUser } from '@clerk/clerk-expo';

import type { AppStackParamList } from '@/navigation/AppStack';
import type { AppNavigationProp } from '@/types/navigation';
import { useClaimMoneyDrop, useMoneyDropDetails } from '@/api/transactionApi';
import { formatCurrency } from '@/utils/formatCurrency';
import { normalizeUsername } from '@/utils/username';

const BRAND_YELLOW = '#FFD300';
const BG_BOTTOM = '#050607';
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BORDER = 'rgba(255,255,255,0.10)';

type ClaimDropScreenRouteProp = RouteProp<AppStackParamList, 'ClaimDrop'>;
type ClaimStep = 'preview' | 'claim';

const formatCompactCurrency = (amountInKobo: number): string => {
  const nairaAmount = amountInKobo / 100;
  return `₦${nairaAmount.toLocaleString('en-NG', { maximumFractionDigits: 0 })}`;
};

const generateIdempotencyKey = () => {
  const randomUUID = globalThis.crypto?.randomUUID?.();
  if (randomUUID) {
    return `mdclaim_${randomUUID}`;
  }
  return `mdclaim_${Date.now()}_${Math.random().toString(36).slice(2, 14)}`;
};

const ClaimDropScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const route = useRoute<ClaimDropScreenRouteProp>();
  const { dropId } = route.params;
  const { user } = useUser();

  const [lockPassword, setLockPassword] = useState('');
  const [passwordError, setPasswordError] = useState('');
  const [step, setStep] = useState<ClaimStep>('preview');
  const [showSuccessSheet, setShowSuccessSheet] = useState(false);
  const [successMessage, setSuccessMessage] = useState('');
  const idempotencyKey = useMemo(() => generateIdempotencyKey(), [dropId]);

  const { data, isLoading, error } = useMoneyDropDetails(dropId);
  const { mutate: claimDrop, isPending } = useClaimMoneyDrop({
    onSuccess: (response) => {
      setSuccessMessage(response.message || 'MoneyDrop has been sent to your Transfa account');
      setShowSuccessSheet(true);
    },
    onError: (claimError) => {
      const message = claimError.message || 'Could not claim this money drop.';
      const lowered = message.toLowerCase();
      if (lowered.includes('invalid drop password')) {
        setPasswordError('Wrong password');
        return;
      }
      if (lowered.includes('password protected')) {
        setPasswordError('Enter password to continue');
        return;
      }
      if (lowered.includes('already claimed')) {
        Alert.alert('Already Claimed', 'You have already claimed this money drop.');
        return;
      }
      if (lowered.includes('already being processed')) {
        Alert.alert(
          'Claim In Progress',
          'Your claim request is already being processed. Please wait a moment.'
        );
        return;
      }
      Alert.alert('Claim Failed', message);
    },
  });

  const progressRatio = useMemo(() => {
    if (!data || data.total_claims_allowed <= 0) {
      return 0;
    }
    return Math.max(0, Math.min(1, data.claims_made_count / data.total_claims_allowed));
  }, [data]);

  const claimTakenLabel = useMemo(() => {
    if (!data) {
      return '0 / 0';
    }
    return `${data.claims_made_count} / ${data.total_claims_allowed}`;
  }, [data]);

  const claimSuccessSubtitle = useMemo(() => {
    if (successMessage.toLowerCase().includes('processing')) {
      return 'MoneyDrop claim is processing and will reflect shortly';
    }
    return 'MoneyDrop has been sent to your Transfa account';
  }, [successMessage]);

  const claimantLabel = useMemo(() => {
    const rawLabel = user?.username || user?.firstName || user?.fullName || 'You';
    return normalizeUsername(rawLabel);
  }, [user?.firstName, user?.fullName, user?.username]);

  const onSubmitClaim = () => {
    if (!data) {
      return;
    }

    if (data.requires_password && lockPassword.trim().length === 0) {
      setPasswordError('Enter password to continue');
      return;
    }

    setPasswordError('');
    claimDrop({
      dropId,
      lockPassword: data.requires_password ? lockPassword.trim() : undefined,
      idempotencyKey,
    });
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A1B1E', '#0C0D0F', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.backgroundGradient}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <KeyboardAvoidingView
          style={styles.content}
          behavior={Platform.select({ ios: 'padding', android: undefined })}
        >
          <TouchableOpacity
            style={styles.backButton}
            activeOpacity={0.8}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={25} color="#F4F4F5" />
          </TouchableOpacity>

          {isLoading ? (
            <View style={styles.centerContent}>
              <ActivityIndicator size="small" color={BRAND_YELLOW} />
              <Text style={styles.statusText}>Loading money drop...</Text>
            </View>
          ) : error ? (
            <View style={styles.centerContent}>
              <Ionicons name="warning-outline" size={34} color="#F59E0B" />
              <Text style={styles.statusTitle}>Could not load drop</Text>
              <Text style={styles.statusText}>{error.message}</Text>
            </View>
          ) : !data ? (
            <View style={styles.centerContent}>
              <Ionicons name="warning-outline" size={34} color="#F59E0B" />
              <Text style={styles.statusTitle}>Money drop unavailable</Text>
              <Text style={styles.statusText}>This money drop no longer exists.</Text>
            </View>
          ) : step === 'preview' ? (
            <View style={styles.previewWrap}>
              <View style={styles.previewCard}>
                <View style={styles.previewHeader}>
                  <Text style={styles.previewBrand}>Transfa x MoneyDrop</Text>
                  <Text style={styles.previewTitle}>
                    {data.is_claimable ? 'Active Drop' : 'Drop Ended'}
                  </Text>
                </View>

                <View style={styles.previewBody}>
                  <Text style={styles.fieldLabel}>Title</Text>
                  <View style={styles.valueField}>
                    <Text style={styles.valueText}>{data.title}</Text>
                  </View>

                  <Text style={styles.fieldLabel}>MoneyDrop Creator</Text>
                  <View style={styles.valueField}>
                    <Text style={styles.valueText}>{normalizeUsername(data.creator_username)}</Text>
                  </View>

                  <Text style={styles.fieldLabel}>Claims Taken</Text>
                  <View style={styles.progressTrackLight}>
                    <View
                      style={[
                        styles.progressFillLight,
                        { width: `${Math.round(progressRatio * 100)}%` },
                      ]}
                    />
                    <Text style={styles.progressLabel}>{claimTakenLabel}</Text>
                  </View>

                  {data.is_claimable ? (
                    <TouchableOpacity
                      activeOpacity={0.9}
                      style={styles.previewClaimButton}
                      onPress={() => setStep('claim')}
                    >
                      {data.requires_password ? (
                        <Ionicons name="lock-closed-outline" size={16} color="#101215" />
                      ) : null}
                      <Text style={styles.previewClaimButtonText}>
                        {`Claim ${formatCompactCurrency(data.amount_per_claim)}`}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            </View>
          ) : (
            <View style={styles.claimFlowWrap}>
              <View style={styles.claimFlowTopRow}>
                <View style={styles.giftBadgeWrap}>
                  <Ionicons name="gift-outline" size={26} color={BRAND_YELLOW} />
                </View>

                <View style={styles.claimFlowArrow} />

                <View style={styles.userBadgeWrap}>
                  <Text style={styles.userBadgeText}>
                    {claimantLabel.slice(0, 1).toUpperCase()}
                  </Text>
                </View>
              </View>

              <View style={styles.claimFlowTopLabels}>
                <Text style={styles.claimFlowLabel}>MoneyDrop</Text>
                <Text style={styles.claimFlowLabel}>{claimantLabel}</Text>
              </View>

              <Text style={styles.claimAmount}>{formatCurrency(data.amount_per_claim)}</Text>
              <Text style={styles.claimHint}>
                {data.requires_password ? 'Enter Password to claim Drop' : 'Tap to claim Drop'}
              </Text>

              {data.requires_password ? (
                <View style={styles.passwordBlock}>
                  <TextInput
                    style={[styles.passwordInput, passwordError ? styles.passwordInputError : null]}
                    placeholder="Enter password"
                    placeholderTextColor="#63666D"
                    value={lockPassword}
                    secureTextEntry
                    onChangeText={(text) => {
                      setLockPassword(text);
                      if (passwordError) {
                        setPasswordError('');
                      }
                    }}
                    editable={!isPending}
                    autoCapitalize="none"
                  />
                  {passwordError ? (
                    <Text style={styles.passwordErrorText}>{passwordError}</Text>
                  ) : null}
                </View>
              ) : null}

              <TouchableOpacity
                activeOpacity={0.9}
                style={[styles.claimButton, isPending ? styles.claimButtonDisabled : null]}
                onPress={onSubmitClaim}
                disabled={isPending}
              >
                <Text style={styles.claimButtonText}>
                  {isPending ? 'Claiming...' : 'Claim Drop'}
                </Text>
              </TouchableOpacity>
            </View>
          )}
        </KeyboardAvoidingView>
      </SafeAreaView>

      <Modal
        transparent
        visible={showSuccessSheet}
        animationType="fade"
        onRequestClose={() => setShowSuccessSheet(false)}
      >
        <View style={styles.successOverlay}>
          <View style={styles.successSheet}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark" size={54} color="#080A0D" />
            </View>
            <Text style={styles.successTitle}>Success!</Text>
            <Text style={styles.successSubtitle}>{claimSuccessSubtitle}</Text>

            <TouchableOpacity
              activeOpacity={0.9}
              style={styles.successDoneButton}
              onPress={() => {
                setShowSuccessSheet(false);
                navigation.navigate('AppTabs', { screen: 'Home' });
              }}
            >
              <Text style={styles.successDoneButtonText}>Done</Text>
            </TouchableOpacity>

            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => {
                setShowSuccessSheet(false);
                navigation.navigate('MoneyDropClaimedHistory');
              }}
            >
              <Text style={styles.successHistoryLink}>View Claim History</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: BG_BOTTOM,
  },
  backgroundGradient: {
    ...StyleSheet.absoluteFillObject,
  },
  safeArea: {
    flex: 1,
  },
  content: {
    flex: 1,
    paddingHorizontal: 18,
  },
  backButton: {
    width: 34,
    height: 34,
    justifyContent: 'center',
    marginBottom: 8,
  },
  centerContent: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 12,
  },
  statusTitle: {
    color: '#F5F6F8',
    fontSize: 23,
    fontWeight: '700',
    marginTop: 10,
  },
  statusText: {
    color: '#90949B',
    fontSize: 15,
    textAlign: 'center',
    marginTop: 8,
    lineHeight: 22,
  },
  previewWrap: {
    flex: 1,
    justifyContent: 'center',
    paddingBottom: 52,
  },
  previewCard: {
    borderRadius: 8,
    borderWidth: 2,
    borderColor: '#E9E9EA',
    overflow: 'hidden',
  },
  previewHeader: {
    backgroundColor: '#0C0E11',
    paddingTop: 12,
    paddingBottom: 24,
    paddingHorizontal: 16,
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#21242A',
  },
  previewBrand: {
    color: '#E2E4E8',
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 10,
  },
  previewTitle: {
    color: '#FFFFFF',
    fontSize: 50,
    lineHeight: 50,
    fontWeight: '700',
    letterSpacing: -1,
  },
  previewBody: {
    backgroundColor: '#F4F4F5',
    paddingHorizontal: 14,
    paddingTop: 14,
    paddingBottom: 16,
  },
  fieldLabel: {
    color: '#1D1D20',
    fontSize: 18,
    fontWeight: '500',
    marginBottom: 6,
  },
  valueField: {
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#CACBD0',
    borderRadius: 4,
    minHeight: 54,
    justifyContent: 'center',
    paddingHorizontal: 12,
    marginBottom: 12,
    backgroundColor: '#F6F6F8',
  },
  valueText: {
    color: '#0F1013',
    fontSize: 31,
    fontWeight: '700',
  },
  progressTrackLight: {
    height: 28,
    borderRadius: 8,
    backgroundColor: '#DADADF',
    overflow: 'hidden',
    justifyContent: 'center',
    marginBottom: 16,
  },
  progressFillLight: {
    position: 'absolute',
    left: 0,
    top: 0,
    bottom: 0,
    backgroundColor: '#040506',
  },
  progressLabel: {
    color: BRAND_YELLOW,
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  previewClaimButton: {
    height: 56,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 8,
  },
  previewClaimButtonText: {
    color: '#0A0B0D',
    fontSize: 28,
    fontWeight: '700',
  },
  claimFlowWrap: {
    flex: 1,
    paddingTop: 44,
  },
  claimFlowTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 8,
  },
  giftBadgeWrap: {
    width: 54,
    height: 54,
    borderRadius: 28,
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimFlowArrow: {
    width: 70,
    borderTopWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#A7ABB2',
    marginHorizontal: 10,
  },
  userBadgeWrap: {
    width: 56,
    height: 56,
    borderRadius: 12,
    backgroundColor: '#D9C29D',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userBadgeText: {
    color: '#16171B',
    fontSize: 24,
    fontWeight: '700',
  },
  claimFlowTopLabels: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginHorizontal: 52,
    marginBottom: 28,
  },
  claimFlowLabel: {
    color: '#A5A9B1',
    fontSize: 14,
    fontWeight: '500',
  },
  claimAmount: {
    color: '#F5F6F8',
    fontSize: 52,
    fontWeight: '700',
    textAlign: 'center',
    marginBottom: 8,
  },
  claimHint: {
    color: '#6F737B',
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  passwordBlock: {
    marginBottom: 14,
  },
  passwordInput: {
    height: 54,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    color: '#F4F5F7',
    fontSize: 17,
    paddingHorizontal: 14,
  },
  passwordInputError: {
    borderColor: '#EF4444',
  },
  passwordErrorText: {
    color: '#EF4444',
    marginTop: 6,
    fontSize: 14,
  },
  claimButton: {
    height: 56,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  claimButtonDisabled: {
    opacity: 0.7,
  },
  claimButtonText: {
    color: '#0C0D10',
    fontSize: 24,
    fontWeight: '700',
  },
  successOverlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.48)',
    justifyContent: 'flex-end',
  },
  successSheet: {
    backgroundColor: '#F3F3F4',
    borderTopLeftRadius: 22,
    borderTopRightRadius: 22,
    paddingHorizontal: 24,
    paddingTop: 24,
    paddingBottom: 36,
    alignItems: 'center',
  },
  successIconWrap: {
    width: 130,
    height: 130,
    borderRadius: 65,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 12,
  },
  successTitle: {
    color: '#101215',
    fontSize: 40,
    fontWeight: '700',
    marginBottom: 8,
  },
  successSubtitle: {
    color: '#303238',
    fontSize: 17,
    textAlign: 'center',
    lineHeight: 30,
    marginBottom: 14,
  },
  successDoneButton: {
    minWidth: 140,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#111318',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 18,
    marginBottom: 10,
  },
  successDoneButtonText: {
    color: '#F5F6F8',
    fontSize: 22,
    fontWeight: '700',
  },
  successHistoryLink: {
    color: '#181A20',
    fontSize: 16,
    fontWeight: '600',
    textDecorationLine: 'underline',
  },
});

export default ClaimDropScreen;

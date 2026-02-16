import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import ReactNativeBiometrics from 'react-native-biometrics';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';

import {
  useGetIncomingPaymentRequest,
  usePayIncomingPaymentRequest,
  useTransactionFees,
  useUserProfile,
} from '@/api/transactionApi';
import type { AppNavigationProp } from '@/types/navigation';
import type { AppStackParamList } from '@/navigation/AppStack';
import { useSecurityStore } from '@/store/useSecurityStore';
import { formatCurrency } from '@/utils/formatCurrency';
import { BRAND_YELLOW, stripUsernamePrefix } from './helpers';

type AuthRoute = RouteProp<AppStackParamList, 'RequestPaymentAuth'>;

const BG_BOTTOM = '#050607';

const rnBiometrics = new ReactNativeBiometrics();

const RequestPaymentAuthScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const route = useRoute<AuthRoute>();
  const { requestId } = route.params;

  const pinInputRef = useRef<TextInput | null>(null);

  const [mode, setMode] = useState<'pin' | 'biometric'>('pin');
  const [pinValue, setPinValue] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [isProcessingVisible, setProcessingVisible] = useState(false);
  const [isSuccessVisible, setSuccessVisible] = useState(false);
  const [hasAutoSubmitted, setHasAutoSubmitted] = useState(false);
  const [lastResult, setLastResult] = useState<{
    transactionId: string;
    amount: number;
    fee: number;
  } | null>(null);

  const { biometricsEnabled, getPin } = useSecurityStore();

  const { data: me } = useUserProfile();
  const { data: request, isLoading: isLoadingRequest } = useGetIncomingPaymentRequest(requestId);
  const { data: fees, isLoading: isLoadingFees } = useTransactionFees();

  const payMutation = usePayIncomingPaymentRequest();

  const fee = fees?.p2p_fee_kobo ?? 0;
  const amount = request?.amount ?? 0;
  const total = amount + fee;

  const senderUsername = useMemo(() => stripUsernamePrefix(me?.username || 'you'), [me?.username]);
  const receiverUsername = useMemo(
    () => stripUsernamePrefix(request?.creator_username || 'recipient'),
    [request?.creator_username]
  );

  useEffect(() => {
    if (mode === 'pin') {
      const timer = setTimeout(() => pinInputRef.current?.focus(), 100);
      return () => clearTimeout(timer);
    }
    return undefined;
  }, [mode]);

  const resolveDevelopmentPin = useCallback(async () => {
    const stored = await getPin();
    if (stored && stored.length === 4) {
      return stored;
    }
    return process.env.EXPO_PUBLIC_DEV_TRANSACTION_PIN || '0000';
  }, [getPin]);

  const submitWithPin = useCallback(
    async (transactionPIN: string) => {
      if (!request) {
        setError('Request is no longer available.');
        return;
      }

      setError(null);
      setProcessingVisible(true);

      try {
        const response = await payMutation.mutateAsync({
          requestId: request.id,
          payload: { transaction_pin: transactionPIN },
        });

        setLastResult({
          transactionId: response.transaction.transaction_id,
          amount: response.transaction.amount ?? request.amount,
          fee: response.transaction.fee ?? fee,
        });
        setSuccessVisible(true);
      } catch (caughtError) {
        const message =
          caughtError instanceof Error ? caughtError.message : 'Could not process request payment.';
        const normalized = message.toLowerCase();

        if (normalized.includes('invalid transaction pin') || normalized.includes('unauthorized')) {
          setError('Wrong PIN. Please try again.');
        } else if (normalized.includes('temporarily locked') || normalized.includes('too many')) {
          setError('PIN is temporarily locked. Please wait and try again.');
        } else if (normalized.includes('insufficient')) {
          setError('Insufficient balance for this payment.');
        } else {
          setError(message);
        }
      } finally {
        setProcessingVisible(false);
        setPinValue('');
      }
    },
    [fee, payMutation, request]
  );

  const handlePinChange = async (value: string) => {
    const normalized = value.replace(/[^0-9]/g, '').slice(0, 4);
    setPinValue(normalized);
    setError(null);

    if (normalized.length === 4 && !payMutation.isPending) {
      await submitWithPin(normalized);
    }
  };

  const handleBiometricVerify = async () => {
    setError(null);

    if (!biometricsEnabled) {
      setError('Biometrics is disabled. Enable it in Settings.');
      return;
    }

    try {
      const { available, biometryType } = await rnBiometrics.isSensorAvailable();
      if (!available || !biometryType) {
        setError('Biometric authentication is not available on this device.');
        return;
      }

      const { success } = await rnBiometrics.simplePrompt({
        promptMessage: 'Verify to continue payment',
        cancelButtonText: 'Cancel',
      });
      if (!success) {
        setError('Biometric verification was cancelled.');
        return;
      }

      const pin = await getPin();
      if (!pin) {
        setError('PIN is required for biometric payment. Use PIN instead.');
        return;
      }

      await submitWithPin(pin);
    } catch {
      setError('Biometric verification failed. Use PIN instead.');
    }
  };

  useEffect(() => {
    const shouldSkipPrompt = process.env.EXPO_PUBLIC_SKIP_PIN_CHECK === 'true';
    if (!shouldSkipPrompt || hasAutoSubmitted || isLoadingRequest || !request) {
      return;
    }

    setHasAutoSubmitted(true);
    resolveDevelopmentPin().then((pin) => {
      submitWithPin(pin);
    });
  }, [hasAutoSubmitted, isLoadingRequest, request, resolveDevelopmentPin, submitWithPin]);

  if (isLoadingRequest || isLoadingFees || !request) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="small" color={BRAND_YELLOW} />
        <Text style={styles.loadingText}>Preparing authorization...</Text>
      </View>
    );
  }

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A1B1E', '#0C0D0F', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#ECECEC" />
        </TouchableOpacity>

        <View style={styles.identityWrap}>
          <View style={styles.userNode}>
            <View style={styles.userAvatar}>
              <Text style={styles.userInitial}>{senderUsername.slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text style={styles.userLabel}>{senderUsername}</Text>
          </View>

          <Ionicons name="arrow-forward" size={18} color="#B8B8BA" style={styles.identityArrow} />

          <View style={styles.userNode}>
            <View style={[styles.userAvatar, { backgroundColor: '#F3ABA7' }]}>
              <Text style={styles.userInitial}>{receiverUsername.slice(0, 1).toUpperCase()}</Text>
            </View>
            <Text style={styles.userLabel}>{receiverUsername}</Text>
          </View>
        </View>

        <Text style={styles.amountText}>{formatCurrency(total)}</Text>

        {mode === 'pin' ? (
          <>
            <Text style={styles.subtitle}>Enter PIN to Pay</Text>
            <Pressable style={styles.pinBoxesRow} onPress={() => pinInputRef.current?.focus()}>
              {[0, 1, 2, 3].map((index) => (
                <View key={index} style={styles.pinBox}>
                  <Text style={styles.pinBoxText}>{pinValue[index] ? pinValue[index] : '-'}</Text>
                </View>
              ))}
            </Pressable>

            <TextInput
              ref={pinInputRef}
              value={pinValue}
              onChangeText={handlePinChange}
              keyboardType="number-pad"
              maxLength={4}
              secureTextEntry
              style={styles.hiddenInput}
            />

            <TouchableOpacity onPress={() => setMode('biometric')}>
              <Text style={styles.altActionText}>Pay with Biometrics</Text>
            </TouchableOpacity>
          </>
        ) : (
          <>
            <View style={styles.biometricsIconWrap}>
              <Ionicons name="scan-circle-outline" size={34} color="#ECECEE" />
            </View>

            <TouchableOpacity style={styles.verifyButton} onPress={handleBiometricVerify}>
              <Text style={styles.verifyButtonText}>Verify Biometrics</Text>
            </TouchableOpacity>

            <TouchableOpacity onPress={() => setMode('pin')}>
              <Text style={styles.altActionText}>Pay with Pin</Text>
            </TouchableOpacity>
          </>
        )}

        {payMutation.isPending ? (
          <View style={styles.stateWrap}>
            <ActivityIndicator size="small" color={BRAND_YELLOW} />
          </View>
        ) : null}

        {error ? <Text style={styles.errorText}>{error}</Text> : null}
      </SafeAreaView>

      <Modal transparent animationType="fade" visible={isProcessingVisible}>
        <View style={styles.overlay}>
          <View style={styles.processingCard}>
            <Ionicons name="paper-plane-outline" size={44} color={BRAND_YELLOW} />
            <Text style={styles.processingTitle}>Processing</Text>
            <Text style={styles.processingSubtitle}>Your transfer is processing</Text>
          </View>
        </View>
      </Modal>

      <Modal
        transparent
        animationType="fade"
        visible={isSuccessVisible}
        onRequestClose={() => setSuccessVisible(false)}
      >
        <View style={styles.overlay}>
          <View style={styles.successCard}>
            <View style={styles.successIconWrap}>
              <Ionicons name="checkmark" size={30} color="#0C0D10" />
            </View>
            <Text style={styles.successTitle}>Success!</Text>
            <Text style={styles.successSubtitle}>Your transaction was successful.</Text>

            <TouchableOpacity
              style={styles.successDoneButton}
              onPress={() => {
                setSuccessVisible(false);
                navigation.navigate('AppTabs', { screen: 'Home' });
              }}
            >
              <Text style={styles.successDoneButtonText}>Done</Text>
            </TouchableOpacity>

            {lastResult ? (
              <TouchableOpacity
                onPress={() => {
                  setSuccessVisible(false);
                  navigation.navigate('TransferStatus', {
                    transactionId: lastResult.transactionId,
                    amount: lastResult.amount,
                    fee: lastResult.fee,
                    description: `Request payment to ${receiverUsername}`,
                    recipientUsername: receiverUsername,
                    transferType: 'p2p',
                  });
                }}
              >
                <Text style={styles.viewReceiptText}>View Receipt</Text>
              </TouchableOpacity>
            ) : null}
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
  safeArea: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
    alignItems: 'center',
  },
  loadingRoot: {
    flex: 1,
    backgroundColor: BG_BOTTOM,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#F2F2F2',
    fontSize: 14,
  },
  backButton: {
    alignSelf: 'flex-start',
    width: 28,
    paddingVertical: 4,
  },
  identityWrap: {
    marginTop: 30,
    flexDirection: 'row',
    alignItems: 'center',
  },
  userNode: {
    alignItems: 'center',
    width: 110,
  },
  userAvatar: {
    width: 54,
    height: 54,
    borderRadius: 14,
    backgroundColor: '#F4DDB5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userInitial: {
    color: '#151618',
    fontSize: 22,
    fontWeight: '700',
  },
  userLabel: {
    marginTop: 8,
    color: '#D8D9DC',
    fontSize: 16,
    fontWeight: '500',
  },
  identityArrow: {
    marginHorizontal: 14,
    marginBottom: 18,
  },
  amountText: {
    marginTop: 12,
    color: '#F4F5F7',
    fontSize: 46 / 2,
    fontWeight: '800',
  },
  subtitle: {
    marginTop: 8,
    color: '#8D9097',
    fontSize: 26 / 2,
    fontWeight: '500',
  },
  pinBoxesRow: {
    marginTop: 20,
    flexDirection: 'row',
    gap: 10,
  },
  pinBox: {
    width: 48,
    height: 48,
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  pinBoxText: {
    color: '#D9DBDF',
    fontSize: 22 / 2,
    fontWeight: '700',
  },
  hiddenInput: {
    position: 'absolute',
    width: 1,
    height: 1,
    opacity: 0,
  },
  altActionText: {
    marginTop: 20,
    color: BRAND_YELLOW,
    fontSize: 16,
    fontWeight: '500',
  },
  biometricsIconWrap: {
    marginTop: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButton: {
    marginTop: 22,
    width: '100%',
    height: 52,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  verifyButtonText: {
    color: '#131417',
    fontSize: 22 / 2,
    fontWeight: '700',
  },
  stateWrap: {
    marginTop: 14,
  },
  errorText: {
    marginTop: 14,
    color: '#FF7070',
    fontSize: 13,
    textAlign: 'center',
  },
  overlay: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.55)',
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 20,
  },
  processingCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 18,
    backgroundColor: '#F2F2F3',
    alignItems: 'center',
    paddingVertical: 28,
    paddingHorizontal: 18,
  },
  processingTitle: {
    marginTop: 10,
    color: '#131417',
    fontSize: 38 / 2,
    fontWeight: '800',
  },
  processingSubtitle: {
    marginTop: 4,
    color: '#6B6E75',
    fontSize: 16,
  },
  successCard: {
    width: '100%',
    maxWidth: 340,
    borderRadius: 12,
    backgroundColor: '#F5F5F6',
    alignItems: 'center',
    paddingVertical: 24,
    paddingHorizontal: 18,
  },
  successIconWrap: {
    width: 70,
    height: 70,
    borderRadius: 35,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  successTitle: {
    marginTop: 12,
    color: '#121316',
    fontSize: 38 / 2,
    fontWeight: '800',
  },
  successSubtitle: {
    marginTop: 4,
    color: '#4F525A',
    fontSize: 16,
    textAlign: 'center',
  },
  successDoneButton: {
    marginTop: 14,
    width: 150,
    height: 44,
    borderRadius: 9,
    backgroundColor: '#0B0C10',
    alignItems: 'center',
    justifyContent: 'center',
  },
  successDoneButtonText: {
    color: '#F4F5F7',
    fontSize: 17,
    fontWeight: '700',
  },
  viewReceiptText: {
    marginTop: 10,
    color: '#1D1F24',
    fontSize: 15,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
});

export default RequestPaymentAuthScreen;

import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Pressable,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';

import { searchUsers } from '@/api/authApi';
import {
  useGetIncomingPaymentRequest,
  useTransactionFees,
  useUserProfile,
} from '@/api/transactionApi';
import type { AppNavigationProp } from '@/types/navigation';
import { formatCurrency } from '@/utils/formatCurrency';
import { parseScannedPayload, type ParsedScanPayload } from '@/utils/scanPayload';
import { normalizeUsername, usernameKey } from '@/utils/username';

const BRAND_YELLOW = '#FFD300';
const CARD_BG = '#E8E8E8';
const DARK_BG = '#050607';
const VISION_CAMERA_UNAVAILABLE_NOTICE =
  'QR scanning is unavailable in Expo Go. Use a development build to scan.';

type VisionCameraModule = typeof import('react-native-vision-camera');

let visionCameraModule: VisionCameraModule | null = null;
try {
  visionCameraModule = require('react-native-vision-camera') as VisionCameraModule;
} catch {
  // Expo Go does not provide the native Vision Camera module.
}

const CameraView = (visionCameraModule?.Camera ?? null) as React.ComponentType<any> | null;
const useCameraDeviceCompat =
  visionCameraModule?.useCameraDevice ?? ((_position: 'back' | 'front') => null);
const useCameraPermissionCompat =
  visionCameraModule?.useCameraPermission ??
  (() => ({
    hasPermission: false,
    requestPermission: async () => false,
  }));
const useCodeScannerCompat = visionCameraModule?.useCodeScanner ?? ((_config: any) => null);

const formatCardDate = (isoDate?: string) => {
  if (!isoDate) {
    return '--/--/----';
  }
  const parsed = new Date(isoDate);
  if (Number.isNaN(parsed.getTime())) {
    return '--/--/----';
  }
  const day = String(parsed.getDate()).padStart(2, '0');
  const month = String(parsed.getMonth() + 1).padStart(2, '0');
  const year = parsed.getFullYear();
  return `${day}/${month}/${year}`;
};

const ScanScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const isFocused = useIsFocused();
  const isVisionCameraAvailable = !!visionCameraModule && !!CameraView;
  const camera = useCameraDeviceCompat('back');
  const { hasPermission, requestPermission } = useCameraPermissionCompat();

  const [activePayload, setActivePayload] = useState<ParsedScanPayload | null>(null);
  const [scanNotice, setScanNotice] = useState<string | null>(null);
  const [isResolvingUser, setIsResolvingUser] = useState(false);

  const lastScanRef = useRef<{ value: string; ts: number } | null>(null);
  const isMountedRef = useRef(true);
  const isFocusedRef = useRef(isFocused);

  const requestId = activePayload?.type === 'payment_request' ? activePayload.requestId : '';
  const {
    data: incomingRequest,
    isLoading: isLoadingIncomingRequest,
    error: incomingRequestError,
  } = useGetIncomingPaymentRequest(requestId);
  const { data: me } = useUserProfile();
  const { data: fees } = useTransactionFees();

  useEffect(() => {
    isFocusedRef.current = isFocused;
  }, [isFocused]);

  useEffect(() => {
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const resetToScan = useCallback(() => {
    setActivePayload(null);
    setScanNotice(null);
  }, []);

  const setEphemeralNotice = useCallback((message: string) => {
    setScanNotice(message);
    setTimeout(() => {
      setScanNotice((current) => (current === message ? null : current));
    }, 2200);
  }, []);

  const resolveUserProfile = useCallback(
    async (username: string) => {
      setIsResolvingUser(true);
      try {
        const response = await searchUsers(username, 10);
        if (!isMountedRef.current || !isFocusedRef.current) {
          return;
        }
        const found = response.users.find((user) => {
          return usernameKey(user.username) === usernameKey(username);
        });
        if (!found) {
          setEphemeralNotice('User not found for this QR code.');
          return;
        }
        navigation.navigate('UserProfileView', { user: found });
      } catch (error) {
        if (!isMountedRef.current || !isFocusedRef.current) {
          return;
        }
        const message = error instanceof Error ? error.message : 'Could not resolve user profile.';
        Alert.alert('Scan failed', message);
      } finally {
        if (isMountedRef.current) {
          setIsResolvingUser(false);
        }
      }
    },
    [navigation, setEphemeralNotice]
  );

  const handleScanPayload = useCallback(
    (payload: ParsedScanPayload) => {
      if (payload.type === 'unknown') {
        setEphemeralNotice('Unsupported QR code.');
        return;
      }

      if (payload.type === 'money_drop') {
        navigation.navigate('ClaimDrop', { dropId: payload.dropId });
        return;
      }

      if (payload.type === 'payment_request') {
        setActivePayload(payload);
        return;
      }

      if (payload.type === 'user_profile') {
        resolveUserProfile(payload.username).catch(() => undefined);
      }
    },
    [navigation, resolveUserProfile, setEphemeralNotice]
  );

  const codeScanner = useCodeScannerCompat({
    codeTypes: ['qr'],
    onCodeScanned: (codes) => {
      if (activePayload || isResolvingUser) {
        return;
      }

      const value = codes[0]?.value?.trim();
      if (!value) {
        return;
      }

      const now = Date.now();
      if (
        lastScanRef.current &&
        lastScanRef.current.value === value &&
        now - lastScanRef.current.ts < 1200
      ) {
        return;
      }
      lastScanRef.current = { value, ts: now };
      handleScanPayload(parseScannedPayload(value));
    },
  });

  const toUsername = normalizeUsername(incomingRequest?.creator_username || '');
  const fromUsername = normalizeUsername(me?.username || '');
  const fee = fees?.p2p_fee_kobo ?? 0;
  const amount = incomingRequest?.amount ?? 0;
  const total = amount + fee;

  const readyToScan =
    isVisionCameraAvailable &&
    hasPermission &&
    !!camera &&
    isFocused &&
    !activePayload &&
    !isResolvingUser;

  const noticeText = useMemo(() => {
    if (scanNotice) {
      return scanNotice;
    }
    if (!isVisionCameraAvailable) {
      return VISION_CAMERA_UNAVAILABLE_NOTICE;
    }
    if (isResolvingUser) {
      return 'Resolving profile...';
    }
    if (!hasPermission) {
      return 'Camera permission is required to scan QR codes.';
    }
    if (!camera) {
      return 'Initializing camera...';
    }
    return 'Scan a MoneyDrop, payment request, or profile QR.';
  }, [camera, hasPermission, isResolvingUser, isVisionCameraAvailable, scanNotice]);

  return (
    <View style={styles.root}>
      {camera && CameraView ? (
        <CameraView
          style={StyleSheet.absoluteFill}
          device={camera}
          isActive={readyToScan}
          codeScanner={codeScanner}
        />
      ) : (
        <View style={styles.fallbackCamera} />
      )}

      <View style={styles.overlayDim} />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <TouchableOpacity
          style={styles.backButton}
          onPress={() => navigation.goBack()}
          activeOpacity={0.85}
        >
          <Ionicons name="arrow-back" size={28} color="#F4F4F4" />
        </TouchableOpacity>
      </SafeAreaView>

      {isVisionCameraAvailable ? (
        <View style={styles.scanReticleWrap}>
          <View style={styles.scanReticle}>
            <Corner position="topLeft" />
            <Corner position="topRight" />
            <Corner position="bottomLeft" />
            <Corner position="bottomRight" />
          </View>
        </View>
      ) : null}

      <View style={styles.noticePill}>
        {isVisionCameraAvailable && (!hasPermission || !camera || isResolvingUser) ? (
          <ActivityIndicator size="small" color={BRAND_YELLOW} />
        ) : null}
        <Text style={styles.noticeText}>{noticeText}</Text>
      </View>

      {!isVisionCameraAvailable ? (
        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>Use a Development Build</Text>
          <Text style={styles.permissionText}>
            Expo Go cannot load the native camera scanner module. Run `npx expo run:android` or `npx
            expo run:ios`, then open the dev build.
          </Text>
        </View>
      ) : null}

      {isVisionCameraAvailable && !hasPermission ? (
        <View style={styles.permissionCard}>
          <Text style={styles.permissionTitle}>Enable Camera Access</Text>
          <Text style={styles.permissionText}>
            You need camera access to scan payment and money drop QR codes.
          </Text>
          <TouchableOpacity
            style={styles.permissionButton}
            onPress={() => requestPermission()}
            activeOpacity={0.9}
          >
            <Text style={styles.permissionButtonText}>Allow Camera</Text>
          </TouchableOpacity>
        </View>
      ) : null}

      {activePayload?.type === 'payment_request' ? (
        <>
          <View style={styles.sheetTopActions}>
            <Pressable style={styles.sheetRoundIcon} onPress={resetToScan}>
              <Ionicons name="close" size={24} color="#1C1C1C" />
            </Pressable>
            <Pressable style={styles.sheetRoundIcon} onPress={resetToScan}>
              <Ionicons name="scan-outline" size={22} color="#1C1C1C" />
            </Pressable>
          </View>

          <View style={styles.sheetWrap}>
            <Text style={styles.sheetTitle}>Make Payment</Text>

            {isLoadingIncomingRequest ? (
              <View style={styles.sheetLoadingWrap}>
                <ActivityIndicator size="small" color="#101010" />
                <Text style={styles.sheetLoadingText}>Loading payment request...</Text>
              </View>
            ) : incomingRequestError || !incomingRequest ? (
              <View style={styles.sheetLoadingWrap}>
                <Text style={styles.sheetLoadingText}>
                  {incomingRequestError?.message || 'Payment request is unavailable.'}
                </Text>
                <TouchableOpacity style={styles.outlineAction} onPress={resetToScan}>
                  <Text style={styles.outlineActionText}>Scan another code</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <View style={styles.infoBlock}>
                  <View style={styles.rowSpace}>
                    <Text style={styles.label}>To</Text>
                    <View style={styles.toIdentity}>
                      <View style={styles.toAvatar}>
                        <Text style={styles.toAvatarInitial}>
                          {(toUsername || '?').slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <Text style={styles.toValue}>{toUsername || '-'}</Text>
                    </View>
                  </View>
                </View>

                <View style={styles.infoBlock}>
                  <View style={styles.rowSpace}>
                    <Text style={styles.label}>From</Text>
                    <Text style={styles.value}>{fromUsername || 'you'}</Text>
                  </View>
                  <View style={styles.rowSpace}>
                    <Text style={styles.label}>Pay on</Text>
                    <Text style={styles.value}>{formatCardDate(incomingRequest.created_at)}</Text>
                  </View>
                  <View style={styles.rowSpace}>
                    <Text style={styles.label}>Fee (0)%</Text>
                    <Text style={styles.value}>{formatCurrency(fee)}</Text>
                  </View>
                </View>

                <View style={styles.infoBlock}>
                  <View style={styles.totalRow}>
                    <View>
                      <Text style={styles.totalLabel}>Total</Text>
                      <Text style={styles.totalValue}>{formatCurrency(total)}</Text>
                    </View>
                    <TouchableOpacity
                      style={styles.detailsButton}
                      onPress={() =>
                        navigation.navigate('RequestPaymentSummary', {
                          requestId: incomingRequest.id,
                        })
                      }
                      activeOpacity={0.86}
                    >
                      <Text style={styles.detailsButtonText}>See details</Text>
                    </TouchableOpacity>
                  </View>
                  <TouchableOpacity
                    style={styles.confirmButton}
                    onPress={() =>
                      navigation.navigate('RequestPaymentAuth', { requestId: incomingRequest.id })
                    }
                    activeOpacity={0.9}
                  >
                    <Text style={styles.confirmButtonText}>Confirm to pay</Text>
                  </TouchableOpacity>
                </View>
              </>
            )}
          </View>
        </>
      ) : null}
    </View>
  );
};

const Corner = ({
  position,
}: {
  position: 'topLeft' | 'topRight' | 'bottomLeft' | 'bottomRight';
}) => {
  return <View style={[styles.corner, styles[position]]} />;
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: DARK_BG,
  },
  fallbackCamera: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: '#151617',
  },
  overlayDim: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.28)',
  },
  safeArea: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
  },
  backButton: {
    width: 42,
    height: 42,
    marginLeft: 16,
    marginTop: 4,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanReticleWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: '35%',
    alignItems: 'center',
    justifyContent: 'center',
  },
  scanReticle: {
    width: 190,
    height: 190,
  },
  corner: {
    position: 'absolute',
    width: 46,
    height: 46,
    borderColor: BRAND_YELLOW,
    borderWidth: 7,
    borderRadius: 27,
  },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
  },
  noticePill: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 242,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    backgroundColor: 'rgba(18,19,22,0.74)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  noticeText: {
    color: '#EFEFF1',
    fontSize: 13,
    fontWeight: '500',
  },
  permissionCard: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 24,
    borderRadius: 16,
    padding: 16,
    backgroundColor: 'rgba(16,17,19,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  permissionTitle: {
    color: '#F5F5F6',
    fontSize: 17,
    fontWeight: '700',
  },
  permissionText: {
    marginTop: 8,
    color: '#CBCDD1',
    fontSize: 13,
    lineHeight: 19,
  },
  permissionButton: {
    marginTop: 14,
    height: 46,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionButtonText: {
    color: '#101114',
    fontSize: 16,
    fontWeight: '700',
  },
  sheetTopActions: {
    position: 'absolute',
    left: 24,
    right: 24,
    bottom: 333,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sheetRoundIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: '#ECEDEF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: 330,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    backgroundColor: CARD_BG,
    paddingHorizontal: 16,
    paddingTop: 14,
    paddingBottom: 26,
  },
  sheetTitle: {
    color: '#292A2D',
    fontSize: 26 / 2,
    fontWeight: '500',
    textAlign: 'center',
    marginBottom: 10,
  },
  sheetLoadingWrap: {
    borderRadius: 12,
    backgroundColor: '#D7D7D7',
    borderWidth: 1,
    borderColor: '#CFCFCF',
    paddingVertical: 24,
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  sheetLoadingText: {
    color: '#222326',
    fontSize: 13,
    textAlign: 'center',
  },
  infoBlock: {
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#D9D9D9',
    backgroundColor: '#DEDEDE',
    paddingHorizontal: 12,
    paddingVertical: 10,
    marginBottom: 8,
    gap: 8,
  },
  rowSpace: {
    minHeight: 26,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  toIdentity: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  toAvatar: {
    width: 42,
    height: 42,
    borderRadius: 12,
    backgroundColor: '#F3ABA7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toAvatarInitial: {
    color: '#101114',
    fontSize: 16,
    fontWeight: '800',
  },
  label: {
    color: '#7A7A7D',
    fontSize: 15,
    fontWeight: '500',
  },
  toValue: {
    color: '#292A2D',
    fontSize: 28 / 2,
    fontWeight: '500',
  },
  value: {
    color: '#2A2A2D',
    fontSize: 25 / 2,
    fontWeight: '500',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: '#6A6A6D',
    fontSize: 15,
  },
  totalValue: {
    marginTop: 2,
    color: '#101114',
    fontSize: 46 / 2,
    fontWeight: '700',
  },
  detailsButton: {
    height: 34,
    borderRadius: 16,
    backgroundColor: '#CECECE',
    paddingHorizontal: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  detailsButtonText: {
    color: '#404246',
    fontSize: 13,
    fontWeight: '500',
  },
  confirmButton: {
    marginTop: 8,
    height: 48,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: '#0F1013',
    fontSize: 29 / 2,
    fontWeight: '700',
  },
  outlineAction: {
    marginTop: 10,
    minHeight: 40,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#3E3F42',
    alignItems: 'center',
    justifyContent: 'center',
  },
  outlineActionText: {
    color: '#1E1F22',
    fontSize: 13,
    fontWeight: '600',
  },
});

export default ScanScreen;

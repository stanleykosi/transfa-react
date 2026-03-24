import BackIcon from '@/assets/icons/back.svg';
import ScanIcon from '@/assets/icons/scan.svg';
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated,
  Dimensions,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useIsFocused, useNavigation } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';

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
const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');
const SHEET_HEIGHT = SCREEN_HEIGHT * 0.6;
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

type DetectionBounds = {
  origin: { x: number; y: number };
  size: { width: number; height: number };
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
  const [detectionBounds, setDetectionBounds] = useState<DetectionBounds | null>(null);
  const fadeAnim = useRef(new Animated.Value(0)).current;

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

  useEffect(() => {
    if (!detectionBounds) {
      return;
    }

    Animated.timing(fadeAnim, {
      toValue: 1,
      duration: 180,
      useNativeDriver: true,
    }).start();

    const timer = setTimeout(() => {
      Animated.timing(fadeAnim, {
        toValue: 0,
        duration: 450,
        useNativeDriver: true,
      }).start(() => setDetectionBounds(null));
    }, 1400);

    return () => clearTimeout(timer);
  }, [detectionBounds, fadeAnim]);

  const resetToScan = useCallback(() => {
    setActivePayload(null);
    setScanNotice(null);
    setDetectionBounds(null);
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

      const firstCode = codes[0] as
        | { value?: string; frame?: { x: number; y: number; width: number; height: number } }
        | undefined;

      const frame = firstCode?.frame;
      if (
        frame &&
        Number.isFinite(frame.x) &&
        Number.isFinite(frame.y) &&
        Number.isFinite(frame.width) &&
        Number.isFinite(frame.height)
      ) {
        setDetectionBounds({
          origin: { x: frame.x, y: frame.y },
          size: { width: frame.width, height: frame.height },
        });
      }

      const value = firstCode?.value?.trim();
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
      <StatusBar style="light" />
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

      {detectionBounds ? (
        <Animated.View
          style={[
            styles.detectionOverlay,
            {
              width: Math.max(24, detectionBounds.size.width + 20),
              height: Math.max(24, detectionBounds.size.height + 20),
              left: detectionBounds.origin.x - 10,
              top: detectionBounds.origin.y - 10,
              opacity: fadeAnim,
            },
          ]}
        >
          <View style={[styles.corner, styles.topLeft]} />
          <View style={[styles.corner, styles.topRight]} />
          <View style={[styles.corner, styles.bottomLeft]} />
          <View style={[styles.corner, styles.bottomRight]} />
        </Animated.View>
      ) : isVisionCameraAvailable ? (
        <View style={styles.staticViewfinderContainer}>
          <View style={styles.staticViewfinder}>
            <View style={[styles.corner, styles.topLeft, styles.inactiveCorner]} />
            <View style={[styles.corner, styles.topRight, styles.inactiveCorner]} />
            <View style={[styles.corner, styles.bottomLeft, styles.inactiveCorner]} />
            <View style={[styles.corner, styles.bottomRight, styles.inactiveCorner]} />
          </View>
        </View>
      ) : null}

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.header}>
          <TouchableOpacity
            style={styles.backButton}
            onPress={() => navigation.goBack()}
            activeOpacity={0.85}
          >
            <BackIcon width={24} height={24} color="#FFF" />
          </TouchableOpacity>
          <Text style={styles.headerTitle}>Scan QR Code</Text>
          <View style={styles.headerSpacer} />
        </View>
      </SafeAreaView>

      <View style={styles.noticePill}>
        {isVisionCameraAvailable && (!hasPermission || !camera || isResolvingUser) ? (
          <ActivityIndicator size="small" color={BRAND_YELLOW} />
        ) : null}
        <Text style={styles.noticeText}>{noticeText}</Text>
      </View>

      {!isVisionCameraAvailable ? (
        <View style={styles.permissionContainer}>
          <View style={styles.permissionCard}>
            <Text style={styles.permissionTitle}>Use a Development Build</Text>
            <Text style={styles.permissionText}>
              Expo Go cannot load the native camera scanner module. Run `npx expo run:android` or
              `npx expo run:ios`, then open the dev build.
            </Text>
          </View>
        </View>
      ) : null}

      {isVisionCameraAvailable && !hasPermission ? (
        <View style={styles.permissionContainer}>
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
              <Text style={styles.permissionButtonText}>Grant Permission</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : null}

      {activePayload?.type === 'payment_request' ? (
        <>
          <View style={styles.bottomControls}>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={resetToScan}
              activeOpacity={0.8}
            >
              <Ionicons name="close" size={24} color="#1C1C1C" />
            </TouchableOpacity>
            <TouchableOpacity
              style={styles.controlButton}
              onPress={resetToScan}
              activeOpacity={0.8}
            >
              <ScanIcon width={24} height={24} />
            </TouchableOpacity>
          </View>

          <View style={styles.sheetWrap}>
            <View style={styles.dragHandleContainer}>
              <View style={styles.dragHandle} />
            </View>
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
  header: {
    position: 'absolute',
    top: 6,
    left: 0,
    right: 0,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    zIndex: 10,
  },
  backButton: {
    width: 44,
    height: 44,
    borderRadius: 22,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Montserrat_600SemiBold',
  },
  headerSpacer: {
    width: 44,
    height: 44,
  },
  detectionOverlay: {
    position: 'absolute',
    zIndex: 5,
  },
  staticViewfinderContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  staticViewfinder: {
    width: SCREEN_WIDTH * 0.7,
    height: SCREEN_WIDTH * 0.7,
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 44,
    height: 44,
    borderColor: BRAND_YELLOW,
    borderWidth: 10,
  },
  inactiveCorner: { opacity: 0.5 },
  topLeft: {
    top: 0,
    left: 0,
    borderRightWidth: 0,
    borderBottomWidth: 0,
    borderTopLeftRadius: 22,
  },
  topRight: {
    top: 0,
    right: 0,
    borderLeftWidth: 0,
    borderBottomWidth: 0,
    borderTopRightRadius: 22,
  },
  bottomLeft: {
    bottom: 0,
    left: 0,
    borderTopWidth: 0,
    borderRightWidth: 0,
    borderBottomLeftRadius: 22,
  },
  bottomRight: {
    bottom: 0,
    right: 0,
    borderTopWidth: 0,
    borderLeftWidth: 0,
    borderBottomRightRadius: 22,
  },
  noticePill: {
    position: 'absolute',
    left: 16,
    right: 16,
    bottom: 130,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: 'rgba(18,19,22,0.74)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    zIndex: 4,
  },
  noticeText: {
    color: '#EFEFF1',
    fontSize: 13,
    fontFamily: 'Montserrat_500Medium',
    flexShrink: 1,
  },
  permissionContainer: {
    ...StyleSheet.absoluteFillObject,
    justifyContent: 'center',
    paddingHorizontal: 20,
    zIndex: 8,
  },
  permissionCard: {
    borderRadius: 16,
    padding: 20,
    backgroundColor: 'rgba(16,17,19,0.92)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
  },
  permissionTitle: {
    color: '#F5F5F6',
    fontSize: 17,
    fontFamily: 'Montserrat_700Bold',
    textAlign: 'center',
  },
  permissionText: {
    marginTop: 10,
    color: '#CBCDD1',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
    lineHeight: 21,
    textAlign: 'center',
  },
  permissionButton: {
    marginTop: 18,
    height: 52,
    borderRadius: 16,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  permissionButtonText: {
    color: '#101114',
    fontSize: 16,
    fontFamily: 'Montserrat_700Bold',
  },
  bottomControls: {
    position: 'absolute',
    bottom: SHEET_HEIGHT + 34,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingHorizontal: 32,
    alignItems: 'center',
    zIndex: 11,
  },
  controlButton: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  sheetWrap: {
    position: 'absolute',
    left: 0,
    right: 0,
    bottom: 0,
    minHeight: SHEET_HEIGHT,
    borderTopLeftRadius: 36,
    borderTopRightRadius: 36,
    backgroundColor: CARD_BG,
    paddingHorizontal: 20,
    paddingBottom: 20,
    zIndex: 10,
  },
  dragHandleContainer: {
    alignItems: 'center',
    paddingVertical: 14,
  },
  dragHandle: {
    width: 48,
    height: 5,
    borderRadius: 3,
    backgroundColor: '#E0E0E0',
  },
  sheetTitle: {
    color: '#292A2D',
    fontSize: 16,
    fontFamily: 'Montserrat_500Medium',
    textAlign: 'center',
    marginBottom: 16,
  },
  sheetLoadingWrap: {
    borderRadius: 20,
    backgroundColor: '#EFEFEF',
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
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
  },
  infoBlock: {
    borderRadius: 20,
    borderWidth: 1,
    borderColor: '#D9D9D9',
    backgroundColor: '#EFEFEF',
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 10,
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
    fontFamily: 'Montserrat_400Regular',
  },
  toValue: {
    color: '#292A2D',
    fontSize: 14,
    fontFamily: 'Montserrat_500Medium',
  },
  value: {
    color: '#2A2A2D',
    fontSize: 15,
    fontFamily: 'Montserrat_500Medium',
  },
  totalRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    justifyContent: 'space-between',
  },
  totalLabel: {
    color: '#6A6A6D',
    fontSize: 15,
    fontFamily: 'Montserrat_400Regular',
  },
  totalValue: {
    marginTop: 2,
    color: '#101114',
    fontSize: 24,
    fontFamily: 'Montserrat_700Bold',
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
    fontFamily: 'Montserrat_500Medium',
  },
  confirmButton: {
    marginTop: 12,
    height: 56,
    borderRadius: 16,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    color: '#0F1013',
    fontSize: 18,
    fontFamily: 'Montserrat_700Bold',
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
    fontFamily: 'Montserrat_600SemiBold',
  },
});

export default ScanScreen;

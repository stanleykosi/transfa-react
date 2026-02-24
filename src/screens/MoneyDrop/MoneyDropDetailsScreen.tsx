import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import QRCode from 'react-native-qrcode-svg';

import type { AppStackParamList } from '@/navigation/AppStack';
import type { AppNavigationProp } from '@/types/navigation';
import {
  useEndMoneyDrop,
  useMoneyDropDashboard,
  useMoneyDropOwnerDetails,
  useRevealMoneyDropPassword,
} from '@/api/transactionApi';
import PinInputModal from '@/components/PinInputModal';
import { useSecureAction } from '@/hooks/useSecureAction';
import { formatCurrency } from '@/utils/formatCurrency';

const BRAND_YELLOW = '#FFD300';
const BG_BOTTOM = '#050607';
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BORDER = 'rgba(255,255,255,0.07)';
const CLAIMER_BG = '#E7E8EA';

type MoneyDropDetailsRouteProp = RouteProp<AppStackParamList, 'MoneyDropDetails'>;

const formatDateTime = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
};

const formatDateOnly = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }
  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const MoneyDropDetailsScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const route = useRoute<MoneyDropDetailsRouteProp>();
  const { dropId } = route.params;

  const [revealedPassword, setRevealedPassword] = useState<string | null>(null);
  const [showPassword, setShowPassword] = useState(false);
  const [copyDone, setCopyDone] = useState(false);
  const qrRef = useRef<any>(null);
  const {
    isModalVisible,
    error: pinError,
    triggerSecureAction,
    handlePinSuccess,
    clearError: clearPinError,
    closeModal,
  } = useSecureAction();

  const { data: dashboard } = useMoneyDropDashboard();
  const { data, isLoading, error, refetch } = useMoneyDropOwnerDetails(dropId, {
    claimersLimit: 20,
  });
  const currentBalance = dashboard?.current_balance ?? 0;
  const previewClaimers = useMemo(() => data?.claimers?.slice(0, 3) ?? [], [data?.claimers]);
  const isActive = !!data?.can_end_drop;
  const { mutate: revealDropPassword, isPending: isRevealingPassword } = useRevealMoneyDropPassword(
    {
      onSuccess: (payload) => {
        setRevealedPassword(payload.lock_password);
        setShowPassword(true);
      },
      onError: (revealError) => {
        Alert.alert('Reveal Failed', revealError.message || 'Could not reveal drop password.');
      },
    }
  );

  useEffect(() => {
    setRevealedPassword(null);
    setShowPassword(false);
  }, [dropId]);

  const { mutate: endDrop, isPending: isEnding } = useEndMoneyDrop({
    onSuccess: (result) => {
      const message =
        result.refunded_amount > 0
          ? `Drop ended. ${formatCurrency(result.refunded_amount)} refunded to your main wallet.`
          : 'Drop ended successfully.';
      Alert.alert('MoneyDrop Ended', message);
      refetch();
    },
    onError: (endError) => {
      Alert.alert('End Drop Failed', endError.message || 'Could not end this drop.');
    },
  });

  const onCopyLink = async () => {
    if (!data) {
      return;
    }
    await Clipboard.setStringAsync(data.shareable_link);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 1600);
  };

  const onShareLink = async () => {
    if (!data) {
      return;
    }
    await Share.share({
      title: data.title,
      message: `Claim this money drop: ${data.shareable_link}`,
      url: data.shareable_link,
    });
  };

  const getQRBase64 = () =>
    new Promise<string>((resolve, reject) => {
      if (!qrRef.current || typeof qrRef.current.toDataURL !== 'function') {
        reject(new Error('QR code is unavailable.'));
        return;
      }
      qrRef.current.toDataURL((raw: string) => {
        if (!raw) {
          reject(new Error('Could not generate QR image.'));
          return;
        }
        resolve(raw);
      });
    });

  const onDownloadQR = async () => {
    if (!data) {
      return;
    }

    try {
      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission Required', 'Allow Photos access to download your QR code.');
        return;
      }

      const base64 = await getQRBase64();
      const storageDir = FileSystem.cacheDirectory ?? FileSystem.documentDirectory;
      if (!storageDir) {
        throw new Error('Storage unavailable');
      }

      const fileUri = `${storageDir}moneydrop-${data.id}-qr.png`;
      await FileSystem.writeAsStringAsync(fileUri, base64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const asset = await MediaLibrary.createAssetAsync(fileUri);
      const existingAlbum = await MediaLibrary.getAlbumAsync('Transfa');
      if (existingAlbum) {
        await MediaLibrary.addAssetsToAlbumAsync([asset], existingAlbum, false);
      } else {
        await MediaLibrary.createAlbumAsync('Transfa', asset, false);
      }

      Alert.alert('Downloaded', 'QR code has been saved to your photo library.');
    } catch (downloadError) {
      console.warn('MoneyDrop owner QR download failed:', downloadError);
      Alert.alert('Download Failed', 'Could not save QR code. Please try again.');
    }
  };

  const confirmEndDrop = () => {
    if (!data) {
      return;
    }
    Alert.alert(
      'End MoneyDrop?',
      'This will stop claims immediately and refund remaining balance.',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'End Drop',
          style: 'destructive',
          onPress: () => endDrop({ dropId: data.id }),
        },
      ]
    );
  };

  const onTogglePasswordVisibility = () => {
    if (!data?.lock_enabled) {
      return;
    }
    if (showPassword) {
      setShowPassword(false);
      return;
    }
    if (revealedPassword) {
      setShowPassword(true);
      return;
    }

    triggerSecureAction((pin) => {
      revealDropPassword({
        dropId: data.id,
        transactionPin: pin,
      });
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
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.backButton}
            onPress={() => navigation.goBack()}
          >
            <Ionicons name="arrow-back" size={24} color="#F4F4F5" />
          </TouchableOpacity>

          {isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="small" color={BRAND_YELLOW} />
              <Text style={styles.centerText}>Loading drop details...</Text>
            </View>
          ) : error || !data ? (
            <View style={styles.centerState}>
              <Ionicons name="warning-outline" size={32} color="#F59E0B" />
              <Text style={styles.centerTitle}>Unable to load drop</Text>
              <Text style={styles.centerText}>{error?.message || 'Money drop not found.'}</Text>
            </View>
          ) : (
            <>
              <Text style={styles.screenTitle}>MONEYDROP</Text>
              <Text style={styles.balanceAmount}>{formatCurrency(currentBalance)}</Text>
              <Text style={styles.balanceLabel}>Current Balance</Text>

              <View style={styles.statusHeader}>
                <Text style={styles.dropName}>{data.title}</Text>
                <Text
                  style={[styles.statusText, isActive ? styles.statusLive : styles.statusEnded]}
                >
                  {data.status_label || (isActive ? 'Live' : 'Ended')}
                </Text>
              </View>

              <View style={styles.detailsCard}>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Title</Text>
                  <Text style={styles.detailValue}>{data.title}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Total Amount</Text>
                  <Text style={styles.detailValue}>{formatCurrency(data.total_amount)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Amount per Person</Text>
                  <Text style={styles.detailValue}>{formatCurrency(data.amount_per_person)}</Text>
                </View>
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Number of people</Text>
                  <Text style={styles.detailValue}>{data.number_of_people}</Text>
                </View>
                {data.lock_enabled ? (
                  <View style={styles.detailRow}>
                    <Text style={styles.detailLabel}>Drop Password</Text>
                    <View style={styles.passwordValueWrap}>
                      <Text style={styles.detailValue}>
                        {showPassword && revealedPassword
                          ? revealedPassword
                          : data.lock_password_masked || '**********'}
                      </Text>
                      <TouchableOpacity
                        activeOpacity={0.85}
                        onPress={onTogglePasswordVisibility}
                        disabled={isRevealingPassword}
                      >
                        <Text style={styles.togglePasswordText}>
                          {showPassword
                            ? 'Hide Password'
                            : isRevealingPassword
                              ? 'Verifying...'
                              : 'View Password'}
                        </Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                ) : null}
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>Expires</Text>
                  <Text style={styles.detailValue}>{formatDateTime(data.expiry_timestamp)}</Text>
                </View>
              </View>

              {isActive ? (
                <>
                  <View style={styles.qrCard}>
                    <View style={styles.qrCodeFrame}>
                      <QRCode
                        getRef={(ref) => {
                          qrRef.current = ref;
                        }}
                        value={data.qr_code_content}
                        size={220}
                        color="#FFFFFF"
                        backgroundColor="#1E2024"
                      />
                      <View style={styles.qrBadge}>
                        <Ionicons name="gift-outline" size={30} color={BRAND_YELLOW} />
                      </View>
                    </View>
                    <Text style={styles.qrHint}>Scan QR to claim</Text>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.86}
                    style={styles.secondaryButton}
                    onPress={onDownloadQR}
                  >
                    <Ionicons name="download-outline" size={18} color="#F4F5F7" />
                    <Text style={styles.secondaryButtonText}>Download</Text>
                  </TouchableOpacity>

                  <Text style={styles.shareLabel}>Sharable Link</Text>
                  <View style={styles.linkField}>
                    <Text style={styles.linkText} numberOfLines={1}>
                      {data.shareable_link}
                    </Text>
                    <TouchableOpacity activeOpacity={0.8} onPress={onCopyLink}>
                      <Ionicons
                        name={copyDone ? 'checkmark-circle' : 'copy-outline'}
                        size={20}
                        color={copyDone ? BRAND_YELLOW : '#E6E8ED'}
                      />
                    </TouchableOpacity>
                  </View>

                  <TouchableOpacity
                    activeOpacity={0.86}
                    style={styles.shareButton}
                    onPress={onShareLink}
                  >
                    <Ionicons name="share-social-outline" size={18} color="#A7ABB2" />
                    <Text style={styles.shareButtonText}>Share Link</Text>
                  </TouchableOpacity>
                </>
              ) : null}

              <View style={styles.claimersHeader}>
                <Text style={styles.claimersTitle}>MoneyDrop Claimers</Text>
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={styles.viewAllButton}
                  onPress={() =>
                    navigation.navigate('MoneyDropClaimers', { dropId: data.id, title: data.title })
                  }
                >
                  <Text style={styles.viewAllText}>View all</Text>
                </TouchableOpacity>
              </View>

              {previewClaimers.length > 0 ? (
                <View style={styles.claimersList}>
                  {previewClaimers.map((claimer) => (
                    <View
                      style={styles.claimerCard}
                      key={`${claimer.user_id}-${claimer.claimed_at}`}
                    >
                      <View style={styles.claimerAvatar}>
                        <Text style={styles.claimerAvatarText}>
                          {claimer.username.slice(0, 1).toUpperCase()}
                        </Text>
                      </View>
                      <View style={styles.claimerMiddle}>
                        <Text style={styles.claimerUsername}>{claimer.username}</Text>
                        {claimer.full_name ? (
                          <Text style={styles.claimerFullName}>{claimer.full_name}</Text>
                        ) : null}
                        <View style={styles.claimedDateWrap}>
                          <Ionicons name="calendar-outline" size={14} color="#303236" />
                          <Text style={styles.claimedDateText}>
                            {formatDateOnly(claimer.claimed_at)}
                          </Text>
                        </View>
                      </View>
                      <Text
                        style={styles.claimerAmount}
                      >{`+ ${formatCurrency(claimer.amount_claimed)}`}</Text>
                    </View>
                  ))}
                </View>
              ) : (
                <View style={styles.emptyClaimersCard}>
                  <Text style={styles.emptyClaimersText}>No claims yet.</Text>
                </View>
              )}

              <View style={styles.noteCard}>
                <Ionicons name="shield-checkmark" size={18} color={BRAND_YELLOW} />
                <Text style={styles.noteText}>
                  Funds are stored in a dedicated account. Unclaimed funds will be automatically
                  refunded after expiry.
                </Text>
              </View>

              {data.can_end_drop ? (
                <TouchableOpacity
                  activeOpacity={0.86}
                  style={[styles.endDropButton, isEnding && styles.endDropButtonDisabled]}
                  onPress={confirmEndDrop}
                  disabled={isEnding}
                >
                  <Text style={styles.endDropText}>{isEnding ? 'Ending Drop...' : 'End Drop'}</Text>
                </TouchableOpacity>
              ) : null}
            </>
          )}
        </ScrollView>
      </SafeAreaView>
      <PinInputModal
        visible={isModalVisible}
        onClose={closeModal}
        onSuccess={handlePinSuccess}
        error={pinError}
        clearError={clearPinError}
      />
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
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    marginBottom: 6,
  },
  centerState: {
    marginTop: 120,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerTitle: {
    color: '#F4F5F7',
    fontSize: 24,
    fontWeight: '700',
    marginTop: 10,
  },
  centerText: {
    color: '#8A8E95',
    fontSize: 15,
    marginTop: 6,
    textAlign: 'center',
  },
  screenTitle: {
    color: '#F0F1F3',
    fontWeight: '700',
    fontSize: 30,
    letterSpacing: 0.4,
    textAlign: 'center',
    marginTop: 8,
  },
  balanceAmount: {
    color: '#F5F5F7',
    fontSize: 46,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 20,
  },
  balanceLabel: {
    color: '#63666D',
    fontSize: 16,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 20,
  },
  statusHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  dropName: {
    color: '#F5F6F8',
    fontSize: 24,
    fontWeight: '700',
    flex: 1,
    marginRight: 10,
  },
  statusText: {
    fontSize: 16,
    fontWeight: '700',
  },
  statusLive: {
    color: BRAND_YELLOW,
  },
  statusEnded: {
    color: '#8A8E95',
  },
  detailsCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 14,
    paddingVertical: 10,
    marginBottom: 14,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 10,
    gap: 12,
  },
  detailLabel: {
    color: '#7C8088',
    fontSize: 16,
    flex: 1,
  },
  detailValue: {
    color: '#F3F4F6',
    fontSize: 16,
    fontWeight: '500',
    textAlign: 'right',
    flex: 1,
  },
  passwordValueWrap: {
    flex: 1,
    alignItems: 'flex-end',
  },
  togglePasswordText: {
    color: BRAND_YELLOW,
    fontSize: 12,
    marginTop: 4,
    textDecorationLine: 'underline',
  },
  qrCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    padding: 14,
    alignItems: 'center',
    marginBottom: 12,
  },
  qrCodeFrame: {
    width: 260,
    height: 260,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 10,
    backgroundColor: '#1E2024',
    overflow: 'hidden',
    marginBottom: 8,
  },
  qrBadge: {
    position: 'absolute',
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: '#1E2024',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,211,0,0.34)',
  },
  qrHint: {
    color: '#6E7279',
    fontSize: 16,
  },
  secondaryButton: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 14,
  },
  secondaryButtonText: {
    color: '#F4F5F7',
    fontSize: 17,
    fontWeight: '700',
    marginLeft: 8,
  },
  shareLabel: {
    color: '#E8EAED',
    fontSize: 16,
    marginBottom: 8,
  },
  linkField: {
    height: 54,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 12,
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 10,
  },
  linkText: {
    flex: 1,
    color: '#E6E8ED',
    fontSize: 16,
    marginRight: 8,
    textDecorationLine: 'underline',
  },
  shareButton: {
    height: 52,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#5B5F67',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 16,
  },
  shareButtonText: {
    color: '#A7ABB2',
    fontSize: 16,
    fontWeight: '700',
    marginLeft: 8,
  },
  claimersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 10,
  },
  claimersTitle: {
    color: '#ECEDEF',
    fontSize: 20,
    fontWeight: '600',
  },
  viewAllButton: {
    height: 40,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 14,
    justifyContent: 'center',
  },
  viewAllText: {
    color: '#D8DADF',
    fontSize: 15,
    fontWeight: '500',
  },
  claimersList: {
    gap: 10,
    marginBottom: 14,
  },
  claimerCard: {
    backgroundColor: CLAIMER_BG,
    borderRadius: 14,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  claimerAvatar: {
    width: 52,
    height: 52,
    borderRadius: 14,
    backgroundColor: '#ABABFD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  claimerAvatarText: {
    color: '#101215',
    fontSize: 18,
    fontWeight: '700',
  },
  claimerMiddle: {
    flex: 1,
    marginRight: 6,
  },
  claimerUsername: {
    color: '#08090A',
    fontSize: 16,
    fontWeight: '700',
  },
  claimerFullName: {
    color: '#303236',
    fontSize: 15,
    marginTop: 1,
  },
  claimedDateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  claimedDateText: {
    color: '#303236',
    fontSize: 14,
    marginLeft: 5,
  },
  claimerAmount: {
    color: '#08090A',
    fontSize: 16,
    fontWeight: '600',
  },
  emptyClaimersCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    paddingVertical: 14,
    alignItems: 'center',
    marginBottom: 14,
  },
  emptyClaimersText: {
    color: '#8A8E95',
    fontSize: 15,
  },
  noteCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.14)',
    borderStyle: 'dashed',
    padding: 12,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 18,
  },
  noteText: {
    color: '#8A8E95',
    fontSize: 15,
    lineHeight: 20,
    marginLeft: 8,
    flex: 1,
  },
  endDropButton: {
    height: 54,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#61646C',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 10,
  },
  endDropButtonDisabled: {
    opacity: 0.65,
  },
  endDropText: {
    color: '#FF4B4B',
    fontSize: 22,
    fontWeight: '700',
  },
});

export default MoneyDropDetailsScreen;

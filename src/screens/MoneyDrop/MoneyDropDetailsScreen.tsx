import AlarmIcon from '@/assets/icons/alarm.svg';
import BackIcon from '@/assets/icons/back.svg';
import CalendarIcon from '@/assets/icons/calendar.svg';
import CopyIcon from '@/assets/icons/document-copy.svg';
import DownloadIcon from '@/assets/icons/download.svg';
import MoneyDropIcon from '@/assets/icons/money-drop.svg';
import ShareIcon from '@/assets/icons/share.svg';
import {
  useEndMoneyDrop,
  useMoneyDropDashboard,
  useMoneyDropOwnerDetails,
  useRevealMoneyDropPassword,
} from '@/api/transactionApi';
import PinInputModal from '@/components/PinInputModal';
import type { AppStackParamList } from '@/navigation/AppStack';
import type { AppNavigationProp } from '@/types/navigation';
import { formatCurrency } from '@/utils/formatCurrency';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import QRCode from 'react-native-qrcode-svg';
import { SvgXml } from 'react-native-svg';

import { useSecureAction } from '@/hooks/useSecureAction';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const backgroundSvg = `<svg width="375" height="812" viewBox="0 0 375 812" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="375" height="812" fill="url(#paint0_linear_708_2445)"/>
<defs>
<linearGradient id="paint0_linear_708_2445" x1="187.5" y1="0" x2="187.5" y2="812" gradientUnits="userSpaceOnUse">
<stop stop-color="#2B2B2B"/>
<stop offset="0.778846" stop-color="#0F0F0F"/>
</linearGradient>
</defs>
</svg>`;

type MoneyDropDetailsRouteProp = RouteProp<AppStackParamList, 'MoneyDropDetails'>;
type DetailRowProps = {
  label: string;
  value: string;
  isPin?: boolean;
  showPassword?: boolean;
  isRevealingPassword?: boolean;
  onTogglePasswordVisibility?: () => void;
};

const DetailRow = ({
  label,
  value,
  isPin = false,
  showPassword = false,
  isRevealingPassword = false,
  onTogglePasswordVisibility,
}: DetailRowProps) => (
  <View style={styles.detailRow}>
    <Text style={[styles.detailLabel, isPin && { marginTop: 3 }]}>{label}</Text>
    <View style={styles.detailValueContainer}>
      {isPin ? (
        <View style={styles.pinContainer}>
          <View style={styles.pinValueBox}>
            <Text style={styles.detailValue}>{showPassword ? value : '****'}</Text>
          </View>
          <TouchableOpacity onPress={onTogglePasswordVisibility} disabled={isRevealingPassword}>
            <Text style={styles.hidePinText}>
              {showPassword ? 'Hide Pin' : isRevealingPassword ? 'Verifying...' : 'Show Pin'}
            </Text>
          </TouchableOpacity>
        </View>
      ) : (
        <Text style={styles.detailValue}>{value}</Text>
      )}
    </View>
  </View>
);

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
  const isLive = !!data?.can_end_drop;

  useEffect(() => {
    setRevealedPassword(null);
    setShowPassword(false);
  }, [dropId]);

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
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    setCopyDone(true);
    setTimeout(() => setCopyDone(false), 1600);
  };

  const onShareLink = async () => {
    if (!data) {
      return;
    }

    try {
      await Share.share({
        message: `Check out this MoneyDrop: ${data.shareable_link}`,
        url: data.shareable_link,
      });
    } catch (shareError) {
      console.warn('Error sharing:', shareError);
    }
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
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

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
      'End MoneyDrop',
      'Are you sure you want to end this MoneyDrop? This action cannot be undone.',
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
    <SafeAreaView style={styles.container}>
      <View style={styles.backgroundContainer} pointerEvents="none">
        <SvgXml
          xml={backgroundSvg}
          width={SCREEN_WIDTH}
          height={SCREEN_HEIGHT}
          pointerEvents="none"
        />
      </View>

      <View style={styles.topBar} pointerEvents="box-none">
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <BackIcon width={24} height={24} />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        contentInsetAdjustmentBehavior="automatic"
        keyboardDismissMode="on-drag"
        keyboardShouldPersistTaps="handled"
      >
        {isLoading ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator size="small" color="#FFD300" />
            <Text style={styles.stateText}>Loading drop details...</Text>
          </View>
        ) : error || !data ? (
          <View style={styles.stateContainer}>
            <Text style={styles.stateText}>{error?.message || 'Money drop not found.'}</Text>
          </View>
        ) : (
          <>
            <Text style={styles.headerTitle}>MONEYDROP</Text>

            <View style={styles.balanceContainer}>
              <Text style={styles.balanceAmount}>{formatCurrency(currentBalance)}</Text>
              <Text style={styles.balanceLabel}>Current Balance</Text>
            </View>

            <View style={styles.dropHeader}>
              <Text style={styles.dropTitleText} numberOfLines={1}>
                {data.title}
              </Text>
              <Text style={[styles.statusText, isLive ? styles.liveStatus : styles.endedStatus]}>
                {data.status_label || (isLive ? 'Live' : 'Ended')}
              </Text>
            </View>

            <View style={styles.summaryCard}>
              <DetailRow label="Title" value={data.title} />
              <DetailRow label="Total Amount" value={formatCurrency(data.total_amount)} />
              <DetailRow label="Amount per Person" value={formatCurrency(data.amount_per_person)} />
              <DetailRow label="Number of people" value={String(data.number_of_people)} />
              {data.lock_enabled ? (
                <DetailRow
                  label="Drop Pin"
                  value={revealedPassword || '****'}
                  isPin
                  showPassword={showPassword}
                  isRevealingPassword={isRevealingPassword}
                  onTogglePasswordVisibility={onTogglePasswordVisibility}
                />
              ) : null}
              <DetailRow label="Expires" value={formatDateTime(data.expiry_timestamp)} />
            </View>

            <View style={styles.mainDivider} />

            {isLive ? (
              <>
                <View style={styles.qrSection}>
                  <View style={styles.qrContainer}>
                    <View style={styles.qrCodeWrapper}>
                      <QRCode
                        getRef={(ref) => {
                          qrRef.current = ref;
                        }}
                        value={data.qr_code_content}
                        size={SCREEN_WIDTH * 0.6}
                        color="white"
                        backgroundColor="transparent"
                      />
                      <View style={styles.qrLogoCenter}>
                        <MoneyDropIcon width={45} height={45} color="#FFD300" />
                      </View>
                    </View>
                    <Text style={styles.qrSubtitle}>Scan QR to claim</Text>
                  </View>

                  <TouchableOpacity style={styles.downloadButton} onPress={onDownloadQR}>
                    <DownloadIcon width={20} height={20} color="#FFFFFF" />
                    <Text style={styles.downloadButtonText}>Download</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.sharableLinkSection}>
                  <Text style={styles.sectionLabel}>Sharable Link</Text>
                  <View style={styles.linkInputContainer}>
                    <Text style={styles.linkText} numberOfLines={1}>
                      {data.shareable_link}
                    </Text>
                    <TouchableOpacity style={styles.copyButton} onPress={onCopyLink}>
                      <CopyIcon width={20} height={20} color="#FFFFFF" />
                    </TouchableOpacity>
                  </View>

                  {copyDone ? <Text style={styles.copyDoneText}>Link copied.</Text> : null}

                  <TouchableOpacity style={styles.shareLinkButton} onPress={onShareLink}>
                    <ShareIcon width={20} height={20} color="#FFFFFF" />
                    <Text style={styles.shareLinkButtonText}>Share Link</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : null}

            <View style={styles.claimersHeader}>
              <Text style={styles.sectionLabel}>MoneyDrop Claimers</Text>
              <TouchableOpacity
                onPress={() =>
                  navigation.navigate('MoneyDropClaimers', { dropId: data.id, title: data.title })
                }
              >
                <View style={styles.viewAllBtn}>
                  <Text style={styles.viewAllText}>View all</Text>
                </View>
              </TouchableOpacity>
            </View>

            <View style={styles.claimersList}>
              {previewClaimers.length > 0 ? (
                previewClaimers.map((claimer) => {
                  const initials = claimer.username.slice(0, 1).toUpperCase();

                  return (
                    <View
                      key={`${claimer.user_id}-${claimer.claimed_at}`}
                      style={styles.claimerCard}
                    >
                      <View style={styles.avatarContainer}>
                        <Text style={styles.avatarText}>{initials}</Text>
                      </View>

                      <View style={styles.claimerInfo}>
                        <View style={styles.claimerNameRow}>
                          <Text style={styles.claimerUsername}>{claimer.username}</Text>
                        </View>

                        {claimer.full_name ? (
                          <Text style={styles.claimerFullName}>{claimer.full_name}</Text>
                        ) : null}

                        <View style={styles.claimerDateRow}>
                          <CalendarIcon width={12} height={12} color="#6C6B6B" />
                          <Text style={styles.claimerDate}>
                            {formatDateOnly(claimer.claimed_at)}
                          </Text>
                        </View>
                      </View>

                      <Text
                        style={styles.claimerAmount}
                      >{`- ${formatCurrency(claimer.amount_claimed)}`}</Text>
                    </View>
                  );
                })
              ) : (
                <Text style={styles.emptyClaimersText}>No claims yet.</Text>
              )}
            </View>

            <View style={styles.infoDivider} />

            <View style={styles.infoBanner}>
              <View style={styles.infoIconContainer}>
                <AlarmIcon width={22} height={25} />
              </View>
              <Text style={styles.infoText}>
                Funds are stored in a dedicated account. Unclaimed funds will be automatically
                refunded after expiry.
              </Text>
            </View>

            {data.can_end_drop ? (
              <TouchableOpacity
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

      <PinInputModal
        visible={isModalVisible}
        onClose={closeModal}
        onSuccess={handlePinSuccess}
        error={pinError}
        clearError={clearPinError}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backgroundContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
  },
  topBar: {
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 10,
  },
  backButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  stateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 80,
  },
  stateText: {
    color: '#9FA1A6',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
    marginTop: 8,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
    letterSpacing: 2,
    textAlign: 'center',
    marginBottom: 20,
    opacity: 0.8,
  },
  balanceContainer: {
    alignItems: 'center',
    marginBottom: 32,
  },
  balanceAmount: {
    fontSize: 40,
    color: '#FFFFFF',
    fontFamily: 'ArtificTrial-Semibold',
    marginBottom: 4,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#6C6B6B',
    fontFamily: 'Montserrat_400Regular',
  },
  dropHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
    gap: 10,
  },
  dropTitleText: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Montserrat_600SemiBold',
    flex: 1,
  },
  statusText: {
    fontSize: 16,
    fontFamily: 'Montserrat_600SemiBold',
  },
  liveStatus: {
    color: '#FFD300',
  },
  endedStatus: {
    color: '#6C6B6B',
  },
  summaryCard: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 16,
    padding: 16,
    gap: 24,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  detailLabel: {
    color: '#6C6B6B',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
  },
  detailValue: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
  },
  detailValueContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  pinContainer: {
    flexDirection: 'column',
    alignItems: 'flex-end',
    gap: 4,
  },
  pinValueBox: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 4,
    paddingHorizontal: 12,
    borderRadius: 6,
  },
  hidePinText: {
    color: '#6C6B6B',
    fontSize: 10,
    fontFamily: 'Montserrat_400Regular',
    textDecorationLine: 'underline',
    marginTop: 2,
  },
  mainDivider: {
    height: 1,
    backgroundColor: '#6C6B6B',
    marginVertical: 24,
  },
  qrSection: {
    alignItems: 'center',
    marginBottom: 32,
  },
  qrContainer: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    padding: 24,
    borderRadius: 24,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    width: '100%',
    alignItems: 'center',
  },
  qrCodeWrapper: {
    position: 'relative',
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrLogoCenter: {
    position: 'absolute',
    backgroundColor: '#202020',
    width: 60,
    height: 60,
    justifyContent: 'center',
    alignItems: 'center',
  },
  qrSubtitle: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
    marginTop: 32,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    width: '100%',
    justifyContent: 'center',
  },
  downloadButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_600SemiBold',
  },
  sharableLinkSection: {
    marginBottom: 32,
  },
  sectionLabel: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 12,
  },
  linkInputContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.05)',
    borderRadius: 12,
    height: 50,
    marginBottom: 12,
    gap: 8,
    paddingHorizontal: 12,
  },
  linkText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
    flex: 1,
  },
  copyButton: {
    padding: 8,
  },
  copyDoneText: {
    color: '#FFD300',
    fontSize: 12,
    fontFamily: 'Montserrat_400Regular',
    marginTop: -4,
    marginBottom: 8,
    textAlign: 'right',
  },
  shareLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 12,
    paddingHorizontal: 24,
    borderRadius: 12,
    gap: 8,
    width: '100%',
    justifyContent: 'center',
  },
  shareLinkButtonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
  },
  claimersHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  viewAllBtn: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 6,
    paddingHorizontal: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 8,
  },
  viewAllText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
  },
  claimersList: {
    gap: 12,
  },
  claimerCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 12,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
    alignItems: 'center',
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EAEAEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#000000',
    fontSize: 18,
    fontFamily: 'Montserrat_600SemiBold',
  },
  claimerInfo: {
    flex: 1,
  },
  claimerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  claimerUsername: {
    color: '#000000',
    fontSize: 16,
    fontFamily: 'Montserrat_600SemiBold',
  },
  claimerAmount: {
    color: '#000000',
    fontSize: 14,
    fontFamily: 'Montserrat_600SemiBold',
  },
  claimerFullName: {
    color: '#6C6B6B',
    fontSize: 12,
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 4,
  },
  claimerDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  claimerDate: {
    color: '#6C6B6B',
    fontSize: 12,
    fontFamily: 'Montserrat_400Regular',
  },
  emptyClaimersText: {
    color: '#6C6B6B',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
  },
  infoDivider: {
    height: 1,
    backgroundColor: '#6C6B6B',
    marginVertical: 24,
  },
  infoBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 20,
    backgroundColor: 'transparent',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.2)',
    borderStyle: 'dashed',
    gap: 12,
    marginBottom: 32,
  },
  infoIconContainer: {
    justifyContent: 'center',
    alignItems: 'center',
  },
  infoText: {
    color: 'rgba(255, 255, 255, 0.5)',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
    lineHeight: 18,
    flex: 1,
  },
  endDropButton: {
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#6C6B6B',
    borderRadius: 12,
    marginBottom: 12,
  },
  endDropButtonDisabled: {
    opacity: 0.65,
  },
  endDropText: {
    color: '#FF3737',
    fontSize: 16,
    fontFamily: 'Montserrat_700Bold',
  },
});

export default MoneyDropDetailsScreen;

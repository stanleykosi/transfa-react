import AlarmIcon from '@/assets/icons/alarm.svg';
import BackIcon from '@/assets/icons/back.svg';
import CautionIcon from '@/assets/icons/caution.svg';
import CopyIcon from '@/assets/icons/document-copy.svg';
import DownloadIcon from '@/assets/icons/download.svg';
import MoneyDropIcon from '@/assets/icons/money-drop.svg';
import ShareIcon from '@/assets/icons/share.svg';
import { QRShareCard } from '@/components/QRShareCard';
import type { AppStackParamList } from '@/navigation/AppStack';
import type { AppNavigationProp } from '@/types/navigation';
import { formatCurrency } from '@/utils/formatCurrency';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import * as Clipboard from 'expo-clipboard';
import * as Haptics from 'expo-haptics';
import * as MediaLibrary from 'expo-media-library';
import React, { useMemo, useRef, useState } from 'react';
import {
  Alert,
  Dimensions,
  Image,
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
import { captureRef } from 'react-native-view-shot';

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

type MoneyDropSuccessRouteProp = RouteProp<AppStackParamList, 'MoneyDropSuccess'>;
type DetailRowProps = {
  label: string;
  value: string;
  isPin?: boolean;
  pinVisible?: boolean;
  canTogglePin?: boolean;
  onTogglePin?: () => void;
};

const DetailRow = ({
  label,
  value,
  isPin = false,
  pinVisible = false,
  canTogglePin = false,
  onTogglePin,
}: DetailRowProps) => (
  <View style={styles.detailRow}>
    <Text style={[styles.detailLabel, isPin && { marginTop: 3 }]}>{label}</Text>
    <View style={styles.detailValueContainer}>
      {isPin ? (
        <View style={styles.pinContainer}>
          <View style={styles.pinValueBox}>
            <Text style={styles.detailValue}>{pinVisible ? value : '****'}</Text>
          </View>
          {canTogglePin ? (
            <TouchableOpacity onPress={onTogglePin}>
              <Text style={styles.viewPinText}>{pinVisible ? 'Hide Pin' : 'View Pin'}</Text>
            </TouchableOpacity>
          ) : null}
        </View>
      ) : (
        <Text style={styles.detailValue}>{value}</Text>
      )}
    </View>
  </View>
);

const formatExpiry = (value: string) => {
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

const MoneyDropSuccessScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const route = useRoute<MoneyDropSuccessRouteProp>();
  const { dropDetails, lockPassword } = route.params;

  const [pinVisible, setPinVisible] = useState(false);
  const cardRef = useRef<View>(null);
  const [downloading, setDownloading] = useState(false);

  const shareLink = dropDetails.shareable_link;
  const title = dropDetails.title;
  const totalAmount = formatCurrency(dropDetails.total_amount);
  const amountPerPerson = formatCurrency(dropDetails.amount_per_claim);
  const numPeople = String(dropDetails.number_of_people);
  const expires = formatExpiry(dropDetails.expiry_timestamp);

  const shareCardPin = useMemo(() => {
    if (!dropDetails.lock_enabled) {
      return 'Not set';
    }
    if (lockPassword) {
      return lockPassword;
    }
    return '******';
  }, [dropDetails.lock_enabled, lockPassword]);

  const handleCopy = async (text: string) => {
    await Clipboard.setStringAsync(text);
    await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    Alert.alert('Success', 'Link copied to clipboard');
  };

  const handleShare = async () => {
    try {
      await Share.share({
        message: `Check out this MoneyDrop: ${shareLink}`,
        url: shareLink,
      });
    } catch (error) {
      console.warn('Error sharing:', error);
    }
  };

  const handleDownload = async () => {
    try {
      setDownloading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert('Permission Required', 'We need gallery permissions to save the QR code.');
        return;
      }

      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1,
        result: 'tmpfile',
      });

      const asset = await MediaLibrary.createAssetAsync(uri);
      const existingAlbum = await MediaLibrary.getAlbumAsync('Transfa');
      if (existingAlbum) {
        await MediaLibrary.addAssetsToAlbumAsync([asset], existingAlbum, false);
      } else {
        await MediaLibrary.createAlbumAsync('Transfa', asset, false);
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved to Gallery', 'Your premium MoneyDrop card has been saved successfully!');
    } catch (error) {
      console.error('Download error:', error);
      Alert.alert('Error', 'Failed to download the QR card. Please try again.');
    } finally {
      setDownloading(false);
    }
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
        <View style={styles.successHeader}>
          <Image
            source={require('@/assets/images/success-confetti.png')}
            style={styles.successImage}
            resizeMode="contain"
          />
          <Text style={styles.successTitle}>Success!</Text>
          <Text style={styles.successSubtitle}>MoneyDrop created successfully.</Text>
        </View>

        <View style={styles.dropDetailsHeader}>
          <View style={styles.alertIconContainer}>
            <CautionIcon width={20} height={20} />
          </View>
          <Text style={styles.sectionTitle}>Drop Details</Text>
        </View>

        <View style={styles.summaryCard}>
          <DetailRow label="Title" value={title} />
          <DetailRow label="Total Amount" value={totalAmount} />
          <DetailRow label="Amount per Person" value={amountPerPerson} />
          <DetailRow label="Number of people" value={numPeople} />
          <DetailRow
            label="Drop Pin"
            value={shareCardPin}
            isPin
            pinVisible={pinVisible}
            canTogglePin={dropDetails.lock_enabled && !!lockPassword}
            onTogglePin={() => setPinVisible((prev) => !prev)}
          />
          <DetailRow label="Expires" value={expires} />
        </View>

        <View style={styles.mainDivider} />

        <View style={styles.qrSection}>
          <View style={styles.qrContainer}>
            <View style={styles.qrCodeWrapper}>
              <QRCode
                value={dropDetails.qr_code_content || shareLink}
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

          <TouchableOpacity
            style={[styles.downloadButton, downloading && { opacity: 0.6 }]}
            onPress={handleDownload}
            disabled={downloading}
          >
            <DownloadIcon width={20} height={20} color="#FFFFFF" />
            <Text style={styles.downloadButtonText}>
              {downloading ? 'Downloading...' : 'Download'}
            </Text>
          </TouchableOpacity>
        </View>

        <View style={styles.sharableLinkSection}>
          <Text style={styles.sectionLabel}>Sharable Link</Text>
          <View style={styles.linkInputContainer}>
            <Text style={styles.linkText} numberOfLines={1}>
              {shareLink}
            </Text>
            <TouchableOpacity style={styles.copyButton} onPress={() => handleCopy(shareLink)}>
              <CopyIcon width={20} height={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <TouchableOpacity style={styles.shareLinkButton} onPress={handleShare}>
            <ShareIcon width={20} height={20} color="#FFFFFF" />
            <Text style={styles.shareLinkButtonText}>Share Link</Text>
          </TouchableOpacity>
        </View>

        <View style={styles.infoBanner}>
          <View style={styles.infoIconContainer}>
            <AlarmIcon width={22} height={25} />
          </View>
          <Text style={styles.infoText}>
            Funds are stored in a dedicated account. Unclaimed funds will be automatically refunded
            after expiry.
          </Text>
        </View>

        <TouchableOpacity
          style={styles.doneButton}
          onPress={() => navigation.navigate('AppTabs', { screen: 'MoneyDrop' })}
        >
          <Text style={styles.doneButtonText}>Done</Text>
        </TouchableOpacity>
      </ScrollView>

      <View style={styles.hiddenCardContainer} pointerEvents="none">
        <QRShareCard ref={cardRef} type="money-drop" value={shareLink} />
      </View>
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
  successHeader: {
    alignItems: 'center',
    marginBottom: 24,
  },
  successImage: {
    width: 220,
    height: 220,
  },
  successTitle: {
    fontSize: 32,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 8,
  },
  successSubtitle: {
    fontSize: 16,
    color: '#6C6B6B',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 24,
  },
  dropDetailsHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  alertIconContainer: {
    width: 20,
    height: 20,
    justifyContent: 'center',
    alignItems: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
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
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'right',
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
  viewPinText: {
    color: '#FFD300',
    fontSize: 12,
    fontFamily: 'Montserrat_400Regular',
    textDecorationLine: 'underline',
    marginTop: 2,
  },
  mainDivider: {
    height: 1,
    backgroundColor: 'rgba(108, 107, 107, 0.3)',
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
    paddingVertical: 14,
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
    color: '#6C6B6B',
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
  shareLinkButton: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.1)',
    paddingVertical: 14,
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
  doneButton: {
    backgroundColor: '#FFD300',
    height: 56,
    borderRadius: 12,
    justifyContent: 'center',
    alignItems: 'center',
  },
  doneButtonText: {
    color: '#000000',
    fontSize: 18,
    fontFamily: 'Montserrat_700Bold',
  },
  hiddenCardContainer: {
    position: 'absolute',
    top: -9999,
    left: -9999,
  },
});

export default MoneyDropSuccessScreen;

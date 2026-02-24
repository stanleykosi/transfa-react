import React, { useMemo, useRef, useState } from 'react';
import { Alert, ScrollView, Share, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
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
import { formatCurrency } from '@/utils/formatCurrency';

const BRAND_YELLOW = '#FFD300';
const BG_BOTTOM = '#050607';
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BORDER = 'rgba(255,255,255,0.07)';

type MoneyDropSuccessRouteProp = RouteProp<AppStackParamList, 'MoneyDropSuccess'>;

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

  const [copied, setCopied] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const qrRef = useRef<any>(null);

  const maskedPassword = useMemo(() => {
    if (!lockPassword) {
      return '**********';
    }
    return '*'.repeat(Math.max(lockPassword.length, 8));
  }, [lockPassword]);

  const copyShareLink = async () => {
    await Clipboard.setStringAsync(dropDetails.shareable_link);
    setCopied(true);
    setTimeout(() => setCopied(false), 1600);
  };

  const shareLink = async () => {
    await Share.share({
      title: 'Transfa MoneyDrop',
      message: `Claim this money drop: ${dropDetails.shareable_link}`,
      url: dropDetails.shareable_link,
    });
  };

  const getQRBase64 = () =>
    new Promise<string>((resolve, reject) => {
      if (!qrRef.current || typeof qrRef.current.toDataURL !== 'function') {
        reject(new Error('QR code is unavailable.'));
        return;
      }
      qrRef.current.toDataURL((data: string) => {
        if (!data) {
          reject(new Error('Could not generate QR image.'));
          return;
        }
        resolve(data);
      });
    });

  const downloadQR = async () => {
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

      const fileUri = `${storageDir}moneydrop-${dropDetails.money_drop_id}-qr.png`;
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
    } catch (error) {
      console.warn('MoneyDrop QR download failed:', error);
      Alert.alert('Download Failed', 'Could not save QR code. Please try again.');
    }
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

          <View style={styles.successIconWrap}>
            <View style={styles.successIcon}>
              <Ionicons name="checkmark" size={60} color="#101215" />
            </View>
            <Text style={styles.successTitle}>Success!</Text>
            <Text style={styles.successSubtitle}>MoneyDrop created successfully.</Text>
          </View>

          <View style={styles.sectionHeader}>
            <Ionicons name="alert-circle" size={18} color={BRAND_YELLOW} />
            <Text style={styles.sectionTitle}>Drop Details</Text>
          </View>
          <View style={styles.detailsCard}>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Title</Text>
              <Text style={styles.detailValue}>{dropDetails.title}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Total Amount</Text>
              <Text style={styles.detailValue}>{formatCurrency(dropDetails.total_amount)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Amount per Person</Text>
              <Text style={styles.detailValue}>{formatCurrency(dropDetails.amount_per_claim)}</Text>
            </View>
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Number of people</Text>
              <Text style={styles.detailValue}>{dropDetails.number_of_people}</Text>
            </View>
            {dropDetails.lock_enabled && (
              <View style={styles.detailRow}>
                <Text style={styles.detailLabel}>Drop Password</Text>
                <View style={styles.passwordValueWrap}>
                  <Text style={styles.detailValue}>
                    {showPassword && lockPassword ? lockPassword : maskedPassword}
                  </Text>
                  {lockPassword ? (
                    <TouchableOpacity
                      activeOpacity={0.85}
                      onPress={() => setShowPassword((prev) => !prev)}
                    >
                      <Text style={styles.togglePasswordText}>
                        {showPassword ? 'Hide Password' : 'View Password'}
                      </Text>
                    </TouchableOpacity>
                  ) : null}
                </View>
              </View>
            )}
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Expires</Text>
              <Text style={styles.detailValue}>{formatExpiry(dropDetails.expiry_timestamp)}</Text>
            </View>
          </View>

          <View style={styles.qrCard}>
            <View style={styles.qrCodeFrame}>
              <QRCode
                getRef={(ref) => {
                  qrRef.current = ref;
                }}
                value={dropDetails.qr_code_content}
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
            onPress={downloadQR}
          >
            <Ionicons name="download-outline" size={18} color="#F4F5F7" />
            <Text style={styles.secondaryButtonText}>Download</Text>
          </TouchableOpacity>

          <Text style={styles.shareLabel}>Sharable Link</Text>
          <View style={styles.linkField}>
            <Text style={styles.linkText} numberOfLines={1}>
              {dropDetails.shareable_link}
            </Text>
            <TouchableOpacity activeOpacity={0.8} onPress={copyShareLink}>
              <Ionicons
                name={copied ? 'checkmark-circle' : 'copy-outline'}
                size={20}
                color={copied ? BRAND_YELLOW : '#E6E8ED'}
              />
            </TouchableOpacity>
          </View>

          <TouchableOpacity activeOpacity={0.86} style={styles.shareButton} onPress={shareLink}>
            <Ionicons name="share-social-outline" size={18} color="#A7ABB2" />
            <Text style={styles.shareButtonText}>Share Link</Text>
          </TouchableOpacity>

          <View style={styles.noteCard}>
            <Ionicons name="shield-checkmark" size={18} color={BRAND_YELLOW} />
            <Text style={styles.noteText}>
              Funds are stored in a dedicated account. Unclaimed funds will be automatically
              refunded after expiry.
            </Text>
          </View>

          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.doneButton}
            onPress={() => navigation.navigate('AppTabs', { screen: 'MoneyDrop' })}
          >
            <Text style={styles.doneButtonText}>Done</Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
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
  successIconWrap: {
    alignItems: 'center',
    marginTop: 4,
    marginBottom: 18,
  },
  successIcon: {
    width: 132,
    height: 132,
    borderRadius: 66,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: BRAND_YELLOW,
    shadowOpacity: 0.5,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 0 },
    elevation: 10,
  },
  successTitle: {
    color: '#F5F6F8',
    fontSize: 32,
    fontWeight: '700',
    marginTop: 14,
  },
  successSubtitle: {
    color: '#70747C',
    fontSize: 16,
    marginTop: 6,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 10,
  },
  sectionTitle: {
    color: '#F4F5F7',
    fontSize: 18,
    fontWeight: '700',
    marginLeft: 8,
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
  doneButton: {
    height: 54,
    borderRadius: 12,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  doneButtonText: {
    color: '#0A0B0D',
    fontSize: 17,
    fontWeight: '700',
  },
});

export default MoneyDropSuccessScreen;

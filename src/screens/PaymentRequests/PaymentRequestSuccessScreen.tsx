import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

import { useDeletePaymentRequest, useGetPaymentRequest } from '@/api/transactionApi';
import { AppStackParamList } from '@/navigation/AppStack';
import { formatCurrency } from '@/utils/formatCurrency';
import { normalizeUsername } from '@/utils/username';

const BRAND_YELLOW = '#FFD300';

type RouteProps = RouteProp<AppStackParamList, 'PaymentRequestSuccess'>;
type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const stripUsernamePrefix = (value?: string | null) => normalizeUsername(value || 'unknown');

const mapStatus = (status: string) => {
  const normalized = status.toLowerCase();
  if (normalized === 'paid' || normalized === 'fulfilled') {
    return { label: 'Paid', text: '#25A641', bg: '#BFF2B6', icon: 'checkmark-circle' as const };
  }
  if (normalized === 'declined') {
    return { label: 'Declined', text: '#F14D4D', bg: '#FFCACA', icon: 'close-circle' as const };
  }
  return { label: 'Pending', text: '#D7A800', bg: 'rgba(255,211,0,0.25)', icon: 'time' as const };
};

const PaymentRequestSuccessScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { requestId } = route.params;

  const qrCodeRef = React.useRef<any>(null);
  const [isDownloading, setIsDownloading] = React.useState(false);

  const {
    data: request,
    isLoading,
    isError,
    error: requestError,
    refetch,
  } = useGetPaymentRequest(requestId);

  const { mutate: deleteRequest, isPending: isDeleting } = useDeletePaymentRequest({
    onSuccess: () => {
      navigation.replace('PaymentRequestsList');
    },
    onError: (mutationError) => {
      Alert.alert('Delete failed', mutationError.message || 'Could not delete request.');
    },
  });

  const shareableLink =
    request?.shareable_link || `https://transfa.app/pay?request_id=${requestId}`;
  const qrValue = request?.qr_code_content || shareableLink;

  const onCopyLink = async () => {
    await Clipboard.setStringAsync(shareableLink);
    Alert.alert('Copied', 'Sharable link copied to clipboard.');
  };

  const onShare = async () => {
    try {
      await Share.share({
        message: `Pay me with this Transfa request link: ${shareableLink}`,
        url: shareableLink,
      });
    } catch (caughtError: any) {
      Alert.alert('Share failed', caughtError?.message || 'Could not share request link.');
    }
  };

  const onDownload = async () => {
    try {
      setIsDownloading(true);

      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission needed',
          'Allow photo access to download and save the request QR image.'
        );
        return;
      }

      const qrBase64 = await new Promise<string>((resolve, reject) => {
        if (!qrCodeRef.current || typeof qrCodeRef.current.toDataURL !== 'function') {
          reject(new Error('QR image is not ready yet.'));
          return;
        }

        qrCodeRef.current.toDataURL((data: string) => {
          if (!data) {
            reject(new Error('Unable to generate QR image.'));
            return;
          }
          resolve(data);
        });
      });

      const rootDir = FileSystem.cacheDirectory || FileSystem.documentDirectory;
      if (!rootDir) {
        throw new Error('File storage is not available on this device.');
      }

      const fileUri = `${rootDir}transfa-request-${requestId}-${Date.now()}.png`;

      await FileSystem.writeAsStringAsync(fileUri, qrBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const asset = await MediaLibrary.createAssetAsync(fileUri);
      try {
        await MediaLibrary.createAlbumAsync('Transfa', asset, false);
      } catch {
        // Album may already exist or creation may fail; asset is already saved to gallery.
      }

      Alert.alert('Downloaded', 'Request QR image has been saved to your gallery.');
    } catch (caughtError: any) {
      Alert.alert('Download failed', caughtError?.message || 'Could not download QR image.');
    } finally {
      setIsDownloading(false);
    }
  };

  const onDelete = () => {
    if (!request) {
      return;
    }

    Alert.alert('Delete Request', 'Are you sure you want to delete this request?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteRequest({ requestId: request.id }),
      },
    ]);
  };

  if (isLoading) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="small" color={BRAND_YELLOW} />
        <Text style={styles.loadingText}>Loading request...</Text>
      </View>
    );
  }

  if (isError && !request) {
    const isNotFound = (requestError?.message || '').toLowerCase().includes('not found');

    return (
      <View style={styles.loadingRoot}>
        <Text style={styles.loadingText}>
          {isNotFound ? 'Request not found.' : 'Unable to load request.'}
        </Text>
        {!isNotFound ? <Text style={styles.errorSubText}>{requestError?.message}</Text> : null}
        <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  if (!request) {
    return (
      <View style={styles.loadingRoot}>
        <Text style={styles.loadingText}>Request not found.</Text>
        <TouchableOpacity onPress={() => refetch()} style={styles.retryButton}>
          <Text style={styles.retryButtonText}>Retry</Text>
        </TouchableOpacity>
      </View>
    );
  }

  const status = mapStatus(request.display_status || request.status);
  const isGeneral = request.request_type === 'general';

  if (isGeneral) {
    return (
      <View style={styles.rootDark}>
        <LinearGradient
          colors={['#1A1B1E', '#0C0D0F', '#050607']}
          start={{ x: 0, y: 0 }}
          end={{ x: 0, y: 1 }}
          style={StyleSheet.absoluteFillObject}
        />

        <SafeAreaView style={styles.safeAreaDark} edges={['top', 'left', 'right']}>
          <View style={styles.darkHeaderRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerIconButton}>
              <Ionicons name="arrow-back" size={20} color="#ECECEC" />
            </TouchableOpacity>

            <Text style={styles.darkHeaderTitle}>General Request</Text>

            <TouchableOpacity style={styles.headerIconButton} activeOpacity={0.9}>
              <Ionicons name="settings-outline" size={18} color="#ECECEC" />
            </TouchableOpacity>
          </View>

          <ScrollView
            contentContainerStyle={styles.darkContent}
            showsVerticalScrollIndicator={false}
          >
            <View style={styles.qrCard}>
              <View style={styles.qrWrap}>
                <QRCode ref={qrCodeRef} value={qrValue} size={210} />
                <View style={styles.qrCenterBadge}>
                  <Ionicons name="receipt-outline" size={22} color={BRAND_YELLOW} />
                </View>
              </View>

              <Text style={styles.qrHintText}>Scan QR to claim</Text>
            </View>

            <TouchableOpacity
              style={styles.secondaryActionButton}
              onPress={onDownload}
              activeOpacity={0.88}
            >
              {isDownloading ? (
                <ActivityIndicator size="small" color="#E7E8EA" />
              ) : (
                <>
                  <Ionicons name="download-outline" size={16} color="#E7E8EA" />
                  <Text style={styles.secondaryActionText}>Download</Text>
                </>
              )}
            </TouchableOpacity>

            <Text style={styles.sectionLabel}>Sharable Link</Text>
            <TouchableOpacity style={styles.linkCard} onPress={onCopyLink} activeOpacity={0.9}>
              <Ionicons name="link-outline" size={16} color="#A9ACB3" />
              <Text style={styles.linkText} numberOfLines={1}>
                {shareableLink}
              </Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={styles.secondaryActionButton}
              onPress={onShare}
              activeOpacity={0.88}
            >
              <Ionicons name="share-social-outline" size={16} color="#E7E8EA" />
              <Text style={styles.secondaryActionText}>Share Link</Text>
            </TouchableOpacity>

            <Text style={styles.sectionLabel}>Request Info</Text>
            <View style={styles.infoCardDark}>
              <View style={styles.infoRowDark}>
                <Text style={styles.infoLabelDark}>Title</Text>
                <Text style={styles.infoValueDark} numberOfLines={1}>
                  {request.title}
                </Text>
              </View>

              <View style={styles.infoRowDark}>
                <Text style={styles.infoLabelDark}>Requested Amount</Text>
                <Text style={styles.infoValueDark}>{formatCurrency(request.amount)}</Text>
              </View>

              <View style={styles.infoRowDark}>
                <Text style={styles.infoLabelDark}>Status</Text>
                <Text style={[styles.infoValueDark, { color: status.text }]}>{status.label}</Text>
              </View>

              {request.description ? (
                <View style={styles.descriptionBlockDark}>
                  <Text style={styles.infoLabelDark}>Description</Text>
                  <Text style={styles.descriptionTextDark}>{request.description}</Text>
                </View>
              ) : null}

              {request.image_url ? (
                <View style={styles.imageRowDark}>
                  <Text style={styles.infoLabelDark}>Image</Text>
                  <Image source={{ uri: request.image_url }} style={styles.thumbImageDark} />
                </View>
              ) : null}
            </View>

            <TouchableOpacity
              style={[styles.deleteButtonDark, isDeleting && styles.deleteButtonDisabled]}
              onPress={onDelete}
              disabled={isDeleting}
              activeOpacity={0.88}
            >
              <Text style={styles.deleteButtonDarkText}>
                {isDeleting ? 'Deleting...' : 'Delete Request'}
              </Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </View>
    );
  }

  const recipientUsername = stripUsernamePrefix(request.recipient_username);

  return (
    <View style={styles.rootLight}>
      <SafeAreaView style={styles.safeAreaLight} edges={['top', 'left', 'right']}>
        <View style={styles.mediaArea}>
          {request.image_url ? (
            <Image
              source={{ uri: request.image_url }}
              style={styles.mediaImage}
              resizeMode="cover"
            />
          ) : (
            <View style={styles.mediaPlaceholder}>
              <Ionicons name="image-outline" size={64} color="#B5B5B7" />
            </View>
          )}

          <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
            <Ionicons name="close" size={18} color="#101214" />
          </TouchableOpacity>
        </View>

        <ScrollView
          style={styles.individualScroll}
          contentContainerStyle={styles.individualContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.sheetCard}>
            <View style={styles.sheetHeaderRow}>
              <View style={styles.sheetAvatarWrap}>
                <Text style={styles.sheetAvatarInitial}>
                  {recipientUsername.slice(0, 1).toUpperCase()}
                </Text>
                <View style={styles.sheetLockBadge}>
                  <Ionicons name="lock-closed" size={9} color="#090909" />
                </View>
              </View>

              <View style={[styles.statusPillLight, { backgroundColor: status.bg }]}>
                <Ionicons name={status.icon} size={10} color={status.text} />
                <Text style={[styles.statusTextLight, { color: status.text }]}>{status.label}</Text>
              </View>
            </View>

            <Text style={styles.sheetUsername}>{recipientUsername}</Text>
            <Text style={styles.sheetFullName}>
              {request.recipient_full_name || 'Transfa User'}
            </Text>

            <View style={styles.sheetDateRow}>
              <Ionicons name="calendar-outline" size={12} color="#6E7076" />
              <Text style={styles.sheetDateText}>
                {new Date(request.created_at).toLocaleDateString('en-US', {
                  month: 'short',
                  day: 'numeric',
                  year: 'numeric',
                })}
              </Text>
            </View>

            <View style={styles.titleAmountRow}>
              <View style={styles.titleWrap}>
                <Text style={styles.sheetSectionLabel}>Title</Text>
                <Text style={styles.sheetTitleText}>{request.title}</Text>
              </View>

              <Text style={styles.sheetAmountText}>{formatCurrency(request.amount)}</Text>
            </View>

            {request.description ? (
              <View style={styles.sheetDescriptionWrap}>
                <Text style={styles.sheetSectionLabel}>Description</Text>
                <Text style={styles.sheetDescriptionText}>{request.description}</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[styles.deleteButtonLight, isDeleting && styles.deleteButtonDisabled]}
              onPress={onDelete}
              disabled={isDeleting}
              activeOpacity={0.88}
            >
              <Text style={styles.deleteButtonLightText}>
                {isDeleting ? 'Deleting...' : 'Delete request'}
              </Text>
            </TouchableOpacity>
          </View>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  loadingRoot: {
    flex: 1,
    backgroundColor: '#050607',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#C8C9CD',
    fontSize: 13,
  },
  errorSubText: {
    maxWidth: '80%',
    textAlign: 'center',
    color: '#94979F',
    fontSize: 12,
  },
  retryButton: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    borderRadius: 8,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  retryButtonText: {
    color: '#ECEDEF',
    fontSize: 12,
    fontWeight: '600',
  },

  rootDark: {
    flex: 1,
    backgroundColor: '#050607',
  },
  safeAreaDark: {
    flex: 1,
  },
  darkHeaderRow: {
    paddingHorizontal: 20,
    paddingTop: 8,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerIconButton: {
    width: 28,
    paddingVertical: 4,
    alignItems: 'center',
  },
  darkHeaderTitle: {
    color: '#EFEFF0',
    fontSize: 16,
    fontWeight: '500',
  },
  darkContent: {
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 26,
    gap: 10,
  },
  qrCard: {
    borderRadius: 8,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  qrWrap: {
    backgroundColor: '#FFFFFF',
    borderRadius: 6,
    padding: 8,
  },
  qrCenterBadge: {
    position: 'absolute',
    top: '50%',
    left: '50%',
    marginTop: -18,
    marginLeft: -18,
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: '#2A2C31',
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrHintText: {
    marginTop: 8,
    color: '#8C8F96',
    fontSize: 13,
  },
  secondaryActionButton: {
    marginTop: 2,
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  secondaryActionText: {
    color: '#E7E8EA',
    fontSize: 14,
    fontWeight: '600',
  },
  sectionLabel: {
    marginTop: 6,
    color: '#D5D6DA',
    fontSize: 15,
    fontWeight: '500',
  },
  linkCard: {
    minHeight: 42,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkText: {
    flex: 1,
    color: '#D2D3D8',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  infoCardDark: {
    marginTop: 2,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingHorizontal: 12,
    paddingVertical: 12,
    gap: 8,
  },
  infoRowDark: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 10,
  },
  infoLabelDark: {
    color: '#8F939A',
    fontSize: 12,
  },
  infoValueDark: {
    color: '#F0F1F2',
    fontSize: 13,
    fontWeight: '500',
    maxWidth: '62%',
    textAlign: 'right',
  },
  descriptionBlockDark: {
    marginTop: 2,
    gap: 4,
  },
  descriptionTextDark: {
    color: '#D0D2D7',
    fontSize: 12,
    lineHeight: 18,
  },
  imageRowDark: {
    marginTop: 2,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  thumbImageDark: {
    width: 42,
    height: 42,
    borderRadius: 7,
  },
  deleteButtonDark: {
    marginTop: 6,
    minHeight: 44,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,0,0,0.45)',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  deleteButtonDarkText: {
    color: '#FF4D4D',
    fontSize: 15,
    fontWeight: '600',
  },

  rootLight: {
    flex: 1,
    backgroundColor: '#EDEDEE',
  },
  safeAreaLight: {
    flex: 1,
  },
  mediaArea: {
    height: 300,
    backgroundColor: '#DCDCDD',
  },
  mediaImage: {
    width: '100%',
    height: '100%',
  },
  mediaPlaceholder: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#DDDDDE',
  },
  closeButton: {
    position: 'absolute',
    top: 12,
    left: 20,
    width: 38,
    height: 38,
    borderRadius: 19,
    backgroundColor: 'rgba(255,255,255,0.9)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  individualScroll: {
    flex: 1,
    marginTop: -20,
  },
  individualContent: {
    paddingBottom: 24,
  },
  sheetCard: {
    backgroundColor: '#F7F7F8',
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 18,
    minHeight: 420,
  },
  sheetHeaderRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  sheetAvatarWrap: {
    width: 84,
    height: 84,
    borderRadius: 20,
    backgroundColor: '#ABABFD',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: -34,
  },
  sheetAvatarInitial: {
    color: '#111214',
    fontSize: 30,
    fontWeight: '700',
  },
  sheetLockBadge: {
    position: 'absolute',
    right: -6,
    bottom: 10,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  statusPillLight: {
    marginTop: 6,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusTextLight: {
    fontSize: 11,
    fontWeight: '600',
  },
  sheetUsername: {
    marginTop: 10,
    color: '#101114',
    fontSize: 20,
    fontWeight: '700',
  },
  sheetFullName: {
    marginTop: 2,
    color: '#52545A',
    fontSize: 13,
  },
  sheetDateRow: {
    marginTop: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  sheetDateText: {
    color: '#6E7076',
    fontSize: 12,
  },
  titleAmountRow: {
    marginTop: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-end',
    gap: 10,
  },
  titleWrap: {
    flex: 1,
    gap: 4,
  },
  sheetSectionLabel: {
    color: '#54575D',
    fontSize: 13,
    fontWeight: '500',
  },
  sheetTitleText: {
    color: '#141518',
    fontSize: 18,
    fontWeight: '600',
  },
  sheetAmountText: {
    color: '#111214',
    fontSize: 22,
    fontWeight: '700',
  },
  sheetDescriptionWrap: {
    marginTop: 24,
    gap: 6,
  },
  sheetDescriptionText: {
    color: '#70737A',
    fontSize: 13,
    lineHeight: 20,
  },
  deleteButtonLight: {
    marginTop: 28,
    minHeight: 50,
    borderRadius: 8,
    backgroundColor: '#08090B',
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteButtonLightText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },

  deleteButtonDisabled: {
    opacity: 0.65,
  },
});

export default PaymentRequestSuccessScreen;

import BackIcon from '@/assets/icons/back.svg';
import CalendarIcon from '@/assets/icons/calendar1.svg';
import CancelIcon from '@/assets/icons/cancel.svg';
import CopyIcon from '@/assets/icons/document-copy.svg';
import DownloadIcon from '@/assets/icons/download.svg';
import GalleryExportIcon from '@/assets/icons/gallery-export.svg';
import PaidIcon from '@/assets/icons/paid.svg';
import PendingIcon from '@/assets/icons/pending.svg';
import RequestIcon from '@/assets/icons/request.svg';
import SettingsIcon from '@/assets/icons/settings.svg';
import ShareIcon from '@/assets/icons/share.svg';
import TrashIcon from '@/assets/icons/trash.svg';
import VerifiedBadge from '@/assets/icons/verified.svg';
import Avatar1 from '@/assets/images/avatar1.svg';
import Avatar2 from '@/assets/images/avatar2.svg';
import Avatar3 from '@/assets/images/avatar3.svg';
import { useDeletePaymentRequest, useGetPaymentRequest } from '@/api/transactionApi';
import type { AppStackParamList } from '@/types/navigation';
import { formatCurrency } from '@/utils/formatCurrency';
import { normalizeUsername } from '@/utils/username';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
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
import QRCode from 'react-native-qrcode-svg';
import { SvgXml } from 'react-native-svg';

const { width: SCREEN_WIDTH, height: SCREEN_HEIGHT } = Dimensions.get('window');

const backgroundSvg = `<svg width="375" height="812" viewBox="0 0 375 812" fill="none" xmlns="http://www.w3.org/2000/svg">
<rect width="375" height="812" fill="white"/>
<rect width="375" height="812" fill="url(#paint0_linear_708_2445)"/>
<rect width="375" height="812" fill="black" fill-opacity="0.2"/>
<defs>
<linearGradient id="paint0_linear_708_2445" x1="187.5" y1="0" x2="187.5" y2="812" gradientUnits="userSpaceOnUse">
<stop stop-color="#2B2B2B"/>
<stop offset="0.778846" stop-color="#0F0F0F"/>
</linearGradient>
</defs>
</svg>`;

type RouteProps = RouteProp<AppStackParamList, 'PaymentRequestSuccess'>;
type NavigationProp = NativeStackNavigationProp<AppStackParamList>;
type RequestStatus = 'pending' | 'paid' | 'declined';
type AvatarComponent = React.ComponentType<{ width?: number; height?: number }>;
type QRCodeRef = {
  toDataURL: (callback: (data: string) => void) => void;
};

const avatarPool: AvatarComponent[] = [Avatar1, Avatar2, Avatar3];

const formatUsername = (value?: string | null) => normalizeUsername(value || 'unknown');

const normalizeRequestStatus = (status?: string): RequestStatus => {
  const normalized = (status || '').toLowerCase();
  if (normalized === 'paid' || normalized === 'fulfilled') {
    return 'paid';
  }
  if (normalized === 'declined') {
    return 'declined';
  }
  return 'pending';
};

const getStatusLabel = (status: RequestStatus) => {
  if (status === 'paid') {
    return 'Paid';
  }
  if (status === 'declined') {
    return 'Declined';
  }
  return 'Pending';
};

const getStatusColor = (status: RequestStatus) => {
  if (status === 'paid') {
    return '#33DA00';
  }
  if (status === 'declined') {
    return '#FF3737';
  }
  return '#EBB351';
};

const pickAvatarComponent = (seed: string): AvatarComponent => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000000007;
  }
  return avatarPool[Math.abs(hash) % avatarPool.length] || Avatar1;
};

const formatRequestDate = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const PaymentRequestSuccessScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const route = useRoute<RouteProps>();
  const { requestId } = route.params;

  const qrCodeRef = React.useRef<QRCodeRef | null>(null);
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
    request?.shareable_link || `https://TryTransfa.com/request/${encodeURIComponent(requestId)}`;
  const qrValue = request?.qr_code_content || shareableLink;

  const onCopyLink = async () => {
    await Clipboard.setStringAsync(shareableLink);
    Alert.alert('Copied', 'Link copied to clipboard');
  };

  const onShare = async () => {
    try {
      await Share.share({
        message: shareableLink,
        url: shareableLink,
      });
    } catch {
      await Clipboard.setStringAsync(shareableLink);
      Alert.alert('Copied', 'Link copied to clipboard');
    }
  };

  const onDownload = async () => {
    try {
      setIsDownloading(true);

      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert(
          'Permission Required',
          'Transfa needs gallery permission to save your request card.'
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
        // Asset may already be in album or album creation may fail.
      }

      Alert.alert('Downloaded', 'Request QR image has been saved to your gallery.');
    } catch (caughtError: unknown) {
      const message =
        caughtError instanceof Error ? caughtError.message : 'Could not download QR image.';
      Alert.alert('Download failed', message);
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
        <ActivityIndicator size="small" color="#FFD300" />
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

  const status = normalizeRequestStatus(request.display_status || request.status);
  const isGeneral = request.request_type === 'general';

  if (isGeneral) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar style="light" />
        <View style={styles.backgroundContainer}>
          <SvgXml xml={backgroundSvg} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} />
        </View>

        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.header}>
            <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
              <BackIcon width={24} height={24} />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>General Request</Text>
            <TouchableOpacity style={styles.settingsButton}>
              <SettingsIcon width={20} height={20} color="#FFFFFF" />
            </TouchableOpacity>
          </View>

          <View style={styles.qrSection}>
            <View style={styles.qrCard}>
              <View style={styles.qrCodeContainer}>
                <QRCode
                  getRef={(ref) => {
                    qrCodeRef.current = ref;
                  }}
                  value={qrValue}
                  size={200}
                  color="#000000"
                  backgroundColor="#FFFFFF"
                />
                <View style={styles.qrCenterIcon}>
                  <RequestIcon width={40} height={40} color="#FFD300" />
                </View>
              </View>
              <Text style={styles.scanText}>Scan QR to claim</Text>
            </View>
            <TouchableOpacity
              style={[styles.downloadButton, isDownloading && { opacity: 0.6 }]}
              onPress={onDownload}
              disabled={isDownloading}
            >
              {isDownloading ? (
                <ActivityIndicator size="small" color="#FFFFFF" />
              ) : (
                <>
                  <DownloadIcon width={20} height={20} color="#FFFFFF" />
                  <Text style={styles.downloadButtonText}>Download</Text>
                </>
              )}
            </TouchableOpacity>
          </View>

          <View style={styles.linkSection}>
            <Text style={styles.sectionTitle}>Sharable Link</Text>
            <TouchableOpacity style={styles.linkContainer} onPress={onCopyLink} activeOpacity={0.7}>
              <CopyIcon width={20} height={20} />
              <Text style={styles.linkText} numberOfLines={1}>
                {shareableLink}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity style={styles.shareButton} onPress={onShare}>
              <ShareIcon width={19} height={20} />
              <Text style={styles.shareButtonText}>Share Link</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.infoSection}>
            <Text style={styles.sectionTitle}>Request Info</Text>

            <View style={styles.infoCard}>
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Title</Text>
                <Text style={styles.infoValue} numberOfLines={1}>
                  {request.title}
                </Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Requested Amount</Text>
                <Text style={styles.infoValue}>{formatCurrency(request.amount)}</Text>
              </View>

              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Status</Text>
                <Text style={[styles.infoValue, { color: getStatusColor(status) }]}>
                  {getStatusLabel(status)}
                </Text>
              </View>

              {request.description ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Description</Text>
                  <Text style={styles.infoDescription}>{request.description}</Text>
                </View>
              ) : null}

              {request.image_url ? (
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Image</Text>
                  <View style={styles.imageContainer}>
                    <Image
                      source={{ uri: request.image_url }}
                      style={styles.uploadedImageThumbnail}
                      resizeMode="center"
                    />
                  </View>
                </View>
              ) : null}
            </View>
          </View>

          <View style={styles.divider} />

          <TouchableOpacity
            style={[styles.deleteButton, isDeleting && styles.deleteButtonDisabled]}
            onPress={onDelete}
            disabled={isDeleting}
          >
            <TrashIcon width={20} height={20} />
            <Text style={styles.deleteButtonText}>
              {isDeleting ? 'Deleting...' : 'Delete Request'}
            </Text>
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    );
  }

  const recipientUsername = formatUsername(request.recipient_username);
  const recipientName = request.recipient_full_name || 'Transfa User';
  const AvatarComponent = pickAvatarComponent(recipientUsername || request.id);

  return (
    <SafeAreaView style={styles.individualContainer}>
      <StatusBar style="light" />

      <View style={styles.backgroundImageContainer}>
        {request.image_url ? (
          <Image
            source={{ uri: request.image_url }}
            style={styles.backgroundImage}
            resizeMode="cover"
          />
        ) : (
          <View style={styles.placeholderContainer}>
            <GalleryExportIcon width={64} height={64} />
          </View>
        )}
      </View>

      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <TouchableOpacity style={styles.closeButton} onPress={() => navigation.goBack()}>
            <View style={styles.closeButtonInner}>
              <Text style={styles.closeButtonText}>✕</Text>
            </View>
          </TouchableOpacity>
        </View>
        <View style={styles.topBarRight} />
      </View>

      <View style={styles.whiteCard}>
        <View style={styles.avatarContainer}>
          <AvatarComponent width={100} height={100} />
          <View style={styles.verifiedBadgeContainer}>
            <VerifiedBadge width={20} height={20} />
          </View>
        </View>

        <View style={styles.statusBadgeContainer}>
          {status === 'declined' ? (
            <View style={styles.statusBadgeDeclined}>
              <CancelIcon width={10} height={10} />
              <Text style={styles.statusTextDeclined}>Declined</Text>
            </View>
          ) : null}
          {status === 'paid' ? (
            <View style={styles.statusBadgePaid}>
              <PaidIcon width={10} height={10} />
              <Text style={styles.statusTextPaid}>Paid</Text>
            </View>
          ) : null}
          {status === 'pending' ? (
            <View style={styles.statusBadgePending}>
              <PendingIcon width={10} height={10} />
              <Text style={styles.statusTextPending}>Pending</Text>
            </View>
          ) : null}
        </View>

        <View style={styles.userInfoSection}>
          <Text style={styles.username}>{recipientUsername}</Text>
          <Text style={styles.name}>{recipientName}</Text>
          <View style={styles.dateRow}>
            <CalendarIcon width={14} height={14} />
            <Text style={styles.dateText}>{formatRequestDate(request.created_at)}</Text>
          </View>
        </View>

        <View style={styles.requestDetails}>
          <Text style={styles.detailLabel}>Title</Text>
          <View style={styles.detailRow}>
            <Text style={styles.detailTitle}>{request.title}</Text>
            <Text style={styles.amount}>{formatCurrency(request.amount)}</Text>
          </View>

          {request.description ? (
            <View style={styles.descriptionSection}>
              <Text style={styles.detailLabel}>Description</Text>
              <Text style={styles.description}>{request.description}</Text>
            </View>
          ) : null}
        </View>

        <TouchableOpacity
          style={[styles.deleteRequestButton, isDeleting && styles.deleteButtonDisabled]}
          onPress={onDelete}
          activeOpacity={0.7}
          disabled={isDeleting}
        >
          <Text style={styles.deleteRequestButtonText}>
            {isDeleting ? 'Deleting...' : 'Delete request'}
          </Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
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
    fontFamily: 'Montserrat_400Regular',
  },
  errorSubText: {
    maxWidth: '80%',
    textAlign: 'center',
    color: '#94979F',
    fontSize: 12,
    fontFamily: 'Montserrat_400Regular',
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
    fontFamily: 'Montserrat_600SemiBold',
  },

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
    zIndex: 0,
  },
  scrollView: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 100,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 32,
    width: '100%',
  },
  backButton: {
    padding: 4,
    width: 32,
    alignItems: 'flex-start',
  },
  headerTitle: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
    flex: 1,
    textAlign: 'center',
  },
  settingsButton: {
    padding: 4,
    width: 32,
    alignItems: 'flex-end',
  },
  qrSection: {
    alignItems: 'center',
    marginBottom: 32,
    width: '100%',
  },
  qrCard: {
    backgroundColor: '#333333',
    borderRadius: 16,
    padding: 24,
    alignItems: 'center',
    width: '100%',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  qrCodeContainer: {
    position: 'relative',
    backgroundColor: '#FFFFFF',
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
    width: 232,
    height: 232,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCenterIcon: {
    position: 'absolute',
    width: 48,
    height: 48,
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
    top: '45%',
    left: '45%',
  },
  scanText: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.5)',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 16,
  },
  downloadButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333333',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    width: '100%',
    height: 48,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 8,
    marginTop: 16,
  },
  downloadButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
  },
  linkSection: {
    marginBottom: 32,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 16,
  },
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333333',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginBottom: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 12,
  },
  linkText: {
    flex: 1,
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  shareButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#333333',
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 8,
  },
  shareButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
  },
  infoSection: {},
  infoCard: {
    backgroundColor: '#333333',
    borderRadius: 16,
    paddingVertical: 20,
    paddingHorizontal: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 20,
  },
  infoLabel: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.3)',
    fontFamily: 'Montserrat_400Regular',
    maxWidth: '45%',
  },
  infoValue: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'right',
    maxWidth: '50%',
  },
  infoDescription: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
    opacity: 0.7,
    lineHeight: 20,
    textAlign: 'right',
    maxWidth: '60%',
  },
  imageContainer: {
    marginLeft: 12,
    alignItems: 'flex-start',
    justifyContent: 'flex-start',
  },
  uploadedImageThumbnail: {
    width: 80,
    height: 80,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  divider: {
    height: 1,
    backgroundColor: '#6C6B6B',
    marginTop: 25,
    marginBottom: 25,
  },
  deleteButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#6C6B6B',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    gap: 8,
    marginTop: 8,
  },
  deleteButtonText: {
    fontSize: 16,
    color: '#FF3737',
    fontFamily: 'Montserrat_700Bold',
  },

  individualContainer: {
    flex: 1,
    backgroundColor: '#000000',
  },
  backgroundImageContainer: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    width: SCREEN_WIDTH,
    height: SCREEN_HEIGHT * 0.4,
    overflow: 'hidden',
  },
  backgroundImage: {
    width: '100%',
    height: '100%',
  },
  placeholderContainer: {
    width: '100%',
    height: '100%',
    backgroundColor: 'rgba(108, 108, 108, 0.3)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 10,
    zIndex: 10,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  closeButton: {
    padding: 4,
  },
  closeButtonInner: {
    width: 32,
    height: 32,
    borderRadius: 16,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeButtonText: {
    fontSize: 18,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  whiteCard: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: '#FFFFFF',
    borderTopLeftRadius: 32,
    borderTopRightRadius: 32,
    paddingTop: 32,
    paddingHorizontal: 20,
    paddingBottom: 40,
    minHeight: SCREEN_HEIGHT * 0.7,
  },
  avatarContainer: {
    position: 'absolute',
    top: -20,
    left: 20,
    width: 100,
    height: 100,
    borderRadius: 12,
    overflow: 'visible',
    zIndex: 20,
  },
  verifiedBadgeContainer: {
    position: 'absolute',
    bottom: 0,
    right: 0,
    width: 28,
    height: 28,
    borderRadius: 14,
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 2,
    borderColor: '#FFFFFF',
  },
  statusBadgeContainer: {
    position: 'absolute',
    top: 20,
    right: 20,
    zIndex: 21,
  },
  statusBadgeDeclined: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFE5E5',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  statusTextDeclined: {
    fontSize: 12,
    color: '#FF3737',
    fontFamily: 'Montserrat_600SemiBold',
  },
  statusBadgePaid: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E5FFE5',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  statusTextPaid: {
    fontSize: 12,
    color: '#33DA00',
    fontFamily: 'Montserrat_600SemiBold',
  },
  statusBadgePending: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FEF5CB',
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 6,
    gap: 6,
  },
  statusTextPending: {
    fontSize: 12,
    color: '#EBB351',
    fontFamily: 'Montserrat_600SemiBold',
  },
  userInfoSection: {
    marginTop: 64,
    marginBottom: 24,
  },
  username: {
    fontSize: 30,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 4,
  },
  name: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 8,
  },
  dateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  dateText: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
  },
  requestDetails: {
    marginBottom: 32,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 24,
  },
  detailLabel: {
    fontSize: 16,
    color: '#FFD300',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 8,
    textTransform: 'uppercase',
  },
  detailTitle: {
    fontSize: 18,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
    flex: 1,
    marginRight: 16,
  },
  amount: {
    fontSize: 24,
    color: '#000000',
    fontFamily: 'Montserrat_600SemiBold',
  },
  descriptionSection: {
    marginTop: 24,
  },
  description: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
    opacity: 0.7,
    lineHeight: 24,
  },
  deleteRequestButton: {
    backgroundColor: 'rgba(0, 0, 0, 0.08)',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 24,
  },
  deleteRequestButtonText: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_700Bold',
  },

  deleteButtonDisabled: {
    opacity: 0.65,
  },
});

export default PaymentRequestSuccessScreen;

import AddIcon from '@/assets/icons/add.svg';
import BackIcon from '@/assets/icons/back.svg';
import CalendarIcon from '@/assets/icons/calendar1.svg';
import CancelIcon from '@/assets/icons/cancel.svg';
import CopyIcon from '@/assets/icons/document-copy.svg';
import DownloadIcon from '@/assets/icons/download.svg';
import Eyeslash from '@/assets/icons/eyeSlash.svg';
import GalleryExportIcon from '@/assets/icons/gallery-export.svg';
import LinkIcon from '@/assets/icons/link.svg';
import NairaIcon from '@/assets/icons/naira.svg';
import NotificationIcon from '@/assets/icons/notification.svg';
import PaidIcon from '@/assets/icons/paid.svg';
import PendingIcon from '@/assets/icons/pending.svg';
import RequestIcon from '@/assets/icons/request.svg';
import ShareIcon from '@/assets/icons/share.svg';
import UsernameIcon from '@/assets/icons/username.svg';
import VerifiedBadge from '@/assets/icons/verified.svg';
import WalletPlusIcon from '@/assets/icons/wallet.svg';
import Avatar from '@/assets/images/avatar.svg';
import Avatar1 from '@/assets/images/avatar1.svg';
import Avatar2 from '@/assets/images/avatar2.svg';
import Avatar3 from '@/assets/images/avatar3.svg';
import Logo from '@/assets/images/logo.svg';
import { useUserSearch } from '@/api/userDiscoveryApi';
import {
  useAccountBalance,
  useCreatePaymentRequest,
  useListPaymentRequests,
  useUserProfile,
} from '@/api/transactionApi';
import DashedBorder from '@/components/DashedBorder';
import DashedRectBorder from '@/components/DashedRectBorder';
import PartialGradientBorder from '@/components/PartialGradientBorder';
import { QRShareCard } from '@/components/QRShareCard';
import { uploadImage, type UploadImageAsset } from '@/api/supabaseClient';
import type { PaymentRequest, UserDiscoveryResult } from '@/types/api';
import type { AppNavigationProp } from '@/types/navigation';
import { formatCurrency, nairaToKobo } from '@/utils/formatCurrency';
import { normalizeUsername, usernameKey } from '@/utils/username';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as Haptics from 'expo-haptics';
import { manipulateAsync, SaveFormat } from 'expo-image-manipulator';
import * as MediaLibrary from 'expo-media-library';
import { StatusBar } from 'expo-status-bar';
import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Dimensions,
  Image,
  RefreshControl,
  SafeAreaView,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import { useNavigation } from '@react-navigation/native';
import QRCode from 'react-native-qrcode-svg';
import { SvgXml } from 'react-native-svg';
import { captureRef } from 'react-native-view-shot';

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

type AvatarComponent = React.ComponentType<{ width?: number; height?: number }>;

const avatarPool: AvatarComponent[] = [Avatar1, Avatar2, Avatar3];

type RequestType = 'general' | 'individual';
type ActiveButton = 'link' | 'request';

interface ReceiveUnifiedScreenProps {
  initialTab?: ActiveButton;
  initialShowRequestForm?: boolean;
  initialRequestType?: RequestType;
  initialRecipient?: UserDiscoveryResult | null;
  closeFormOnBack?: boolean;
}

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

const normalizeRequestStatus = (status?: string): 'pending' | 'paid' | 'declined' => {
  if (status === 'paid') {
    return 'paid';
  }
  if (status === 'declined') {
    return 'declined';
  }
  return 'pending';
};

const MAX_ALLOWED_IMAGE_BYTES = 50 * 1024 * 1024;
const TARGET_COMPRESSED_IMAGE_BYTES = 8 * 1024 * 1024;
const PRIMARY_MAX_IMAGE_DIMENSION = 1600;
const SECONDARY_MAX_IMAGE_DIMENSION = 1200;
const MAX_UPLOAD_ATTEMPTS = 3;
const SUPPORTED_IMAGE_MIME_TYPES = new Set(['image/jpeg', 'image/png']);

type UploadFailureAction = 'retry' | 'continue' | 'cancel';

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const bytesToMb = (bytes: number) => (bytes / (1024 * 1024)).toFixed(1);

const normalizeImageMimeType = (
  mimeType?: string | null,
  fileName?: string | null
): 'image/jpeg' | 'image/png' | null => {
  const normalizedMime = mimeType?.trim().toLowerCase();
  if (normalizedMime === 'image/jpeg' || normalizedMime === 'image/jpg') {
    return 'image/jpeg';
  }
  if (normalizedMime === 'image/png') {
    return 'image/png';
  }

  const lowerFileName = fileName?.trim().toLowerCase() ?? '';
  if (lowerFileName.endsWith('.jpg') || lowerFileName.endsWith('.jpeg')) {
    return 'image/jpeg';
  }
  if (lowerFileName.endsWith('.png')) {
    return 'image/png';
  }

  return null;
};

const getFileSizeFromUri = async (uri: string): Promise<number | null> => {
  try {
    const info = await FileSystem.getInfoAsync(uri);
    if (info.exists && 'size' in info && typeof info.size === 'number') {
      return info.size;
    }
  } catch {
    return null;
  }

  return null;
};

const getAssetSizeBytes = async (asset: ImagePicker.ImagePickerAsset): Promise<number | null> => {
  if (typeof asset.fileSize === 'number' && Number.isFinite(asset.fileSize)) {
    return asset.fileSize;
  }
  if (!asset.uri) {
    return null;
  }
  return getFileSizeFromUri(asset.uri);
};

const validatePickedImageAsset = async (
  asset: ImagePicker.ImagePickerAsset
): Promise<string | null> => {
  if (!asset.uri) {
    return 'Invalid image selected. Please choose another image.';
  }

  const normalizedMimeType = normalizeImageMimeType(asset.mimeType, asset.fileName);
  if (!normalizedMimeType || !SUPPORTED_IMAGE_MIME_TYPES.has(normalizedMimeType)) {
    return 'Only JPEG and PNG images are supported.';
  }

  const sizeBytes = await getAssetSizeBytes(asset);
  if (typeof sizeBytes === 'number' && sizeBytes > MAX_ALLOWED_IMAGE_BYTES) {
    return `Image is too large (${bytesToMb(sizeBytes)} MB). Maximum allowed is 50 MB.`;
  }

  return null;
};

const getResizeDimensions = (
  width: number,
  height: number,
  maxDimension: number
): { width: number; height: number } | null => {
  if (
    !Number.isFinite(width) ||
    !Number.isFinite(height) ||
    width <= 0 ||
    height <= 0 ||
    Math.max(width, height) <= maxDimension
  ) {
    return null;
  }

  const scale = maxDimension / Math.max(width, height);
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
};

const buildUploadFileName = (
  fileName: string | null | undefined,
  mimeType: 'image/jpeg' | 'image/png'
) => {
  const source = fileName?.trim() || `request-${Date.now()}`;
  const base = source
    .replace(/\.[^/.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]/g, '-')
    .slice(0, 80);
  const extension = mimeType === 'image/png' ? 'png' : 'jpg';
  return `${base || 'request'}-${Date.now()}.${extension}`;
};

const optimizeAssetForUpload = async (
  asset: ImagePicker.ImagePickerAsset
): Promise<UploadImageAsset> => {
  if (!asset.uri) {
    throw new Error('Invalid image selected.');
  }

  const normalizedMimeType = normalizeImageMimeType(asset.mimeType, asset.fileName);
  if (!normalizedMimeType) {
    throw new Error('Only JPEG and PNG images are supported.');
  }

  let outputMimeType: 'image/jpeg' | 'image/png' = normalizedMimeType;
  let manipulated = await manipulateAsync(
    asset.uri,
    (() => {
      const resize = getResizeDimensions(asset.width, asset.height, PRIMARY_MAX_IMAGE_DIMENSION);
      return resize ? [{ resize }] : [];
    })(),
    {
      compress: outputMimeType === 'image/png' ? 0.95 : 0.75,
      format: outputMimeType === 'image/png' ? SaveFormat.PNG : SaveFormat.JPEG,
    }
  );

  let optimizedSize = await getFileSizeFromUri(manipulated.uri);

  if (typeof optimizedSize === 'number' && optimizedSize > TARGET_COMPRESSED_IMAGE_BYTES) {
    const resize = getResizeDimensions(
      manipulated.width,
      manipulated.height,
      SECONDARY_MAX_IMAGE_DIMENSION
    );

    manipulated = await manipulateAsync(manipulated.uri, resize ? [{ resize }] : [], {
      compress: 0.55,
      format: SaveFormat.JPEG,
    });
    outputMimeType = 'image/jpeg';
    optimizedSize = await getFileSizeFromUri(manipulated.uri);
  }

  if (typeof optimizedSize === 'number' && optimizedSize > MAX_ALLOWED_IMAGE_BYTES) {
    throw new Error(`Image is too large after optimization (${bytesToMb(optimizedSize)} MB).`);
  }

  return {
    uri: manipulated.uri,
    fileName: buildUploadFileName(asset.fileName, outputMimeType),
    type: outputMimeType,
  };
};

const uploadImageWithRetry = async (
  uploadAsset: UploadImageAsset,
  maxAttempts = MAX_UPLOAD_ATTEMPTS
): Promise<string> => {
  let attempt = 0;
  let lastError: unknown = null;

  while (attempt < maxAttempts) {
    try {
      return await uploadImage(uploadAsset);
    } catch (error) {
      lastError = error;
      attempt += 1;

      if (attempt < maxAttempts) {
        await sleep(500 * attempt);
      }
    }
  }

  if (lastError instanceof Error) {
    throw lastError;
  }
  throw new Error('Could not upload selected image.');
};

const getReadableUploadErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : 'Could not upload selected image.';
  const lower = message.toLowerCase();

  if (
    lower.includes('network') ||
    lower.includes('fetch') ||
    lower.includes('connection') ||
    lower.includes('timeout')
  ) {
    return 'Network issue while uploading image. Check your connection and try again.';
  }

  if (
    lower.includes('permission') ||
    lower.includes('not allowed') ||
    lower.includes('policy') ||
    lower.includes('row-level') ||
    lower.includes('rls')
  ) {
    return 'Image upload permission is not configured for this account yet.';
  }

  if (lower.includes('413') || lower.includes('payload') || lower.includes('too large')) {
    return 'Image is too large to upload. Please choose a smaller image.';
  }

  return message;
};

const promptUploadFailureAction = (message: string): Promise<UploadFailureAction> =>
  new Promise((resolve) => {
    Alert.alert(
      'Upload failed',
      `${message}\n\nYou can retry or continue without an image.`,
      [
        { text: 'Cancel', style: 'cancel', onPress: () => resolve('cancel') },
        { text: 'Continue without image', onPress: () => resolve('continue') },
        { text: 'Retry', onPress: () => resolve('retry') },
      ],
      { cancelable: false }
    );
  });

const ReceiveUnifiedScreen = ({
  initialTab = 'request',
  initialShowRequestForm = false,
  initialRequestType = 'general',
  initialRecipient = null,
  closeFormOnBack = true,
}: ReceiveUnifiedScreenProps) => {
  const navigation = useNavigation<AppNavigationProp>();

  const [balanceVisible, setBalanceVisible] = useState(true);
  const [activeButton, setActiveButton] = useState<ActiveButton>(initialTab);
  const [linkButtonDimensions, setLinkButtonDimensions] = useState({ width: 0, height: 0 });
  const [requestButtonDimensions, setRequestButtonDimensions] = useState({ width: 0, height: 0 });

  const [showRequestForm, setShowRequestForm] = useState(initialShowRequestForm);
  const [requestType, setRequestType] = useState<RequestType>(initialRequestType);
  const [recipientUsername, setRecipientUsername] = useState('');
  const [selectedRecipient, setSelectedRecipient] = useState<UserDiscoveryResult | null>(null);
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const [description, setDescription] = useState('');
  const [focusedInput, setFocusedInput] = useState<string | null>(null);
  const [selectedImage, setSelectedImage] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [uploadAreaDimensions, setUploadAreaDimensions] = useState({ width: 0, height: 0 });

  const [isUploading, setIsUploading] = useState(false);
  const [downloading, setDownloading] = useState(false);

  const cardRef = useRef<View>(null);

  const { data: profile } = useUserProfile();
  const {
    data: balanceData,
    isLoading: isLoadingBalance,
    refetch: refetchBalance,
  } = useAccountBalance();

  const {
    data: latestRequests,
    isLoading: isLoadingRequests,
    isError: isRequestsError,
    error: requestsError,
    refetch: refetchRequests,
    isRefetching,
  } = useListPaymentRequests({ limit: 3, offset: 0 });

  const { mutateAsync: createPaymentRequest, isPending: isCreatingRequest } =
    useCreatePaymentRequest();

  const isSubmittingRequest = isUploading || isCreatingRequest;

  const displayUsername = normalizeUsername(profile?.username || 'new_user');
  const balance = balanceData?.available_balance ?? 0;
  const outgoingRequests = latestRequests ?? [];

  const searchQuery =
    requestType === 'individual' && !selectedRecipient ? recipientUsername.trim() : '';
  const { data: searchData, isLoading: isSearching } = useUserSearch(searchQuery, 10);

  const searchResults = useMemo(() => {
    if (!searchQuery) {
      return [] as UserDiscoveryResult[];
    }

    return (searchData?.users ?? [])
      .filter((user) => usernameKey(user.username) !== usernameKey(displayUsername))
      .slice(0, 5);
  }, [displayUsername, searchData?.users, searchQuery]);

  const selectedRecipientName = selectedRecipient
    ? normalizeUsername(selectedRecipient.username)
    : '';
  const SelectedRecipientAvatar = selectedRecipient
    ? pickAvatarComponent(selectedRecipientName || selectedRecipient.id)
    : null;

  useEffect(() => {
    if (!initialRecipient) {
      return;
    }

    setActiveButton('request');
    setShowRequestForm(true);
    setRequestType('individual');
    setSelectedRecipient(initialRecipient);
    setRecipientUsername(normalizeUsername(initialRecipient.username));
  }, [initialRecipient]);

  useEffect(() => {
    if (initialShowRequestForm) {
      setActiveButton('request');
      setShowRequestForm(true);
    }
  }, [initialShowRequestForm]);

  const isFormValid =
    requestType === 'individual'
      ? recipientUsername.trim().length > 0 && title.trim().length > 0 && amount.trim().length > 0
      : title.trim().length > 0 && amount.trim().length > 0;

  const myLinkUrl = `https://TryTransfa.com/${displayUsername}`;
  const qrCodeValue = myLinkUrl;

  const handleBackPress = () => {
    if (showRequestForm && closeFormOnBack) {
      setShowRequestForm(false);
      return;
    }
    navigation.goBack();
  };

  const handleCopyLink = async () => {
    await Clipboard.setStringAsync(myLinkUrl);
    Alert.alert('Copied', 'Link copied to clipboard');
  };

  const handleShareLink = async () => {
    try {
      await Share.share({
        message: myLinkUrl,
        url: myLinkUrl,
      });
    } catch {
      await Clipboard.setStringAsync(myLinkUrl);
      Alert.alert('Copied', 'Link copied to clipboard');
    }
  };

  const handleDownloadQR = async () => {
    try {
      setDownloading(true);
      await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

      const { status } = await MediaLibrary.requestPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          'Permission Required',
          'Transfa needs gallery permission to save your profile card.'
        );
        return;
      }

      if (!cardRef.current) {
        throw new Error('Card is not ready yet.');
      }

      const uri = await captureRef(cardRef, {
        format: 'png',
        quality: 1.0,
      });

      const asset = await MediaLibrary.createAssetAsync(uri);
      try {
        await MediaLibrary.createAlbumAsync('Transfa', asset, false);
      } catch {
        // Asset is already saved even if album creation fails.
      }

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      Alert.alert('Saved!', 'Your premium profile QR card has been saved to your gallery.');
    } catch {
      Alert.alert('Error', 'Failed to save QR card. Please try again.');
    } finally {
      setDownloading(false);
    }
  };

  const handleImagePicker = async () => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (permission.status !== 'granted') {
      Alert.alert('Permission required', 'Allow photo library access to upload images.');
      return;
    }

    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      aspect: [4, 3],
      quality: 0.8,
    });

    if (!result.canceled && result.assets[0]) {
      const pickedAsset = result.assets[0];
      const validationError = await validatePickedImageAsset(pickedAsset);
      if (validationError) {
        Alert.alert('Invalid image', validationError);
        return;
      }

      setSelectedImage(pickedAsset);
    }
  };

  const handleSelectRecipient = (user: UserDiscoveryResult) => {
    setSelectedRecipient(user);
    setRecipientUsername(normalizeUsername(user.username));
  };

  const handleClearRecipientSelection = () => {
    setSelectedRecipient(null);
    setRecipientUsername('');
  };

  const handleRecipientInputChange = (value: string) => {
    setRecipientUsername(value);
    if (selectedRecipient) {
      const selectedName = normalizeUsername(selectedRecipient.username).toLowerCase();
      if (selectedName !== value.trim().toLowerCase()) {
        setSelectedRecipient(null);
      }
    }
  };

  const resetForm = () => {
    setTitle('');
    setAmount('');
    setDescription('');
    setSelectedImage(null);
    setFocusedInput(null);
    if (requestType === 'individual') {
      setRecipientUsername('');
      setSelectedRecipient(null);
    }
  };

  const handleSubmitRequest = async () => {
    if (!isFormValid || isSubmittingRequest) {
      return;
    }

    const trimmedTitle = title.trim();
    const amountNumber = parseFloat(amount.replace(/,/g, '').trim());
    const amountKobo = nairaToKobo(amountNumber);

    if (trimmedTitle.length < 3) {
      Alert.alert('Invalid title', 'Please enter a request title (at least 3 characters).');
      return;
    }

    if (!Number.isFinite(amountKobo) || amountKobo <= 0) {
      Alert.alert('Invalid amount', 'Please enter a valid amount.');
      return;
    }

    let recipient: string | undefined;
    if (requestType === 'individual') {
      if (!selectedRecipient) {
        Alert.alert('Select recipient', 'Select a user from search results to continue.');
        return;
      }

      recipient = normalizeUsername(selectedRecipient.username);
      if (usernameKey(recipient) === usernameKey(displayUsername)) {
        Alert.alert('Invalid recipient', 'You cannot create an individual request for yourself.');
        return;
      }
    }

    const trimmedDescription = description.trim();

    let imageURL: string | undefined;
    if (selectedImage) {
      try {
        const validationError = await validatePickedImageAsset(selectedImage);
        if (validationError) {
          Alert.alert('Invalid image', validationError);
          return;
        }

        const uploadAsset = await optimizeAssetForUpload(selectedImage);

        while (true) {
          setIsUploading(true);
          try {
            imageURL = await uploadImageWithRetry(uploadAsset);
            setIsUploading(false);
            break;
          } catch (uploadError) {
            setIsUploading(false);
            const action = await promptUploadFailureAction(
              getReadableUploadErrorMessage(uploadError)
            );

            if (action === 'retry') {
              continue;
            }
            if (action === 'continue') {
              imageURL = undefined;
              break;
            }

            return;
          }
        }
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : 'Could not process selected image for upload.';
        Alert.alert('Image processing failed', message);
        return;
      }
    }

    try {
      const created = await createPaymentRequest({
        request_type: requestType,
        title: trimmedTitle,
        recipient_username: requestType === 'individual' ? recipient : undefined,
        amount: amountKobo,
        description: trimmedDescription.length > 0 ? trimmedDescription : undefined,
        image_url: imageURL,
      });

      resetForm();
      navigation.replace('PaymentRequestSuccess', { requestId: created.id });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Could not create payment request.';
      Alert.alert('Request failed', message);
    }
  };

  const onRefresh = async () => {
    await Promise.all([refetchRequests(), refetchBalance()]);
  };

  const renderRequestStatus = (item: PaymentRequest) => {
    const normalized = normalizeRequestStatus(item.display_status);

    if (normalized === 'paid') {
      return (
        <View style={styles.paidBadge}>
          <PaidIcon width={10} height={10} color="#FFFFFF" />
          <Text style={styles.paidText}>Paid</Text>
        </View>
      );
    }

    if (normalized === 'declined') {
      return (
        <View style={styles.declinedBadge}>
          <CancelIcon width={10} height={10} />
          <Text style={styles.declinedText}>Declined</Text>
        </View>
      );
    }

    return (
      <View style={styles.pendingBadge}>
        <PendingIcon width={10} height={10} />
        <Text style={styles.pendingText}>Pending</Text>
      </View>
    );
  };

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
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={onRefresh}
            tintColor="#FFFFFF"
            colors={['#FFFFFF']}
          />
        }
      >
        <View style={styles.headerContainer}>
          <TouchableOpacity onPress={handleBackPress} style={styles.backButton}>
            <BackIcon width={24} height={24} />
          </TouchableOpacity>

          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <View>
                <Avatar width={44} height={44} />
              </View>
              <View style={styles.usernameWrapper}>
                <View style={styles.usernameRow}>
                  <Text style={styles.username}>{displayUsername}</Text>
                  <VerifiedBadge width={14} height={14} />
                </View>
              </View>
            </View>
            <View style={styles.headerRight}>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => navigation.navigate('NotificationCenter')}
              >
                <WalletPlusIcon width={20} height={20} />
              </TouchableOpacity>
              <TouchableOpacity
                style={styles.iconButton}
                onPress={() => navigation.navigate('NotificationCenter')}
              >
                <NotificationIcon width={20} height={20} />
              </TouchableOpacity>
            </View>
          </View>
        </View>

        <View style={styles.balanceSection}>
          <Text style={styles.balanceLabel}>AVAILABLE BALANCE</Text>
          <View style={styles.balanceRow}>
            {isLoadingBalance ? (
              <ActivityIndicator size="small" color="#FFD300" />
            ) : (
              <Text style={styles.balanceAmount}>
                {balanceVisible ? formatCurrency(balance) : '••••••••'}
              </Text>
            )}
            <TouchableOpacity
              onPress={() => setBalanceVisible(!balanceVisible)}
              style={styles.eyeButton}
            >
              <Eyeslash width={20} height={20} />
            </TouchableOpacity>
          </View>
        </View>

        <View style={styles.actionButtons}>
          <View
            style={styles.actionButtonWrapper}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setLinkButtonDimensions({ width, height });
            }}
          >
            <TouchableOpacity
              style={[styles.actionButton, activeButton === 'link' && styles.actionButtonActive]}
              onPress={() => setActiveButton('link')}
            >
              <View>
                <LinkIcon width={24} height={24} color="#FFFFFF" />
              </View>
              <Text
                style={[
                  styles.actionButtonText,
                  activeButton === 'link' && styles.actionButtonTextActive,
                ]}
              >
                My Link
              </Text>
            </TouchableOpacity>
            <PartialGradientBorder
              width={linkButtonDimensions.width}
              height={linkButtonDimensions.height}
              borderRadius={10}
              visible={activeButton === 'link'}
            />
          </View>

          <View
            style={styles.actionButtonWrapper}
            onLayout={(event) => {
              const { width, height } = event.nativeEvent.layout;
              setRequestButtonDimensions({ width, height });
            }}
          >
            <TouchableOpacity
              style={[styles.actionButton, activeButton === 'request' && styles.actionButtonActive]}
              onPress={() => setActiveButton('request')}
            >
              <View>
                <RequestIcon width={24} height={24} color="#FFFFFF" />
              </View>
              <Text
                style={[
                  styles.actionButtonText,
                  activeButton === 'request' && styles.actionButtonTextActive,
                ]}
              >
                Request
              </Text>
            </TouchableOpacity>
            <PartialGradientBorder
              width={requestButtonDimensions.width}
              height={requestButtonDimensions.height}
              borderRadius={10}
              visible={activeButton === 'request'}
            />
          </View>
        </View>

        <View style={styles.sectionDivider} />

        {activeButton === 'link' ? (
          <>
            <View style={styles.qrSection}>
              <View style={styles.qrCard}>
                <View style={styles.qrCodeContainer}>
                  <QRCode
                    value={qrCodeValue}
                    size={200}
                    color="#FFFFFF"
                    backgroundColor="#333333"
                  />
                  <View style={styles.qrCenterIcon}>
                    <Logo width={40} height={40} />
                  </View>
                </View>
              </View>
              <TouchableOpacity
                style={[styles.downloadButton, downloading && { opacity: 0.6 }]}
                onPress={handleDownloadQR}
                disabled={downloading}
              >
                <DownloadIcon width={20} height={20} color="#FFF" />
                <Text style={styles.downloadButtonText}>
                  {downloading ? 'Downloading...' : 'Download'}
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.linkSection}>
              <Text style={styles.sectionTitle}>Sharable Link</Text>
              <TouchableOpacity
                style={styles.linkContainer}
                onPress={handleCopyLink}
                activeOpacity={0.7}
              >
                <CopyIcon width={20} height={20} />
                <Text style={styles.linkText} numberOfLines={1}>
                  {myLinkUrl}
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.shareButton} onPress={handleShareLink}>
                <ShareIcon width={19} height={20} />
                <Text style={styles.shareButtonText}>Share Link</Text>
              </TouchableOpacity>
            </View>
          </>
        ) : !showRequestForm ? (
          <View style={styles.outgoingRequestsSection}>
            <View style={styles.sectionHeader}>
              <Text style={styles.sectionTitle}>Outgoing requests</Text>
              <TouchableOpacity
                style={styles.historyButton}
                onPress={() => navigation.navigate('PaymentRequestHistory')}
              >
                <Text style={styles.historyButtonText}>Show more</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.requestsList}>
              {isLoadingRequests && outgoingRequests.length === 0 ? (
                <View style={styles.stateWrap}>
                  <ActivityIndicator size="small" color="#FFFFFF" />
                </View>
              ) : isRequestsError && outgoingRequests.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    {requestsError?.message || 'Unable to load outgoing requests.'}
                  </Text>
                </View>
              ) : outgoingRequests.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No outgoing requests yet.</Text>
                </View>
              ) : (
                outgoingRequests.map((request) => {
                  const isGeneral = request.request_type === 'general';
                  const name = isGeneral
                    ? 'General Request'
                    : normalizeUsername(request.recipient_username || 'Transfa User');
                  const AvatarComponent = pickAvatarComponent(name || request.id);

                  return (
                    <TouchableOpacity
                      key={request.id}
                      style={styles.requestCard}
                      activeOpacity={0.86}
                      onPress={() =>
                        navigation.navigate('PaymentRequestSuccess', { requestId: request.id })
                      }
                    >
                      <View style={styles.requestLeft}>
                        {isGeneral ? (
                          <View style={styles.generalRequestIcon}>
                            <DashedBorder
                              size={48}
                              borderWidth={2}
                              color="#000000"
                              dashCount={18}
                              gapRatio={0.7}
                            />
                            <RequestIcon width={24} height={24} color="#000000" />
                          </View>
                        ) : (
                          <View style={styles.requestAvatarContainer}>
                            <AvatarComponent width={48} height={48} />
                          </View>
                        )}

                        <View style={styles.requestInfo}>
                          <View style={styles.requestNameRow}>
                            <Text style={styles.requestName} numberOfLines={1}>
                              {name}
                            </Text>
                            {!isGeneral ? <VerifiedBadge width={16} height={16} /> : null}
                          </View>
                          <Text style={styles.requestAmount}>{formatCurrency(request.amount)}</Text>
                          <View style={styles.requestDateRow}>
                            <CalendarIcon width={14} height={14} color="#000000" />
                            <Text style={styles.requestDate}>
                              {formatRequestDate(request.created_at)}
                            </Text>
                          </View>
                        </View>
                      </View>

                      <View style={styles.requestStatus}>{renderRequestStatus(request)}</View>
                    </TouchableOpacity>
                  );
                })
              )}
            </View>

            <View style={styles.sectionDivider} />

            <TouchableOpacity
              style={styles.createRequestButton}
              onPress={() => setShowRequestForm(true)}
            >
              <AddIcon width={20} height={20} color="#6C6B6B" />
              <Text style={styles.createRequestButtonText}>Create Request</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <View style={styles.requestFormSection}>
            <View style={styles.requestTypeSelector}>
              <TouchableOpacity
                style={[
                  styles.requestTypeButton,
                  requestType === 'general' && styles.requestTypeButtonActive,
                ]}
                onPress={() => {
                  setRequestType('general');
                  setRecipientUsername('');
                  setSelectedRecipient(null);
                }}
              >
                <Text
                  style={[
                    styles.requestTypeText,
                    requestType === 'general' && styles.requestTypeTextActive,
                  ]}
                >
                  General Request
                </Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[
                  styles.requestTypeButton,
                  requestType === 'individual' && styles.requestTypeButtonActive,
                ]}
                onPress={() => setRequestType('individual')}
              >
                <Text
                  style={[
                    styles.requestTypeText,
                    requestType === 'individual' && styles.requestTypeTextActive,
                  ]}
                >
                  Individual Request
                </Text>
              </TouchableOpacity>
            </View>

            <View style={styles.formFields}>
              {requestType === 'individual' ? (
                <View style={styles.formFieldGroup}>
                  <Text style={styles.formFieldLabel}>Username</Text>
                  {!selectedRecipient ? (
                    <View
                      style={[
                        styles.formInputWrapper,
                        focusedInput === 'username' && styles.formInputWrapperFocused,
                      ]}
                    >
                      <View style={styles.usernameIconContainer}>
                        <UsernameIcon width={20} height={21} />
                      </View>
                      <TextInput
                        style={styles.formInput}
                        placeholder="Enter Username"
                        placeholderTextColor="rgba(255, 255, 255, 0.32)"
                        value={recipientUsername}
                        onChangeText={handleRecipientInputChange}
                        autoCapitalize="none"
                        onFocus={() => setFocusedInput('username')}
                        onBlur={() => setFocusedInput(null)}
                      />
                    </View>
                  ) : (
                    <View style={[styles.searchResultCard, styles.selectedRecipientCard]}>
                      <View style={styles.searchResultAvatarWrap}>
                        {SelectedRecipientAvatar ? (
                          <SelectedRecipientAvatar width={40} height={40} />
                        ) : null}
                      </View>
                      <View style={styles.searchResultTextWrap}>
                        <View style={styles.selectedRecipientUsernameRow}>
                          <Text style={styles.searchResultUsername}>{selectedRecipientName}</Text>
                          <VerifiedBadge width={15} height={15} />
                        </View>
                        <Text style={styles.searchResultFullName} numberOfLines={1}>
                          {selectedRecipient.full_name || 'Transfa User'}
                        </Text>
                      </View>
                      <TouchableOpacity
                        style={styles.selectedRecipientCancelButton}
                        onPress={handleClearRecipientSelection}
                        activeOpacity={0.7}
                      >
                        <CancelIcon width={18} height={18} />
                      </TouchableOpacity>
                    </View>
                  )}

                  {!selectedRecipient && searchQuery.length > 0 ? (
                    isSearching ? (
                      <View style={styles.searchResultsState}>
                        <ActivityIndicator size="small" color="#FFD300" />
                      </View>
                    ) : searchResults.length === 0 ? (
                      <View style={styles.searchResultsState}>
                        <Text style={styles.searchEmptyText}>No users found.</Text>
                      </View>
                    ) : (
                      <View style={styles.searchResultsList}>
                        {searchResults.map((user) => {
                          const userName = normalizeUsername(user.username);
                          const UserAvatarComponent = pickAvatarComponent(userName || user.id);

                          return (
                            <TouchableOpacity
                              key={user.id}
                              style={styles.searchResultCard}
                              onPress={() => handleSelectRecipient(user)}
                              activeOpacity={0.86}
                            >
                              <View style={styles.searchResultAvatarWrap}>
                                <UserAvatarComponent width={40} height={40} />
                              </View>
                              <View style={styles.searchResultTextWrap}>
                                <Text style={styles.searchResultUsername}>{userName}</Text>
                                <Text style={styles.searchResultFullName} numberOfLines={1}>
                                  {user.full_name || 'Transfa User'}
                                </Text>
                              </View>
                              <VerifiedBadge width={15} height={15} />
                            </TouchableOpacity>
                          );
                        })}
                      </View>
                    )
                  ) : null}
                </View>
              ) : null}

              <View style={styles.formFieldGroup}>
                <Text style={styles.formFieldLabel}>Title</Text>
                <View
                  style={[
                    styles.formInputWrapper,
                    focusedInput === 'title' && styles.formInputWrapperFocused,
                  ]}
                >
                  <TextInput
                    style={styles.formInput}
                    placeholder="Add title"
                    placeholderTextColor="rgba(255, 255, 255, 0.32)"
                    value={title}
                    onChangeText={setTitle}
                    onFocus={() => setFocusedInput('title')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </View>
              </View>

              <View style={styles.formFieldGroup}>
                <Text style={styles.formFieldLabel}>Amount</Text>
                <View
                  style={[
                    styles.formInputWrapper,
                    focusedInput === 'amount' && styles.formInputWrapperFocused,
                  ]}
                >
                  <View style={styles.nairaIconContainer}>
                    <NairaIcon width={17} height={15} color="#FFFFFF" />
                  </View>
                  <TextInput
                    style={styles.formInput}
                    placeholder="Amount"
                    placeholderTextColor="rgba(255, 255, 255, 0.32)"
                    value={amount}
                    onChangeText={setAmount}
                    keyboardType="numeric"
                    onFocus={() => setFocusedInput('amount')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </View>
              </View>

              <View style={styles.formFieldGroup}>
                <Text style={styles.formFieldLabel}>Description</Text>
                <View
                  style={[
                    styles.formTextAreaWrapper,
                    focusedInput === 'description' && styles.formInputWrapperFocused,
                  ]}
                >
                  <TextInput
                    style={styles.formTextArea}
                    placeholder="Add description"
                    placeholderTextColor="rgba(255, 255, 255, 0.32)"
                    value={description}
                    onChangeText={setDescription}
                    multiline
                    numberOfLines={4}
                    onFocus={() => setFocusedInput('description')}
                    onBlur={() => setFocusedInput(null)}
                  />
                </View>
              </View>

              <View style={styles.formFieldGroup}>
                <Text style={styles.formFieldLabel}>Upload image (Optional)</Text>
                <View
                  style={styles.uploadAreaWrapper}
                  onLayout={(event) => {
                    const { width, height } = event.nativeEvent.layout;
                    setUploadAreaDimensions({ width, height });
                  }}
                >
                  <TouchableOpacity
                    style={[styles.uploadArea, selectedImage && styles.uploadAreaWithImage]}
                    activeOpacity={0.8}
                    onPress={handleImagePicker}
                  >
                    {selectedImage?.uri ? (
                      <Image
                        source={{ uri: selectedImage.uri }}
                        style={styles.uploadedImage}
                        resizeMode="cover"
                      />
                    ) : (
                      <View style={styles.uploadContent}>
                        <GalleryExportIcon width={48} height={48} />
                        <Text style={styles.uploadText}>Choose a file or drag & drop it here</Text>
                        <Text style={styles.uploadSubtext}>JPEG & PNG formats, up to 50mb</Text>
                      </View>
                    )}
                  </TouchableOpacity>
                  {uploadAreaDimensions.width > 0 && uploadAreaDimensions.height > 0 ? (
                    <DashedRectBorder
                      width={uploadAreaDimensions.width}
                      height={uploadAreaDimensions.height}
                      borderRadius={12}
                      borderWidth={2}
                      color="#6C6B6B"
                      dashCount={150}
                      gapRatio={0.5}
                    />
                  ) : null}
                </View>
              </View>
            </View>

            {isUploading ? (
              <View style={styles.uploadingState}>
                <ActivityIndicator size="small" color="#FFD300" />
                <Text style={styles.uploadingText}>Uploading image...</Text>
              </View>
            ) : null}

            <TouchableOpacity
              style={[
                styles.submitRequestButton,
                !isFormValid && styles.submitRequestButtonDisabled,
              ]}
              disabled={!isFormValid || isSubmittingRequest}
              onPress={handleSubmitRequest}
            >
              {isCreatingRequest ? (
                <ActivityIndicator size="small" color="#000000" />
              ) : (
                <Text style={styles.submitRequestButtonText}>
                  {requestType === 'individual' ? 'Send request' : 'Create request'}
                </Text>
              )}
            </TouchableOpacity>
          </View>
        )}
      </ScrollView>

      <View style={styles.hiddenCardContainer} pointerEvents="none">
        <QRShareCard ref={cardRef} type="profile" value={qrCodeValue} username={displayUsername} />
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
  hiddenCardContainer: {
    position: 'absolute',
    top: -9999,
    left: -9999,
  },
  headerContainer: {
    marginBottom: 24,
  },
  backButton: {
    marginBottom: 20,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    gap: 16,
  },
  iconButton: {
    padding: 4,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  usernameWrapper: {
    flexShrink: 1,
  },
  username: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
  },
  balanceSection: {
    alignItems: 'flex-start',
    marginBottom: 32,
  },
  balanceLabel: {
    fontSize: 12,
    color: '#FFFFFF',
    marginBottom: 8,
    fontFamily: 'Montserrat_400Regular',
    letterSpacing: 1.2,
  },
  balanceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    width: '100%',
    gap: 12,
  },
  balanceAmount: {
    fontSize: 36,
    fontWeight: 'bold',
    color: '#FFFFFF',
    fontFamily: 'ArtificTrial-Semibold',
  },
  eyeButton: {
    padding: 4,
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 16,
  },
  actionButtonWrapper: {
    flex: 1,
    position: 'relative',
  },
  actionButton: {
    flex: 1,
    flexDirection: 'row',
    backgroundColor: '#333333',
    borderRadius: 10,
    paddingVertical: 14,
    paddingHorizontal: 12,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    gap: 8,
  },
  actionButtonActive: {},
  actionButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
  },
  actionButtonTextActive: {},
  stateWrap: {
    marginTop: 12,
    alignItems: 'center',
  },
  emptyCard: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 16,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 13,
    color: '#D6D6D7',
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
  },
  outgoingRequestsSection: {
    marginBottom: 20,
  },
  sectionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  sectionTitle: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
    marginBottom: 16,
  },
  historyButton: {
    backgroundColor: '#333333',
    borderRadius: 12,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  historyButtonText: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
  },
  requestsList: {
    gap: 12,
  },
  requestCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 10,
    padding: 16,
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  requestLeft: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 12,
    flex: 1,
  },
  requestAvatarContainer: {
    width: 48,
    height: 48,
  },
  generalRequestIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    position: 'relative',
  },
  requestInfo: {
    flex: 1,
  },
  requestNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    marginBottom: 8,
    marginTop: 4,
  },
  requestName: {
    fontSize: 18,
    color: '#000000',
    fontFamily: 'Montserrat_700Bold',
    maxWidth: 140,
  },
  requestAmount: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_500Medium',
    marginBottom: 6,
  },
  requestDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  requestDate: {
    fontSize: 14,
    color: '#000000',
    fontFamily: 'Montserrat_400Regular',
  },
  requestStatus: {
    alignItems: 'flex-end',
    marginLeft: 10,
  },
  pendingBadge: {
    backgroundColor: '#FEF5CB',
    borderRadius: 21,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  pendingText: {
    fontSize: 12,
    color: '#EBB351',
    fontFamily: 'Montserrat_600SemiBold',
  },
  paidBadge: {
    backgroundColor: '#CBF9BD',
    borderRadius: 21,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  paidText: {
    fontSize: 12,
    color: '#33DA00',
    fontFamily: 'Montserrat_600SemiBold',
  },
  declinedBadge: {
    backgroundColor: '#FFCDCD',
    borderRadius: 21,
    paddingHorizontal: 12,
    paddingVertical: 6,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  declinedText: {
    fontSize: 12,
    color: '#FF3737',
    fontFamily: 'Montserrat_600SemiBold',
  },
  createRequestButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderColor: '#6C6B6B',
    borderWidth: 1,
    borderRadius: 12,
    paddingVertical: 14,
    paddingHorizontal: 16,
    gap: 10,
    marginTop: 8,
  },
  createRequestButtonText: {
    fontSize: 18,
    color: '#6C6B6B',
    fontFamily: 'Montserrat_600SemiBold',
  },
  sectionDivider: {
    height: 1,
    backgroundColor: '#6C6B6B',
    marginTop: 25,
    marginBottom: 25,
  },
  requestFormSection: {
    marginBottom: 20,
  },
  requestTypeSelector: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'transparent',
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.22)',
    padding: 2,
    marginBottom: 24,
  },
  requestTypeButton: {
    flex: 1,
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestTypeButtonActive: {
    backgroundColor: '#333333',
  },
  requestTypeText: {
    fontSize: 14,
    color: '#6C6B6B',
    fontFamily: 'Montserrat_600SemiBold',
  },
  requestTypeTextActive: {
    color: '#FFFFFF',
  },
  formFields: {
    gap: 20,
    marginBottom: 32,
  },
  formFieldGroup: {
    marginBottom: 0,
  },
  formFieldLabel: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 8,
  },
  formInputWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333333',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    minHeight: 56,
  },
  formInputWrapperFocused: {
    borderColor: 'rgba(255, 211, 0, 0.5)',
  },
  formInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  nairaIconContainer: {
    marginRight: 8,
  },
  usernameIconContainer: {
    marginRight: 8,
  },
  formTextAreaWrapper: {
    backgroundColor: '#333333',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
    minHeight: 100,
  },
  formTextArea: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
    textAlignVertical: 'top',
    minHeight: 72,
  },
  uploadAreaWrapper: {
    position: 'relative',
    minHeight: 200,
  },
  uploadArea: {
    backgroundColor: '#333333',
    borderRadius: 12,
    padding: 32,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 200,
    overflow: 'hidden',
  },
  uploadAreaWithImage: {
    padding: 0,
  },
  uploadContent: {
    alignItems: 'center',
    justifyContent: 'center',
    gap: 12,
  },
  uploadedImage: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    width: '100%',
    height: '100%',
  },
  uploadText: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.32)',
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
  },
  uploadSubtext: {
    fontSize: 14,
    color: 'rgba(255, 255, 255, 0.32)',
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
  },
  submitRequestButton: {
    backgroundColor: '#FFD300',
    borderRadius: 12,
    paddingVertical: 16,
    paddingHorizontal: 24,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 8,
  },
  submitRequestButtonDisabled: {
    opacity: 0.4,
  },
  submitRequestButtonText: {
    fontSize: 16,
    color: '#000000',
    fontFamily: 'Montserrat_700Bold',
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
    backgroundColor: '#333333',
    padding: 16,
    marginBottom: 16,
    width: 232,
    height: 232,
    alignItems: 'center',
    justifyContent: 'center',
  },
  qrCenterIcon: {
    position: 'absolute',
    width: 32,
    height: 32,
    backgroundColor: '#333333',
    alignItems: 'center',
    justifyContent: 'center',
    top: '50%',
    left: '50%',
    marginLeft: -16,
    marginTop: -16,
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
  linkContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
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
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
    flex: 1,
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
  searchResultsList: {
    marginTop: 10,
    gap: 8,
  },
  searchResultCard: {
    minHeight: 60,
    borderRadius: 10,
    backgroundColor: '#FFFFFF',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  searchResultAvatarWrap: {
    width: 40,
    height: 40,
    borderRadius: 10,
    overflow: 'hidden',
    justifyContent: 'center',
    alignItems: 'center',
  },
  searchResultTextWrap: {
    flex: 1,
  },
  searchResultUsername: {
    fontSize: 15,
    color: '#17181B',
    fontFamily: 'Montserrat_700Bold',
  },
  searchResultFullName: {
    marginTop: 1,
    color: '#5F6268',
    fontSize: 12,
    fontFamily: 'Montserrat_400Regular',
  },
  searchResultsState: {
    marginTop: 10,
    alignItems: 'center',
  },
  searchEmptyText: {
    color: 'rgba(255, 255, 255, 0.55)',
    fontFamily: 'Montserrat_400Regular',
    fontSize: 13,
  },
  selectedRecipientCard: {
    marginTop: 10,
    minHeight: 60,
  },
  selectedRecipientUsernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
  },
  selectedRecipientCancelButton: {
    padding: 4,
    marginLeft: 8,
  },
  uploadingState: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginBottom: 8,
  },
  uploadingText: {
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
    fontSize: 13,
  },
});

export default ReceiveUnifiedScreen;

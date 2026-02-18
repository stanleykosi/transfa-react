import React, { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';
import QRCode from 'react-native-qrcode-svg';
import * as Clipboard from 'expo-clipboard';
import * as FileSystem from 'expo-file-system/legacy';
import * as MediaLibrary from 'expo-media-library';

import { useAccountBalance, useListPaymentRequests, useUserProfile } from '@/api/transactionApi';
import { AppStackParamList } from '@/navigation/AppStack';
import type { PaymentRequest } from '@/types/api';
import { formatCurrency } from '@/utils/formatCurrency';
import { normalizeUsername } from '@/utils/username';

const BRAND_YELLOW = '#FFD300';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const stripUsernamePrefix = (value?: string | null) => normalizeUsername(value || 'new_user');

const formatRequestDate = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const RequestStatusPill = ({ status }: { status: PaymentRequest['display_status'] }) => {
  const normalized = status === 'paid' || status === 'declined' ? status : 'pending';
  const bgColor =
    normalized === 'paid'
      ? '#BFF2B6'
      : normalized === 'declined'
        ? '#FFCACA'
        : 'rgba(255, 211, 0, 0.28)';
  const textColor =
    normalized === 'paid' ? '#25A641' : normalized === 'declined' ? '#F14D4D' : '#D8A700';

  return (
    <View style={[styles.statusPill, { backgroundColor: bgColor }]}>
      <Ionicons
        name={
          normalized === 'paid'
            ? 'checkmark-circle'
            : normalized === 'declined'
              ? 'close-circle'
              : 'time'
        }
        size={10}
        color={textColor}
      />
      <Text style={[styles.statusText, { color: textColor }]}>
        {normalized === 'paid' ? 'Paid' : normalized === 'declined' ? 'Declined' : 'Pending'}
      </Text>
    </View>
  );
};

const OutgoingRequestCard = ({ item, onPress }: { item: PaymentRequest; onPress: () => void }) => {
  const isGeneral = item.request_type === 'general';
  const username = stripUsernamePrefix(item.recipient_username);
  const fullName = item.recipient_full_name?.trim() || item.title;

  return (
    <TouchableOpacity style={styles.requestCard} activeOpacity={0.86} onPress={onPress}>
      <View style={styles.requestCardLeft}>
        <View style={[styles.cardAvatar, isGeneral && styles.generalAvatar]}>
          {isGeneral ? (
            <Ionicons name="qr-code-outline" size={16} color="#222326" />
          ) : (
            <Text style={styles.cardAvatarInitial}>{username.slice(0, 1).toUpperCase()}</Text>
          )}
        </View>

        <View style={styles.requestTextWrap}>
          <View style={styles.requestTitleRow}>
            <Text style={styles.requestTitle} numberOfLines={1}>
              {isGeneral ? 'General Request' : username}
            </Text>
            {!isGeneral ? (
              <View style={styles.lockBadge}>
                <Ionicons name="lock-closed" size={8} color="#090909" />
              </View>
            ) : null}
          </View>

          <Text style={styles.requestAmount}>{formatCurrency(item.amount)}</Text>

          <View style={styles.dateRow}>
            <Ionicons name="calendar-outline" size={11} color="#7A7D84" />
            <Text style={styles.requestDate}>{formatRequestDate(item.created_at)}</Text>
          </View>

          {!isGeneral ? (
            <Text style={styles.requestSubName} numberOfLines={1}>
              {fullName}
            </Text>
          ) : null}
        </View>
      </View>

      <RequestStatusPill status={item.display_status} />
    </TouchableOpacity>
  );
};

const PaymentRequestsListScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [activeTab, setActiveTab] = useState<'my_link' | 'request'>('request');
  const [isDownloadingLinkQR, setIsDownloadingLinkQR] = useState(false);
  const qrCodeRef = React.useRef<any>(null);

  const { data: profile } = useUserProfile();
  const { data: balanceData, isLoading: isLoadingBalance } = useAccountBalance();
  const {
    data: latestRequests,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useListPaymentRequests({ limit: 3, offset: 0 });

  const profileUsername = stripUsernamePrefix(profile?.username || '');
  const hasProfileUsername = profileUsername.length > 0;
  const username = hasProfileUsername ? profileUsername : 'new_user';
  const requests = latestRequests ?? [];
  const shareableLink = hasProfileUsername
    ? `https://trytransfa.com/${profileUsername.toLowerCase()}`
    : null;

  const requireShareableLink = () => {
    if (!shareableLink) {
      Alert.alert('Profile unavailable', 'Your profile link is still loading. Please try again.');
      return null;
    }
    return shareableLink;
  };

  const onCopyLink = async () => {
    const link = requireShareableLink();
    if (!link) {
      return;
    }
    await Clipboard.setStringAsync(link);
    Alert.alert('Copied', 'Sharable profile link copied to clipboard.');
  };

  const onShareLink = async () => {
    const link = requireShareableLink();
    if (!link) {
      return;
    }
    try {
      await Share.share({
        message: `Connect with me on Transfa: ${link}`,
        url: link,
      });
    } catch {
      Alert.alert('Share failed', 'Unable to share link right now.');
    }
  };

  const onDownloadQRCode = async () => {
    const link = requireShareableLink();
    if (!link) {
      return;
    }

    try {
      setIsDownloadingLinkQR(true);

      const permission = await MediaLibrary.requestPermissionsAsync();
      if (!permission.granted) {
        Alert.alert('Permission needed', 'Allow photo access to save the QR image.');
        return;
      }

      const qrBase64 = await new Promise<string>((resolve, reject) => {
        if (!qrCodeRef.current || typeof qrCodeRef.current.toDataURL !== 'function') {
          reject(new Error('QR image is not ready.'));
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
        throw new Error('File storage is unavailable.');
      }

      const fileUri = `${rootDir}transfa-profile-link-${Date.now()}.png`;
      await FileSystem.writeAsStringAsync(fileUri, qrBase64, {
        encoding: FileSystem.EncodingType.Base64,
      });

      const asset = await MediaLibrary.createAssetAsync(fileUri);
      try {
        await MediaLibrary.createAlbumAsync('Transfa', asset, false);
      } catch {
        // Asset already saved even if album creation fails.
      }

      Alert.alert('Downloaded', 'QR image saved to your gallery.');
    } catch (downloadError: any) {
      Alert.alert('Download failed', downloadError?.message || 'Could not save QR image.');
    } finally {
      setIsDownloadingLinkQR(false);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A1B1E', '#0C0D0F', '#050607']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView
          contentContainerStyle={styles.content}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={BRAND_YELLOW}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.backButton}>
            <Ionicons name="arrow-back" size={20} color="#F2F2F2" />
          </TouchableOpacity>

          <View style={styles.identityRow}>
            <View style={styles.avatarWrap}>
              <Text style={styles.avatarInitial}>{username.slice(0, 1).toUpperCase()}</Text>
            </View>

            <View style={styles.userTextWrap}>
              <Text style={styles.userName}>{username}</Text>
              <View style={styles.userLockBadge}>
                <Ionicons name="lock-closed" size={8} color="#0A0A0A" />
              </View>
            </View>

            <View style={styles.headerIcons}>
              <Ionicons name="wallet-outline" size={18} color="#ECEDEE" />
              <Ionicons name="notifications-outline" size={17} color="#ECEDEE" />
            </View>
          </View>

          <View style={styles.balanceSection}>
            <Text style={styles.balanceLabel}>AVAILABLE BALANCE</Text>
            <View style={styles.balanceRow}>
              {isLoadingBalance ? (
                <ActivityIndicator size="small" color={BRAND_YELLOW} />
              ) : (
                <Text style={styles.balanceValue}>
                  {formatCurrency(balanceData?.available_balance ?? 0)}
                </Text>
              )}
              <Ionicons name="eye-off-outline" size={18} color="#C7C8CB" style={styles.eyeIcon} />
            </View>
          </View>

          <View style={styles.topSegmentWrap}>
            <TouchableOpacity
              style={[
                styles.topSegmentButton,
                activeTab === 'my_link' ? styles.topSegmentActive : styles.topSegmentInactive,
              ]}
              activeOpacity={0.9}
              onPress={() => setActiveTab('my_link')}
            >
              <Ionicons
                name="link-outline"
                size={14}
                color={activeTab === 'my_link' ? '#E7E8EA' : '#C3C4C7'}
              />
              <Text style={styles.topSegmentText}>My Link</Text>
            </TouchableOpacity>

            <TouchableOpacity
              style={[
                styles.topSegmentButton,
                activeTab === 'request' ? styles.topSegmentActive : styles.topSegmentInactive,
              ]}
              activeOpacity={0.9}
              onPress={() => setActiveTab('request')}
            >
              <Ionicons
                name="receipt-outline"
                size={14}
                color={activeTab === 'request' ? '#E7E8EA' : '#C3C4C7'}
              />
              <Text style={styles.topSegmentText}>Request</Text>
            </TouchableOpacity>
          </View>

          <View style={styles.divider} />

          {activeTab === 'my_link' ? (
            <View>
              <View style={styles.myLinkCard}>
                <View style={styles.myLinkQrWrap}>
                  {shareableLink ? (
                    <>
                      <QRCode ref={qrCodeRef} value={shareableLink} size={224} />
                      <View style={styles.myLinkCenterBadge}>
                        <Ionicons name="paper-plane" size={18} color="#121316" />
                      </View>
                    </>
                  ) : (
                    <View style={styles.myLinkPlaceholder}>
                      <ActivityIndicator size="small" color={BRAND_YELLOW} />
                      <Text style={styles.myLinkPlaceholderText}>Loading your profile link...</Text>
                    </View>
                  )}
                </View>
              </View>

              <TouchableOpacity
                style={styles.myLinkActionButton}
                activeOpacity={0.9}
                onPress={onDownloadQRCode}
                disabled={!shareableLink || isDownloadingLinkQR}
              >
                {isDownloadingLinkQR ? (
                  <ActivityIndicator size="small" color="#ECEDEE" />
                ) : (
                  <>
                    <Ionicons name="download-outline" size={16} color="#ECEDEE" />
                    <Text style={styles.myLinkActionText}>Download</Text>
                  </>
                )}
              </TouchableOpacity>

              <Text style={styles.myLinkSectionLabel}>Sharable Link</Text>

              <TouchableOpacity
                style={styles.linkRow}
                activeOpacity={0.85}
                onPress={onCopyLink}
                disabled={!shareableLink}
              >
                <Ionicons name="link-outline" size={16} color="#BFC1C6" />
                <Text numberOfLines={1} style={styles.linkText}>
                  {shareableLink || 'Profile link unavailable'}
                </Text>
              </TouchableOpacity>

              <TouchableOpacity
                style={styles.myLinkActionButton}
                activeOpacity={0.9}
                onPress={onShareLink}
                disabled={!shareableLink}
              >
                <Ionicons name="share-social-outline" size={16} color="#ECEDEE" />
                <Text style={styles.myLinkActionText}>Share Link</Text>
              </TouchableOpacity>
            </View>
          ) : (
            <View>
              <View style={styles.sectionHeader}>
                <Text style={styles.sectionTitle}>Outgoing requests</Text>
                <TouchableOpacity
                  onPress={() => navigation.navigate('PaymentRequestHistory')}
                  style={styles.historyPill}
                  activeOpacity={0.85}
                >
                  <Text style={styles.historyPillText}>Request History</Text>
                </TouchableOpacity>
              </View>

              {isLoading ? (
                <View style={styles.stateWrap}>
                  <ActivityIndicator size="small" color={BRAND_YELLOW} />
                </View>
              ) : isError && !latestRequests ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>
                    {error?.message || 'Unable to load requests. Pull to refresh and try again.'}
                  </Text>
                </View>
              ) : requests.length === 0 ? (
                <View style={styles.emptyCard}>
                  <Text style={styles.emptyText}>No outgoing requests yet.</Text>
                </View>
              ) : (
                <View style={styles.requestList}>
                  {requests.map((request) => (
                    <OutgoingRequestCard
                      key={request.id}
                      item={request}
                      onPress={() =>
                        navigation.navigate('PaymentRequestSuccess', { requestId: request.id })
                      }
                    />
                  ))}
                </View>
              )}

              <View style={[styles.divider, styles.bottomDivider]} />

              <TouchableOpacity
                style={styles.createRequestButton}
                activeOpacity={0.9}
                onPress={() => navigation.navigate('CreatePaymentRequest')}
              >
                <Ionicons name="add" size={20} color="#D8D9DC" />
                <Text style={styles.createRequestText}>Create Request</Text>
              </TouchableOpacity>
            </View>
          )}
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050607',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: 20,
    paddingTop: 8,
    paddingBottom: 32,
  },
  backButton: {
    width: 28,
    paddingVertical: 4,
  },
  identityRow: {
    marginTop: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    width: 34,
    height: 34,
    borderRadius: 10,
    backgroundColor: '#F4DDB5',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarInitial: {
    color: '#151618',
    fontSize: 14,
    fontWeight: '700',
  },
  userTextWrap: {
    marginLeft: 10,
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  userName: {
    color: '#EFEFF0',
    fontSize: 18,
    fontWeight: '700',
  },
  userLockBadge: {
    marginLeft: 4,
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  balanceSection: {
    marginTop: 14,
  },
  balanceLabel: {
    color: '#B5B7BC',
    fontSize: 13,
    letterSpacing: 0.6,
  },
  balanceRow: {
    marginTop: 3,
    flexDirection: 'row',
    alignItems: 'center',
  },
  balanceValue: {
    color: '#F5F5F6',
    fontSize: 40,
    fontWeight: '700',
  },
  eyeIcon: {
    marginLeft: 8,
    marginTop: 3,
  },
  topSegmentWrap: {
    marginTop: 18,
    flexDirection: 'row',
    gap: 10,
  },
  topSegmentButton: {
    flex: 1,
    height: 44,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  topSegmentInactive: {
    backgroundColor: 'rgba(255,255,255,0.07)',
  },
  topSegmentActive: {
    backgroundColor: 'rgba(255,255,255,0.07)',
    borderColor: BRAND_YELLOW,
  },
  topSegmentText: {
    color: '#D6D7DA',
    fontSize: 14,
    fontWeight: '500',
  },
  divider: {
    marginTop: 18,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.15)',
  },
  bottomDivider: {
    marginTop: 16,
    marginBottom: 16,
  },
  myLinkCard: {
    marginTop: 18,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.09)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 14,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myLinkQrWrap: {
    width: 230,
    height: 230,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myLinkCenterBadge: {
    position: 'absolute',
    width: 40,
    height: 28,
    borderRadius: 6,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  myLinkPlaceholder: {
    width: '100%',
    height: '100%',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  myLinkPlaceholderText: {
    color: '#C9CBD0',
    fontSize: 13,
  },
  myLinkActionButton: {
    marginTop: 12,
    height: 48,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    gap: 6,
  },
  myLinkActionText: {
    color: '#ECEDEE',
    fontSize: 16,
    fontWeight: '600',
  },
  myLinkSectionLabel: {
    marginTop: 14,
    color: '#D5D7DC',
    fontSize: 15,
    fontWeight: '500',
  },
  linkRow: {
    marginTop: 8,
    height: 44,
    borderRadius: 8,
    paddingHorizontal: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  linkText: {
    flex: 1,
    color: '#C2C4CA',
    fontSize: 13,
    textDecorationLine: 'underline',
  },
  sectionHeader: {
    marginTop: 18,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#E9E9EB',
    fontSize: 18,
    fontWeight: '500',
  },
  historyPill: {
    height: 34,
    borderRadius: 17,
    paddingHorizontal: 16,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.12)',
  },
  historyPillText: {
    color: '#C7C8CC',
    fontSize: 13,
    fontWeight: '500',
  },
  stateWrap: {
    marginTop: 18,
    alignItems: 'center',
  },
  emptyCard: {
    marginTop: 14,
    borderRadius: 12,
    minHeight: 80,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  emptyText: {
    color: '#A8AAB0',
    fontSize: 13,
  },
  requestList: {
    marginTop: 12,
    gap: 10,
  },
  requestCard: {
    minHeight: 82,
    borderRadius: 10,
    backgroundColor: '#F7F7F8',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    gap: 10,
  },
  requestCardLeft: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardAvatar: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#ABABFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  generalAvatar: {
    backgroundColor: '#EFEFF1',
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: '#7A7D84',
  },
  cardAvatarInitial: {
    color: '#111214',
    fontSize: 16,
    fontWeight: '700',
  },
  requestTextWrap: {
    flex: 1,
  },
  requestTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  requestTitle: {
    color: '#111214',
    fontSize: 15,
    fontWeight: '700',
  },
  lockBadge: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  requestAmount: {
    color: '#17181A',
    fontSize: 15,
    fontWeight: '500',
    marginTop: 2,
  },
  dateRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  requestDate: {
    color: '#6D7077',
    fontSize: 11,
  },
  requestSubName: {
    color: '#54575D',
    fontSize: 12,
    marginTop: 1,
  },
  statusPill: {
    marginTop: 2,
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  createRequestButton: {
    height: 48,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.25)',
    backgroundColor: 'rgba(0,0,0,0.25)',
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
  },
  createRequestText: {
    color: '#D7D8DB',
    fontSize: 16,
    fontWeight: '500',
  },
});

export default PaymentRequestsListScreen;

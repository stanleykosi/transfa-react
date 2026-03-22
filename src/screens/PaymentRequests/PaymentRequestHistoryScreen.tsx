import BackIcon from '@/assets/icons/back.svg';
import CalendarIcon from '@/assets/icons/calendar1.svg';
import CancelIcon from '@/assets/icons/cancel.svg';
import PendingIcon from '@/assets/icons/pending.svg';
import PaidIcon from '@/assets/icons/paid.svg';
import RequestIcon from '@/assets/icons/request.svg';
import SearchIcon from '@/assets/icons/search.svg';
import SettingsIcon from '@/assets/icons/settings.svg';
import VerifiedBadge from '@/assets/icons/verified.svg';
import Avatar1 from '@/assets/images/avatar1.svg';
import Avatar2 from '@/assets/images/avatar2.svg';
import Avatar3 from '@/assets/images/avatar3.svg';
import { useListPaymentRequests } from '@/api/transactionApi';
import DashedBorder from '@/components/DashedBorder';
import { AppStackParamList } from '@/navigation/AppStack';
import type { PaymentRequest } from '@/types/api';
import { formatCurrency } from '@/utils/formatCurrency';
import { normalizeUsername } from '@/utils/username';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { StatusBar } from 'expo-status-bar';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { SvgXml } from 'react-native-svg';

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

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;
type AvatarComponent = React.ComponentType<{ width?: number; height?: number }>;
type NormalizedRequestStatus = 'declined' | 'paid' | 'pending';

const avatarPool: AvatarComponent[] = [Avatar1, Avatar2, Avatar3];

const pickAvatarComponent = (seed: string): AvatarComponent => {
  let hash = 0;
  for (let i = 0; i < seed.length; i += 1) {
    hash = (hash * 31 + seed.charCodeAt(i)) % 1000000007;
  }

  return avatarPool[Math.abs(hash) % avatarPool.length] || Avatar1;
};

const normalizeRequestStatus = (
  status?: PaymentRequest['display_status']
): NormalizedRequestStatus => {
  if (status === 'declined') {
    return 'declined';
  }
  if (status === 'paid') {
    return 'paid';
  }
  return 'pending';
};

const formatRequestDate = (isoDate: string) =>
  new Date(isoDate).toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });

const buildRequestName = (request: PaymentRequest) =>
  request.request_type === 'general'
    ? 'General Request'
    : normalizeUsername(request.recipient_username || 'Transfa User');

const RequestHistoryCard = ({
  request,
  onPress,
}: {
  request: PaymentRequest;
  onPress: () => void;
}) => {
  const status = normalizeRequestStatus(request.display_status);
  const name = buildRequestName(request);
  const isGeneral = request.request_type === 'general';
  const AvatarComponent = pickAvatarComponent(name || request.id);

  return (
    <TouchableOpacity style={styles.requestCard} onPress={onPress} activeOpacity={0.7}>
      <View style={styles.requestLeft}>
        {isGeneral ? (
          <View style={styles.generalRequestIcon}>
            <DashedBorder size={48} borderWidth={2} color="#000000" dashCount={18} gapRatio={0.7} />
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
            <CalendarIcon width={14} height={14} />
            <Text style={styles.requestDate}>{formatRequestDate(request.created_at)}</Text>
          </View>
        </View>
      </View>
      <View style={styles.requestStatus}>
        {status === 'declined' ? (
          <View style={styles.declinedBadge}>
            <CancelIcon width={10} height={10} />
            <Text style={styles.declinedText}>Declined</Text>
          </View>
        ) : null}
        {status === 'paid' ? (
          <View style={styles.paidBadge}>
            <PaidIcon width={10} height={10} color="#FFFFFF" />
            <Text style={styles.paidText}>Paid</Text>
          </View>
        ) : null}
        {status === 'pending' ? (
          <View style={styles.pendingBadge}>
            <PendingIcon width={10} height={10} />
            <Text style={styles.pendingText}>Pending</Text>
          </View>
        ) : null}
      </View>
    </TouchableOpacity>
  );
};

const PaymentRequestHistoryScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [searchQuery, setSearchQuery] = useState('');
  const query = searchQuery.trim();

  const { data, isLoading, isError, error, refetch, isRefetching } = useListPaymentRequests({
    limit: 100,
    offset: 0,
    q: query || undefined,
  });

  const requests = useMemo(() => data ?? [], [data]);

  const filteredRequests = useMemo(() => {
    if (!query) {
      return requests;
    }

    const lowered = query.toLowerCase();
    return requests.filter((request) => {
      const name = buildRequestName(request).toLowerCase();
      const title = (request.title || '').toLowerCase();
      return name.includes(lowered) || title.includes(lowered);
    });
  }, [query, requests]);

  return (
    <SafeAreaView style={styles.container} edges={['top', 'left', 'right']}>
      <StatusBar style="light" />
      <View style={styles.backgroundContainer}>
        <SvgXml xml={backgroundSvg} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} />
      </View>

      <View style={styles.topBar}>
        <View style={styles.topBarLeft}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <BackIcon width={24} height={24} />
          </TouchableOpacity>
        </View>
        <View style={styles.topBarRight}>
          <View style={styles.statusIcons} />
          <TouchableOpacity style={styles.settingsButton} activeOpacity={0.8}>
            <SettingsIcon width={24} height={24} color="#FFFFFF" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
        refreshControl={
          <RefreshControl
            refreshing={isRefetching}
            onRefresh={refetch}
            tintColor="#FFFFFF"
            colors={['#FFFFFF']}
          />
        }
      >
        <Text style={styles.title}>Outgoing Request</Text>

        <View style={styles.searchContainer}>
          <View style={styles.searchIconContainer}>
            <SearchIcon width={16} height={16} color="#FFFFFF" />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search user"
            placeholderTextColor="#6C6B6B"
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <View style={styles.requestsList}>
          {isLoading && requests.length === 0 ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator size="small" color="#FFFFFF" />
            </View>
          ) : isError && requests.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {error?.message || 'Unable to load request history.'}
              </Text>
            </View>
          ) : filteredRequests.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No request history found.</Text>
            </View>
          ) : (
            filteredRequests.map((request) => (
              <RequestHistoryCard
                key={request.id}
                request={request}
                onPress={() =>
                  navigation.navigate('PaymentRequestSuccess', { requestId: request.id })
                }
              />
            ))
          )}
        </View>
      </ScrollView>
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
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    zIndex: 1,
  },
  topBarLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 16,
  },
  backButton: {
    padding: 4,
  },
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  statusIcons: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  settingsButton: {
    padding: 4,
  },
  scrollView: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 40,
  },
  title: {
    fontSize: 24,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 24,
    textAlign: 'center',
  },
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#333333',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  searchIconContainer: {
    marginRight: 12,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  requestsList: {
    gap: 12,
  },
  stateWrap: {
    marginTop: 20,
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
});

export default PaymentRequestHistoryScreen;

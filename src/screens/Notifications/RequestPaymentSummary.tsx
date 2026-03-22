import BackIcon from '@/assets/icons/back.svg';
import VerifiedBadge from '@/assets/icons/verified.svg';
import Avatar from '@/assets/images/avatar.svg';
import Avatar1 from '@/assets/images/avatar1.svg';
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';
import { StatusBar } from 'expo-status-bar';
import React from 'react';
import {
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SvgXml } from 'react-native-svg';

import {
  useGetIncomingPaymentRequest,
  useTransactionFees,
  useUserProfile,
} from '@/api/transactionApi';
import type { AppStackParamList } from '@/navigation/AppStack';
import type { AppNavigationProp } from '@/types/navigation';
import { formatCurrency } from '@/utils/formatCurrency';
import { BRAND_YELLOW, stripUsernamePrefix } from './helpers';

type SummaryRoute = RouteProp<AppStackParamList, 'RequestPaymentSummary'>;

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

const RequestPaymentSummaryScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const route = useRoute<SummaryRoute>();
  const { requestId } = route.params;

  const { data: request, isLoading: isLoadingRequest } = useGetIncomingPaymentRequest(requestId);
  const { data: fees, isLoading: isLoadingFees } = useTransactionFees();
  const { data: me } = useUserProfile();

  if (isLoadingRequest || isLoadingFees || !request) {
    return (
      <View style={styles.loadingRoot}>
        <ActivityIndicator size="small" color={BRAND_YELLOW} />
        <Text style={styles.loadingText}>Preparing payment summary...</Text>
      </View>
    );
  }

  const senderUsername = stripUsernamePrefix(me?.username || 'you');
  const receiverUsername = stripUsernamePrefix(request.creator_username || 'recipient');

  const fee = fees?.p2p_fee_kobo ?? 0;
  const total = request.amount + fee;

  return (
    <SafeAreaView style={styles.container}>
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
        <View style={styles.topBarRight} />
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.title}>Summary</Text>

        <View style={styles.userProfiles}>
          <View style={styles.userProfile}>
            <View style={styles.avatarContainer}>
              <Avatar width={64} height={64} />
              <View style={styles.verifiedBadgeContainer}>
                <VerifiedBadge width={20} height={20} />
              </View>
            </View>
            <Text style={styles.profileUsername}>{senderUsername}</Text>
          </View>

          <View style={styles.arrowContainer}>
            <View style={styles.arrowDot} />
            <View style={styles.arrowDot} />
            <View style={styles.arrowDot} />
          </View>

          <View style={styles.userProfile}>
            <View style={styles.avatarContainer}>
              <Avatar1 width={64} height={64} />
            </View>
            <Text style={styles.profileUsername}>{receiverUsername}</Text>
          </View>
        </View>

        <View style={styles.detailsCard}>
          <SummaryRow label="Receiver" value={receiverUsername} />
          <SummaryRow label="Transaction type" value="Request" />
          <SummaryRow label="Amount" value={formatCurrency(request.amount)} />
          <SummaryRow label="Transaction fee" value={formatCurrency(fee)} />

          <View style={styles.divider} />

          <SummaryRow label="Total" value={formatCurrency(total)} isTotal />
        </View>
      </ScrollView>

      <View style={styles.buttonContainer}>
        <TouchableOpacity
          style={styles.confirmButton}
          onPress={() => navigation.navigate('RequestPaymentAuth', { requestId: request.id })}
          activeOpacity={0.8}
        >
          <Text style={styles.confirmButtonText}>Confirm</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
};

const SummaryRow = ({
  label,
  value,
  isTotal,
}: {
  label: string;
  value: string;
  isTotal?: boolean;
}) => (
  <View style={styles.detailRow}>
    <Text style={[styles.detailLabel, isTotal && styles.totalLabel]}>{label}</Text>
    <Text style={[styles.detailValue, isTotal && styles.totalValue]}>{value}</Text>
  </View>
);

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
  loadingRoot: {
    flex: 1,
    backgroundColor: '#000000',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  loadingText: {
    color: '#F2F2F2',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
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
  topBarRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  backButton: {
    padding: 4,
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
  title: {
    fontSize: 24,
    color: '#FFD300',
    fontFamily: 'Montserrat_600SemiBold',
    textAlign: 'center',
    marginBottom: 40,
  },
  userProfiles: {
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 32,
    gap: 16,
  },
  userProfile: {
    alignItems: 'center',
  },
  avatarContainer: {
    position: 'relative',
    marginBottom: 8,
  },
  verifiedBadgeContainer: {
    position: 'absolute',
    bottom: -7,
    right: -8,
    width: 24,
    height: 24,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  profileUsername: {
    fontSize: 14,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  arrowContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginHorizontal: 8,
  },
  arrowDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#FFFFFF',
    opacity: 0.5,
  },
  detailsCard: {
    backgroundColor: '#333333',
    borderRadius: 16,
    padding: 20,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 16,
    color: 'rgba(255, 255, 255, 0.3)',
    fontFamily: 'Montserrat_400Regular',
  },
  detailValue: {
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  divider: {
    height: 1,
    backgroundColor: '#6C6B6B',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 18,
    color: 'rgba(255, 255, 255, 0.3)',
    fontFamily: 'Montserrat_600SemiBold',
  },
  totalValue: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_600SemiBold',
  },
  buttonContainer: {
    position: 'absolute',
    bottom: 290,
    left: 0,
    right: 0,
    paddingHorizontal: 20,
    paddingBottom: 40,
    paddingTop: 20,
    zIndex: 10,
  },
  confirmButton: {
    backgroundColor: '#FFD300',
    borderRadius: 12,
    paddingVertical: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmButtonText: {
    fontSize: 18,
    color: '#000000',
    fontFamily: 'Montserrat_700Bold',
  },
});

export default RequestPaymentSummaryScreen;

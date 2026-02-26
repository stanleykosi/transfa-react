import React from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { LinearGradient } from 'expo-linear-gradient';
import { Ionicons } from '@expo/vector-icons';
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { useQuery } from '@tanstack/react-query';

import { ProfileStackParamList } from '@/navigation/ProfileStack';
import { fetchKycStatus } from '@/api/authApi';
import theme from '@/constants/theme';

type NavigationProp = NativeStackNavigationProp<ProfileStackParamList, 'KycLevel'>;

const BRAND_YELLOW = '#FFD400';
const BG_BOTTOM = '#060708';
const { fontSizes, fontWeights, spacing } = theme;

const KycLevelScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const { data, isLoading } = useQuery({
    queryKey: ['kyc-status'],
    queryFn: fetchKycStatus,
  });

  const currentTier = data?.current_tier ?? 1;

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1B1C1E', '#111214', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
            <Ionicons name="arrow-back" size={24} color="#ECECEC" />
          </TouchableOpacity>

          <Text style={styles.title}>Upgrade KYC</Text>

          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={BRAND_YELLOW} />
              <Text style={styles.loadingText}>Fetching your KYC tier...</Text>
            </View>
          ) : null}

          <TierCard
            tier="Tier 1"
            dailyLimit="₦20,000.00"
            balanceLimit="₦2,000.00"
            expanded
            isCurrent={currentTier === 1}
          />

          <TierCard
            tier="Tier 2"
            dailyLimit="₦200,000.00"
            balanceLimit="₦50,000.00"
            expanded
            isCurrent={currentTier === 2}
          />

          <TouchableOpacity
            activeOpacity={0.8}
            style={styles.tier3Row}
            disabled={currentTier >= 3}
            onPress={() => navigation.navigate('KycTier3Upgrade')}
          >
            <Text style={styles.tier3Text}>Tier 3</Text>
            {currentTier >= 3 ? (
              <Text style={styles.tier3Current}>Current</Text>
            ) : (
              <Ionicons name="chevron-forward" size={20} color="#F2F2F2" />
            )}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </View>
  );
};

const TierCard = ({
  tier,
  dailyLimit,
  balanceLimit,
  expanded,
  isCurrent,
}: {
  tier: string;
  dailyLimit: string;
  balanceLimit: string;
  expanded: boolean;
  isCurrent: boolean;
}) => (
  <View style={styles.card}>
    <View style={styles.cardHeader}>
      <View style={styles.cardTitleRow}>
        <Text style={styles.cardTitle}>{tier}</Text>
        {isCurrent ? (
          <View style={styles.currentPill}>
            <Text style={styles.currentPillText}>Current</Text>
          </View>
        ) : null}
      </View>
      <Ionicons name={expanded ? 'chevron-down' : 'chevron-forward'} size={18} color="#DCDCDD" />
    </View>

    {expanded ? (
      <>
        <View style={styles.separator} />
        <View style={styles.limitRow}>
          <Text style={styles.limitLabel}>Daily Limit</Text>
          <Text style={styles.limitValue}>{dailyLimit}</Text>
        </View>
        <View style={styles.limitRow}>
          <Text style={styles.limitLabel}>Balance Limit</Text>
          <Text style={styles.limitValue}>{balanceLimit}</Text>
        </View>
      </>
    ) : null}
  </View>
);

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#090A0B',
  },
  safeArea: {
    flex: 1,
  },
  content: {
    paddingHorizontal: spacing.s20,
    paddingBottom: spacing.s32,
  },
  backButton: {
    width: 34,
    height: 34,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 4,
  },
  title: {
    marginTop: 24,
    marginBottom: 18,
    color: '#F2F2F2',
    fontSize: fontSizes['3xl'],
    fontWeight: fontWeights.bold,
    textAlign: 'center',
  },
  loadingWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginBottom: 16,
  },
  loadingText: {
    color: '#A5A7AA',
    fontSize: fontSizes.sm,
  },
  card: {
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    paddingVertical: 14,
    marginBottom: 12,
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  cardTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  cardTitle: {
    color: '#F4F4F4',
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
  currentPill: {
    borderRadius: 999,
    paddingHorizontal: 8,
    paddingVertical: 2,
    backgroundColor: BRAND_YELLOW,
  },
  currentPillText: {
    color: '#121212',
    fontSize: fontSizes.xs,
    fontWeight: fontWeights.bold,
  },
  separator: {
    marginTop: 14,
    marginBottom: 10,
    height: 1,
    backgroundColor: 'rgba(255,255,255,0.2)',
  },
  limitRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 6,
  },
  limitLabel: {
    color: '#C0C2C6',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  limitValue: {
    color: '#EDEDED',
    fontSize: fontSizes.sm,
    fontWeight: fontWeights.medium,
  },
  tier3Row: {
    minHeight: 58,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 14,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  tier3Text: {
    color: '#F4F4F4',
    fontSize: fontSizes.lg,
    fontWeight: fontWeights.bold,
  },
  tier3Current: {
    color: BRAND_YELLOW,
    fontSize: fontSizes.base,
    fontWeight: fontWeights.bold,
  },
});

export default KycLevelScreen;

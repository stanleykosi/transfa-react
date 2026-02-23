import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useNavigation } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import { useMoneyDropDashboard } from '@/api/transactionApi';
import { formatCurrency } from '@/utils/formatCurrency';
import type { MoneyDropDashboardItem } from '@/types/api';
import type { AppNavigationProp } from '@/types/navigation';

const BRAND_YELLOW = '#FFD300';
const BG_BOTTOM = '#050607';
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BORDER = 'rgba(255,255,255,0.07)';

type DropCardProps = {
  item: MoneyDropDashboardItem;
  onPress: () => void;
};

const DropCard = ({ item, onPress }: DropCardProps) => {
  const isActive = item.status === 'active' && !item.ended;

  return (
    <TouchableOpacity activeOpacity={0.86} style={styles.dropCard} onPress={onPress}>
      <View style={[styles.iconWrap, isActive ? styles.iconWrapActive : styles.iconWrapEnded]}>
        <Ionicons name="gift-outline" size={20} color={isActive ? BRAND_YELLOW : '#7E8188'} />
      </View>

      <View style={styles.dropCardMiddle}>
        <Text style={styles.dropTitle} numberOfLines={1}>
          {item.title}
        </Text>
        <Text style={styles.dropSubtitle} numberOfLines={1}>
          {isActive ? `Time left: ${item.time_left_label}` : item.ended_display_status || 'Ended'}
        </Text>
      </View>

      <View style={styles.dropCardRight}>
        <Text style={styles.dropAmount}>{formatCurrency(item.total_amount)}</Text>
        <Text style={styles.dropRightSub}>
          {isActive ? `Users Claimed: ${item.users_claimed_label}` : item.created_date_label}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const MoneyDropTabScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const [refreshing, setRefreshing] = useState(false);
  const { data: dashboard, isLoading, isFetching, error, refetch } = useMoneyDropDashboard();

  const activeDrops = dashboard?.active_drops ?? [];
  const historyDrops = dashboard?.drop_history ?? [];
  const currentBalance = dashboard?.current_balance ?? 0;

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const isEmpty = useMemo(
    () => activeDrops.length === 0 && historyDrops.length === 0,
    [activeDrops.length, historyDrops.length]
  );

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
          refreshControl={
            <RefreshControl
              refreshing={refreshing || (isFetching && !isLoading)}
              onRefresh={onRefresh}
              tintColor={BRAND_YELLOW}
            />
          }
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.topRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              onPress={() => navigation.navigate('AppTabs', { screen: 'Home' })}
              style={styles.backButton}
            >
              <Ionicons name="arrow-back" size={24} color="#F4F4F5" />
            </TouchableOpacity>
          </View>

          <Text style={styles.screenTitle}>MONEYDROP</Text>
          <Text style={styles.balanceAmount}>{formatCurrency(currentBalance)}</Text>
          <Text style={styles.balanceLabel}>Current Balance</Text>

          <TouchableOpacity
            activeOpacity={0.9}
            style={styles.createButton}
            onPress={() => navigation.navigate('CreateDropWizard')}
          >
            <Ionicons name="add" size={24} color="#74777D" />
            <Text style={styles.createButtonText}>Create MoneyDrop</Text>
          </TouchableOpacity>

          {isLoading ? (
            <View style={styles.loadingWrap}>
              <ActivityIndicator size="small" color={BRAND_YELLOW} />
              <Text style={styles.loadingText}>Loading money drops...</Text>
            </View>
          ) : error ? (
            <View style={styles.errorCard}>
              <Text style={styles.errorText}>
                {error.message || 'Failed to load MoneyDrop dashboard. Pull to refresh.'}
              </Text>
            </View>
          ) : (
            <>
              {activeDrops.length > 0 && (
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Active Drop</Text>
                  <View style={styles.cardsColumn}>
                    {activeDrops.map((item) => (
                      <DropCard
                        key={item.id}
                        item={item}
                        onPress={() => navigation.navigate('MoneyDropDetails', { dropId: item.id })}
                      />
                    ))}
                  </View>
                </View>
              )}

              <View style={styles.divider} />

              <View style={styles.historyHeader}>
                <Text style={styles.sectionTitle}>Drop History</Text>
                <TouchableOpacity
                  activeOpacity={0.9}
                  style={styles.claimedButton}
                  onPress={() => navigation.navigate('MoneyDropClaimedHistory')}
                >
                  <Text style={styles.claimedButtonText}>Claimed Drop</Text>
                </TouchableOpacity>
              </View>

              {historyDrops.length > 0 ? (
                <View style={styles.cardsColumn}>
                  {historyDrops.map((item) => (
                    <DropCard
                      key={item.id}
                      item={item}
                      onPress={() => navigation.navigate('MoneyDropDetails', { dropId: item.id })}
                    />
                  ))}
                </View>
              ) : (
                <View style={styles.emptyHistoryCard}>
                  <Text style={styles.emptyHistoryText}>
                    {isEmpty
                      ? 'No MoneyDrop yet. Create your first drop to get started.'
                      : 'No ended drops yet.'}
                  </Text>
                </View>
              )}
            </>
          )}
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
    paddingBottom: 124,
  },
  topRow: {
    marginTop: 2,
    marginBottom: 8,
  },
  backButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
  },
  screenTitle: {
    color: '#F0F1F3',
    fontWeight: '700',
    fontSize: 35,
    letterSpacing: 0.5,
    textAlign: 'center',
    marginTop: 14,
  },
  balanceAmount: {
    color: '#F5F5F7',
    fontSize: 54,
    fontWeight: '700',
    textAlign: 'center',
    marginTop: 24,
  },
  balanceLabel: {
    color: '#63666D',
    fontSize: 16,
    textDecorationLine: 'underline',
    textAlign: 'center',
    marginTop: 4,
    marginBottom: 30,
  },
  createButton: {
    height: 62,
    borderRadius: 17,
    borderWidth: 1,
    borderColor: '#61646C',
    alignItems: 'center',
    justifyContent: 'center',
    flexDirection: 'row',
    marginBottom: 24,
  },
  createButtonText: {
    color: '#74777D',
    fontSize: 22,
    fontWeight: '600',
    marginLeft: 8,
  },
  loadingWrap: {
    marginTop: 48,
    alignItems: 'center',
  },
  loadingText: {
    color: '#9EA1A8',
    marginTop: 10,
    fontSize: 14,
  },
  section: {
    marginTop: 6,
  },
  sectionTitle: {
    color: '#ECEDEF',
    fontSize: 34,
    fontWeight: '500',
    marginBottom: 14,
  },
  cardsColumn: {
    gap: 12,
  },
  dropCard: {
    backgroundColor: CARD_BG,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    borderRadius: 16,
    paddingHorizontal: 16,
    paddingVertical: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  iconWrap: {
    width: 58,
    height: 58,
    borderRadius: 29,
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 14,
  },
  iconWrapActive: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: BRAND_YELLOW,
  },
  iconWrapEnded: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: '#70737A',
  },
  dropCardMiddle: {
    flex: 1,
    marginRight: 10,
  },
  dropCardRight: {
    alignItems: 'flex-end',
    justifyContent: 'space-between',
    minHeight: 52,
  },
  dropTitle: {
    color: '#F1F2F4',
    fontSize: 17,
    fontWeight: '700',
  },
  dropSubtitle: {
    color: '#7E8188',
    fontSize: 13,
    marginTop: 4,
  },
  dropAmount: {
    color: '#F0F1F3',
    fontSize: 18,
    fontWeight: '500',
  },
  dropRightSub: {
    color: '#6D7077',
    fontSize: 12,
    marginTop: 4,
  },
  divider: {
    height: 1,
    backgroundColor: '#4F525A',
    marginVertical: 24,
  },
  historyHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  claimedButton: {
    height: 44,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 16,
    justifyContent: 'center',
  },
  claimedButtonText: {
    color: '#D8DADF',
    fontSize: 17,
    fontWeight: '500',
  },
  errorCard: {
    marginTop: 24,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.45)',
    backgroundColor: 'rgba(239,68,68,0.12)',
    paddingHorizontal: 14,
    paddingVertical: 12,
  },
  errorText: {
    color: '#FFD3D3',
    fontSize: 14,
  },
  emptyHistoryCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 16,
    paddingVertical: 18,
  },
  emptyHistoryText: {
    color: '#8E9197',
    fontSize: 14,
  },
});

export default MoneyDropTabScreen;

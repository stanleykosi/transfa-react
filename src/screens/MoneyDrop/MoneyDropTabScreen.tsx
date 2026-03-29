import AddIcon from '@/assets/icons/add.svg';
import MoneyDropIcon from '@/assets/icons/money-drop.svg';
import AnimatedPageWrapper from '@/components/AnimatedPageWrapper';
import BottomNavbar from '@/components/bottom-navbar';
import { useMoneyDropDashboard } from '@/api/transactionApi';
import type { MoneyDropDashboardItem } from '@/types/api';
import type { AppNavigationProp } from '@/types/navigation';
import { formatCurrency } from '@/utils/formatCurrency';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
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

type DropCardProps = {
  item: MoneyDropDashboardItem;
  isActive: boolean;
  onPress: () => void;
};

const DropCard = ({ item, isActive, onPress }: DropCardProps) => {
  const secondaryLeft = isActive
    ? `Time left: ${item.time_left_label || '--'}`
    : item.ended_display_status || 'Ended';

  const secondaryRight = isActive
    ? `Users Claimed: ${item.users_claimed_label || '--'}`
    : item.created_date_label || '--';

  return (
    <TouchableOpacity style={styles.dropCard} activeOpacity={0.8} onPress={onPress}>
      <View style={isActive ? styles.giftIconContainerActive : styles.giftIconContainerEnded}>
        <MoneyDropIcon width={24} height={24} color={isActive ? '#FFD300' : '#6C6B6B'} />
      </View>

      <View style={styles.dropInfo}>
        <View style={styles.dropRow}>
          <Text style={styles.dropTitle} numberOfLines={1}>
            {item.title}
          </Text>
          <Text style={styles.dropAmount}>{formatCurrency(item.total_amount)}</Text>
        </View>

        <View style={styles.dropRow}>
          <Text style={styles.dropSubtext} numberOfLines={1}>
            {secondaryLeft}
          </Text>
          <Text style={styles.dropSubtext} numberOfLines={1}>
            {secondaryRight}
          </Text>
        </View>
      </View>
    </TouchableOpacity>
  );
};

const MoneyDropTabScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const [refreshing, setRefreshing] = useState(false);

  const { data: dashboard, isLoading, isFetching, error, refetch } = useMoneyDropDashboard();

  const activeDrops = dashboard?.active_drops ?? [];
  const dropHistory = dashboard?.drop_history ?? [];

  const currentBalance = useMemo(
    () => dashboard?.current_balance ?? 0,
    [dashboard?.current_balance]
  );

  const onRefresh = async () => {
    setRefreshing(true);
    try {
      await refetch();
    } finally {
      setRefreshing(false);
    }
  };

  const handleTabPress = (tab: 'home' | 'settings' | 'gifts' | 'support') => {
    if (tab === 'home') {
      navigation.navigate('AppTabs', { screen: 'Home' });
      return;
    }

    if (tab === 'settings') {
      navigation.navigate('AppTabs', { screen: 'Settings', params: { screen: 'ProfileHome' } });
      return;
    }

    if (tab === 'gifts') {
      navigation.navigate('AppTabs', { screen: 'MoneyDrop' });
      return;
    }

    navigation.navigate('AppTabs', { screen: 'Support' });
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.backgroundContainer}>
        <SvgXml xml={backgroundSvg} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} />
      </View>

      <View style={styles.topBar} />

      <AnimatedPageWrapper>
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={refreshing || (isFetching && !isLoading)}
              onRefresh={onRefresh}
              tintColor="#FFD300"
            />
          }
        >
          <Text style={styles.headerTitle}>MONEYDROP</Text>

          <View style={styles.balanceContainer}>
            <Text style={styles.balanceAmount}>{formatCurrency(currentBalance)}</Text>
            <Text style={styles.balanceLabel}>Current Balance</Text>
          </View>

          <TouchableOpacity
            style={styles.createButton}
            activeOpacity={0.8}
            onPress={() => navigation.navigate('CreateDropWizard')}
          >
            <AddIcon width={24} height={24} color="#6C6B6B" />
            <Text style={styles.createButtonText}>Create MoneyDrop</Text>
          </TouchableOpacity>

          {isLoading ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator size="small" color="#FFD300" />
              <Text style={styles.stateText}>Loading money drops...</Text>
            </View>
          ) : error ? (
            <View style={styles.stateWrap}>
              <Text style={styles.stateText}>
                {error.message || 'Failed to load MoneyDrop dashboard.'}
              </Text>
            </View>
          ) : (
            <>
              <View style={styles.section}>
                <Text style={styles.sectionHeader}>Active Drop</Text>
                <View style={styles.dropList}>
                  {activeDrops.length > 0 ? (
                    activeDrops.map((drop) => (
                      <DropCard
                        key={drop.id}
                        item={drop}
                        isActive
                        onPress={() => navigation.navigate('MoneyDropDetails', { dropId: drop.id })}
                      />
                    ))
                  ) : (
                    <Text style={styles.emptyText}>No active drops yet.</Text>
                  )}
                </View>
              </View>

              <View style={styles.divider} />

              <View style={styles.section}>
                <View style={styles.historyHeader}>
                  <Text style={styles.sectionHeader}>Drop History</Text>
                  <TouchableOpacity
                    style={styles.claimedButton}
                    onPress={() => navigation.navigate('MoneyDropClaimedHistory')}
                  >
                    <Text style={styles.claimedButtonText}>Claimed Drop</Text>
                  </TouchableOpacity>
                </View>

                <View style={styles.dropList}>
                  {dropHistory.length > 0 ? (
                    dropHistory.map((drop) => (
                      <DropCard
                        key={drop.id}
                        item={drop}
                        isActive={false}
                        onPress={() => navigation.navigate('MoneyDropDetails', { dropId: drop.id })}
                      />
                    ))
                  ) : (
                    <Text style={styles.emptyText}>No ended drops yet.</Text>
                  )}
                </View>
              </View>
            </>
          )}
        </ScrollView>
      </AnimatedPageWrapper>

      <BottomNavbar activeTab="gifts" onTabPress={handleTabPress} visible />
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
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 10,
    paddingBottom: 20,
    zIndex: 1,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
    letterSpacing: 1.2,
    textAlign: 'center',
    marginTop: 10,
    marginBottom: 20,
  },
  scrollView: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingBottom: 120,
  },
  balanceContainer: {
    alignItems: 'center',
    marginTop: 20,
    marginBottom: 32,
  },
  balanceAmount: {
    fontSize: 40,
    color: '#FFFFFF',
    fontFamily: 'ArtificTrial-Semibold',
    marginBottom: 4,
  },
  balanceLabel: {
    fontSize: 14,
    color: '#6C6B6B',
    fontFamily: 'Montserrat_400Regular',
  },
  createButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'transparent',
    borderWidth: 1,
    borderColor: '#6C6B6B',
    borderRadius: 12,
    paddingVertical: 14,
    gap: 10,
    marginBottom: 40,
  },
  createButtonText: {
    color: '#6C6B6B',
    fontSize: 18,
    fontFamily: 'Montserrat_600SemiBold',
  },
  section: {
    marginBottom: 24,
  },
  sectionHeader: {
    fontSize: 18,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 16,
  },
  historyHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  claimedButton: {
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  claimedButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
  },
  dropList: {
    gap: 12,
  },
  dropCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.03)',
  },
  giftIconContainerActive: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 211, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#FFD300',
    borderStyle: 'dashed',
  },
  giftIconContainerEnded: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(108, 107, 107, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1.5,
    borderColor: '#6C6B6B',
    borderStyle: 'dashed',
  },
  dropInfo: {
    flex: 1,
    gap: 4,
  },
  dropRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  dropTitle: {
    color: '#FFFFFF',
    fontSize: 18,
    fontFamily: 'Montserrat_600SemiBold',
    flex: 1,
  },
  dropAmount: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
  },
  dropSubtext: {
    color: '#6C6B6B',
    fontSize: 12,
    fontFamily: 'Montserrat_400Regular',
    flex: 1,
  },
  divider: {
    height: 1,
    backgroundColor: '#6C6B6B',
    marginVertical: 12,
    marginBottom: 24,
    width: '100%',
  },
  stateWrap: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 24,
  },
  stateText: {
    color: '#9FA1A6',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
    marginTop: 8,
    textAlign: 'center',
  },
  emptyText: {
    color: '#6C6B6B',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
  },
});

export default MoneyDropTabScreen;

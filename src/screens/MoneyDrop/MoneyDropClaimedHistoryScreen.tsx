import BackIcon from '@/assets/icons/back.svg';
import MoneyDropIcon from '@/assets/icons/money-drop.svg';
import { useClaimedMoneyDrops } from '@/api/transactionApi';
import BottomNavbar from '@/components/bottom-navbar';
import type { AppNavigationProp } from '@/types/navigation';
import { formatCurrency } from '@/utils/formatCurrency';
import { normalizeUsername } from '@/utils/username';
import { useNavigation } from '@react-navigation/native';
import React, { useMemo } from 'react';
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

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('en-GB', {
    day: '2-digit',
    month: '2-digit',
    year: '2-digit',
  });
};

const MoneyDropClaimedHistoryScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const { data, isLoading, error } = useClaimedMoneyDrops();

  const items = useMemo(() => data?.items ?? [], [data?.items]);

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

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <BackIcon width={24} height={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>CLAIMED DROPS</Text>
        <View style={{ width: 24 }} />
      </View>

      {isLoading ? (
        <View style={styles.stateContainer}>
          <ActivityIndicator size="small" color="#FFD300" />
          <Text style={styles.stateText}>Loading claimed drops...</Text>
        </View>
      ) : error ? (
        <View style={styles.stateContainer}>
          <Text style={styles.stateText}>{error.message || 'Failed to load claimed drops.'}</Text>
        </View>
      ) : (
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <View style={styles.listContainer}>
            {items.map((drop) => (
              <View key={`${drop.drop_id}-${drop.claimed_at}`} style={styles.dropCard}>
                <View style={styles.iconContainer}>
                  <MoneyDropIcon width={24} height={24} color="#FFD300" />
                </View>

                <View style={styles.dropInfo}>
                  <View style={styles.row}>
                    <Text style={styles.dropTitle} numberOfLines={1}>
                      {drop.title}
                    </Text>
                    <Text style={styles.dropAmount}>{formatCurrency(drop.amount_claimed)}</Text>
                  </View>

                  <View style={styles.row}>
                    <Text
                      style={styles.dropSubtext}
                    >{`From: ${normalizeUsername(drop.creator_username)}`}</Text>
                    <Text style={styles.dropSubtext}>{formatDate(drop.claimed_at)}</Text>
                  </View>
                </View>
              </View>
            ))}
          </View>

          {items.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Text style={styles.emptyText}>You haven&apos;t claimed any drops yet.</Text>
            </View>
          ) : null}
        </ScrollView>
      )}

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
  backButton: {
    padding: 4,
  },
  headerTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
    letterSpacing: 1.2,
  },
  scrollView: {
    flex: 1,
    zIndex: 1,
  },
  scrollContent: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 120,
  },
  listContainer: {
    gap: 16,
  },
  dropCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  iconContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: 'rgba(255, 211, 0, 0.1)',
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 211, 0, 0.3)',
  },
  dropInfo: {
    flex: 1,
    gap: 4,
  },
  row: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
  },
  dropTitle: {
    color: '#FFFFFF',
    fontSize: 16,
    fontFamily: 'Montserrat_600SemiBold',
    flex: 1,
  },
  dropAmount: {
    color: '#FFD300',
    fontSize: 16,
    fontFamily: 'Montserrat_600SemiBold',
  },
  dropSubtext: {
    color: '#6C6B6B',
    fontSize: 12,
    fontFamily: 'Montserrat_400Regular',
    flex: 1,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: 100,
  },
  emptyText: {
    color: '#6C6B6B',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
  },
  stateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    flex: 1,
  },
  stateText: {
    color: '#9FA1A6',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
    marginTop: 8,
  },
});

export default MoneyDropClaimedHistoryScreen;

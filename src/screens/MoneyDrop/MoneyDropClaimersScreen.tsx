import BackIcon from '@/assets/icons/back.svg';
import CalendarIcon from '@/assets/icons/calendar.svg';
import SearchIcon from '@/assets/icons/search.svg';
import SettingsIcon from '@/assets/icons/settings.svg';
import { useMoneyDropClaimers } from '@/api/transactionApi';
import type { AppStackParamList } from '@/types/navigation';
import { formatCurrency } from '@/utils/formatCurrency';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Dimensions,
  SafeAreaView,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
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

type MoneyDropClaimersRouteProp = RouteProp<AppStackParamList, 'MoneyDropClaimers'>;

const formatDate = (value: string) => {
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) {
    return value;
  }

  return parsed.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  });
};

const MoneyDropClaimersScreen = () => {
  const navigation = useNavigation();
  const route = useRoute<MoneyDropClaimersRouteProp>();
  const { dropId } = route.params;
  const [searchQuery, setSearchQuery] = useState('');

  const { data, isLoading, error } = useMoneyDropClaimers(dropId, {
    search: searchQuery,
    limit: 100,
    offset: 0,
  });

  const claimers = useMemo(() => data?.claimers ?? [], [data?.claimers]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.backgroundContainer}>
        <SvgXml xml={backgroundSvg} width={SCREEN_WIDTH} height={SCREEN_HEIGHT} />
      </View>

      <View style={styles.topBar}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <BackIcon width={24} height={24} color="#FFFFFF" />
        </TouchableOpacity>
        <Text style={styles.headerTitle}>MoneyDrop Claimers</Text>
        <TouchableOpacity style={styles.settingsButton}>
          <SettingsIcon width={24} height={24} color="#FFFFFF" />
        </TouchableOpacity>
      </View>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        showsVerticalScrollIndicator={false}
      >
        <View style={styles.searchContainer}>
          <View style={styles.searchIconContainer}>
            <SearchIcon width={18} height={18} color="#FFFFFF" />
          </View>
          <TextInput
            style={styles.searchInput}
            placeholder="Search user"
            placeholderTextColor="#6C6B6B"
            value={searchQuery}
            onChangeText={setSearchQuery}
          />
        </View>

        {isLoading ? (
          <View style={styles.stateContainer}>
            <ActivityIndicator size="small" color="#FFD300" />
            <Text style={styles.stateText}>Loading claimers...</Text>
          </View>
        ) : error ? (
          <View style={styles.stateContainer}>
            <Text style={styles.stateText}>{error.message || 'Failed to load claimers.'}</Text>
          </View>
        ) : (
          <View style={styles.claimersList}>
            {claimers.length > 0 ? (
              claimers.map((claimer) => {
                const initials = claimer.username.slice(0, 1).toUpperCase();

                return (
                  <View key={`${claimer.user_id}-${claimer.claimed_at}`} style={styles.claimerCard}>
                    <View style={styles.avatarContainer}>
                      <Text style={styles.avatarText}>{initials}</Text>
                    </View>

                    <View style={styles.claimerInfo}>
                      <View style={styles.claimerNameRow}>
                        <Text style={styles.claimerUsername}>{claimer.username}</Text>
                      </View>

                      {claimer.full_name ? (
                        <Text style={styles.claimerFullName}>{claimer.full_name}</Text>
                      ) : null}

                      <View style={styles.claimerDateRow}>
                        <CalendarIcon width={12} height={12} color="#6C6B6B" />
                        <Text style={styles.claimerDate}>{formatDate(claimer.claimed_at)}</Text>
                      </View>
                    </View>

                    <Text
                      style={styles.claimerAmount}
                    >{`- ${formatCurrency(claimer.amount_claimed)}`}</Text>
                  </View>
                );
              })
            ) : (
              <Text style={styles.emptyText}>No claimers found.</Text>
            )}
          </View>
        )}
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
    fontSize: 18,
    fontFamily: 'Montserrat_400Regular',
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
  searchContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1A1A1A',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 24,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.05)',
  },
  searchIconContainer: {
    marginRight: 12,
    opacity: 0.6,
  },
  searchInput: {
    flex: 1,
    fontSize: 16,
    color: '#FFFFFF',
    fontFamily: 'Montserrat_400Regular',
  },
  claimersList: {
    gap: 16,
  },
  claimerCard: {
    flexDirection: 'row',
    backgroundColor: '#FFFFFF',
    borderRadius: 12,
    padding: 16,
    gap: 12,
    alignItems: 'center',
  },
  avatarContainer: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#EAEAEA',
    alignItems: 'center',
    justifyContent: 'center',
  },
  avatarText: {
    color: '#000000',
    fontSize: 18,
    fontFamily: 'Montserrat_600SemiBold',
  },
  claimerInfo: {
    flex: 1,
  },
  claimerNameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginBottom: 4,
  },
  claimerUsername: {
    color: '#000000',
    fontSize: 16,
    fontFamily: 'Montserrat_600SemiBold',
  },
  claimerAmount: {
    color: '#000000',
    fontSize: 16,
    fontFamily: 'Montserrat_600SemiBold',
  },
  claimerFullName: {
    color: '#6C6B6B',
    fontSize: 12,
    fontFamily: 'Montserrat_400Regular',
    marginBottom: 4,
  },
  claimerDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  claimerDate: {
    color: '#6C6B6B',
    fontSize: 12,
    fontFamily: 'Montserrat_400Regular',
  },
  stateContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 40,
  },
  stateText: {
    color: '#9FA1A6',
    fontSize: 14,
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
    marginTop: 8,
  },
  emptyText: {
    color: '#6C6B6B',
    fontSize: 16,
    fontFamily: 'Montserrat_400Regular',
    textAlign: 'center',
  },
});

export default MoneyDropClaimersScreen;

import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp, useNavigation, useRoute } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';

import type { AppStackParamList } from '@/navigation/AppStack';
import type { AppNavigationProp } from '@/types/navigation';
import { useMoneyDropClaimers } from '@/api/transactionApi';
import { formatCurrency } from '@/utils/formatCurrency';

const BG_BOTTOM = '#050607';
const CARD_BG = '#E7E8EA';

type MoneyDropClaimersRouteProp = RouteProp<AppStackParamList, 'MoneyDropClaimers'>;

const formatDateOnly = (value: string) => {
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
  const navigation = useNavigation<AppNavigationProp>();
  const route = useRoute<MoneyDropClaimersRouteProp>();
  const { dropId } = route.params;
  const [search, setSearch] = useState('');

  const { data, isLoading, error } = useMoneyDropClaimers(dropId, {
    search,
    limit: 100,
    offset: 0,
  });

  const claimers = useMemo(() => data?.claimers ?? [], [data?.claimers]);

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A1B1E', '#0C0D0F', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={styles.backgroundGradient}
      />
      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.content}>
          <View style={styles.headerRow}>
            <TouchableOpacity
              activeOpacity={0.8}
              style={styles.iconButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={24} color="#F4F4F5" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>MoneyDrop Claimers</Text>
            <TouchableOpacity activeOpacity={0.8} style={styles.iconButton}>
              <Ionicons name="settings-outline" size={22} color="#F4F4F5" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchBox}>
            <Ionicons name="search" size={22} color="#D7D9DD" />
            <TextInput
              value={search}
              onChangeText={setSearch}
              placeholder="Search user"
              placeholderTextColor="#72767D"
              style={styles.searchInput}
            />
          </View>

          {isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="small" color="#FFD300" />
              <Text style={styles.centerText}>Loading claimers...</Text>
            </View>
          ) : error ? (
            <View style={styles.centerState}>
              <Text style={styles.centerText}>{error.message || 'Failed to load claimers.'}</Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {claimers.length > 0 ? (
                claimers.map((claimer) => (
                  <View style={styles.claimerCard} key={`${claimer.user_id}-${claimer.claimed_at}`}>
                    <View style={styles.avatarWrap}>
                      <Text style={styles.avatarText}>
                        {claimer.username.slice(0, 1).toUpperCase()}
                      </Text>
                    </View>

                    <View style={styles.claimerMiddle}>
                      <Text style={styles.claimerUsername}>{claimer.username}</Text>
                      {claimer.full_name ? (
                        <Text style={styles.claimerFullName}>{claimer.full_name}</Text>
                      ) : null}
                      <View style={styles.dateWrap}>
                        <Ionicons name="calendar-outline" size={14} color="#303236" />
                        <Text style={styles.dateText}>{formatDateOnly(claimer.claimed_at)}</Text>
                      </View>
                    </View>

                    <Text
                      style={styles.claimerAmount}
                    >{`+ ${formatCurrency(claimer.amount_claimed)}`}</Text>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>No claimers found.</Text>
                </View>
              )}
            </ScrollView>
          )}
        </View>
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
  content: {
    flex: 1,
    paddingHorizontal: 20,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 14,
  },
  iconButton: {
    width: 32,
    height: 32,
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerTitle: {
    color: '#F4F5F7',
    fontSize: 24,
    fontWeight: '700',
  },
  searchBox: {
    height: 54,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingHorizontal: 12,
    alignItems: 'center',
    flexDirection: 'row',
    marginBottom: 14,
  },
  searchInput: {
    flex: 1,
    color: '#E8EAED',
    fontSize: 18,
    marginLeft: 8,
  },
  centerState: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centerText: {
    color: '#8A8E95',
    fontSize: 15,
    marginTop: 8,
    textAlign: 'center',
  },
  listContent: {
    paddingBottom: 40,
    gap: 12,
  },
  claimerCard: {
    backgroundColor: CARD_BG,
    borderRadius: 14,
    padding: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  avatarWrap: {
    width: 56,
    height: 56,
    borderRadius: 14,
    backgroundColor: '#ABABFD',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 10,
  },
  avatarText: {
    color: '#090A0B',
    fontSize: 23,
    fontWeight: '700',
  },
  claimerMiddle: {
    flex: 1,
    marginRight: 8,
  },
  claimerUsername: {
    color: '#070809',
    fontSize: 19,
    fontWeight: '700',
  },
  claimerFullName: {
    color: '#2E3135',
    fontSize: 16,
    marginTop: 1,
  },
  dateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 3,
  },
  dateText: {
    color: '#2E3135',
    fontSize: 15,
    marginLeft: 5,
  },
  claimerAmount: {
    color: '#070809',
    fontSize: 18,
    fontWeight: '600',
  },
  emptyState: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.08)',
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 10,
  },
  emptyText: {
    color: '#8A8E95',
    fontSize: 15,
  },
});

export default MoneyDropClaimersScreen;

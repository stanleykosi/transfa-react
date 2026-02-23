import React, { useMemo } from 'react';
import {
  ActivityIndicator,
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

import type { AppNavigationProp } from '@/types/navigation';
import { useClaimedMoneyDrops } from '@/api/transactionApi';
import { formatCurrency } from '@/utils/formatCurrency';
import { normalizeUsername } from '@/utils/username';

const BG_BOTTOM = '#050607';
const CARD_BG = 'rgba(255,255,255,0.08)';
const CARD_BORDER = 'rgba(255,255,255,0.07)';

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

const MoneyDropClaimedHistoryScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const { data, isLoading, error } = useClaimedMoneyDrops();
  const items = useMemo(() => data?.items ?? [], [data?.items]);

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
              style={styles.backButton}
              onPress={() => navigation.goBack()}
            >
              <Ionicons name="arrow-back" size={24} color="#F4F4F5" />
            </TouchableOpacity>
            <Text style={styles.headerTitle}>Claimed Drops</Text>
            <View style={styles.backButton} />
          </View>

          {isLoading ? (
            <View style={styles.centerState}>
              <ActivityIndicator size="small" color="#FFD300" />
              <Text style={styles.centerText}>Loading claimed drops...</Text>
            </View>
          ) : error ? (
            <View style={styles.centerState}>
              <Text style={styles.centerText}>
                {error.message || 'Failed to load claimed drops.'}
              </Text>
            </View>
          ) : (
            <ScrollView
              contentContainerStyle={styles.listContent}
              showsVerticalScrollIndicator={false}
            >
              {items.length > 0 ? (
                items.map((item) => (
                  <View style={styles.itemCard} key={`${item.drop_id}-${item.claimed_at}`}>
                    <View style={styles.itemTopRow}>
                      <Text style={styles.itemTitle} numberOfLines={1}>
                        {item.title}
                      </Text>
                      <Text
                        style={styles.itemAmount}
                      >{`+ ${formatCurrency(item.amount_claimed)}`}</Text>
                    </View>
                    <Text style={styles.itemCreator}>
                      From {normalizeUsername(item.creator_username)}
                    </Text>
                    <View style={styles.itemDateWrap}>
                      <Ionicons name="calendar-outline" size={14} color="#A0A4AC" />
                      <Text style={styles.itemDate}>{formatDateOnly(item.claimed_at)}</Text>
                    </View>
                  </View>
                ))
              ) : (
                <View style={styles.emptyState}>
                  <Text style={styles.emptyText}>You have not claimed any drop yet.</Text>
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
  backButton: {
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
  itemCard: {
    borderRadius: 14,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  itemTopRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 10,
  },
  itemTitle: {
    flex: 1,
    color: '#F2F3F5',
    fontSize: 18,
    fontWeight: '700',
  },
  itemAmount: {
    color: '#F2F3F5',
    fontSize: 17,
    fontWeight: '600',
  },
  itemCreator: {
    color: '#A0A4AC',
    fontSize: 15,
    marginTop: 5,
  },
  itemDateWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 6,
  },
  itemDate: {
    color: '#A0A4AC',
    fontSize: 14,
    marginLeft: 5,
  },
  emptyState: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: CARD_BORDER,
    backgroundColor: CARD_BG,
    paddingVertical: 18,
    alignItems: 'center',
    marginTop: 10,
  },
  emptyText: {
    color: '#8A8E95',
    fontSize: 15,
  },
});

export default MoneyDropClaimedHistoryScreen;

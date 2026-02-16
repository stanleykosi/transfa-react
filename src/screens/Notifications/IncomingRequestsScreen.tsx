import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useNavigation } from '@react-navigation/native';

import { useListIncomingPaymentRequests } from '@/api/transactionApi';
import type { PaymentRequest } from '@/types/api';
import type { AppNavigationProp } from '@/types/navigation';
import { formatCurrency } from '@/utils/formatCurrency';
import { BRAND_YELLOW, formatShortDate, stripUsernamePrefix } from './helpers';

const BG_BOTTOM = '#050607';

const statusConfig = (status: PaymentRequest['display_status']) => {
  if (status === 'paid') {
    return { bg: '#BFF2B6', text: '#25A641', icon: 'checkmark-circle' as const, label: 'Paid' };
  }
  if (status === 'declined') {
    return { bg: '#FFCACA', text: '#F14D4D', icon: 'close-circle' as const, label: 'Declined' };
  }
  return { bg: 'rgba(255,211,0,0.25)', text: '#D7A800', icon: 'time' as const, label: 'Pending' };
};

const IncomingRequestsScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const [query, setQuery] = useState('');

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  const { data, isLoading, isError, error, refetch, isRefetching } = useListIncomingPaymentRequests(
    {
      limit: 100,
      offset: 0,
      q: trimmedQuery || undefined,
    }
  );

  const requests = data ?? [];

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A1B1E', '#0C0D0F', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.headerRow}>
          <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
            <Ionicons name="arrow-back" size={20} color="#ECECEC" />
          </TouchableOpacity>

          <View style={styles.headerSpacer} />

          <TouchableOpacity style={styles.headerButton} activeOpacity={0.9}>
            <Ionicons name="settings-outline" size={18} color="#ECECEC" />
          </TouchableOpacity>
        </View>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color="#D2D3D5" />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search user"
            placeholderTextColor="#919399"
            style={styles.searchInput}
            autoCapitalize="none"
            autoCorrect={false}
          />
        </View>

        <ScrollView
          contentContainerStyle={styles.listContent}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl
              refreshing={isRefetching}
              onRefresh={refetch}
              tintColor={BRAND_YELLOW}
            />
          }
        >
          {isLoading ? (
            <View style={styles.stateWrap}>
              <ActivityIndicator size="small" color={BRAND_YELLOW} />
            </View>
          ) : isError && requests.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {error?.message || 'Unable to load incoming requests.'}
              </Text>
            </View>
          ) : requests.length === 0 ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>No incoming requests found.</Text>
            </View>
          ) : (
            requests.map((request) => {
              const status = statusConfig(request.display_status);
              const creatorUsername = stripUsernamePrefix(
                request.creator_username || 'Transfa User'
              );

              return (
                <TouchableOpacity
                  key={request.id}
                  style={styles.card}
                  activeOpacity={0.88}
                  onPress={() =>
                    navigation.navigate('IncomingRequestDetail', {
                      requestId: request.id,
                    })
                  }
                >
                  <View style={styles.cardAvatar}>
                    <Text style={styles.cardAvatarInitial}>
                      {creatorUsername.slice(0, 1).toUpperCase()}
                    </Text>
                  </View>

                  <View style={styles.cardTextWrap}>
                    <View style={styles.titleRow}>
                      <Text style={styles.cardTitle} numberOfLines={1}>
                        {creatorUsername}
                      </Text>
                      <View style={styles.lockBadge}>
                        <Ionicons name="lock-closed" size={8} color="#080808" />
                      </View>
                    </View>

                    <Text style={styles.cardAmount}>{formatCurrency(request.amount)}</Text>

                    <View style={styles.dateRow}>
                      <Ionicons name="calendar-outline" size={11} color="#757981" />
                      <Text style={styles.cardDate}>{formatShortDate(request.created_at)}</Text>
                    </View>
                  </View>

                  {request.display_status === 'pending' ? (
                    <View style={styles.requestedWrap}>
                      <Text style={styles.requestedLabel}>Requested{`\n`}Amount:</Text>
                      <Text style={styles.requestedAmount}>{formatCurrency(request.amount)}</Text>
                    </View>
                  ) : (
                    <View style={[styles.statusPill, { backgroundColor: status.bg }]}>
                      <Ionicons name={status.icon} size={10} color={status.text} />
                      <Text style={[styles.statusText, { color: status.text }]}>
                        {status.label}
                      </Text>
                    </View>
                  )}
                </TouchableOpacity>
              );
            })
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
  safeArea: {
    flex: 1,
    paddingHorizontal: 20,
    paddingTop: 8,
  },
  headerRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  headerButton: {
    width: 28,
    paddingVertical: 4,
    alignItems: 'center',
  },
  headerSpacer: {
    flex: 1,
  },
  searchWrap: {
    marginTop: 14,
    height: 40,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 7,
  },
  searchInput: {
    flex: 1,
    color: '#ECECEC',
    fontSize: 14,
    paddingVertical: 0,
  },
  listContent: {
    paddingTop: 12,
    paddingBottom: 20,
    gap: 10,
  },
  stateWrap: {
    marginTop: 24,
    alignItems: 'center',
  },
  emptyCard: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    backgroundColor: 'rgba(255,255,255,0.05)',
    paddingVertical: 18,
    paddingHorizontal: 12,
    alignItems: 'center',
  },
  emptyText: {
    color: '#9FA1A7',
    fontSize: 13,
    textAlign: 'center',
  },
  card: {
    minHeight: 86,
    borderRadius: 8,
    backgroundColor: '#F4F4F5',
    paddingHorizontal: 10,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
  },
  cardAvatar: {
    width: 42,
    height: 42,
    borderRadius: 10,
    backgroundColor: '#F3ABA7',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAvatarInitial: {
    color: '#17181A',
    fontSize: 14,
    fontWeight: '700',
  },
  cardTextWrap: {
    marginLeft: 10,
    flex: 1,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardTitle: {
    color: '#1B1C1F',
    fontSize: 15,
    fontWeight: '700',
    maxWidth: '90%',
  },
  lockBadge: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAmount: {
    marginTop: 1,
    color: '#131416',
    fontSize: 13,
    fontWeight: '700',
  },
  dateRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardDate: {
    color: '#6F7279',
    fontSize: 11,
  },
  requestedWrap: {
    alignItems: 'flex-end',
  },
  requestedLabel: {
    color: '#686B72',
    fontSize: 11,
    textAlign: 'right',
    lineHeight: 13,
  },
  requestedAmount: {
    marginTop: 2,
    color: '#111216',
    fontSize: 12,
    fontWeight: '700',
  },
  statusPill: {
    height: 22,
    borderRadius: 11,
    paddingHorizontal: 8,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '700',
  },
});

export default IncomingRequestsScreen;

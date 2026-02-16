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
import { useNavigation } from '@react-navigation/native';
import { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { LinearGradient } from 'expo-linear-gradient';

import { useListPaymentRequests } from '@/api/transactionApi';
import { AppStackParamList } from '@/navigation/AppStack';
import type { PaymentRequest } from '@/types/api';
import { formatCurrency } from '@/utils/formatCurrency';

const BRAND_YELLOW = '#FFD300';

type NavigationProp = NativeStackNavigationProp<AppStackParamList>;

const stripUsernamePrefix = (value?: string | null) => (value || 'unknown').replace(/^_+/, '');

const normalizeStatus = (status: PaymentRequest['display_status']) => {
  if (status === 'paid') {
    return 'Paid';
  }
  if (status === 'declined') {
    return 'Declined';
  }
  return 'Pending';
};

const statusStyle = (status: PaymentRequest['display_status']) => {
  if (status === 'paid') {
    return { bg: '#BFF2B6', text: '#25A641' };
  }
  if (status === 'declined') {
    return { bg: '#FFCACA', text: '#F14D4D' };
  }
  return { bg: 'rgba(255,211,0,0.25)', text: '#D7A800' };
};

const RequestHistoryCard = ({
  request,
  onPress,
}: {
  request: PaymentRequest;
  onPress: () => void;
}) => {
  const username =
    request.request_type === 'general'
      ? 'General Request'
      : stripUsernamePrefix(request.recipient_username);

  const fullName =
    request.request_type === 'general'
      ? request.title
      : request.recipient_full_name?.trim() || request.title || 'Individual request';

  const statusColors = statusStyle(request.display_status);

  return (
    <TouchableOpacity style={styles.historyCard} activeOpacity={0.88} onPress={onPress}>
      <View style={styles.cardAvatar}>
        <Text style={styles.cardAvatarInitial}>{username.slice(0, 1).toUpperCase()}</Text>
      </View>

      <View style={styles.cardTextWrap}>
        <View style={styles.usernameRow}>
          <Text style={styles.cardUsername} numberOfLines={1}>
            {username}
          </Text>
          {request.request_type !== 'general' ? (
            <View style={styles.lockBadge}>
              <Ionicons name="lock-closed" size={8} color="#090909" />
            </View>
          ) : null}
        </View>

        <Text style={styles.cardAmount}>{formatCurrency(request.amount)}</Text>

        <View style={styles.dateRow}>
          <Ionicons name="calendar-outline" size={11} color="#72757C" />
          <Text style={styles.cardDate}>
            {new Date(request.created_at).toLocaleDateString('en-US', {
              month: 'short',
              day: 'numeric',
              year: 'numeric',
            })}
          </Text>
        </View>

        <Text style={styles.cardFullName} numberOfLines={1}>
          {fullName}
        </Text>
      </View>

      <View style={[styles.statusPill, { backgroundColor: statusColors.bg }]}>
        <Ionicons
          name={
            request.display_status === 'paid'
              ? 'checkmark-circle'
              : request.display_status === 'declined'
                ? 'close-circle'
                : 'time'
          }
          size={10}
          color={statusColors.text}
        />
        <Text style={[styles.statusText, { color: statusColors.text }]}>
          {normalizeStatus(request.display_status)}
        </Text>
      </View>
    </TouchableOpacity>
  );
};

const PaymentRequestHistoryScreen = () => {
  const navigation = useNavigation<NavigationProp>();
  const [query, setQuery] = useState('');

  const trimmedQuery = useMemo(() => query.trim(), [query]);

  const {
    data: requests,
    isLoading,
    isError,
    error,
    refetch,
    isRefetching,
  } = useListPaymentRequests({
    limit: 100,
    offset: 0,
    q: trimmedQuery.length > 0 ? trimmedQuery : undefined,
  });

  const historyItems = requests ?? [];

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A1B1E', '#0C0D0F', '#050607']}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <View style={styles.container}>
          <View style={styles.headerRow}>
            <TouchableOpacity onPress={() => navigation.goBack()} style={styles.headerButton}>
              <Ionicons name="arrow-back" size={20} color="#ECEDED" />
            </TouchableOpacity>

            <Text style={styles.headerTitle}>Request History</Text>

            <TouchableOpacity style={styles.headerButton} activeOpacity={0.9}>
              <Ionicons name="settings-outline" size={18} color="#ECEDED" />
            </TouchableOpacity>
          </View>

          <View style={styles.searchWrap}>
            <Ionicons name="search" size={16} color="#D2D3D5" />
            <TextInput
              value={query}
              onChangeText={setQuery}
              placeholder="Search user"
              placeholderTextColor="#9D9EA2"
              style={styles.searchInput}
              autoCapitalize="none"
              autoCorrect={false}
            />
          </View>

          <ScrollView
            style={styles.listScroll}
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
              <View style={styles.centerState}>
                <ActivityIndicator size="small" color={BRAND_YELLOW} />
              </View>
            ) : isError && !requests ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>
                  {error?.message ||
                    'Unable to load request history. Pull to refresh and try again.'}
                </Text>
              </View>
            ) : historyItems.length === 0 ? (
              <View style={styles.emptyCard}>
                <Text style={styles.emptyText}>No request history found.</Text>
              </View>
            ) : (
              historyItems.map((item) => (
                <RequestHistoryCard
                  key={item.id}
                  request={item}
                  onPress={() =>
                    navigation.navigate('PaymentRequestSuccess', { requestId: item.id })
                  }
                />
              ))
            )}
          </ScrollView>
        </View>
      </SafeAreaView>
    </View>
  );
};

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: '#050607',
  },
  safeArea: {
    flex: 1,
  },
  container: {
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
  headerTitle: {
    color: '#F2F2F3',
    fontSize: 24,
    fontWeight: '500',
  },
  searchWrap: {
    marginTop: 18,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.08)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 12,
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ECECEF',
    fontSize: 14,
    paddingVertical: 0,
  },
  listScroll: {
    flex: 1,
    marginTop: 14,
  },
  listContent: {
    paddingBottom: 32,
    gap: 12,
  },
  historyCard: {
    minHeight: 88,
    borderRadius: 10,
    backgroundColor: '#F6F6F7',
    paddingHorizontal: 12,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
  },
  cardAvatar: {
    width: 44,
    height: 44,
    borderRadius: 10,
    backgroundColor: '#ABABFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAvatarInitial: {
    color: '#121316',
    fontSize: 16,
    fontWeight: '700',
  },
  cardTextWrap: {
    flex: 1,
  },
  usernameRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  cardUsername: {
    color: '#111214',
    fontSize: 18,
    fontWeight: '700',
  },
  lockBadge: {
    width: 15,
    height: 15,
    borderRadius: 7.5,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cardAmount: {
    color: '#17181A',
    fontSize: 16,
    fontWeight: '500',
    marginTop: 2,
  },
  dateRow: {
    marginTop: 2,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 3,
  },
  cardDate: {
    color: '#6D7077',
    fontSize: 11,
  },
  cardFullName: {
    color: '#55585F',
    fontSize: 12,
    marginTop: 1,
  },
  statusPill: {
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 4,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  statusText: {
    fontSize: 11,
    fontWeight: '600',
  },
  centerState: {
    marginTop: 36,
    alignItems: 'center',
  },
  emptyCard: {
    minHeight: 100,
    borderRadius: 12,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    color: '#A5A7AC',
    fontSize: 13,
  },
});

export default PaymentRequestHistoryScreen;

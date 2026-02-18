import React, { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
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
import { useNavigation, useRoute, type RouteProp } from '@react-navigation/native';

import { useGetTransferList, useToggleTransferListMember } from '@/api/transactionApi';
import { useUserSearch } from '@/api/userDiscoveryApi';
import type { AppNavigationProp } from '@/types/navigation';
import type { AppStackParamList } from '@/navigation/AppStack';
import { normalizeUsername, usernameKey } from '@/utils/username';

const BRAND_YELLOW = '#FFD300';
const BG_BOTTOM = '#050607';

type ScreenRoute = RouteProp<AppStackParamList, 'TransferListDetail'>;

type GroupedMember = {
  letter: string;
  users: Array<{ user_id: string; username: string; full_name?: string | null }>;
};

const TransferListDetailScreen = () => {
  const navigation = useNavigation<AppNavigationProp>();
  const route = useRoute<ScreenRoute>();
  const { listId } = route.params;

  const [searchQuery, setSearchQuery] = useState('');
  const [pendingUsername, setPendingUsername] = useState<string | null>(null);

  const { data: list, isLoading, refetch } = useGetTransferList(listId);
  const normalizedQuery = searchQuery.trim();
  const { data: searchData, isLoading: isSearching } = useUserSearch(normalizedQuery, 15);

  const toggleMutation = useToggleTransferListMember({
    onError: (error) => {
      Alert.alert('List update failed', error.message || 'Please try again.');
    },
  });

  const memberUsernameSet = useMemo(() => {
    const values = new Set<string>();
    (list?.members ?? []).forEach((member) => values.add(usernameKey(member.username)));
    return values;
  }, [list?.members]);

  const groupedMembers = useMemo<GroupedMember[]>(() => {
    const byLetter = new Map<string, GroupedMember['users']>();
    (list?.members ?? []).forEach((member) => {
      const displayUsername = normalizeUsername(member.username);
      const letter = displayUsername.slice(0, 1).toUpperCase() || '#';
      const group = byLetter.get(letter) ?? [];
      group.push(member);
      byLetter.set(letter, group);
    });

    return [...byLetter.entries()]
      .sort((a, b) => a[0].localeCompare(b[0]))
      .map(([letter, users]) => ({
        letter,
        users: users.sort((a, b) =>
          normalizeUsername(a.username).localeCompare(normalizeUsername(b.username))
        ),
      }));
  }, [list?.members]);

  const handleToggleUser = async (username: string) => {
    const normalizedUsername = usernameKey(username);
    setPendingUsername(normalizedUsername);
    try {
      await toggleMutation.mutateAsync({
        listId,
        payload: { username: normalizeUsername(username) },
      });
      await refetch();
    } finally {
      setPendingUsername(null);
    }
  };

  return (
    <View style={styles.root}>
      <LinearGradient
        colors={['#1A1B1E', '#0C0D0F', BG_BOTTOM]}
        start={{ x: 0, y: 0 }}
        end={{ x: 0, y: 1 }}
        style={StyleSheet.absoluteFillObject}
      />

      <SafeAreaView style={styles.safeArea} edges={['top', 'left', 'right']}>
        <TouchableOpacity style={styles.backButton} onPress={() => navigation.goBack()}>
          <Ionicons name="arrow-back" size={22} color="#ECECEC" />
        </TouchableOpacity>

        <Text style={styles.title}>{list?.name || 'Transfer List'}</Text>

        <View style={styles.searchWrap}>
          <Ionicons name="search" size={16} color="#9FA1A7" />
          <TextInput
            style={styles.searchInput}
            value={searchQuery}
            onChangeText={setSearchQuery}
            placeholder="Search"
            placeholderTextColor="#6F727A"
            autoCapitalize="none"
          />
        </View>

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionTitle}>List members</Text>
          <TouchableOpacity
            style={styles.payButton}
            disabled={!list || list.member_count === 0}
            onPress={() => navigation.navigate('PayTransferList', { listId })}
          >
            <Text style={styles.payButtonText}>Pay</Text>
          </TouchableOpacity>
        </View>

        {isLoading ? (
          <View style={styles.loadingWrap}>
            <ActivityIndicator size="small" color={BRAND_YELLOW} />
          </View>
        ) : (
          <ScrollView style={styles.scroll} contentContainerStyle={styles.content}>
            {normalizedQuery.length > 0 ? (
              <View style={styles.searchResultsSection}>
                <Text style={styles.searchResultTitle}>Suggestions</Text>
                {isSearching ? (
                  <ActivityIndicator size="small" color={BRAND_YELLOW} />
                ) : (
                  (searchData?.users ?? []).map((user) => {
                    const displayUsername = normalizeUsername(user.username);
                    const normalizedUsername = usernameKey(user.username);
                    const inList = memberUsernameSet.has(normalizedUsername);
                    const pending = pendingUsername === normalizedUsername;

                    return (
                      <View key={user.id} style={styles.userCard}>
                        <View style={styles.userInfo}>
                          <View style={styles.userAvatar}>
                            <Text style={styles.userAvatarInitial}>
                              {displayUsername.slice(0, 1).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.userTextWrap}>
                            <Text style={styles.username}>{displayUsername}</Text>
                            <Text style={styles.fullName}>{user.full_name || 'Transfa User'}</Text>
                          </View>
                        </View>

                        <TouchableOpacity
                          style={[styles.toggleCircle, inList && styles.toggleCircleActive]}
                          onPress={() => handleToggleUser(user.username)}
                          disabled={pending}
                        >
                          {pending ? (
                            <ActivityIndicator
                              size="small"
                              color={inList ? '#0F1012' : '#B6B7BC'}
                            />
                          ) : null}
                        </TouchableOpacity>
                      </View>
                    );
                  })
                )}
              </View>
            ) : null}

            {groupedMembers.length === 0 ? (
              <View style={styles.emptyWrap}>
                <Text style={styles.emptyText}>No members in this list yet.</Text>
              </View>
            ) : (
              groupedMembers.map((group) => (
                <View key={group.letter}>
                  <Text style={styles.groupLetter}>{group.letter}</Text>
                  {group.users.map((member) => {
                    const displayUsername = normalizeUsername(member.username);
                    const pending = pendingUsername === usernameKey(member.username);
                    return (
                      <View key={member.user_id} style={styles.userCard}>
                        <View style={styles.userInfo}>
                          <View style={styles.userAvatar}>
                            <Text style={styles.userAvatarInitial}>
                              {displayUsername.slice(0, 1).toUpperCase()}
                            </Text>
                          </View>
                          <View style={styles.userTextWrap}>
                            <Text style={styles.username}>{displayUsername}</Text>
                            <Text style={styles.fullName}>
                              {member.full_name || 'Transfa User'}
                            </Text>
                          </View>
                        </View>

                        <TouchableOpacity
                          style={[styles.toggleCircle, styles.toggleCircleActive]}
                          onPress={() => handleToggleUser(member.username)}
                          disabled={pending}
                        >
                          {pending ? <ActivityIndicator size="small" color="#0F1012" /> : null}
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              ))
            )}
          </ScrollView>
        )}
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
    paddingHorizontal: 16,
  },
  backButton: {
    width: 28,
    marginTop: 4,
  },
  title: {
    marginTop: 8,
    textAlign: 'center',
    color: '#F0F0F2',
    fontSize: 24,
    fontWeight: '700',
  },
  searchWrap: {
    marginTop: 14,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.06)',
    height: 42,
    paddingHorizontal: 12,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  searchInput: {
    flex: 1,
    color: '#ECEDEF',
    fontSize: 16,
    paddingVertical: 0,
  },
  sectionHeader: {
    marginTop: 12,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  sectionTitle: {
    color: '#D8DADF',
    fontSize: 22,
    fontWeight: '500',
  },
  payButton: {
    minWidth: 74,
    height: 34,
    borderRadius: 10,
    backgroundColor: BRAND_YELLOW,
    alignItems: 'center',
    justifyContent: 'center',
  },
  payButtonText: {
    color: '#0E0F11',
    fontSize: 17,
    fontWeight: '700',
  },
  loadingWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  scroll: {
    marginTop: 8,
    flex: 1,
  },
  content: {
    paddingBottom: 40,
  },
  searchResultsSection: {
    marginBottom: 10,
  },
  searchResultTitle: {
    marginVertical: 8,
    color: '#95979C',
    fontSize: 17,
  },
  groupLetter: {
    marginTop: 8,
    marginBottom: 6,
    color: '#D4B315',
    fontSize: 17,
    fontWeight: '700',
  },
  userCard: {
    minHeight: 72,
    borderRadius: 11,
    backgroundColor: '#F4F4F4',
    marginBottom: 10,
    paddingHorizontal: 10,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  userInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
    marginRight: 10,
  },
  userAvatar: {
    width: 42,
    height: 42,
    borderRadius: 13,
    backgroundColor: '#ABABFD',
    alignItems: 'center',
    justifyContent: 'center',
  },
  userAvatarInitial: {
    color: '#131313',
    fontSize: 16,
    fontWeight: '800',
  },
  userTextWrap: {
    marginLeft: 10,
    flex: 1,
  },
  username: {
    color: '#18191B',
    fontSize: 18,
    fontWeight: '700',
  },
  fullName: {
    marginTop: 1,
    color: '#5A5C61',
    fontSize: 14,
  },
  toggleCircle: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1,
    borderColor: '#CACBD0',
    backgroundColor: '#FFFFFF',
    alignItems: 'center',
    justifyContent: 'center',
  },
  toggleCircleActive: {
    borderColor: '#E6C111',
    backgroundColor: '#E6C111',
  },
  emptyWrap: {
    paddingTop: 24,
    alignItems: 'center',
  },
  emptyText: {
    color: '#9EA0A6',
    fontSize: 15,
  },
});

export default TransferListDetailScreen;
